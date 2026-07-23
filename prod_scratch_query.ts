import { Client } from 'pg';
import Redis from 'ioredis';

const unitId = '19fc76ad-3683-477d-b424-24ddd0041b3a';
const dbUrl = 'postgresql://postgres:FFDTCbOGGZDnYxtCMtxxpiiJPlMurDGp@hayabusa.proxy.rlwy.net:19256/railway';

async function check() {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const res = await client.query('SELECT id, state, channel_id, created_at, updated_at FROM content_units WHERE id = $1', [unitId]);
    console.log('DB State:', JSON.stringify(res.rows[0], null, 2));
  } catch (e) {
    console.error('DB Error:', e);
  } finally {
    await client.end();
  }

  const redis = new Redis('redis://default:VJZdoPnqsrkzjfEzYIWEASKTmvtFcHmK@hayabusa.proxy.rlwy.net:59360');
  try {
    const channelId = '477e2ab6-3a1d-4954-9e62-c750ac45cb9c';
    const queueNames = ['research', 'script', 'media', 'quality', 'supervisor'];
    console.log('\nRedis Jobs for unit:', unitId);
    for (const q of queueNames) {
      const qName = `queue:${channelId}:${q}`;
      const active = await redis.lrange(`bull:${qName}:active`, 0, -1);
      const wait = await redis.lrange(`bull:${qName}:wait`, 0, -1);
      const delayed = await redis.zrange(`bull:${qName}:delayed`, 0, -1);
      const failed = await redis.zrange(`bull:${qName}:failed`, 0, -1);
      
      const checkJobs = async (list, type) => {
        for (const jobId of list) {
          const jobDataStr = await redis.hget(`bull:${qName}:${jobId}`, 'data');
          const reason = await redis.hget(`bull:${qName}:${jobId}`, 'failedReason');
          const state = await redis.hget(`bull:${qName}:${jobId}`, 'state');
          console.log(`[${qName}] Job ${jobId} (${type})`);
          if (reason) console.log(`  Reason: ${reason}`);
          if (jobDataStr) console.log(`  Data: ${jobDataStr.substring(0, 100)}...`);
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
