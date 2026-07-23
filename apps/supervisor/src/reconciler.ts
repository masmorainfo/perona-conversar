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
  // Run every 10 minutes
  setInterval(async () => {
    try {
      await runReconciliation(pool);
    } catch (err) {
      console.error('[Supervisor Reconciler] Error during run:', err);
    }
  }, 10 * 60 * 1000);
  
  // Run once on startup after a small delay
  setTimeout(() => runReconciliation(pool).catch(console.error), 10 * 1000);
}

async function runReconciliation(pool: any) {
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
  
  for (const unit of rows) {
    const state = unit.state as ContentState;
    const queueType = getExpectedQueueForState(state);
    if (!queueType) continue;

    const queue = getQueue(queueType, unit.channel_id);
    const jobId = `${unit.id}:${state}`;
    
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        console.warn(`[Supervisor Reconciler] 🚨 Limbo detected for unit ${unit.id} in state ${state}. Job ${jobId} not found in queue ${queueType}. Marking as QUEUE_ERROR.`);
        
        const metadata = typeof unit.metadata === 'string' ? JSON.parse(unit.metadata) : unit.metadata;
        const attemptCounts = typeof unit.attempt_counts === 'string' ? JSON.parse(unit.attempt_counts) : unit.attempt_counts;

        const queueErrorMetadata = {
          ...(metadata || {}),
          queueErrorFrom: state,
          queueErrorSource: 'reconciler',
          queueErrorReason: `Job ${jobId} not found in BullMQ after 15 minutes in state ${state}`,
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
      }
    } catch (err) {
      console.error(`[Supervisor Reconciler] Error checking job for unit ${unit.id}:`, err);
    }
  }
}
