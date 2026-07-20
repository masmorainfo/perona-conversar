const { Queue } = require('bullmq');
const { Pool } = require('pg');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

async function main() {
  const topic = 'Final da Copa do Mundo 2026';
  console.log('Injetando tópico:', topic);
  
  const supervisorQueue = new Queue('SUPERVISOR_QUEUE', { connection });
  
  // Pegar o channelId
  const { rows: channelRows } = await pool.query('SELECT id FROM channel_registry WHERE slug = $1', ['kairo-futebol']);
  if (channelRows.length === 0) {
    console.error('Channel not found');
    process.exit(1);
  }
  const realChannelId = channelRows[0].id;
  
  // Inserir content_unit
  const { rows: contentRows } = await pool.query(
    `INSERT INTO content_units (channel_id, topic, state, metadata, attempt_counts)
     VALUES ($1, $2, 'DISCOVERED', '{}'::jsonb, '{}'::jsonb)
     RETURNING id`,
    [realChannelId, topic]
  );
  
  const contentId = contentRows[0].id;
  
  await supervisorQueue.add('EVALUATE_TRIGGER', {
    contentId,
    channelId: realChannelId,
    topic,
  });
  
  console.log('Job injetado. Content ID:', contentId);
  await supervisorQueue.close();
  await pool.end();
}

main().catch(console.error);
