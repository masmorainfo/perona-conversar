import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker, Job } from 'bullmq';
import { OPPORTUNITY_TRIGGER_QUEUE } from '@cos/events';
import { OpportunityEngine } from './engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables relative to current package in apps/agents/observer/
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

const engine = new OpportunityEngine(pool);

async function runObserverCycle(job: Job) {
  const { reason, timestamp } = job.data;
  console.log(`\n--- 🌎 Iniciando Ciclo do Opportunity Engine ---`);
  console.log(`[Opportunity Engine] Triggered by Scheduler. Reason: ${reason}`);
  try {
    // Run Opportunity Engine to identify opportunities for each active channel
    // The engine now fetches signals directly from the normalized_signals table
    await engine.generateOpportunities();

    console.log('--- 🌎 Ciclo do Opportunity Engine Concluído com Sucesso ---');
  } catch (err: any) {
    console.error('🚨 [Opportunity Engine] Erro no ciclo:', err);
  }
}

async function bootstrap() {
  console.log('🚀 Iniciando Opportunity Engine (Worker)...');
  
  const worker = new Worker(OPPORTUNITY_TRIGGER_QUEUE, runObserverCycle, { connection, concurrency: 1, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } });
  
  worker.on('ready', () => {
    console.log(`✅ Ouve fila: ${OPPORTUNITY_TRIGGER_QUEUE}`);
  });
  
  worker.on('error', err => {
    console.error(`🚨 Erro no worker ${OPPORTUNITY_TRIGGER_QUEUE}:`, err);
  });
}

bootstrap().catch(console.error);
