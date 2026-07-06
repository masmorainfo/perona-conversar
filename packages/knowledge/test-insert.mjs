import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

async function main() {
  await client.connect();

  const channelsRes = await client.query('SELECT id FROM channel_registry LIMIT 1');
  if (channelsRes.rows.length === 0) {
    console.error('No channels found in DB');
    await client.end();
    return;
  }
  const channelId = channelsRes.rows[0].id;

  console.log(`Inserting mock PENDING opportunity for channel ${channelId}...`);
  const insertRes = await client.query(`
    INSERT INTO content_opportunities (
      channel_id, 
      title, 
      description, 
      status, 
      base_score, 
      dynamic_score, 
      source_signals
    ) VALUES (
      $1,
      'Mock Opportunity for Verification',
      'This is a mock opportunity created to test the end-to-end integration of the Editorial Intelligence pipeline.',
      'PENDING',
      85.0,
      85.0,
      '[]'::jsonb
    ) RETURNING id, status;
  `, [channelId]);
  
  const newId = insertRes.rows[0].id;
  console.log(`Created mock opportunity with ID: ${newId} (Status: ${insertRes.rows[0].status})`);

  console.log('Waiting for Scheduler and Supervisor to process (15 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  const checkRes = await client.query('SELECT id, status FROM content_opportunities WHERE id = $1', [newId]);
  console.log(`Opportunity final status: ${checkRes.rows[0]?.status}`);

  const contentUnitRes = await client.query(`SELECT id, status, metadata FROM content_units WHERE metadata->>'opportunity_id' = $1`, [newId]);
  
  if (contentUnitRes.rows.length > 0) {
    console.log('Content Unit found for opportunity:');
    console.log(JSON.stringify(contentUnitRes.rows, null, 2));
  } else {
    console.log('No Content Unit found for this opportunity.');
  }

  await client.end();
}

main().catch(console.error);
