const { Client } = require('pg');

async function checkSpecificUnit() {
  const client = new Client({
    connectionString: 'postgresql://postgres:FFDTCbOGGZDnYxtCMtxxpiiJPlMurDGp@hayabusa.proxy.rlwy.net:19256/railway',
  });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, state, metadata
      FROM content_units
      WHERE id = 'a06d3d7d-bd40-4c27-b17d-cb87f88c964d'
    `);
    
    if (res.rows.length > 0) {
      console.log(JSON.stringify(res.rows[0].metadata, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
checkSpecificUnit();
