const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db' });
pool.query(`
  SELECT cu.id, cu.state, cu.created_at, cu.updated_at, cu.topic, cr.slug 
  FROM content_units cu 
  JOIN channel_registry cr ON cu.channel_id = cr.id 
  WHERE cu.state = 'DISCOVERED'
  ORDER BY cu.created_at DESC
  LIMIT 20
`)
.then(res => { console.table(res.rows); pool.end(); })
.catch(err => { console.error(err); pool.end(); });
