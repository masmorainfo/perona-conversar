import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, QualityJobData, QualityResultData } from '@cos/events';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

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

const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

async function processQualityJob(job: Job<QualityJobData>) {
  const { contentId, channelId, videoFilePath } = job.data;
  console.log(`[Quality Control Agent] Analisando vídeo: ${videoFilePath}`);

  // Simulating FFmpeg-probe / computer vision checks
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Mock verification - always approve in this mock version
  const checklist = {
    hasAudio: true,
    hasSubtitles: true,
    durationWithinRange: true,
    resolutionMeetsRequirements: true,
    noBlackFrames: true,
    audioLevelAcceptable: true
  };

  const score = 1.0;
  const approved = true;

  const resultData: QualityResultData = {
    contentId,
    channelId,
    approved,
    score,
    checklist,
  };

  if (!approved) {
    resultData.reason = "Falhou em testes automatizados de controle de qualidade (ex: sem áudio).";
  }

  await supervisorQueue.add('QUALITY_RESULT', resultData);
  console.log(`[Quality Control Agent] Análise concluída. Aprovado: ${approved} (Score: ${score})`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Quality Control Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('quality', channelId);
    const worker = new Worker(qName, processQualityJob, { connection, concurrency: 2 });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
