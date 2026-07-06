import pg from 'pg';
import type { ContentState } from '@cos/types';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://cos:cos_dev@localhost:5432/cos_db',
});

export async function initDb(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

/** Retorna o pool singleton — para uso pelo polling loop do Supervisor. */
export function getPool(): pg.Pool {
  return pool;
}


export async function getContentState(pool: pg.Pool, contentId: string): Promise<{
  state: ContentState;
  topic: string;
  metadata: Record<string, any>;
  attemptCounts: Record<string, number>;
} | null> {
  const query = `
    SELECT state, topic, metadata, attempt_counts
    FROM content_units
    WHERE id = $1
  `;
  const { rows } = await pool.query(query, [contentId]);
  if (rows.length === 0) return null;

  return {
    state: rows[0].state as ContentState,
    topic: rows[0].topic,
    metadata: rows[0].metadata,
    attemptCounts: rows[0].attempt_counts,
  };
}

export async function persistTransition(
  pool: pg.Pool,
  contentId: string,
  fromState: ContentState,
  toState: ContentState,
  actor: string,
  reason: string | null,
  newMetadata: Record<string, any>,
  newAttemptCounts: Record<string, number>
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update the content unit
    const updateUnitQuery = `
      UPDATE content_units
      SET state = $1, metadata = $2, attempt_counts = $3, updated_at = NOW()
      WHERE id = $4
    `;
    await client.query(updateUnitQuery, [
      toState,
      JSON.stringify(newMetadata),
      JSON.stringify(newAttemptCounts),
      contentId,
    ]);

    // 2. Insert into transitions log
    const insertTransitionQuery = `
      INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await client.query(insertTransitionQuery, [
      contentId,
      fromState,
      toState,
      actor,
      reason,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
