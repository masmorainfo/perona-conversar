const pg = require('pg');
const { Queue } = require('bullmq');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

async function main() {
  const contentId = '8ec42fed-6e26-46d8-8eee-20e2e2aaccbc';
  
  // 1. Update state in database back to CRITIC_OK
  console.log('Updating content state in DB to CRITIC_OK...');
  await pool.query("UPDATE content_metadata SET state = 'CRITIC_OK' WHERE id = $1", [contentId]);
  
  // Also insert a transition record for auditing
  await pool.query(
    "INSERT INTO content_state_transitions (content_id, from_state, to_state, actor, reason) VALUES ($1, $2, $3, $4, $5)",
    [contentId, 'PRODUCED', 'CRITIC_OK', 'Antigravity_Agent', 'Reset to CRITIC_OK to regenerate assets with H.264 compatibility fix']
  );

  const res = await pool.query('SELECT * FROM content_metadata WHERE id = $1', [contentId]);
  if (res.rows.length === 0) {
    console.error('Content not found');
    process.exit(1);
  }
  const row = res.rows[0];
  
  // 2. Queue the generate_media job in BullMQ
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisUrl = new URL(REDIS_URL);
  const connection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port || '6379', 10),
  };
  
  const qName = `media-${row.channel_id}`;
  const queue = new Queue(qName, { connection });
  
  const jobData = {
    contentId,
    channelId: row.channel_id,
    script: row.metadata.script,
  };
  
  console.log('Adding generate_media job to queue:', qName);
  await queue.add('generate_media', jobData);
  console.log('Job successfully added to Media queue!');
  
  await pool.end();
  await queue.close();
}

main().catch(console.error);
