const { Client } = require('pg');

async function pollLatestUnit() {
  const client = new Client({
    connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db',
  });
  await client.connect();

  try {
    while (true) {
      const res = await client.query(`
        SELECT id, state, origin, metadata
        FROM content_units
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      if (res.rows.length > 0) {
        const unit = res.rows[0];
        console.log(`[${new Date().toISOString()}] Latest Unit ID: ${unit.id} | State: ${unit.state}`);
        
        if (['MEDIA_RESULT', 'PUBLISHED', 'QUEUE_ERROR', 'ERROR', 'CINEMATIC_REVIEWING'].includes(unit.state)) {
          if (unit.metadata && unit.metadata.storyManifestAudit) {
            console.log('>>> storyManifestAudit found!');
            // console.log(JSON.stringify(unit.metadata.storyManifestAudit, null, 2));
            break;
          } else {
            console.log('State is advanced but storyManifestAudit NOT found in metadata.');
            if (['QUEUE_ERROR', 'ERROR'].includes(unit.state)) {
                break;
            }
          }
        }
      } else {
        console.log('No units found.');
      }
      
      // Wait 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

pollLatestUnit();
