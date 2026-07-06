import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { QUEUE_TYPES } from '@cos/events';
import { query } from '@/lib/db';

const ALL_QUEUES = QUEUE_TYPES as unknown as string[];

export async function GET() {
  try {
    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisUrl = new URL(REDIS_URL);
    const connection = {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379', 10),
    };

    // Buscar contagens de cada fila do BullMQ em paralelo
    const queueData = await Promise.all(
      ALL_QUEUES.map(async (name) => {
        const q = new Queue(name, { connection });
        const counts = await q.getJobCounts('waiting', 'active', 'failed', 'completed', 'delayed');
        await q.close();
        return { name, counts };
      })
    );

    // Métricas do banco: total de retries por estado e taxa de abandono
    const { rows: retryRows } = await query(`
      SELECT 
        state,
        COUNT(*) as count
      FROM content_units
      GROUP BY state
    `);

    const { rows: abandonRows } = await query(`
      SELECT COUNT(*) as total FROM content_units WHERE state = 'ABANDONED'
    `);

    const { rows: totalRows } = await query(`
      SELECT COUNT(*) as total FROM content_units
    `);

    const { rows: avgTransitionRows } = await query(`
      SELECT 
        to_state,
        COUNT(*) as transitions
      FROM content_transitions
      GROUP BY to_state
      ORDER BY transitions DESC
      LIMIT 5
    `);

    // Calcular taxa de abandono real
    const abandoned = parseInt(abandonRows[0]?.total ?? '0');
    const total = parseInt(totalRows[0]?.total ?? '1');
    const abandonRate = total > 0 ? (abandoned / total) : 0;

    const stateDistribution = Object.fromEntries(
      retryRows.map((r: any) => [r.state, parseInt(r.count)])
    );

    const topTransitions = avgTransitionRows.map((r: any) => ({
      toState: r.to_state,
      count: parseInt(r.transitions),
    }));

    // Total de jobs processados em todas as filas
    const totalCompleted = queueData.reduce((acc, q) => acc + (q.counts.completed ?? 0), 0);
    const totalWaiting = queueData.reduce((acc, q) => acc + (q.counts.waiting ?? 0), 0);
    const totalActive = queueData.reduce((acc, q) => acc + (q.counts.active ?? 0), 0);
    const totalFailed = queueData.reduce((acc, q) => acc + (q.counts.failed ?? 0), 0);

    return NextResponse.json({
      queues: queueData,
      summary: {
        totalCompleted,
        totalWaiting,
        totalActive,
        totalFailed,
        status: totalActive > 0 ? 'PROCESSING' : totalWaiting > 0 ? 'QUEUED' : 'IDLE',
      },
      pipeline: {
        stateDistribution,
        abandonRate: parseFloat(abandonRate.toFixed(4)),
        topTransitions,
        totalUnits: total,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
