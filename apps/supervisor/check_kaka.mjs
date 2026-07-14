import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db' });

const r = await pool.query(`SELECT id, topic, state, created_at, metadata->'script'->>'title' as script_title FROM content_units WHERE topic ILIKE '%Kaká%' ORDER BY created_at DESC`);
console.log(r.rows);

await pool.end();
