import { Pool } from 'pg';
import { Redis } from 'ioredis';

const pool = new Pool({ connectionString: 'postgres://cos:cos_dev@localhost:5432/cos_db' });
const redis = new Redis('redis://localhost:6379');

async function main() {
  const id = '19fc76ad-3683-477d-b424-24ddd0041b3a';
  
  // Check DB
  try {
    const { rows } = await pool.query('SELECT * FROM content_units WHERE id = $1', [id]);
    console.log('--- DB Check ---');
    console.log('DB found:', rows.length);
    if (rows.length) {
      console.log('State:', rows[0].state);
      console.log('Attempt counts:', rows[0].attempt_counts);
    }
  } catch (err: any) {
    console.log('DB error:', err.message);
  }
  
  console.log('\n--- Redis Check (research queue) ---');
  // Check Redis for active/waiting jobs related to research
  const waiting = await redis.lrange('bull:90kairo:research:wait', 0, -1);
  console.log('Waiting:', waiting);
  const active = await redis.lrange('bull:90kairo:research:active', 0, -1);
  console.log('Active:', active);
  const delayed = await redis.zrange('bull:90kairo:research:delayed', 0, -1);
  console.log('Delayed:', delayed);
  const stalled = await redis.smembers('bull:90kairo:research:stalled');
  console.log('Stalled:', stalled);
  const failed = await redis.zrange('bull:90kairo:research:failed', 0, -1);
  console.log('Failed:', failed);
  
  // Let's get the detailed data for any jobs in the active/waiting/failed lists
  const allJobIds = [...new Set([...waiting, ...active, ...delayed, ...stalled, ...failed])];
  for (const jobId of allJobIds) {
      const jobData = await redis.hgetall(`bull:90kairo:research:${jobId}`);
      if (jobData) {
          console.log(`\nJob ${jobId} detail:`);
          console.log('  name:', jobData.name);
          console.log('  failedReason:', jobData.failedReason);
          console.log('  stacktrace:', jobData.stacktrace);
      }
  }

  process.exit(0);
}
main().catch(console.error);
