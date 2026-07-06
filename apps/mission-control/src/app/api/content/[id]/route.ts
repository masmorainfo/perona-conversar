import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { rows: contentRows } = await query(
      `SELECT cu.*, cr.name AS channel_name, cr.slug AS channel_slug
       FROM content_units cu
       LEFT JOIN channel_registry cr ON cu.channel_id = cr.id
       WHERE cu.id = $1`,
      [id]
    );
    if (contentRows.length === 0) {
      return NextResponse.json({ error: 'Content unit not found' }, { status: 404 });
    }

    const { rows: transitionRows } = await query(
      'SELECT * FROM content_transitions WHERE content_id = $1 ORDER BY transitioned_at DESC',
      [id]
    );

    return NextResponse.json({
      contentUnit: contentRows[0],
      transitions: transitionRows,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { metadata, state } = body;

    const { rows: existing } = await query('SELECT id, state FROM content_units WHERE id = $1', [id]);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Content unit not found' }, { status: 404 });
    }

    if (metadata) {
      await query(
        'UPDATE content_units SET metadata = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(metadata), id]
      );
    }

    if (state && state !== existing[0].state) {
      await query(
        'UPDATE content_units SET state = $1, updated_at = NOW() WHERE id = $2',
        [state, id]
      );
      // Log manual intervention transition
      await query(
        `INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
         VALUES ($1, $2, $3, 'human_intervention', 'Alteração manual pelo Mission Control')`,
        [id, existing[0].state, state]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
