import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db';

export const pool = new pg.Pool({
  connectionString,
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}
