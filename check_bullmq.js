const { Queue } = require('bullmq');

async function run() {
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisUrl = new URL(REDIS_URL);
  
  const qName = 'research-477e2ab6-3a1d-4954-9e62-c750ac45cb9c';
  console.log(`Connecting to Redis at ${REDIS_URL} for queue ${qName}`);
  
  const queue = new Queue(qName, {
    connection: {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379', 10),
      password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    },
  });

  const waitingCount = await queue.getWaitingCount();
  const activeCount = await queue.getActiveCount();
  const delayedCount = await queue.getDelayedCount();
  const failedCount = await queue.getFailedCount();
  
  console.log(`Waiting: ${waitingCount}, Active: ${activeCount}, Delayed: ${delayedCount}, Failed: ${failedCount}`);
  
  const activeJobs = await queue.getActive();
  for (const job of activeJobs) {
    console.log(`Active Job ID: ${job.id}, Name: ${job.name}`);
  }
  
  const waitingJobs = await queue.getWaiting();
  for (const job of waitingJobs) {
    console.log(`Waiting Job ID: ${job.id}, Name: ${job.name}`);
  }

  const failedJobs = await queue.getFailed();
  for (const job of failedJobs) {
    console.log(`Failed Job ID: ${job.id}, Name: ${job.name}, Reason: ${job.failedReason}`);
  }
  
  await queue.close();
}

run().catch(console.error);
