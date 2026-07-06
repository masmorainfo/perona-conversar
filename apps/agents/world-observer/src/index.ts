import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Queue } from 'bullmq';
import { RAW_SIGNALS_QUEUE } from '@cos/events';
import { fetchAllSignals } from './sensors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

const rawSignalsQueue = new Queue(RAW_SIGNALS_QUEUE, { connection });

async function runSensorsCycle() {
  console.log('\n--- 🌎 World Observer (Sensors) Capturando Sinais ---');
  try {
    const rawSignals = await fetchAllSignals();
    console.log(`[World Observer] Coletados ${rawSignals.length} sinais brutos das fontes.`);

    for (const raw of rawSignals) {
      await rawSignalsQueue.add('RAW_SIGNAL', {
        sensorName: raw.sensorName,
        externalId: raw.externalId,
        payload: raw.payload,
      });
    }
    
    console.log(`[World Observer] ${rawSignals.length} eventos enviados para a fila '${RAW_SIGNALS_QUEUE}'.`);
  } catch (err: any) {
    console.error('🚨 [World Observer] Erro ao capturar sinais:', err);
  }
}

async function bootstrap() {
  console.log('🚀 Iniciando World Observer (Sensors Only)...');
  
  // Run immediately on boot
  await runSensorsCycle();

  // Run periodically (e.g. every 60 seconds for development/demo)
  const intervalMs = 60000;
  setInterval(runSensorsCycle, intervalMs);
}

bootstrap().catch(console.error);
