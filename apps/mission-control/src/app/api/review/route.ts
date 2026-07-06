import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { SUPERVISOR_QUEUE } from '@cos/events';

export async function POST(request: Request) {
  try {
    const { contentId, channelId, action, reason, metadata } = await request.json();

    if (!contentId || !channelId || !action) {
      return NextResponse.json({ error: 'Missing contentId, channelId, or action' }, { status: 400 });
    }

    if (!['approve', 'reject', 'regenerate'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisUrl = new URL(REDIS_URL);
    const connection = {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379', 10),
    };

    const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

    await supervisorQueue.add('REVIEW_RESULT', {
      contentId,
      channelId,
      action,
      reason,
      metadata
    });

    await supervisorQueue.close();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
