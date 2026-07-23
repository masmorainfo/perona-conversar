import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { queueName, QueueType } from '@cos/events';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const QUEUES: QueueType[] = [
  'editorial', 'research', 'script', 'critic', 'storyboard',
  'media', 'render', 'quality', 'cinematic-review', 'publish-youtube' as any
];

function getQueue(name: string, channelId: string): Queue {
  const qName = queueName(name as QueueType, channelId);
  return new Queue(qName, {
    connection: { url: process.env.REDIS_URL as string },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { rows } = await pool.query(
      'SELECT id, channel_id, topic, state, updated_at, metadata, attempt_counts FROM content_units WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const unit = rows[0];
    const metadata = unit.metadata || {};
    const actualChannelId = unit.channel_id;

    // executionsToday (from metadata.operatorActions)
    const operatorActions = metadata.operatorActions || [];
    const today = new Date().toISOString().split('T')[0];
    const executionsToday = operatorActions.filter((a: any) => a.at && a.at.startsWith(today)).length;
    const executionsLimit = 15;

    // lastError
    const lastError = metadata.lastError || metadata.error || null;

    // Queue Stats
    const queueStats = [];
    for (const q of QUEUES) {
      const queue = getQueue(q, actualChannelId);
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'failed');
        queueStats.push({
          queue: q,
          waiting: counts.waiting,
          active: counts.active,
          failed: counts.failed,
        });
      } catch (e) {
        // ignore redis errors if queue doesn't exist
      } finally {
        await queue.close();
      }
    }

    const pipelineUnit = {
      id: unit.id,
      topic: unit.topic,
      state: unit.state,
      lastTransitionAt: unit.updated_at,
      attemptCounts: unit.attempt_counts || metadata.attemptCounts || {},
      lastError,
      executionsToday,
      executionsLimit,
      queueStats
    };

    return NextResponse.json({ unit: pipelineUnit });
  } catch (error: any) {
    console.error('API Pipeline Inspector Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
