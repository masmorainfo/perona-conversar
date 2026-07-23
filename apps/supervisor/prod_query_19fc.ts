import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:FFDTCbOGGZDnYxtCMtxxpiiJPlMurDGp@hayabusa.proxy.rlwy.net:19256/railway'
    }
  }
});

const redisConnection = new Redis('redis://default:VJZdoPnqsrkzjfEzYIWEASKTmvtFcHmK@hayabusa.proxy.rlwy.net:59360');

async function main() {
  const unitId = '19fc76ad-3683-477d-b424-24ddd0041b3a';
  console.log(`Checking DB for ${unitId}...`);
  const unit = await prisma.contentUnit.findUnique({
    where: { id: unitId }
  });
  console.log(unit ? `Unit state: ${unit.state}, Channel: ${unit.channelId}` : 'Unit not found in DB');

  if (unit) {
    const queueNames = ['editorial', 'research', 'script', 'critic', 'media', 'cinematic-review'];
    for (const qName of queueNames) {
      const qId = `queue:${unit.channelId}:${qName}`;
      console.log(`\nChecking Redis Queue: ${qId}`);
      const queue = new Queue(qId, { connection: redisConnection });
      
      const states: ('active' | 'waiting' | 'delayed' | 'failed' | 'completed')[] = ['active', 'waiting', 'delayed', 'failed', 'completed'];
      for (const state of states) {
        const jobs = await queue.getJobs([state]);
        const matched = jobs.filter(j => j?.data?.unitId === unitId);
        if (matched.length > 0) {
          console.log(`Found ${matched.length} job(s) in state [${state}]:`);
          for (const m of matched) {
            console.log(` - Job ${m.id} | Name: ${m.name}`);
            if (state === 'failed') {
              console.log(`   Error: ${m.failedReason}`);
            }
          }
        }
      }
    }
  }

  await prisma.$disconnect();
  redisConnection.disconnect();
}

main().catch(console.error);
