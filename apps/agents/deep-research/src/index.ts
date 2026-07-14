/**
 * KDR Agent — KAIRO Deep Research
 *
 * Worker BullMQ que escuta a fila 'kdr-research'.
 * Recebe jobs com { area, query } e produz ResearchEntry[] no pending_research.json.
 *
 * Acionamento: manual via comando /kdr no Telegram.
 * Não é channel-scoped — opera sobre a CGL global.
 */

import { Worker, Job } from 'bullmq';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { research } from './researcher.js';
import { savePendingEntries, isValidArea, type CGLArea } from '@cos/cgl-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

export const KDR_QUEUE = 'kdr-research';

export interface KDRJobData {
  area: string;
  query: string;
  telegramChatId: string;
  telegramBotToken: string;
}

export interface KDRResultData {
  area: string;
  query: string;
  entryCount: number;
  entryIds: string[];
  cached: boolean;
  durationMs: number;
}

async function processKDRJob(job: Job<KDRJobData>): Promise<KDRResultData> {
  const { area, query, telegramChatId, telegramBotToken } = job.data;
  console.log(`[KDR Agent] 🔬 Pesquisa: área="${area}", query="${query}"`);

  if (!isValidArea(area)) {
    const errorMsg = `❌ Área inválida: "${area}"`;
    console.error(`[KDR Agent] ${errorMsg}`);
    await sendTelegramDirect(errorMsg, telegramBotToken, telegramChatId);
    return { area, query, entryCount: 0, entryIds: [], cached: false, durationMs: 0 };
  }

  try {
    const result = await research(area as CGLArea, query);

    if (result.cached) {
      await sendTelegramDirect(
        `\u{1F4E6} *Cache hit* \u2014 j\u00e1 existe proposta pendente similar para _"${escMd(query)}"_ em ${mdCode(area)}\. Use os bot\u00f5es da proposta anterior\.`,
        telegramBotToken,
        telegramChatId,
      );
      return { area, query, entryCount: 0, entryIds: [], cached: true, durationMs: result.durationMs };
    }

    if (result.entries.length === 0) {
      await sendTelegramDirect(
        `\u26A0\uFE0F Nenhuma proposta gerada para _"${escMd(query)}"_ em ${mdCode(area)}\. Tente outra query\.`,
        telegramBotToken,
        telegramChatId,
      );
      return { area, query, entryCount: 0, entryIds: [], cached: false, durationMs: result.durationMs };
    }

    // Salva propostas no pending
    savePendingEntries(result.entries);

    // Envia card para cada proposta via Telegram
    for (const entry of result.entries) {
      const tags = entry.tags.map((t: string) => `\\#${escMd(t)}`).join(' ');
      const confidencePct = `${(entry.confidence * 100).toFixed(0)}%`;
      const cardText = [
        `\u{1F4DA} *Proposta KDR \\— ${escMd(area)}*`,
        ``,
        `\u{1F3AF} *Conceito:* ${escMd(entry.concept)}`,
        `\u{1F4DD} *Descri\u00e7\u00e3o:* _${escMd(entry.description)}_`,
        `\u{1F3F7}\uFE0F *Tags:* ${tags}`,
        `\u{1F4CA} *Confian\u00e7a:* ${mdCode(confidencePct)}`,
        `\u{1F4AC} *Racioc\u00ednio:* _${escMd(entry.reasoning)}_`,
      ].join('\n');

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '✅ Aprovar para CGL', callback_data: `kdr_approve:${entry.id}` },
            { text: '❌ Rejeitar', callback_data: `kdr_reject:${entry.id}` },
          ],
        ],
      };

      await sendTelegramDirect(cardText, telegramBotToken, telegramChatId, replyMarkup);
    }

    const summaryText = `\u{1F52C} *KDR conclu\u00eddo:* ${result.entries.length} proposta\\(s\\) para ${mdCode(area)} em ${result.durationMs}ms \\(${result.tavilyCalls} Tavily, ${result.llmCalls} LLM\\)`;
    await sendTelegramDirect(summaryText, telegramBotToken, telegramChatId);

    return {
      area,
      query,
      entryCount: result.entries.length,
      entryIds: result.entries.map(e => e.id),
      cached: false,
      durationMs: result.durationMs,
    };
  } catch (err) {
    console.error(`[KDR Agent] Erro na pesquisa:`, err);
    await sendTelegramDirect(
      `\u{1F6A8} Erro ao pesquisar _"${escMd(query)}"_ em ${mdCode(area)}\.`,
      telegramBotToken,
      telegramChatId,
    );
    throw err;
  }
}

// ─── Telegram helpers (direto, sem dependência do supervisor) ────────────────

function escMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/** Wraps text in MarkdownV2 inline code (backticks). */
function mdCode(text: string): string {
  return '`' + escMd(text) + '`';
}

async function sendTelegramDirect(
  text: string,
  botToken: string,
  chatId: string,
  replyMarkup?: object,
): Promise<void> {
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
  };
  if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);

  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json() as any;
    if (!data.ok) {
      console.error('[KDR Agent] Telegram API error:', data.description, '| text preview:', text.slice(0, 100));
    }
  } catch (err) {
    console.error('[KDR Agent] Falha ao enviar Telegram:', err);
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function bootstrap() {
  console.log('🔬 Iniciando KDR Agent (KAIRO Deep Research)...');

  const worker = new Worker(KDR_QUEUE, processKDRJob, { connection, concurrency: 1 });

  worker.on('ready', () => console.log(`✅ KDR Agent ouvindo fila: ${KDR_QUEUE}`));
  worker.on('completed', (job: Job | undefined) => console.log(`[KDR] Job ${job?.id} concluído.`));
  worker.on('failed', (job: Job | undefined, err: Error) => console.error(`[KDR] Job ${job?.id} falhou:`, err));
  worker.on('error', (err: Error) => console.error('🚨 [KDR] Erro no worker:', err));
}

bootstrap().catch(console.error);
