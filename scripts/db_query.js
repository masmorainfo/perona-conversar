const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT id, channel_id, topic, state, updated_at FROM content_units WHERE state = 'DISCOVERED'")
  .then(r => { console.table(r.rows); pool.end(); })
  .catch(e => { console.error(e); pool.end(); });
