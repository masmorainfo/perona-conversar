const { createClient } = require('redis');

async function checkRedis() {
  const url = process.env.REDIS_URL || 'redis://default:VJZdoPnqsrkzjfEzYIWEASKTmvtFcHmK@redis.railway.internal:6379';
  console.log('Connecting to:', url);
  const client = createClient({ url });
  
  client.on('error', (err) => console.log('Redis Client Error', err));

  await client.connect();

  const keys = await client.keys('bull:script:*');
  console.log('BullMQ Script Keys:', keys);

  for (const key of keys) {
    const type = await client.type(key);
    if (type === 'list' || type === 'set' || type === 'zset') {
       if (type === 'list') {
         const len = await client.lLen(key);
         console.log(`${key} (${type}): length ${len}`);
       } else if (type === 'set') {
         const len = await client.sCard(key);
         console.log(`${key} (${type}): length ${len}`);
       } else if (type === 'zset') {
         const len = await client.zCard(key);
         console.log(`${key} (${type}): length ${len}`);
       }
    }
  }

  await client.disconnect();
}
checkRedis();
