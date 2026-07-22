import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, QualityJobData, QualityResultData } from '@cos/events';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeVideoQuality } from './quality-checker.js';

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

const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

async function processQualityJob(job: Job<QualityJobData>) {
  const { contentId, channelId, videoFilePath } = job.data;
  console.log(`[Quality Control Agent] Analisando vídeo: ${videoFilePath}`);

  // Executa verificação real com FFmpeg + análise perceptual de escuridão
  const analysis = analyzeVideoQuality(videoFilePath);

  console.log(`[Quality Control Agent] Métricas calculadas:`, {
    duracao: `${analysis.metrics.durationSeconds.toFixed(1)}s`,
    resolucao: `${analysis.metrics.width}x${analysis.metrics.height}`,
    fps: analysis.metrics.fps,
    framesEscuros: `${analysis.metrics.darkFramesCount}/${analysis.metrics.totalSampledFrames} (${analysis.metrics.darkFramePercentage.toFixed(1)}%)`,
    brilhoMedioAmostras: analysis.metrics.frameMeanBrightness.slice(0, 10), // primeiras 10 amostras
  });

  const resultData: QualityResultData = {
    contentId,
    channelId,
    approved: analysis.approved,
    score: analysis.score,
    checklist: analysis.checklist,
  };

  if (!analysis.approved) {
    resultData.reason = analysis.reason || "Falhou nos critérios automatizados de qualidade.";
  }

  await supervisorQueue.add('QUALITY_RESULT', resultData);
  console.log(`[Quality Control Agent] Análise concluída. Aprovado: ${analysis.approved} (Score: ${analysis.score})`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Quality Control Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('quality', channelId);
    const worker = new Worker(qName, processQualityJob, { connection, concurrency: 2, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
