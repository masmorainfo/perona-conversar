require('dotenv').config({ path: '../../.env' });
const { Pool } = require('pg');
const { Queue } = require('bullmq');

async function main() {
  console.log('--- LOCAL DB QUERY ---');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let approvedUnitId = null;
  try {
    const { rows } = await pool.query(`
      SELECT id, content_id, state, updated_at, NOW() - updated_at as age 
      FROM content_units 
      WHERE state = 'APPROVED'
    `);
    console.log('APPROVED units:', rows);
    if (rows.length > 0) approvedUnitId = rows[0].id;
  } catch(e) {
    console.error('DB Error:', e.message);
  } finally {
    pool.end();
  }

  console.log('\n--- BULLMQ RESEARCH QUEUE ---');
  const researchQueue = new Queue('research', { 
    connection: { host: 'localhost', port: 6379 }
  });
  try {
    const jobs = await researchQueue.getJobs(['waiting', 'active', 'delayed', 'failed']);
    console.log(`Total jobs in research queue: ${jobs.length}`);
    for (const job of jobs) {
      console.log(`Job ${job.id} [${job.name}] - Status: ${await job.getState()} - Data:`, job.data);
    }
  } catch (e) {
    console.error('Redis/Queue Error:', e.message);
  } finally {
    await researchQueue.close();
  }
}
main();
