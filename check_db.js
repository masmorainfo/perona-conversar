const { Client } = require('pg');

async function checkLatestUnit() {
  const client = new Client({
    connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db',
  });
  await client.connect();

  try {
    const res = await client.query(`
      SELECT id, state, origin, metadata
      FROM content_units
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (res.rows.length > 0) {
      const unit = res.rows[0];
      console.log('Latest Unit ID:', unit.id);
      console.log('State:', unit.state);
      console.log('Origin:', unit.origin);
      
      if (unit.metadata && unit.metadata.storyManifestAudit) {
        console.log('storyManifestAudit found!');
        console.log(JSON.stringify(unit.metadata.storyManifestAudit, null, 2));
      } else {
        console.log('storyManifestAudit NOT found in metadata.');
      }
    } else {
      console.log('No units found.');
    }
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

checkLatestUnit();
