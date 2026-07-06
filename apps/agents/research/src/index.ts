import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, ResearchJobData, ResearchResultData } from '@cos/events';
import { OpenAIProvider } from '@cos/llm';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { ResearchPackage } from '@cos/types';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

const { Pool } = pg;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

const llm = new OpenAIProvider();
const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

async function processResearchJob(job: Job<ResearchJobData>) {
  const { contentId, channelId, topic, editorialDirection, clpOverrides } = job.data as any;
  console.log(`[Research Agent] Pesquisando tópico: "${topic}" (Direção: ${editorialDirection})`);

  try {
    let searchResults: any = null;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    if (TAVILY_API_KEY) {
      try {
        console.log(`[Research Agent] Tavily API encontrada. Efetuando busca real na internet...`);
        const searchResponse = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: TAVILY_API_KEY,
            query: topic,
            search_depth: 'advanced',
            include_answer: true,
            max_results: 5,
          }),
        });
        if (searchResponse.ok) {
          searchResults = await searchResponse.json();
          console.log(`[Research Agent] Busca no Tavily concluída com sucesso!`);
        } else {
          console.error(`[Research Agent] Falha na chamada da API Tavily: Status ${searchResponse.status}`);
        }
      } catch (searchError) {
        console.error(`[Research Agent] Erro ao conectar com a API Tavily:`, searchError);
      }
    }

    const prompt = `
      Faça uma pesquisa detalhada sobre o tópico: "${topic}".
      Direção editorial desejada: "${editorialDirection || 'Neutro'}".
      
      ${searchResults ? `Aqui estão os resultados reais encontrados na internet para referência:\n${JSON.stringify(searchResults.results, null, 2)}\nResumo gerado pela pesquisa: ${searchResults.answer || ''}` : ''}
      
      Extraia fatos importantes, estatísticas e um resumo.
      Responda APENAS com um objeto JSON no formato:
      {
        "summary": "Resumo geral do tópico",
        "facts": ["fato 1", "fato 2", "fato 3"],
        "sources": [{"title": "Nome da fonte", "url": "url"}]
      }
    `;

    const responseJsonStr = await llm.complete(prompt, { task: 'observer', jsonMode: true, temperature: 0.3 });
    const result = JSON.parse(responseJsonStr);

    const researchPackage: ResearchPackage = {
      topic,
      summary: result.summary,
      keyFacts: result.facts || [],
      sources: (result.sources || []).map((s: any) => ({
        title: s.title || 'Source',
        url: s.url || '',
        excerpt: s.excerpt || ''
      })),
      relatedEntities: [],
      researchedAt: new Date()
    };

    // Phase 2: Insert into WorldKnowledgePgStore
    const embedding = await llm.embed(researchPackage.summary);
    await pool.query(
      `INSERT INTO world_knowledge (id, entity_type, entity_name, facts, sources, embedding, last_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (entity_type, entity_name) DO UPDATE 
       SET facts = EXCLUDED.facts, sources = EXCLUDED.sources, embedding = EXCLUDED.embedding, last_verified_at = NOW()`,
      [
        contentId, 
        'topic', 
        topic, 
        JSON.stringify(researchPackage.keyFacts), 
        JSON.stringify(researchPackage.sources),
        `[${embedding.join(',')}]`
      ]
    );

    const resultData: ResearchResultData = {
      contentId,
      channelId,
      researchPackage,
    };

    await supervisorQueue.add('RESEARCH_RESULT', resultData);
    console.log(`[Research Agent] Pesquisa concluída para "${topic}" e salva no World Knowledge.`);

    // ── CLP Learning Engine: enriquecer cultural_context ──────────────────────────
    // Se o Editorial detectou termos que precisam de contexto cultural (EXPLAIN/ADAPT),
    // aproveitamos a pesquisa para gravar esse contexto na localization_memory.
    if (clpOverrides?.length) {
      for (const override of clpOverrides) {
        if (override.strategy === 'EXPLAIN' || override.strategy === 'ADAPT') {
          await pool.query(
            `UPDATE localization_memory
             SET cultural_context = $1
             WHERE original_term = $2`,
            [researchPackage.summary.slice(0, 500), override.originalTerm]
          ).catch(() => {}); // não bloquear por falha na memória
          console.log(`[Research Agent] 🧠 Cultural context enriquecido: "${override.originalTerm}"`);
        }
      }
    }
  } catch (error: any) {
    console.error(`[Research Agent] Falha ao processar pesquisa para "${topic}":`, error);
    throw error;
  }
}

async function bootstrap() {
  console.log('🚀 Iniciando Research Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('research', channelId);
    const worker = new Worker(qName, processResearchJob, { connection, concurrency: 2 });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
