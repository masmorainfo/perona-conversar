const pg = require('pg');
const client = new pg.Client({connectionString: 'postgresql://cos:cos_dev@localhost:5432/cos_db'});
async function run() {
  await client.connect();
  const result = await client.query(`
    UPDATE content_opportunities 
    SET status = 'PENDING', momentum = 2.0, category = 'BREAKING_NEWS', created_at = NOW() - INTERVAL '2 hours' 
    WHERE id = (SELECT id FROM content_opportunities LIMIT 1)
  `);
  console.log('Updated ' + result.rowCount + ' row(s) to PENDING');
  await client.end();
}
run();
