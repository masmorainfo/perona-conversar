import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker, Job, Queue } from 'bullmq';
import pg from 'pg';
import { RAW_SIGNALS_QUEUE, NORMALIZED_SIGNAL_QUEUE, RawSignalJobData } from '@cos/events';
import { normalizeSignal, needsLocalization } from './normalizer.js';
import { OpenAIProvider } from '@cos/llm';
import type { CLPResult, LocalizationDecision } from '@cos/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cos:cos_dev@localhost:5432/cos_db',
});

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
};

const normalizedQueue = new Queue(NORMALIZED_SIGNAL_QUEUE, { connection });

// ─── LLM para tradução ────────────────────────────────────────────────────────
const llm = new OpenAIProvider();

// ─── Buffer de sinais pendentes de localização (CLP) ─────────────────────────
// Acumula até BATCH_SIZE itens antes de disparar uma chamada ao LLM.
// Isso reduz o custo de API em ~85% vs localizar 1 item por chamada.

interface PendingSignal {
  normalized: ReturnType<typeof normalizeSignal>;
  rawSignalId: string;
  resolve: () => void;
  reject: (err: any) => void;
}

const BATCH_SIZE = 30;
const BATCH_TIMEOUT_MS = 2000; // flush após 2s mesmo se não cheio

let pendingBuffer: PendingSignal[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushBuffer() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;

  if (pendingBuffer.length === 0) return;

  const batch = pendingBuffer.splice(0, BATCH_SIZE);

  // Separar sinais que precisam de localização CLP dos que já são latinos
  const toLocalizeIdxs: number[] = [];
  batch.forEach((item, idx) => {
    if (needsLocalization(item.normalized.detectedLang)) {
      toLocalizeIdxs.push(idx);
    }
  });

  // ── CLP: localizar em batch (1 chamada LLM para todos os não-latinos) ────────
  const clpDecisionsMap = new Map<number, LocalizationDecision>();

  if (toLocalizeIdxs.length > 0) {
    const items = toLocalizeIdxs.map(idx => ({
      term: batch[idx]!.normalized.title,
      context: `sinal de ${batch[idx]!.normalized.source}`,
    }));
    console.log(`[Signal Normalizer] 🌐 CLP: localizando ${items.length} sinais (batch)...`);
    try {
      const decisions = await llm.localizeBatch(items, 'pt-BR');
      toLocalizeIdxs.forEach((batchIdx, i) => {
        const decision = decisions[i];
        if (decision) clpDecisionsMap.set(batchIdx, decision);
      });
    } catch (err) {
      console.error('[Signal Normalizer] Erro na localização CLP, mantendo originais:', err);
    }
  }

  // ── Inserir todos no DB e emitir eventos ──────────────────────────────────────
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i]!;
    try {
      const { normalized, rawSignalId } = item;
      const decision = clpDecisionsMap.get(i);

      // Aplicar decisão CLP ao título
      if (decision) {
        if (decision.strategy === 'REMOVE') {
          // Sinal não agrega valor — marcar mas não descartar (auditoria)
          normalized.title = `[REMOVIDO] ${normalized.originalTitle}`;
        } else {
          normalized.title = decision.localizedForm || normalized.title;
        }
      }

      // Montar CLPResult para persistência
      const clpResult: CLPResult | null = decision ? {
        originalText: normalized.originalTitle,
        localizedText: normalized.title,
        decisions: [decision],
        appliedAt: new Date(),
      } : null;

      const insertNormRes = await pool.query(
        `INSERT INTO normalized_signals 
          (source, title, original_title, detected_lang, description, url, score, raw_signal_id, clp_result) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING id`,
        [
          normalized.source,
          normalized.title,          // PT-BR localizado (CLP)
          normalized.originalTitle,  // Preservado para auditoria
          normalized.detectedLang,
          normalized.description,
          (normalized.rawPayload as any)?.url || null,
          normalized.score,
          rawSignalId,
          clpResult ? JSON.stringify(clpResult) : null,
        ]
      );

      // ── Learning Engine: registrar decisão na memória ─────────────────────────
      if (decision && decision.strategy !== 'KEEP') {
        // Apenas decisões não-triviais entram na memória (KEEP não precisa de LLM futuro)
        await pool.query(
          `INSERT INTO localization_memory
            (original_term, strategy, localized_form, reason, last_seen_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (original_term, COALESCE(channel_id, ''))
           DO UPDATE SET
             strategy = EXCLUDED.strategy,
             localized_form = EXCLUDED.localized_form,
             occurrence_count = localization_memory.occurrence_count + 1,
             last_seen_at = NOW()`,
          [decision.originalTerm, decision.strategy, decision.localizedForm, decision.reason]
        ).catch(() => {}); // não bloquear o pipeline por falha na memória
      }

      await normalizedQueue.add('new_signal', {
        normalizedSignalId: insertNormRes.rows[0].id,
        source: normalized.source,
      });

      const strategyTag = decision ? ` [CLP:${decision.strategy}]` : '';
      console.log(
        `[Signal Normalizer] ✅ ${normalized.source} |${strategyTag} "${normalized.title}"` +
        (normalized.detectedLang !== 'latin' && normalized.detectedLang !== 'und'
          ? ` ← "${normalized.originalTitle}" (${normalized.detectedLang})`
          : '') +
        ` (Score: ${normalized.score.toFixed(2)})`
      );

      item.resolve();
    } catch (err) {
      item.reject(err);
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return; // já agendado
  flushTimer = setTimeout(flushBuffer, BATCH_TIMEOUT_MS);
}

async function processRawSignal(job: Job<RawSignalJobData>) {
  const raw = job.data;

  // 1. Save raw signal to DB
  const insertRawRes = await pool.query(
    'INSERT INTO raw_signals (sensor_name, external_id, payload) VALUES ($1, $2, $3) RETURNING id',
    [raw.sensorName, raw.externalId, JSON.stringify(raw.payload)]
  );
  const rawSignalId = insertRawRes.rows[0].id;

  // 2. Normalize (extrair título, detectar idioma)
  const normalized = normalizeSignal({
    sensorName: raw.sensorName,
    externalId: raw.externalId,
    payload: raw.payload,
  });

  // 3. Enfileirar no buffer de tradução e aguardar flush
  await new Promise<void>((resolve, reject) => {
    pendingBuffer.push({ normalized, rawSignalId, resolve, reject });

    if (pendingBuffer.length >= BATCH_SIZE) {
      // Buffer cheio: flush imediato
      flushBuffer();
    } else {
      // Agendar flush por timeout
      scheduleFlush();
    }
  });
}

async function bootstrap() {
  console.log('🚀 Iniciando Signal Normalizer Worker (CLP — Content Localization Policy)...');

  const worker = new Worker(RAW_SIGNALS_QUEUE, processRawSignal, { connection, concurrency: 5 });

  worker.on('ready', () => {
    console.log(`✅ Ouve fila: ${RAW_SIGNALS_QUEUE}`);
  });

  worker.on('error', err => {
    console.error(`🚨 Erro no worker ${RAW_SIGNALS_QUEUE}:`, err);
  });
}

bootstrap().catch(console.error);
