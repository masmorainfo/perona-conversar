import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const { rows: channels } = await query(
      `SELECT id, slug, name, inherits_from, is_active, priority, created_at, updated_at
       FROM channel_registry
       ORDER BY created_at DESC`
    );

    const { rows: contentUnits } = await query(
      `SELECT cu.id, cu.channel_id, cu.topic, cu.state, cu.metadata, cu.attempt_counts, cu.created_at, cu.updated_at, cr.name as channel_name
       FROM content_units cu
       JOIN channel_registry cr ON cu.channel_id = cr.id
       ORDER BY cu.updated_at DESC
       LIMIT 50`
    );

    const { rows: transitions } = await query(
      `SELECT ct.id, ct.content_id, ct.from_state, ct.to_state, ct.actor, ct.reason, ct.transitioned_at, cu.topic
       FROM content_transitions ct
       JOIN content_units cu ON ct.content_id = cu.id
       ORDER BY ct.transitioned_at DESC
       LIMIT 30`
    );

    return NextResponse.json({
      channels,
      contentUnits,
      transitions,
    });
  } catch (error: any) {
    console.error('API Mission Control Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
