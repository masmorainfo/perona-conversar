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
  const res = await pool.query('SELECT * FROM content_metadata WHERE id = $1', [contentId]);
  if (res.rows.length === 0) {
    console.error('Content not found');
    process.exit(1);
  }
  const row = res.rows[0];
  
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisUrl = new URL(REDIS_URL);
  const connection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port || '6379', 10),
  };
  
  const qName = `render-${row.channel_id}`;
  const queue = new Queue(qName, { connection });
  
  const jobData = {
    contentId,
    channelId: row.channel_id,
    script: row.metadata.script,
    assetUrls: row.metadata.assetUrls,
  };
  
  console.log('Adding job to queue:', qName);
  await queue.add('render_video', jobData);
  console.log('Job successfully added!');
  
  await pool.end();
  await queue.close();
}

main().catch(console.error);
