import { Pool } from 'pg';

const pool = new Pool({ connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db' });

async function main() {
  try {
    const { rows } = await pool.query('SELECT id, state, created_at FROM content_units ORDER BY created_at DESC LIMIT 10');
    console.log('Recent units:');
    console.table(rows);
  } catch (err: any) {
    console.log('DB error:', err.message);
  }
  process.exit(0);
}
main().catch(console.error);
