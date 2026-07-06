import { Worker, Job, Queue } from 'bullmq';
import { SUPERVISOR_QUEUE, queueName, AnalyticsJobData } from '@cos/events';
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
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

// Analytics currently doesn't reply to Supervisor via BullMQ to transition content states,
// Wait, the plan says it transitions to ANALYZED. 
// We will emit an ANALYTICS_RESULT back to the supervisor.
const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

async function processAnalyticsJob(job: Job<AnalyticsJobData>) {
  const { contentId, channelId, publicationResults } = job.data;
  console.log(`[Analytics Agent] Ingerindo métricas para ${contentId} em ${publicationResults.length} plataformas.`);

  // Simulating metrics gathering
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Mock writing to performance_index
  const mockMetrics = {
    views: Math.floor(Math.random() * 10000) + 1000,
    ctr: (Math.random() * 5 + 3).toFixed(2), // 3-8%
    retentionPercent: (Math.random() * 30 + 40).toFixed(2), // 40-70%
    shares: Math.floor(Math.random() * 500)
  };

  // Here we insert each metric as a row in performance_index PG table.
  const metricsList = [
    { metric: 'views', value: mockMetrics.views },
    { metric: 'ctr', value: parseFloat(mockMetrics.ctr) },
    { metric: 'retentionPercent', value: parseFloat(mockMetrics.retentionPercent) },
    { metric: 'shares', value: mockMetrics.shares }
  ];

  for (const item of metricsList) {
    await pool.query(
      `INSERT INTO performance_index (channel_id, content_id, platform, metric_type, value, signal_tier, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [channelId, contentId, 'youtube', item.metric, item.value, 'short']
    );
  }

  console.log(`[Analytics Agent] Métricas gravadas no banco de dados:`, mockMetrics);

  // Tell supervisor to advance state to ANALYZED
  // Note: We need to define ANALYTICS_RESULT in eventHandler, but we can pass it generically.
  await supervisorQueue.add('ANALYTICS_RESULT', { contentId, channelId });
}

async function bootstrap() {
  console.log('🚀 Iniciando Analytics Agent...');
  
  const channelsRes = await pool.query('SELECT id FROM channel_registry');
  const channelIds = channelsRes.rows.map(r => r.id);
  if (channelIds.length === 0) channelIds.push('tech-br-001');

  for (const channelId of channelIds) {
    const qName = queueName('analytics', channelId);
    const worker = new Worker(qName, processAnalyticsJob, { connection, concurrency: 2 });
    
    worker.on('ready', () => console.log(`✅ Ouve fila: ${qName}`));
    worker.on('error', err => console.error(`🚨 Erro no worker ${qName}:`, err));
  }
}

bootstrap().catch(console.error);
