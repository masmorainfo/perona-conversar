import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Queue } from 'bullmq';
import { RAW_SIGNALS_QUEUE } from '@cos/events';
import { fetchAllSignals, RawSignalInput } from './sensors.js';

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

// ─── Pré-filtro de deduplicação (equilíbrio de vazão) ─────────────────────────
// O Trends24 devolve a mesma lista de trends a cada ciclo; sem dedup, ~99% do
// que entra na fila raw_signals é o mesmo tópico re-enfileirado (medido:
// produção ~12.2k/h vs consumo ~130/h em 26/07). A chave inclui região
// (payload.region, hoje sempre 'global') para preservar multiplicidade
// regional quando a fonte passar a fornecê-la. Mapa em memória: perder em
// restart é aceitável — o primeiro ciclo re-enfileira uma vez e se autocorrige.

const DEDUP_TTL_HOURS = parseInt(process.env.SIGNAL_DEDUP_TTL_HOURS ?? '6', 10);
const DEDUP_TTL_MS = DEDUP_TTL_HOURS * 60 * 60 * 1000;
const QUEUE_ALERT_THRESHOLD = parseInt(process.env.RAW_SIGNALS_QUEUE_ALERT_THRESHOLD ?? '50000', 10);

const recentTopicKeys = new Map<string, number>();

function dedupKey(raw: RawSignalInput): string {
  const topic = String(raw.payload?.topic ?? raw.payload?.title ?? raw.payload?.query ?? raw.externalId)
    .trim()
    .toLowerCase();
  const region = String(raw.payload?.region ?? 'global').toLowerCase();
  return `${raw.sensorName}:${region}:${topic}`;
}

function filterFreshSignals(signals: RawSignalInput[]): RawSignalInput[] {
  const now = Date.now();
  for (const [key, seenAt] of recentTopicKeys) {
    if (now - seenAt > DEDUP_TTL_MS) recentTopicKeys.delete(key);
  }
  const fresh: RawSignalInput[] = [];
  for (const signal of signals) {
    const key = dedupKey(signal);
    if (recentTopicKeys.has(key)) continue;
    recentTopicKeys.set(key, now);
    fresh.push(signal);
  }
  return fresh;
}

async function runSensorsCycle() {
  console.log('\n--- 🌎 World Observer (Sensors) Capturando Sinais ---');
  try {
    const rawSignals = await fetchAllSignals();
    console.log(`[World Observer] Coletados ${rawSignals.length} sinais brutos das fontes.`);

    const freshSignals = filterFreshSignals(rawSignals);
    const discardedCount = rawSignals.length - freshSignals.length;
    console.log(
      `[World Observer] Dedup: ${discardedCount} duplicado(s) descartado(s) (janela ${DEDUP_TTL_HOURS}h), ` +
      `${freshSignals.length} novo(s). Mapa dedup: ${recentTopicKeys.size} tópico(s).`
    );

    const waitingCount = await rawSignalsQueue.getWaitingCount();
    if (waitingCount > QUEUE_ALERT_THRESHOLD) {
      console.error(
        `🚨 [World Observer] ALERTA: fila '${RAW_SIGNALS_QUEUE}' com ${waitingCount} jobs em espera ` +
        `(teto: ${QUEUE_ALERT_THRESHOLD}). Consumo abaixo da produção — verificar signal-normalizer.`
      );
    }

    for (const raw of freshSignals) {
      await rawSignalsQueue.add('RAW_SIGNAL', {
        sensorName: raw.sensorName,
        externalId: raw.externalId,
        payload: raw.payload,
      });
    }

    console.log(`[World Observer] ${freshSignals.length} eventos enviados para a fila '${RAW_SIGNALS_QUEUE}'.`);
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
