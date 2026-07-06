import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

async function main() {
  await client.connect();
  
  await client.query(`UPDATE channel_registry SET strategy = jsonb_set(strategy, '{autoPublish}', 'false')`);
  console.log('Disabled autoPublish for all channels');
  
  await client.end();
}

main().catch(console.error);
