import { Client } from 'pg';
import Redis from 'ioredis';

const unitId = '19fc76ad-3683-477d-b424-24ddd0041b3a';
const dbUrl = 'postgres://cos:cos_dev@localhost:5432/cos_db';

async function check() {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const res = await client.query('SELECT id, state, created_at, updated_at FROM content_units WHERE id = $1', [unitId]);
    console.log('DB State:', JSON.stringify(res.rows[0], null, 2));
  } catch (e) {
    console.error('DB Error:', e);
  } finally {
    await client.end();
  }

  const redis = new Redis();
  try {
    const queueNames = ['research', 'script', 'media', 'quality', 'supervisor'];
    console.log('\nRedis Jobs for unit:', unitId);
    for (const q of queueNames) {
      const active = await redis.lrange(`bull:${q}:active`, 0, -1);
      const wait = await redis.lrange(`bull:${q}:wait`, 0, -1);
      const delayed = await redis.zrange(`bull:${q}:delayed`, 0, -1);
      const failed = await redis.zrange(`bull:${q}:failed`, 0, -1);
      
      const checkJobs = async (list, type) => {
        for (const jobId of list) {
          const jobDataStr = await redis.hget(`bull:${q}:${jobId}`, 'data');
          if (jobDataStr && jobDataStr.includes(unitId)) {
            const reason = await redis.hget(`bull:${q}:${jobId}`, 'failedReason');
            const state = await redis.hget(`bull:${q}:${jobId}`, 'state');
            console.log(`[${q}] Job ${jobId} (${type})`);
            if (reason) console.log(`  Reason: ${reason}`);
          }
        }
      };

      await checkJobs(active, 'active');
      await checkJobs(wait, 'wait');
      await checkJobs(delayed, 'delayed');
      await checkJobs(failed, 'failed');
    }
  } catch (e) {
    console.error('Redis Error:', e);
  } finally {
    redis.quit();
  }
}

check();
