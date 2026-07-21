import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, CriticJobData, CriticResultData } from '@cos/events';
import { OpenAIProvider } from '@cos/llm';
import type { CriticEvaluation, CriticDimension, CriticSuggestion } from '@cos/types';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
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

async function processCriticJob(job: Job<CriticJobData>) {
  const { contentId, channelId, script, attemptNumber } = job.data;
  console.log(`[Critic Agent] Avaliando roteiro: "${script.title}" (Tentativa: ${attemptNumber})`);

  // ─── Ghost Script Safety Net ──────────────────────────────────────────────
  const templatePhrases = [
    "Uma história surpreendente sobre este acontecimento",
    "A primeira análise revela detalhes profundos",
    "Depois do momento de glória",
    "Hoje o legado se mantém vivo",
    "Como esses fatos mudaram a sua perspectiva"
  ];
  const containsTemplate = templatePhrases.some(phrase => {
    const inHook = script.hook?.includes(phrase);
    const inCta = script.cta?.includes(phrase);
    const inBody = script.body?.some((s: any) => s.content?.includes(phrase));
    return inHook || inCta || inBody;
  });

  if (containsTemplate) {
    console.warn(`[Critic Agent] 🚨 Roteiro-fantasma detectado para a unit ${contentId}! Reprovando automaticamente.`);
    const evaluation = {
      overallScore: 0.0,
      approved: false,
      dimensions: {
        originality: { score: 0.0, note: "Template de fallback detectado (Roteiro-Fantasma)", isBlocking: true }
      },
      blockingIssues: ["Roteiro-fantasma detectado: o roteiro contém partes do template de fallback."],
      suggestions: [
        { position: "Geral", issue: "Roteiro-fantasma", recommendation: "Re-escrever do zero sem usar fallbacks." }
      ],
      attemptNumber,
      maxAttempts: 3,
      evaluatedAt: new Date()
    };
    await supervisorQueue.add('CRITIC_RESULT', { contentId, channelId, evaluation });
    return;
  }

  // Fetch ChannelCore from registry
  const res = await pool.query('SELECT core FROM channel_registry WHERE id = $1', [channelId]);
  if (res.rowCount === 0) {
    throw new Error(`Channel ${channelId} not found`);
  }
  const channelCore = res.rows[0].core;

  const prompt = `
    Você é o Revisor Crítico do canal "${channelCore.name}".
    Sua responsabilidade é ser EXIGENTE e garantir que o roteiro siga os padrões de qualidade e regras do canal.
    
    Regras do canal:
    - Missão: "${channelCore.mission}"
    - Palavras proibidas: ${channelCore.persona?.forbiddenWords?.join(', ')}
    - Limites ALWAYS OUT: ${channelCore.editorialLimits?.alwaysOut?.join(', ')}
    
    Roteiro em análise:
    Título: ${script.title}
    Hook: ${script.hook}
    Corpo:
    ${script.body.map((s: any, idx: number) => `Sec ${idx+1} (${s.durationSeconds}s): ${s.content} [Visual: ${s.visualNote || 'none'}]`).join('\n')}
    CTA: ${script.cta}
    
    Avalie este roteiro. Se houver falhas graves, "approved" deve ser false e informe os "blockingIssues".
    
    ATENÇÃO — Política CLP (Content Localization Policy):
    O COS é um sistema de LOCALIZAÇÃO, não de tradução.
    Se o roteiro contiver termos em japonês, árabe, coreano ou outros idiomas não-latinos SEM localização adequada
    para o público brasileiro, isso é uma falha BLOQUEANTE.
    Princípio: "Um brasileiro médio compreende imediatamente este termo?"
    
    Responda APENAS com um objeto JSON no formato:
    {
      "overallScore": 0.8,
      "approved": true,
      "dimensions": {
        "clarity": { "score": 0.9, "note": "ok", "isBlocking": false },
        "retention": { "score": 0.7, "note": "Hook longo", "isBlocking": false },
        "naturalness": { "score": 0.8, "note": "ok", "isBlocking": false },
        "rhythm": { "score": 0.8, "note": "ok", "isBlocking": false },
        "originality": { "score": 0.7, "note": "ok", "isBlocking": false },
        "copyright": { "score": 1.0, "note": "ok", "isBlocking": false },
        "seo": { "score": 0.9, "note": "ok", "isBlocking": false },
        "localization": { "score": 1.0, "note": "Todos os termos estrangeiros localizados corretamente", "isBlocking": false }
      },
      "blockingIssues": [],
      "suggestions": [
        { "position": "Hook", "issue": "Longo demais", "recommendation": "Cortar os 5 segundos iniciais" }
      ]
    }
  `;


  try {
    const responseJsonStr = await llm.complete(prompt, { task: 'editorial', jsonMode: true, temperature: 0.1 });
    const result = JSON.parse(responseJsonStr);

    const evaluation: CriticEvaluation = {
      overallScore: result.overallScore ?? 0.9,
      approved: typeof result.approved === 'boolean' ? result.approved : true,
      dimensions: result.dimensions || { clarity: { score: 0.9, note: "ok", isBlocking: false } },
      blockingIssues: result.blockingIssues || [],
      suggestions: result.suggestions || [],
      attemptNumber,
      maxAttempts: 3, // Reflete RETRY_LIMITS de @cos/types
      evaluatedAt: new Date(),
    };

    const resultData: CriticResultData = {
      contentId,
      channelId,
      evaluation,
    };

    await supervisorQueue.add('CRITIC_RESULT', resultData);
    console.log(`[Critic Agent] Roteiro avaliado. Aprovado: ${evaluation.approved} (Score: ${evaluation.overallScore})`);
  } catch (error) {
    console.error(`[Critic Agent] Erro ao avaliar roteiro:`, error);
    throw error;
  }
}

async function bootstrap() {
  console.log('🚀 Iniciando Critic Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('critic', channelId);
    const worker = new Worker(qName, processCriticJob, { connection, concurrency: 2, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
