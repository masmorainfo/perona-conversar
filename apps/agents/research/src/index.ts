import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, ResearchJobData, ResearchResultData } from '@cos/events';
import { OpenAIProvider } from '@cos/llm';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { ResearchPackage } from '@cos/types';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { Pool } = pg;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
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
    let tavilyFailReason: string | null = null;
    let braveFailReason: string | null = null;

    // 1. Try Tavily (primária — busca avançada + resumo pronto)
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    if (TAVILY_API_KEY) {
      try {
        console.log(`[Research Agent] 🔎 Tentando Tavily (search_depth=advanced)...`);
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

        if (!searchResponse.ok) {
          const errorBody = await searchResponse.text().catch(() => '');
          throw new Error(`Tavily API ${searchResponse.status}: ${errorBody.slice(0, 200)}`);
        }

        const data = await searchResponse.json() as any;
        if (data?.results?.length > 0) {
          searchResults = data;
          console.log(`[Research Agent] ✅ Tavily concluída (${data.results.length} resultados)`);
        } else {
          tavilyFailReason = 'respondeu OK mas retornou 0 resultados';
          console.warn(`[Research Agent] Tavily ${tavilyFailReason} para "${topic}"`);
        }
      } catch (err: any) {
        tavilyFailReason = err?.message ?? String(err);
        console.error('[Research Agent] Tavily Error, falling back to Brave Search:', err);
      }
    } else {
      tavilyFailReason = 'TAVILY_API_KEY não configurada';
      console.warn(`[Research Agent] ${tavilyFailReason}, tentando Brave Search direto...`);
    }

    // 2. Try Brave Search (fallback — normalizado pro mesmo formato do Tavily)
    if (!searchResults) {
      const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
      if (BRAVE_API_KEY) {
        try {
          console.log(`[Research Agent] 🔎 Tentando Brave Search (fallback)...`);
          const braveResponse = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(topic)}&count=5`,
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': BRAVE_API_KEY,
              },
            }
          );

          if (!braveResponse.ok) {
            const errorBody = await braveResponse.text().catch(() => '');
            throw new Error(`Brave API ${braveResponse.status}: ${errorBody.slice(0, 200)}`);
          }

          const braveData = await braveResponse.json() as any;
          const braveWebResults = braveData?.web?.results ?? [];

          if (braveWebResults.length > 0) {
            // Normaliza pro mesmo shape do Tavily, pra que o prompt do LLM
            // abaixo funcione idêntico independente da fonte
            searchResults = {
              answer: '', // Brave não gera resumo pronto como o Tavily
              results: braveWebResults.map((r: any) => ({
                title: r.title ?? '',
                url: r.url ?? '',
                content: r.description ?? '',
              })),
            };
            console.log(`[Research Agent] ✅ Brave Search concluída (${braveWebResults.length} resultados)`);
          } else {
            braveFailReason = 'respondeu OK mas retornou 0 resultados';
            console.warn(`[Research Agent] Brave Search ${braveFailReason} para "${topic}"`);
          }
        } catch (err: any) {
          braveFailReason = err?.message ?? String(err);
          console.error('[Research Agent] Brave Search Error:', err);
        }
      } else {
        braveFailReason = 'BRAVE_API_KEY não configurada';
        console.warn(`[Research Agent] ${braveFailReason}`);
      }
    }

    let result = { summary: '', facts: [], sources: [] };

    // 3. Ambas falharam → comportamento honesto (nunca inventa nada)
    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      console.warn(
        `[Research Agent] ⚠️ Nenhum resultado real para "${topic}" após tentar AMBAS as fontes. ` +
        `Tavily: ${tavilyFailReason ?? 'não tentada'}. ` +
        `Brave: ${braveFailReason ?? 'não tentada'}. ` +
        `Retornando vazio honestamente.`
      );
      result = {
        summary: `Nenhum fato encontrado para o tópico: ${topic}.`,
        facts: [],
        sources: []
      };
    } else {
      const prompt = `
        Faça uma pesquisa detalhada sobre o tópico: "${topic}".
        Direção editorial desejada: "${editorialDirection || 'Neutro'}".
        
        Aqui estão os resultados reais encontrados na internet para referência:
        ${JSON.stringify(searchResults.results, null, 2)}
        Resumo gerado pela pesquisa: ${searchResults.answer || ''}
        
        Extraia fatos importantes, estatísticas e um resumo baseando-se EXCLUSIVAMENTE nestes resultados reais. Não invente nenhuma informação.
        Responda APENAS com um objeto JSON no formato:
        {
          "summary": "Resumo geral do tópico baseado nos resultados",
          "facts": ["fato 1", "fato 2", "fato 3"],
          "sources": [{"title": "Nome da fonte", "url": "url"}]
        }
      `;

      const responseJsonStr = await llm.complete(prompt, { task: 'research', jsonMode: true, temperature: 0.3 });
      result = JSON.parse(responseJsonStr);
    }

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
    const worker = new Worker(qName, processResearchJob, { connection, concurrency: 2, lockDuration: 3 * 60 * 1000, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
