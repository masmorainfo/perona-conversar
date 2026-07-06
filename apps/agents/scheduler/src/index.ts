import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker, Job, Queue } from 'bullmq';
import pg from 'pg';
import Redis from 'ioredis';
import { NORMALIZED_SIGNAL_QUEUE, OPPORTUNITY_TRIGGER_QUEUE, SUPERVISOR_QUEUE } from '@cos/events';
import { DefaultScoringStrategy } from './score.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
};

const redisClient = new (Redis as any)(REDIS_URL);
const opportunityQueue = new Queue(OPPORTUNITY_TRIGGER_QUEUE, { connection });
// Assuming Supervisor picks up new opportunities or Editorial agent polls QUEUED
// For now, we will just update the status to QUEUED. If an event is needed, we could send it to SUPERVISOR_QUEUE.
const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

// Limiares para disparo definidos pelo usuário
const MIN_SIGNALS_TO_TRIGGER = 3; 
const MAX_TIME_WITHOUT_TRIGGER_MS = 2 * 60 * 60 * 1000; // 2 horas

const DYNAMIC_SCORE_THRESHOLD = 80;

async function processSignal(job: Job) {
  const lastTriggerStr = await redisClient.get('scheduler:last_opportunity_trigger');
  const lastTriggerTime = lastTriggerStr ? parseInt(lastTriggerStr, 10) : 0;
  
  const now = Date.now();
  
  // Regra 1: Tempo máximo
  if (now - lastTriggerTime >= MAX_TIME_WITHOUT_TRIGGER_MS) {
    await triggerOpportunityEngine(now, "max_time_elapsed");
    return;
  }
  
  // Regra 2: Quantidade de sinais acumulados
  const res = await pool.query(
    'SELECT COUNT(*) FROM normalized_signals WHERE created_at > to_timestamp($1 / 1000.0)',
    [lastTriggerTime]
  );
  const count = parseInt(res.rows[0].count, 10);
  
  if (count >= MIN_SIGNALS_TO_TRIGGER) {
    await triggerOpportunityEngine(now, `min_signals_reached_${count}`);
    return;
  }
  
  console.log(`[Scheduler] Sinal recebido, regras não atingidas. Sinais pendentes: ${count}.`);
}

async function triggerOpportunityEngine(now: number, reason: string) {
  console.log(`[Scheduler] 🚀 Disparando Opportunity Engine! Motivo: ${reason}`);
  await opportunityQueue.add('trigger', { timestamp: now, reason });
  await redisClient.set('scheduler:last_opportunity_trigger', now.toString());
}

async function evaluateOpportunities() {
  try {
    const { rows: opportunities } = await pool.query(
      `SELECT id, org_id, channel_id, base_score, created_at, title, category, source_count, geographic_expansion, editorial_compatibility, momentum FROM content_opportunities WHERE status = 'PENDING'`
    );

    if (opportunities.length === 0) return;

    console.log(`[Scheduler] Avaliando ${opportunities.length} oportunidades PENDING...`);

    const now = Date.now();
    const scoringStrategy = new DefaultScoringStrategy();

    for (const opp of opportunities) {
      const createdAt = new Date(opp.created_at).getTime();
      const factors = {
        category: opp.category,
        sourceCount: opp.source_count,
        geographicExpansion: opp.geographic_expansion,
        editorialCompatibility: opp.editorial_compatibility,
        momentum: opp.momentum,
      };
      const dynamicScore = scoringStrategy.calculateScore(opp.base_score, factors, createdAt, now);

      if (dynamicScore >= DYNAMIC_SCORE_THRESHOLD) {
        console.log(`[Scheduler] 🌟 Oportunidade promovida para QUEUED: "${opp.title}" (Score: ${dynamicScore.toFixed(2)})`);
        await pool.query(
          `UPDATE content_opportunities SET dynamic_score = $1, status = 'QUEUED', updated_at = NOW() WHERE id = $2`,
          [dynamicScore, opp.id]
        );

        console.log(`[Scheduler] Injetando Oportunidade "${opp.title}" no pipeline...`);
        // 1. Create content unit
        const insertRes = await pool.query(
          `INSERT INTO content_units (org_id, channel_id, topic, state, metadata, attempt_counts)
           VALUES ($1, $2, $3, 'DISCOVERED', jsonb_build_object('topic', $3::text, 'opportunity_id', $4::text), '{}')
           RETURNING id`,
          [opp.org_id, opp.channel_id, opp.title, opp.id]
        );
        const contentId = insertRes.rows[0].id;

        // 2. Insert transition
        await pool.query(
          `INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
           VALUES ($1, 'DISCOVERED', 'DISCOVERED', 'agent:scheduler', $2)`,
          [contentId, `Opportunity promoted to QUEUED (Score: ${dynamicScore.toFixed(2)})`]
        );

        // 3. Dispatch EVALUATE_TRIGGER to Supervisor
        await supervisorQueue.add('EVALUATE_TRIGGER', {
          contentId,
          channelId: opp.channel_id,
          topic: opp.title,
        });

      } else if (dynamicScore <= 0) {
        console.log(`[Scheduler] 🗑️ Oportunidade descartada por decay: "${opp.title}"`);
        await pool.query(
          `UPDATE content_opportunities SET dynamic_score = $1, status = 'DISCARDED', updated_at = NOW() WHERE id = $2`,
          [dynamicScore, opp.id]
        );
      } else {
        // Apenas atualiza o score dinâmico
        await pool.query(
          `UPDATE content_opportunities SET dynamic_score = $1, updated_at = NOW() WHERE id = $2`,
          [dynamicScore, opp.id]
        );
      }
    }
  } catch (err) {
    console.error(`[Scheduler] Erro ao avaliar oportunidades:`, err);
  }
}

async function bootstrap() {
  console.log('⏳ Iniciando Intelligence Scheduler...');
  
  const worker = new Worker(NORMALIZED_SIGNAL_QUEUE, processSignal, { connection, concurrency: 1 });
  
  worker.on('ready', () => {
    console.log(`✅ Ouve fila: ${NORMALIZED_SIGNAL_QUEUE}`);
  });
  
  worker.on('error', err => {
    console.error(`🚨 Erro no worker ${NORMALIZED_SIGNAL_QUEUE}:`, err);
  });

  // Avalia as oportunidades a cada minuto
  setInterval(evaluateOpportunities, 60 * 1000);
  console.log(`✅ Loop de avaliação de Opportunities iniciado (1m).`);
  
  // Executa uma vez no início
  await evaluateOpportunities();
}

bootstrap().catch(console.error);

