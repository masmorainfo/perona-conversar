import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, RenderJobData, RenderResultData } from '@cos/events';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { compositeVideo } from './video-compositor.js';

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

async function processRenderJob(job: Job<RenderJobData>) {
  const { contentId, channelId, script, assetUrls, canonArchetype } = job.data;
  console.log(`[Render Engine] Renderizando vídeo: "${script.title}" [arquétipo: ${canonArchetype ?? 'nenhum'}]`);

  // Ensure the /tmp/outputs directory exists
  const outDir = path.resolve(process.cwd(), '../../../tmp/outputs');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const videoFileName = `${channelId}_${contentId}.mp4`;
  const videoFilePath = path.join(outDir, videoFileName);

  // Run the actual compositor using FFmpeg
  await compositeVideo(contentId, script, assetUrls, videoFilePath, canonArchetype);

  const resultData: RenderResultData = {
    contentId,
    channelId,
    videoFilePath,
  };

  await supervisorQueue.add('RENDER_RESULT', resultData);
  console.log(`[Render Engine] Vídeo renderizado com sucesso em: ${videoFilePath}`);
}

async function bootstrap() {
  console.log('🚀 Iniciando Render Engine...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('render', channelId);
    const worker = new Worker(qName, processRenderJob, { connection, concurrency: 1 }); // Geralmente render exige concurrency 1
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
