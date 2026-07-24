import { Queue } from 'bullmq';
import { persistTransition } from './db.js';
import { queueName } from '@cos/events';
import type { ContentState } from '@cos/types';

// Map of queues
const queues = new Map<string, Queue>();

function getQueue(queueType: string, channelId: string): Queue {
  const name = queueName(queueType as any, channelId);
  if (!queues.has(name)) {
    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisUrl = new URL(REDIS_URL);
    queues.set(name, new Queue(name, {
      connection: {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
      },
    }));
  }
  return queues.get(name)!;
}

function getExpectedQueueForState(state: ContentState): string | null {
  switch(state) {
    case 'EVALUATED': return 'editorial';
    case 'APPROVED': return 'research';
    case 'RESEARCHED':
    case 'REVISED': return 'script';
    case 'SCRIPTED': return 'critic';
    case 'CRITIC_OK': return 'storyboard';
    case 'STORYBOARD_PLANNED': return 'media';
    case 'PRODUCED': return 'render';
    case 'RENDERED': return 'quality';
    case 'CINEMATIC_REVIEWING': return 'cinematic-review';
    case 'PUBLISHED':
    case 'PUBLISHED_PARTIAL': return 'analytics';
    case 'ANALYZED': return 'learning';
    default: return null;
  }
}

export function startReconciler(pool: any) {
  const INTERVAL_MS = 10 * 60 * 1000;
  console.log(`[Supervisor Reconciler] ✅ Iniciado. Ciclo a cada ${INTERVAL_MS / 60000} min. Primeiro ciclo em 10s.`);

  setInterval(async () => {
    try {
      await runReconciliation(pool);
    } catch (err) {
      console.error('[Supervisor Reconciler] ❌ Erro fatal no ciclo:', err);
    }
  }, INTERVAL_MS);

  // Run once on startup after a small delay
  setTimeout(() => runReconciliation(pool).catch(err => {
    console.error('[Supervisor Reconciler] ❌ Erro no ciclo inicial (boot):', err);
  }), 10 * 1000);
}

async function runReconciliation(pool: any) {
  const cycleStart = new Date().toISOString();
  const processableStates = [
    'EVALUATED', 'APPROVED', 'RESEARCHED', 'REVISED', 'SCRIPTED', 
    'CRITIC_OK', 'STORYBOARD_PLANNED', 'PRODUCED', 'RENDERED', 
    'CINEMATIC_REVIEWING', 'PUBLISHED', 'PUBLISHED_PARTIAL', 'ANALYZED'
  ];

  const query = `
    SELECT id, channel_id, state, metadata, attempt_counts
    FROM content_units
    WHERE state = ANY($1)
      AND updated_at < NOW() - INTERVAL '15 minutes'
  `;
  
  const { rows } = await pool.query(query, [processableStates]);
  console.log(`[Supervisor Reconciler] 🔍 Ciclo iniciado em ${cycleStart}. Units varridas (>15min paradas): ${rows.length}.`);

  let limbosFound = 0;
  let errorsFound = 0;

  for (const unit of rows) {
    const state = unit.state as ContentState;
    const queueType = getExpectedQueueForState(state);
    if (!queueType) continue;

    const queue = getQueue(queueType, unit.channel_id);
    const jobId = `${unit.id}_${state}`;
    
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        limbosFound++;
        console.warn(`[Supervisor Reconciler] 🚨 Limbo detectado: unit ${unit.id} em estado ${state} há >15min. Job ${jobId} ausente na fila '${queueType}'. Marcando QUEUE_ERROR.`);
        
        const metadata = typeof unit.metadata === 'string' ? JSON.parse(unit.metadata) : unit.metadata;
        const attemptCounts = typeof unit.attempt_counts === 'string' ? JSON.parse(unit.attempt_counts) : unit.attempt_counts;

        const queueErrorMetadata = {
          ...(metadata || {}),
          queueErrorFrom: state,
          queueErrorSource: 'reconciler',
          queueErrorReason: `Job ${jobId} não encontrado no BullMQ após 15 minutos no estado ${state}`,
          queueErrorAt: new Date().toISOString()
        };

        await persistTransition(
          pool,
          unit.id,
          state,
          'QUEUE_ERROR',
          'agent:reconciler',
          `Limbo reconciliation: Job missing`,
          queueErrorMetadata,
          attemptCounts
        );
      } else {
        const jobState = await job.getState();
        console.log(`[Supervisor Reconciler]   ↳ Unit ${unit.id} (${state}): job encontrado na fila '${queueType}', estado BullMQ = '${jobState}'.`);
      }
    } catch (err) {
      errorsFound++;
      console.error(`[Supervisor Reconciler] ❌ Erro ao verificar job da unit ${unit.id} (${state}):`, err);
    }
  }

  console.log(`[Supervisor Reconciler] ✅ Ciclo concluído. Varridas: ${rows.length}, Limbos: ${limbosFound}, Erros: ${errorsFound}.`);
}
