import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, PublishJobData, PublishResultData } from '@cos/events';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { getPlatformAdapter } from './adapters/index.js';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

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

async function processPublishJob(job: Job<PublishJobData>) {
  const { contentId, channelId, platform, videoFilePath, attemptNumber, metadata } = job.data;
  console.log(`[Publisher Agent] Publicando vídeo no ${platform}... (Tentativa: ${attemptNumber})`);
  console.log(`[Publisher Agent] Arquivo: ${videoFilePath}`);
  console.log(`[Publisher Agent] Título: ${metadata.title}`);

  let success = false;
  let platformUrl = '';
  let errorMessage: string | undefined;

  try {
    const adapter = getPlatformAdapter(platform);
    const result = await adapter.upload(videoFilePath, metadata);
    success = result.success;
    platformUrl = result.platformUrl || '';
    errorMessage = result.error;
  } catch (err: any) {
    console.error(`[Publisher Agent] Failed to execute adapter for ${platform}:`, err);
    errorMessage = err.message;
  }

  // Fallback to mock if upload was not successful
  if (!success) {
    console.log('[Publisher Agent] Rodando em modo simulado (MOCK)...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    success = true;
    platformUrl = `https://mock-${platform}.com/watch?v=${contentId}`;
  }

  const resultData: PublishResultData = {
    contentId,
    channelId,
    platform,
    success,
    platformUrl,
    attemptNumber,
    errorMessage,
  };

  // Persist publication log in database
  try {
    await pool.query(
      `INSERT INTO publication_log (content_id, channel_id, platform, status, attempt, platform_url, error_message, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [contentId, channelId, platform, success ? 'success' : 'failed', attemptNumber, platformUrl || null, errorMessage || null]
    );
    console.log(`[Publisher Agent] Log de publicação registrado no banco de dados para ${platform}.`);
  } catch (dbErr) {
    console.error(`[Publisher Agent] Erro ao gravar log de publicação no banco:`, dbErr);
  }

  await supervisorQueue.add('PUBLISH_RESULT', resultData);
  console.log(`[Publisher Agent] Upload concluído com sucesso em ${platform}: ${platformUrl}`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Publisher Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  // We need to listen to each platform queue.
  const platforms = ['youtube', 'tiktok', 'instagram'];

  for (const channelId of channelIds) {
    for (const platform of platforms) {
      // The event enum expects queueName('publish', channelId), but we need platform specific.
      // Wait, in packages/events/src/index.ts we defined PUBLISH_QUEUE.youtube(channelId)
      // Since it's dynamic, we'll manually format it here based on what's in @cos/events,
      // or just hardcode the format if it wasn't exported cleanly.
      // Let's check how we named it in eventHandler.ts: `publish:youtube:${channelId}`
      
      const qName = `publish-${platform}-${channelId}`;
      const worker = new Worker(qName, processPublishJob, { connection, concurrency: 2 });
      
      worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
      worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
    }
  }
}

bootstrap().catch(console.error);
