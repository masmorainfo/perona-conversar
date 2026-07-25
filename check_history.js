const { Client } = require('pg');

async function checkHistory() {
  const client = new Client({
    connectionString: 'postgresql://postgres:FFDTCbOGGZDnYxtCMtxxpiiJPlMurDGp@hayabusa.proxy.rlwy.net:19256/railway',
  });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT from_state, to_state, actor, reason, transitioned_at
      FROM content_transitions
      WHERE content_id = '84329d1c-f42b-4182-afe7-f48265d55d03'
      ORDER BY transitioned_at ASC
    `);
    
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
checkHistory();
