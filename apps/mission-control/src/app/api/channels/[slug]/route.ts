import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { rows } = await query('SELECT * FROM channel_registry WHERE slug = $1 OR id::text = $1', [slug]);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { core, strategy } = body;

    const { rows: existing } = await query('SELECT id FROM channel_registry WHERE slug = $1 OR id::text = $1', [slug]);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const channelId = existing[0].id;

    if (core) {
      await query(
        'UPDATE channel_registry SET core = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(core), channelId]
      );
    }

    if (strategy) {
      await query(
        'UPDATE channel_registry SET strategy = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(strategy), channelId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
