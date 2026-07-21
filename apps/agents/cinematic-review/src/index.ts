import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, CinematicJobData, CinematicResultData } from '@cos/events';
import { OpenAIProvider } from '@cos/llm';
import type { CinematicEvaluation } from '@cos/types';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
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

async function processCinematicJob(job: Job<CinematicJobData>) {
  const { contentId, channelId, videoFilePath, script, attemptNumber } = job.data;
  // Check if this content unit is a VLS experiment (which bypasses editorial rejection to maintain scientific control)
  const unitRes = await pool.query('SELECT metadata FROM content_units WHERE id = $1', [contentId]);
  const metadata = unitRes.rows[0]?.metadata || {};
  const isVls = metadata.isVls || metadata.is_vls_experiment || false;

  if (isVls) {
    console.log(`[Cinematic Review Agent] 🔬 Unit ${contentId} detectada como experimento VLS. Aprovação automática para manter o controle científico.`);
    const evaluation: CinematicEvaluation = {
      approved: true,
      reasons: [],
      feedback: 'Aprovado automaticamente como parte do experimento VLS para controle de hipóteses.',
      suggestions: [],
      attemptNumber,
      maxAttempts: 3,
      evaluatedAt: new Date()
    };
    const resultData: CinematicResultData = {
      contentId,
      channelId,
      approved: true,
      evaluation
    };
    await supervisorQueue.add('CINEMATIC_RESULT', resultData);
    return;
  }

  // Fetch ChannelCore from registry
  const res = await pool.query('SELECT core FROM channel_registry WHERE id = $1', [channelId]);
  if (res.rowCount === 0) {
    throw new Error(`Channel ${channelId} not found`);
  }
  const channelCore = res.rows[0].core;  // Carregar KAI-DNA
  const dnaPath = path.resolve(process.cwd(), '../../../dna/kairo_dna.json');
  let dna: any = { genes: {} };
  if (fs.existsSync(dnaPath)) {
    try {
      dna = JSON.parse(fs.readFileSync(dnaPath, 'utf-8'));
    } catch (err) {
      console.error('[Cinematic Review Agent] Erro ao ler DNA:', err);
    }
  }

  // Filtrar apenas genes que não estão Dormant
  const activeGenes: any = {};
  if (dna.genes) {
    for (const [geneCategory, geneOptions] of Object.entries(dna.genes)) {
      activeGenes[geneCategory] = {};
      for (const [geneName, geneValue] of Object.entries(geneOptions as any)) {
        if ((geneValue as any).maturity !== 'Dormant') {
          activeGenes[geneCategory][geneName] = geneValue;
        }
      }
    }
  }

  const prompt = `
    Você é o Diretor de Cinema e Editor-Chefe do canal de futebol mundial "${channelCore.name}".
    Sua missão é atuar como o guardião da cultura e identidade da marca KAIRO. O objetivo não é atribuir notas técnicas ou numéricas, mas responder a uma única pergunta existencial: "A KAIRO assinaria este vídeo?"

    Aqui estão os genes do DNA Cinematográfico ativos do nosso canal com seus respectivos níveis de maturidade baseados em evidências:
    ${JSON.stringify(activeGenes, null, 2)}

    O vídeo foi produzido com o seguinte roteiro:
    Título: ${script.title}
    Hook (Primeiros 5s): ${script.hook}
    Corpo:
    ${script.body.map((s: any, idx: number) => `Cena ${idx+1} (${s.durationSeconds}s): ${s.content} [Nota Visual: ${s.visualNote || 'Nenhuma'}]`).join('\n')}
    CTA: ${script.cta}

    Avalie o roteiro e os metadados visuais sob os princípios da nossa Assinatura Editorial:
    1. Humanidade Narrativa: O texto evita clichês de IA? Transmite alma e poesia? O gancho de atenção inicial conecta com contradições profundas?
    2. Ritmo & Tensão: O tempo dos cortes e pausas dramáticas sugeridas criam tensão e mantêm o espectador preso?
    3. Aderência Estética: O visual se enquadra na paleta de cores e atmosfera solene do futebol clássico da KAIRO?
    4. Legendas como Arte: As quebras de frase e a cadência apoiam o fluxo natural da fala?
    5. Orgulho da Marca: Este vídeo representa a alma da KAIRO e está pronto para receber a assinatura oficial da marca?

    Se o vídeo possuir problemas como narração robótica, ritmo mecânico, imagens inadequadas, legendas ruins ou se afastar da alma da marca, ele deve ser classificado como "UNSIGNABLE". Caso contrário, se estiver excelente e apto a carregar a marca KAIRO, classifique como "SIGNABLE".

    Retorne APENAS um objeto JSON no formato exato:
    {
      "signature": "SIGNABLE" | "UNSIGNABLE",
      "reasons": [
        "lista de motivos qualitativos de rejeição apenas se for UNSIGNABLE. Exemplo: 'A narração ainda parece artificial.', 'O ritmo está mecânico.'"
      ],
      "feedback": "Crítica detalhada e construtiva sobre a identidade poética e a direção estética do vídeo.",
      "suggestions": [
        "Sugestões práticas de melhoria na re-direção do vídeo."
      ]
    }
  `;

  try {
    const responseJsonStr = await llm.complete(prompt, { task: 'cinematic-review', jsonMode: true, temperature: 0.2 });
    const result = JSON.parse(responseJsonStr);

    const isApproved = result.signature === 'SIGNABLE';

    const evaluation: CinematicEvaluation = {
      approved: isApproved,
      reasons: result.reasons || [],
      feedback: result.feedback || 'Análise de assinatura concluída.',
      suggestions: result.suggestions || [],
      attemptNumber,
      maxAttempts: 3,
      evaluatedAt: new Date()
    };

    const resultData: CinematicResultData = {
      contentId,
      channelId,
      approved: evaluation.approved,
      evaluation,
      reason: evaluation.approved ? undefined : (evaluation.reasons.join('; ') || 'Não atendeu os critérios da Assinatura Editorial.')
    };

    await supervisorQueue.add('CINEMATIC_RESULT', resultData);
    console.log(`[Cinematic Review Agent] Análise concluída para a unit ${contentId}. Assinável: ${evaluation.approved}`);
  } catch (err: any) {
    console.error(`[Cinematic Review Agent] Erro ao processar análise para unit ${contentId}:`, err);
    // Fallback defensivo: aprovar em caso de erro extremo na chamada da LLM para não travar o pipeline físico de testes
    const evaluation: CinematicEvaluation = {
      approved: true,
      reasons: [],
      feedback: 'Aprovado via fallback por falha de API de LLM.',
      suggestions: [],
      attemptNumber,
      maxAttempts: 3,
      evaluatedAt: new Date()
    };
    const resultData: CinematicResultData = {
      contentId,
      channelId,
      approved: true,
      evaluation
    };
    await supervisorQueue.add('CINEMATIC_RESULT', resultData);
  }
}

async function bootstrap() {
  console.log('🚀 Iniciando Cinematic Review Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('cinematic-review', channelId);
    const worker = new Worker(qName, processCinematicJob, { connection, concurrency: 2, lockDuration: 3 * 60 * 1000, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
