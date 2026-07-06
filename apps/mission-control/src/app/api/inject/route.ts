import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { SUPERVISOR_QUEUE } from '@cos/events';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelId, topic } = body;

    if (!channelId || !topic) {
      return NextResponse.json({ error: 'Missing channelId or topic' }, { status: 400 });
    }

    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisUrl = new URL(REDIS_URL);
    const connection = {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379', 10),
    };

    const supervisorQueue = new Queue(SUPERVISOR_QUEUE, { connection });

    // 1. Inserir no banco como DISCOVERED
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId);
    const queryText = isUuid 
      ? 'SELECT id FROM channel_registry WHERE id = $1::uuid'
      : 'SELECT id FROM channel_registry WHERE slug = $1';

    const { rows: channelRows } = await import('@/lib/db').then(db =>
      db.query(queryText, [channelId])
    );

    if (channelRows.length === 0) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const realChannelId = channelRows[0].id;

    const { rows: contentRows } = await import('@/lib/db').then(db =>
      db.query(
        `INSERT INTO content_units (channel_id, topic, state, metadata, attempt_counts)
         VALUES ($1, $2, 'DISCOVERED', '{}'::jsonb, '{}'::jsonb)
         RETURNING id`,
        [realChannelId, topic]
      )
    );

    const contentId = contentRows[0].id;

    // 2. Enfileirar o disparo no BullMQ para o supervisor pegar
    await supervisorQueue.add('EVALUATE_TRIGGER', {
      contentId,
      channelId: realChannelId,
      topic,
    });

    await supervisorQueue.close();

    return NextResponse.json({ success: true, contentId });
  } catch (error: any) {
    console.error('API Inject Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
