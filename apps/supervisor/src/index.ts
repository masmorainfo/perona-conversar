import { Worker, Job, Queue } from 'bullmq';
import { approveEntry, rejectEntry } from '@cos/cgl-writer';
import { SUPERVISOR_QUEUE, OPPORTUNITY_TRIGGER_QUEUE, queueName } from '@cos/events';
import { handleSupervisorEvent, processEvent } from './eventHandler.js';
import { initDb, closeDb, getPool } from './db.js';
import { initNotifications, notify, isNotificationsEnabled, getUpdates, editTelegramMessage, editTelegramCaption, answerCallbackQuery } from '@cos/notifications';
import type { TelegramUpdate } from '@cos/notifications';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
};

const TELEGRAM_BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
const TELEGRAM_CHAT_ID   = process.env['TELEGRAM_CHAT_ID'] ?? '';
const CHANNEL_SLUG       = process.env['CHANNEL_SLUG'] ?? 'kairo-futebol';

// Teclado fixo no rodapé do Telegram
const KAIRO_REPLAY_KEYBOARD = {
  keyboard: [
    [
      { text: '🎬 Próxima História' }
    ]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

// ─── Helpers do Telegram ──────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// Poll por novas oportunidades após disparo manual do Opportunity Engine.
// Timeout de 45s com fallback — nunca espera indefinidamente.
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 45_000;

async function pollForNewOpportunities(
  pool: ReturnType<typeof getPool>,
  channelId: string,
  telegramConfig: { botToken: string; chatId: string }
): Promise<void> {
  const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
  const scanStart = Date.now();

  while (Date.now() - scanStart < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const { rows } = await pool.query(`
      SELECT id, title, COALESCE(dynamic_score, base_score) AS score
      FROM content_opportunities
      WHERE status = 'PENDING' AND channel_id = $1
        AND created_at >= NOW() - INTERVAL '2 minutes'
      ORDER BY COALESCE(dynamic_score, base_score) DESC
      LIMIT 3
    `, [channelId]);

    if (rows.length > 0) {
      const listText = rows
        .map((r, i) => `${i + 1}. *${escapeMarkdown(r.title)}* (score: ${Number(r.score).toFixed(0)})`)
        .join('\n');
      await sendTelegram(
        `🔎 *Varredura concluída\\!* ${rows.length} oportunidade(s) encontrada(s):\n\n${listText}\n\nToque em *🎬 Próxima História* para iniciar a melhor\\!`,
        telegramConfig,
        'MarkdownV2'
      );
      console.log(`[Supervisor] Poll pós-varredura: ${rows.length} oportunidades encontradas em ${((Date.now() - scanStart) / 1000).toFixed(0)}s`);
      return;
    }
  }

  // Timeout: nenhuma oportunidade gerada
  await sendTelegram(
    '⏰ A varredura não encontrou novas oportunidades nos últimos 45 segundos. Os sensores podem não ter captado sinais relevantes agora. Tente novamente mais tarde ou envie um tema manualmente digitando-o aqui.',
    telegramConfig
  );
  console.log('[Supervisor] Poll pós-varredura: timeout (45s), nenhuma oportunidade encontrada.');
}

// Busca e enfileira a melhor oportunidade pendente do VLS para o canal KAIRO
async function startNextHistory(): Promise<void> {
  const telegramConfig = { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID };
  const pool = getPool();

  try {
    const chanRes = await pool.query(
      "SELECT id FROM channel_registry WHERE slug = $1",
      [CHANNEL_SLUG]
    );

    if (chanRes.rows.length === 0) {
      const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
      await sendTelegram(`❌ Canal KAIRO (${CHANNEL_SLUG}) não encontrado no registro.`, telegramConfig);
      return;
    }

    const channelId = chanRes.rows[0].id;

    // Busca a oportunidade PENDING com maior score dinâmico
    const oppRes = await pool.query(`
      SELECT id, title, description, org_id
      FROM content_opportunities
      WHERE status = 'PENDING' AND channel_id = $1
      ORDER BY COALESCE(dynamic_score, base_score) DESC, created_at DESC
      LIMIT 1
    `, [channelId]);

    const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');

    if (oppRes.rows.length === 0) {
      await sendTelegram(
        '☕ Não há novas histórias pendentes de curadoria na fila do VLS no momento. Iniciando varredura por novos sinais... 🔎',
        telegramConfig
      );
      // Dispara o Opportunity Engine
      const opportunityQueue = new Queue(OPPORTUNITY_TRIGGER_QUEUE, { connection });
      await opportunityQueue.add('trigger', { timestamp: Date.now(), reason: 'manual_telegram_request' });
      await opportunityQueue.close();

      // Fire-and-forget: poll por novas oportunidades com timeout de 45s
      pollForNewOpportunities(pool, channelId, telegramConfig).catch((err) => {
        console.error('[Supervisor] Erro no poll pós-varredura:', err);
      });
      return;
    }

    const opp = oppRes.rows[0];

    // Cria a nova unidade de conteúdo (content_units)
    const insertRes = await pool.query(`
      INSERT INTO content_units (org_id, channel_id, topic, state, metadata, attempt_counts)
      VALUES ($1, $2, $3, 'DISCOVERED', jsonb_build_object('topic', $3::text, 'opportunity_id', $4::text), '{}')
      RETURNING id
    `, [opp.org_id, channelId, opp.title, opp.id]);

    const contentId = insertRes.rows[0].id;

    // Salva a transição de estado no banco
    await pool.query(`
      INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
      VALUES ($1, 'DISCOVERED', 'DISCOVERED', 'telegram-curator', $2)
    `, [contentId, `Produção iniciada pelo operador via Telegram para oportunidade: ${opp.title}`]);

    // Marca a oportunidade como QUEUED
    await pool.query(`
      UPDATE content_opportunities
      SET status = 'QUEUED', updated_at = NOW()
      WHERE id = $1
    `, [opp.id]);

    // Enfileira o job na fila do pipeline
    const pipelineQueue = new Queue(SUPERVISOR_QUEUE, { connection });
    await pipelineQueue.add('EVALUATE_TRIGGER', {
      contentId,
      channelId,
      topic: opp.title,
    });
    await pipelineQueue.close();

    console.log(`[Supervisor] Operador iniciou história "${opp.title}" (Unit: ${contentId})`);

    const escTitle = escapeMarkdown(opp.title);
    const successMsg = `⏳ *Iniciando Produção:* *${escTitle}*\n\nA Cinematic Engine está escrevendo e renderizando esta história! Você receberá o card de revisão assim que estiver pronto. 🎬`;
    
    await sendTelegram(successMsg, telegramConfig, 'Markdown');

  } catch (err) {
    console.error('[Supervisor] Erro ao iniciar próxima história:', err);
    const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
    await sendTelegram('🚨 Erro ao iniciar a próxima história no pipeline.', telegramConfig);
  }
}

// ─── Renderizador de Lista de Pendentes ───────────────────────────────────────
async function renderPendingList(messageIdToEdit?: number): Promise<void> {
  const telegramConfig = { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID };
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT id, topic FROM content_units WHERE state = 'PENDING_REVIEW' ORDER BY created_at ASC`
    );

    if (rows.length === 0) {
      const emptyText = 'Não há vídeos pendentes de revisão no momento. ☕';
      if (messageIdToEdit) {
        await editTelegramMessage(messageIdToEdit, emptyText, telegramConfig, 'Markdown');
      } else {
        await notify('TEST', { message: emptyText });
      }
      return;
    }

    const listText = `📋 *Vídeos Pendentes de Revisão (${rows.length}):*`;
    const buttons = rows.map((r, i) => ([{
      text: `${i + 1}. ${r.topic.slice(0, 30)}${r.topic.length > 30 ? '...' : ''}`,
      callback_data: `show:${r.id}`
    }]));

    const replyMarkup = { inline_keyboard: buttons };

    if (messageIdToEdit) {
      await editTelegramMessage(messageIdToEdit, listText, telegramConfig, 'Markdown', replyMarkup);
    } else {
      const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
      await sendTelegram(listText, telegramConfig, 'Markdown', replyMarkup);
    }

  } catch (err) {
    console.error('[Supervisor] Erro ao renderizar lista de pendentes:', err);
  }
}

// ─── Telegram Polling ───────────────────────────────────────────────────────
// Escuta comandos /approve, /reject, /list e cliques de botões inline.
// Sem webhook, sem URL pública — funciona em localhost.

let _lastUpdateId = 0;
let _lastKDRTimestamp = 0;

async function pollTelegram(): Promise<void> {
  if (!isNotificationsEnabled()) return;

  const telegramConfig = { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID };
  const updates: TelegramUpdate[] = await getUpdates(telegramConfig, _lastUpdateId + 1);

  for (const update of updates) {
    _lastUpdateId = update.update_id;

    // ── 1. Processa Cliques em Botões Inline (Callback Queries) ────────────────
    if (update.callback_query) {
      const cbQuery = update.callback_query;
      const fromChatId = String(cbQuery.message?.chat.id ?? '');

      if (fromChatId !== TELEGRAM_CHAT_ID) continue;

      const data = cbQuery.data;
      const messageId = cbQuery.message?.message_id;

      if (data.startsWith('approve:') || data.startsWith('reject:') || data.startsWith('adjust:')) {
        const [action, contentId] = data.split(':');
        const pool = getPool();
        
        try {
          const res = await pool.query('SELECT channel_id, topic, metadata FROM content_units WHERE id = $1', [contentId]);
          const contentUnit = res.rows[0];
          
          if (!contentUnit) {
            await answerCallbackQuery(cbQuery.id, telegramConfig, '\u274c Conteúdo não encontrado.', true);
            continue;
          }

          const channelId = contentUnit.channel_id;
          const topic = contentUnit.topic;
          const metadata = contentUnit.metadata || {};
          const isVideo = !!metadata.telegramIsVideo;

          // Função auxiliar local: edita a mensagem certa dependendo do tipo
          const editMsg = async (text: string, markup?: any) => {
            if (!messageId) return;
            if (isVideo) {
              await editTelegramCaption(messageId, text, telegramConfig, 'Markdown', markup);
            } else {
              await editTelegramMessage(messageId, text, telegramConfig, 'Markdown', markup);
            }
          };

          const chanRes = await pool.query('SELECT slug FROM channel_registry WHERE id = $1', [channelId]);
          const channelSlug = chanRes.rows[0]?.slug ?? 'geral';

          const script = (metadata.script || {}) as any;
          const durationSeconds = metadata.script?.estimatedDurationSeconds || undefined;
          const durationText = durationSeconds !== undefined ? formatDuration(durationSeconds) : null;
          const hook = script.hook || script.cta || '';
          const hookLine = hook ? `_${escapeMarkdown(hook.slice(0, 120))}_` : null;

          // Transita o estado oficialmente chamando o eventHandler
          const nextMarkup = {
            inline_keyboard: [
              [
                { text: '🎬 Próxima História', callback_data: 'next_story' }
              ]
            ]
          };

          if (action === 'approve') {
            await processEvent(pool, 'REVIEW_RESULT', { contentId, channelId, action: 'approve' });
            await answerCallbackQuery(cbQuery.id, telegramConfig, '\u2705 Vídeo aprovado para publicação!');

            const updatedText = [
              `*KAIRO // APROVADO*`,
              ``,
              `"${escapeMarkdown(topic)}"`,
              hookLine,
              ``,
              durationText ? `\u23f1 ${durationText} \u00b7 \ud83d\udcfa ${channelSlug}` : `\ud83d\udcfa ${channelSlug}`,
              ``,
              `\ud83d\udfe2 Aprovado \u2014 aguardando publicação`,
            ].filter((x): x is string => x !== null).join('\n');

            await editMsg(updatedText, nextMarkup);

          } else if (action === 'adjust') {
            await processEvent(pool, 'REVIEW_RESULT', { contentId, channelId, action: 'regenerate' });
            await answerCallbackQuery(cbQuery.id, telegramConfig, '\ud83d\udfe1 Ajustes solicitados!');

            const updatedText = [
              `*KAIRO // EM REVISÃO*`,
              ``,
              `"${escapeMarkdown(topic)}"`,
              hookLine,
              ``,
              durationText ? `\u23f1 ${durationText} \u00b7 \ud83d\udcfa ${channelSlug}` : `\ud83d\udcfa ${channelSlug}`,
              ``,
              `\ud83d\udfe1 Ajustes solicitados \u2014 retornando ao pipeline`,
            ].filter((x): x is string => x !== null).join('\n');

            await editMsg(updatedText, nextMarkup);

          } else if (action === 'reject') {
            // Mostra o submenu de motivos de descarte editando a mesma mensagem
            const escTopic = escapeMarkdown(topic);

            const detailText = [
              `*KAIRO // DESCARTAR?*`,
              ``,
              `"${escTopic}"`,
              hookLine,
              ``,
              durationText ? `\u23f1 ${durationText} \u00b7 \ud83d\udcfa ${channelSlug}` : `\ud83d\udcfa ${channelSlug}`,
              ``,
              `\ud83d\udd34 Selecione o motivo do descarte:`,
            ].filter((x): x is string => x !== null).join('\n');

            const rejectMarkup = {
              inline_keyboard: [
                [
                  { text: '\ud83d\udeab N\u00e3o representa a marca', callback_data: `reject_reason:${contentId}:not_brand` },
                  { text: '\ud83d\udde3\ufe0f Narra\u00e7\u00e3o artificial', callback_data: `reject_reason:${contentId}:narration` }
                ],
                [
                  { text: '\ud83c\udfac Dire\u00e7\u00e3o cinematogr\u00e1fica', callback_data: `reject_reason:${contentId}:direction` },
                  { text: '\ud83d\uddbc\ufe0f Imagens inadequadas', callback_data: `reject_reason:${contentId}:images` }
                ],
                [
                  { text: '\ud83d\udcdd Legendas ruins', callback_data: `reject_reason:${contentId}:subtitles` },
                  { text: '\ud83d\udca1 Boa ideia, m\u00e1 execu\u00e7\u00e3o', callback_data: `reject_reason:${contentId}:bad_execution` }
                ],
                [
                  { text: '\u2b05\ufe0f Cancelar', callback_data: `show:${contentId}` }
                ]
              ]
            };

            await editMsg(detailText, rejectMarkup);
            await answerCallbackQuery(cbQuery.id, telegramConfig, 'Selecione o motivo da rejei\u00e7\u00e3o');
            continue;
          }
        } catch (err) {
          console.error(`[Supervisor] Erro ao processar callback query ${action}:`, err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao processar ação.', true);
        }
      } else if (data.startsWith('details:')) {
        // Mostra detalhes (score editorial + status por plataforma) sem remover o vídeo
        const contentId = data.slice(8);
        const pool = getPool();

        try {
          const res = await pool.query('SELECT channel_id, topic, metadata FROM content_units WHERE id = $1', [contentId]);
          const contentUnit = res.rows[0];
          if (!contentUnit) {
            await answerCallbackQuery(cbQuery.id, telegramConfig, '\u274c Conteúdo não encontrado.', true);
            continue;
          }

          const channelId = contentUnit.channel_id;
          const topic = contentUnit.topic;
          const metadata = contentUnit.metadata || {};
          const isVideo = !!metadata.telegramIsVideo;

          const chanRes = await pool.query('SELECT slug FROM channel_registry WHERE id = $1', [channelId]);
          const channelSlug = chanRes.rows[0]?.slug ?? 'geral';

          const score = (metadata.editorialScore || metadata.score) as number | undefined;
          const scoreText = score !== undefined ? `${(score * 100).toFixed(0)}%` : 'N/A';
          const durationSeconds = metadata.script?.estimatedDurationSeconds || undefined;
          const durationText = durationSeconds !== undefined ? formatDuration(durationSeconds) : null;

          const script = (metadata.script || {}) as any;
          const hook = script.hook || script.cta || '';
          const hookLine = hook ? `_${escapeMarkdown(hook.slice(0, 120))}_` : null;

          // Publica\u00e7\u00e3o por plataforma
          const pubResults = (metadata.publicationResults ?? []) as Array<{ platform: string; platformUrl?: string; success?: boolean }>;
          const pubLines = pubResults.length > 0
            ? pubResults.map(r => r.platformUrl
                ? `\u2022 [${r.platform}](${r.platformUrl})`
                : `\u2022 ${r.platform}: ${r.success === false ? '\u274c Falhou' : '\u23f3 Pendente'}`
              ).join('\n')
            : null;

          const detailText = [
            `*KAIRO // DETALHES*`,
            ``,
            `"${escapeMarkdown(topic)}"`,
            hookLine,
            ``,
            durationText ? `\u23f1 ${durationText} \u00b7 \ud83d\udcfa ${channelSlug}` : `\ud83d\udcfa ${channelSlug}`,
            `\u2b50 Score editorial: \`${scoreText}\``,
            pubLines ? `\n\ud83d\ude80 Publica\u00e7\u00e3o:\n${pubLines}` : null,
          ].filter((x): x is string => x !== null).join('\n');

          const backMarkup = {
            inline_keyboard: [
              [
                { text: '\u2b05\ufe0f Voltar', callback_data: `show:${contentId}` }
              ]
            ]
          };

          if (messageId) {
            if (isVideo) {
              await editTelegramCaption(messageId, detailText, telegramConfig, 'Markdown', backMarkup);
            } else {
              await editTelegramMessage(messageId, detailText, telegramConfig, 'Markdown', backMarkup);
            }
          }
          await answerCallbackQuery(cbQuery.id, telegramConfig);

        } catch (err) {
          console.error('[Supervisor] Erro ao buscar detalhes:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '\ud83d\udea8 Erro ao buscar detalhes.', true);
        }
      } else if (data.startsWith('reject_reason:')) {
        const parts = data.split(':');
        const contentId = parts[1];
        const reasonSlug = parts[2] || '';
        const pool = getPool();
        
        try {
          const res = await pool.query('SELECT channel_id, topic, metadata FROM content_units WHERE id = $1', [contentId]);
          const contentUnit = res.rows[0];
          
          if (!contentUnit) {
            await answerCallbackQuery(cbQuery.id, telegramConfig, '❌ Conteúdo não encontrado.', true);
            continue;
          }

          const channelId = contentUnit.channel_id;
          const topic = contentUnit.topic;
          const metadata = contentUnit.metadata || {};

          let reasonText = 'Rejeitado via Telegram';
          // Mapa: slug do callback → texto legível + ENUM do banco editorial_feedback
          const SLUG_TO_FEEDBACK: Record<string, { text: string; category: string }> = {
            not_brand:     { text: 'Não representa a marca',  category: 'brand_mismatch' },
            narration:     { text: 'Narração artificial',      category: 'artificial_narration' },
            direction:     { text: 'Direção cinematográfica',  category: 'cinematic_direction' },
            images:        { text: 'Imagens inadequadas',      category: 'inadequate_imagery' },
            subtitles:     { text: 'Legendas ruins',           category: 'bad_captions' },
            bad_execution: { text: 'Boa ideia, má execução',   category: 'good_idea_bad_execution' },
          };

          const feedbackEntry = SLUG_TO_FEEDBACK[reasonSlug];
          if (feedbackEntry) {
            reasonText = feedbackEntry.text;
            await pool.query(
              `INSERT INTO editorial_feedback (content_unit_id, source, category)
               VALUES ($1, 'telegram', $2::editorial_feedback_category)`,
              [contentId, feedbackEntry.category]
            );
            console.log(`[Supervisor] 📝 Feedback editorial gravado: ${feedbackEntry.category} (unit: ${contentId})`);
          }

          // Transita o estado oficialmente para REJECTED
          await processEvent(pool, 'REVIEW_RESULT', { contentId, channelId, action: 'reject', reason: reasonText });
          await answerCallbackQuery(cbQuery.id, telegramConfig, `❌ Rejeitado: ${reasonText}`);

          const isVideo = !!metadata.telegramIsVideo;

          const chanRes = await pool.query('SELECT slug FROM channel_registry WHERE id = $1', [channelId]);
          const channelSlug = chanRes.rows[0]?.slug ?? 'geral';

          const script = (metadata.script || {}) as any;
          const durationSeconds = metadata.script?.estimatedDurationSeconds || undefined;
          const durationText = durationSeconds !== undefined ? formatDuration(durationSeconds) : null;
          const hook = script.hook || script.cta || '';
          const hookLine = hook ? `_${escapeMarkdown(hook.slice(0, 120))}_` : null;

          const updatedText = [
            `*KAIRO // REJEITADO*`,
            ``,
            `"${escapeMarkdown(topic)}"`,
            hookLine,
            ``,
            durationText ? `⏱ ${durationText} · 📺 ${channelSlug}` : `📺 ${channelSlug}`,
            ``,
            `🔴 Rejeitado: _${escapeMarkdown(reasonText)}_`,
          ].filter((x): x is string => x !== null).join('\n');

          if (messageId) {
            const nextMarkup = {
              inline_keyboard: [
                [
                  { text: '🎬 Próxima História', callback_data: 'next_story' }
                ]
              ]
            };
            if (isVideo) {
              await editTelegramCaption(messageId, updatedText, telegramConfig, 'Markdown', nextMarkup);
            } else {
              await editTelegramMessage(messageId, updatedText, telegramConfig, 'Markdown', nextMarkup);
            }
          }

        } catch (err) {
          console.error('[Supervisor] Erro ao processar reject_reason callback:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao processar descarte.', true);
        }
      } else if (data.startsWith('show:')) {
        const contentId = data.slice(5);
        const pool = getPool();
        
        try {
          const res = await pool.query('SELECT channel_id, topic, metadata FROM content_units WHERE id = $1', [contentId]);
          const contentUnit = res.rows[0];
          if (!contentUnit) {
            await answerCallbackQuery(cbQuery.id, telegramConfig, '❌ Conteúdo não encontrado.', true);
            continue;
          }

          const channelId = contentUnit.channel_id;
          const topic = contentUnit.topic;
          const metadata = contentUnit.metadata || {};
          const isVideo = !!metadata.telegramIsVideo;

          const chanRes = await pool.query('SELECT slug FROM channel_registry WHERE id = $1', [channelId]);
          const channelSlug = chanRes.rows[0]?.slug ?? 'geral';

          const score = (metadata.editorialScore || metadata.score) as number | undefined;
          const durationSeconds = metadata.script?.estimatedDurationSeconds || undefined;
          const durationText = durationSeconds !== undefined ? formatDuration(durationSeconds) : null;

          const script = (metadata.script || {}) as any;
          const hook = script.hook || script.cta || '';
          const hookLine = hook ? `_${escapeMarkdown(hook.slice(0, 120))}_` : null;
          const metaLine = durationText ? `⏱ ${durationText} · 📺 ${channelSlug}` : `📺 ${channelSlug}`;

          // Restaura a caption no formato KAIRO original
          const detailText = [
            `*KAIRO // NOVA PRODUÇÃO*`,
            ``,
            `"${escapeMarkdown(topic)}"`,
            hookLine,
            ``,
            metaLine,
          ].filter((x): x is string => x !== null).join('\n');

          // Botões KAIRO: [APROVAR] | [Editar][Detalhes][Rejeitar]
          const replyMarkup = {
            inline_keyboard: [
              [
                { text: '✅  APROVAR', callback_data: `approve:${contentId}` },
              ],
              [
                { text: '✏️ Editar', callback_data: `adjust:${contentId}` },
                { text: 'ℹ️ Detalhes', callback_data: `details:${contentId}` },
                { text: '❌ Rejeitar', callback_data: `reject:${contentId}` },
              ],
            ]
          };

          if (messageId) {
            if (isVideo) {
              await editTelegramCaption(messageId, detailText, telegramConfig, 'Markdown', replyMarkup);
            } else {
              await editTelegramMessage(messageId, detailText, telegramConfig, 'Markdown', replyMarkup);
            }
          }
          await answerCallbackQuery(cbQuery.id, telegramConfig);

        } catch (err) {
          console.error('[Supervisor] Erro ao carregar detalhes do vídeo:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao buscar detalhes.', true);
        }
      } else if (data === 'list_all') {
        await answerCallbackQuery(cbQuery.id, telegramConfig);
        if (messageId) {
          await renderPendingList(messageId);
        }
      }
      
      // 1. Por que esta história? (why_story)
      else if (data.startsWith('why_story:')) {
        const contentId = data.split(':')[1];
        const pool = getPool();
        try {
          const res = await pool.query(
            `SELECT co.title, co.description, co.base_score, co.dynamic_score, co.editorial_compatibility, co.momentum, cu.metadata
             FROM content_units cu
             LEFT JOIN content_opportunities co ON co.id = (cu.metadata->>'opportunity_id')::uuid
             WHERE cu.id = $1`,
            [contentId]
          );
          const row = res.rows[0];
          if (row) {
            const title = row.title || row.metadata?.topic || 'Título desconhecido';
            const baseScore = row.base_score !== null ? `${(row.base_score * 100).toFixed(0)}%` : 'N/A';
            const dynamicScore = row.dynamic_score !== null ? `${row.dynamic_score.toFixed(0)}/100` : 'N/A';
            const compatibility = row.editorial_compatibility !== null ? `${(row.editorial_compatibility * 100).toFixed(0)}%` : 'N/A';
            const momentum = row.momentum !== null ? `${(row.momentum * 100).toFixed(0)}%` : 'N/A';
            const archetype = row.metadata?.canonArchetype || 'Não definido';
            const emotion = row.metadata?.canonTargetEmotion || 'Não definida';

            const explainText = `🔍 *Por que esta História?*\n📌 *Título:* ${escapeMarkdown(title)}\n\n📈 *Métricas do VLS:*\n• *Score Dinâmico:* \`${dynamicScore}\`\n• *Volume Base (Score):* \`${baseScore}\`\n• *Compatibilidade DNA KAIRO:* \`${compatibility}\`\n• *Momentum da Tendência:* \`${momentum}\`\n\n🎭 *Filtro do Canon KAIRO:*\n• *Arquétipo Sugerido:* \`${archetype}\`\n• *Emoção Central:* \`${emotion}\`\n\n_O VLS selecionou este tema porque ele une o drama humano do futebol clássico com o volume recente de engajamento nas mídias sociais._`;

            const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
            await sendTelegram(explainText, telegramConfig, 'Markdown');
            await answerCallbackQuery(cbQuery.id, telegramConfig, 'Métricas enviadas!');
          } else {
            await answerCallbackQuery(cbQuery.id, telegramConfig, '❌ Oportunidade não encontrada.', true);
          }
        } catch (err) {
          console.error('[Supervisor] Erro no callback why_story:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao buscar métricas.', true);
        }
      }

      // 2. Ver Fontes (sources_story)
      else if (data.startsWith('sources_story:')) {
        const contentId = data.split(':')[1];
        const pool = getPool();
        try {
          const res = await pool.query(
            `SELECT cu.metadata, co.source_signals
             FROM content_units cu
             LEFT JOIN content_opportunities co ON co.id = (cu.metadata->>'opportunity_id')::uuid
             WHERE cu.id = $1`,
            [contentId]
          );
          const row = res.rows[0];
          if (row) {
            let sourcesList: Array<{ title: string; url: string }> = [];
            const researchSources = row.metadata?.researchPackage?.sources;
            if (Array.isArray(researchSources)) {
              sourcesList = researchSources.map((s: any) => ({
                title: s.title || 'Artigo/Notícia',
                url: s.url || '#'
              }));
            }

            if (sourcesList.length === 0 && row.source_signals) {
              const signalIds: string[] = [];
              if (Array.isArray(row.source_signals)) {
                for (const sig of row.source_signals) {
                  if (typeof sig === 'string') signalIds.push(sig);
                  else if (sig && typeof sig === 'object' && sig.id) signalIds.push(sig.id);
                }
              }
              
              if (signalIds.length > 0) {
                const sigRes = await pool.query(
                  `SELECT title, url, source FROM normalized_signals WHERE id = ANY($1::uuid[])`,
                  [signalIds]
                );
                sourcesList = sigRes.rows.map((s: any) => ({
                  title: s.title || `Sinal de ${s.source}`,
                  url: s.url || '#'
                }));
              }
            }

            if (sourcesList.length === 0) {
              await answerCallbackQuery(cbQuery.id, telegramConfig, '⚠️ Nenhuma fonte registrada.', true);
            } else {
              const sourcesMsg = `📚 *Fontes de Origem:*\n_Notícias e tendências de futebol que geraram esta história:_\n\n` + 
                sourcesList.slice(0, 10).map((s, idx) => `${idx + 1}. [${escapeMarkdown(s.title)}](${s.url})`).join('\n');
              
              const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
              await sendTelegram(sourcesMsg, telegramConfig, 'Markdown');
              await answerCallbackQuery(cbQuery.id, telegramConfig, 'Fontes enviadas!');
            }
          } else {
            await answerCallbackQuery(cbQuery.id, telegramConfig, '❌ Conteúdo não encontrado.', true);
          }
        } catch (err) {
          console.error('[Supervisor] Erro no callback sources_story:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao buscar fontes.', true);
        }
      }

      // 3. Trocar Hipótese VLS (menu de arquétipos)
      else if (data.startsWith('swap_hypothesis:')) {
        const contentId = data.split(':')[1];
        try {
          const archetypes = [
            { key: 'heroi_tragico', label: '1. Herói Trágico 🎭 (Culpa + Grandeza)' },
            { key: 'exilado_que_retorna', label: '2. Exilado Retorna 🚶 (Redenção)' },
            { key: 'eterno_segundo', label: '3. Eterno Segundo 🥈 (Injustiça)' },
            { key: 'martir_esquecido', label: '4. Mártir Esquecido 🕰️ (Legado)' },
            { key: 'momento_impossivel', label: '5. Momento Impossível ✨ (Êxtase)' }
          ];

          const inline_keyboard = archetypes.map(a => ([{
            text: a.label,
            callback_data: `choose_hypo:${contentId}:${a.key}`
          }]));

          inline_keyboard.push([{
            text: '⬅️ Voltar para Revisão',
            callback_data: `show:${contentId}`
          }]);

          const promptText = `🧪 *Selecione a nova hipótese VLS (Arquétipo Narrativo):*\nSelecione o arquétipo central para re-escrever o roteiro do vídeo. O tema da história e a pesquisa original serão mantidos como variáveis controladas.`;

          if (messageId) {
            await editTelegramMessage(messageId, promptText, telegramConfig, 'Markdown', { inline_keyboard });
          }
          await answerCallbackQuery(cbQuery.id, telegramConfig);
        } catch (err) {
          console.error('[Supervisor] Erro no callback swap_hypothesis:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao carregar hipóteses.', true);
        }
      }

      // 4. Seleção da nova hipótese VLS (reinicia script)
      else if (data.startsWith('choose_hypo:')) {
        const [_, contentId, archetype] = data.split(':');
        const pool = getPool();
        try {
          const res = await pool.query('SELECT channel_id, topic, metadata FROM content_units WHERE id = $1', [contentId]);
          const unit = res.rows[0];
          if (!unit) {
            await answerCallbackQuery(cbQuery.id, telegramConfig, '❌ Conteúdo não encontrado.', true);
            continue;
          }

          const metadata = unit.metadata || {};
          delete metadata.script;
          delete metadata.videoFile;
          delete metadata.assetUrls;
          delete metadata.qcChecklist;
          delete metadata.qcScore;
          delete metadata.criticEvaluation;
          delete metadata.cinematicEvaluation;

          metadata.canonArchetype = archetype;
          let emotion = 'Culpa + Grandeza';
          if (archetype === 'exilado_que_retorna') emotion = 'Redenção + Melancolia';
          else if (archetype === 'eterno_segundo') emotion = 'Injustiça + Dignidade';
          else if (archetype === 'martir_esquecido') emotion = 'Solidão + Legado';
          else if (archetype === 'momento_impossivel') emotion = 'Espanto + Êxtase';

          metadata.canonTargetEmotion = emotion;

          await pool.query(
            `UPDATE content_units 
             SET state = 'RESEARCHED', metadata = $1, attempt_counts = '{}', updated_at = NOW() 
             WHERE id = $2`,
            [JSON.stringify(metadata), contentId]
          );

          await pool.query(
            `INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
             VALUES ($1, 'PENDING_REVIEW', 'RESEARCHED', 'telegram-vls-selector', $2)`,
            [contentId, `Hipótese VLS alterada para o arquétipo: ${archetype}`]
          );

          const scriptQueue = new Queue(queueName('script', unit.channel_id), { connection });
          await scriptQueue.add('write_script', {
            contentId,
            channelId: unit.channel_id,
            researchPackage: metadata.researchPackage,
            attemptNumber: 1
          });
          await scriptQueue.close();

          const feedbackMsg = `🧪 *VLS:* Arquétipo alterado para \`${archetype}\` (\`${emotion}\`).\n\nRe-gerando roteiro e re-renderizando vídeo... ⏳`;
          if (messageId) {
            await editTelegramMessage(messageId, feedbackMsg, telegramConfig, 'Markdown');
          }
          await answerCallbackQuery(cbQuery.id, telegramConfig, 'Hipótese VLS atualizada!');
        } catch (err) {
          console.error('[Supervisor] Erro ao escolher hipótese:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao atualizar hipótese.', true);
        }
      }

      // 5. Pular esta história (descarta a atual e inicia a próxima)
      else if (data.startsWith('skip_story:')) {
        const contentId = data.split(':')[1];
        const pool = getPool();
        try {
          const res = await pool.query('SELECT channel_id, topic, metadata FROM content_units WHERE id = $1', [contentId]);
          const unit = res.rows[0];
          if (!unit) {
            await answerCallbackQuery(cbQuery.id, telegramConfig, '❌ Conteúdo não encontrado.', true);
            continue;
          }

          const channelId = unit.channel_id;
          const oppId = unit.metadata?.opportunity_id;

          if (oppId) {
            await pool.query(
              `UPDATE content_opportunities SET status = 'DISCARDED', updated_at = NOW() WHERE id = $1`,
              [oppId]
            );
          }

          await processEvent(pool, 'ABANDON_REQUEST', {
            contentId,
            channelId,
            reason: 'Pulado pelo operador via Telegram (curadoria)'
          });

          await answerCallbackQuery(cbQuery.id, telegramConfig, 'História pulada!');

          const skipMsg = `⏭️ *História pulada:* _"${escapeMarkdown(unit.topic)}"_\n\nBuscando e iniciando próxima oportunidade de maior score dinâmico... 🔍`;
          if (messageId) {
            await editTelegramMessage(messageId, skipMsg, telegramConfig, 'Markdown');
          }

          await startNextHistory();
        } catch (err) {
          console.error('[Supervisor] Erro no callback skip_story:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao pular história.', true);
        }
      }

      // ── KDR: Aprovar proposta para a CGL ──────────────────────────────────────
      else if (data.startsWith('kdr_approve:')) {
        const entryId = data.slice('kdr_approve:'.length);
        try {
          const result = approveEntry(entryId);
          if (result.success && result.entry) {
            await answerCallbackQuery(cbQuery.id, telegramConfig, `✅ Aprovado: ${result.entry.concept}`);
            if (messageId) {
              const txt = `📚 *Adicionado à CGL:*\n🎯 *${escapeMarkdown(result.entry.concept)}* → \`${result.entry.area}\``;
              await editTelegramMessage(messageId, txt, telegramConfig, 'Markdown');
            }
          } else {
            await answerCallbackQuery(cbQuery.id, telegramConfig, `❌ ${result.error || 'Proposta não encontrada ou já processada.'}`, true);
          }
        } catch (err) {
          console.error('[Supervisor] Erro kdr_approve:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao aprovar.', true);
        }
      }

      // ── KDR: Rejeitar proposta ────────────────────────────────────────────────
      else if (data.startsWith('kdr_reject:')) {
        const entryId = data.slice('kdr_reject:'.length);
        try {
          const result = rejectEntry(entryId);
          if (result.success && result.entry) {
            await answerCallbackQuery(cbQuery.id, telegramConfig, `❌ Rejeitado: ${result.entry.concept}`);
            if (messageId) {
              const txt = `🗑️ *Proposta rejeitada:*\n_${escapeMarkdown(result.entry.concept)}_ (preservada para VLS)`;
              await editTelegramMessage(messageId, txt, telegramConfig, 'Markdown');
            }
          } else {
            await answerCallbackQuery(cbQuery.id, telegramConfig, `❌ ${result.error || 'Proposta não encontrada ou já processada.'}`, true);
          }
        } catch (err) {
          console.error('[Supervisor] Erro kdr_reject:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao rejeitar.', true);
        }
      }
      
      // ── Próxima História ──────────────────────────────────────────────────────
      else if (data === 'next_story') {
        try {
          await startNextHistory();
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🎬 Buscando próxima história...');
        } catch (err) {
          console.error('[Supervisor] Erro ao iniciar próxima história via callback:', err);
          await answerCallbackQuery(cbQuery.id, telegramConfig, '🚨 Erro ao iniciar próxima história.', true);
        }
      }
      
      continue;
    }

    // ── 2. Processa Comandos de Texto Clássicos ───────────────────────────────
    // Em channels, mensagens vêm como channel_post, não message
    const msg = update.message ?? update.channel_post;
    const text = msg?.text?.trim() ?? '';
    const fromChatId = String(msg?.chat.id ?? '');

    if (fromChatId !== TELEGRAM_CHAT_ID) continue;

    if (text.startsWith('/list') || text.startsWith('/start')) {
      if (text.startsWith('/start')) {
        const welcomeText = `⚽ *Mesa Editorial KAIRO* ⚽\n\nBem-vindo ao Painel Editorial. O COS e o VLS estão ativamente escutando tendências globais do futebol.\n\nToque no botão abaixo a qualquer momento para que o sistema analise e produza a próxima melhor história!`;
        const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
        await sendTelegram(welcomeText, telegramConfig, 'Markdown', KAIRO_REPLAY_KEYBOARD as any);
      }
      await renderPendingList();
      continue;
    }

    if (text === '🎬 Próxima História') {
      await startNextHistory();
      continue;
    }

    const approveMatch = text.match(/^\/approve\s+([\w-]+)$/i);
    const rejectMatch  = text.match(/^\/reject\s+([\w-]+)$/i);

    if (approveMatch) {
      const contentId = approveMatch[1] as string;
      console.log(`[Supervisor] Telegram: operador aprovou ${contentId}`);

      try {
        const pool = getPool();
        const res = await pool.query('SELECT channel_id FROM content_units WHERE id = $1', [contentId]);
        const channelId: string | undefined = res.rows[0]?.channel_id;
        if (!channelId) {
          await notify('TEST', { message: `❌ Conteúdo não encontrado: \`${contentId}\`` });
          continue;
        }
        await processEvent(pool, 'REVIEW_RESULT', { contentId, channelId, action: 'approve' });
        await notify('TEST', { message: `✅ Conteúdo *${contentId.slice(0, 8)}* aprovado com sucesso.` });
      } catch (err) {
        console.error('[Supervisor] Erro ao processar /approve via Telegram:', err);
      }

    } else if (rejectMatch) {
      const contentId = rejectMatch[1] as string;
      console.log(`[Supervisor] Telegram: operador rejeitou ${contentId}`);

      try {
        const pool = getPool();
        const res = await pool.query('SELECT channel_id FROM content_units WHERE id = $1', [contentId]);
        const channelId: string | undefined = res.rows[0]?.channel_id;
        if (!channelId) {
          await notify('TEST', { message: `❌ Conteúdo não encontrado: \`${contentId}\`` });
          continue;
        }
        await processEvent(pool, 'REVIEW_RESULT', { contentId, channelId, action: 'reject', reason: 'Rejeitado pelo operador via Telegram' });
        await notify('TEST', { message: `🚫 Conteúdo *${contentId.slice(0, 8)}* rejeitado.` });
      } catch (err) {
        console.error('[Supervisor] Erro ao processar /reject via Telegram:', err);
      }
    } else if (text.startsWith('/kdr ')) {
      // ── KDR: Pesquisa cinematográfica manual ────────────────────────────────
      const kdrParts = text.slice(5).trim().split(/\s+/);
      const kdrArea = kdrParts[0] || '';
      const kdrQuery = kdrParts.slice(1).join(' ');

      if (!kdrArea || !kdrQuery) {
        const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
        await sendTelegram('⚠️ Uso: `/kdr <área> <tema>`\nÁreas: fotografia, storytelling, ritmo, montagem, som, cor, futebol, emocoes, simbolismo, cinema, referencias, documentarios, linguagem\\_visual', telegramConfig, 'Markdown');
        continue;
      }

      // Rate limit: 1 por minuto
      const now = Date.now();
      if (now - _lastKDRTimestamp < 60_000) {
        const waitSec = Math.ceil((60_000 - (now - _lastKDRTimestamp)) / 1000);
        const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
        await sendTelegram(`⏳ Rate limit: aguarde ${waitSec}s antes do próximo /kdr.`, telegramConfig);
        continue;
      }
      _lastKDRTimestamp = now;

      try {
        const kdrQueue = new Queue('kdr-research', { connection });
        await kdrQueue.add('KDR_RESEARCH', {
          area: kdrArea,
          query: kdrQuery,
          telegramChatId: TELEGRAM_CHAT_ID,
          telegramBotToken: TELEGRAM_BOT_TOKEN,
        });
        await kdrQueue.close();

        const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
        await sendTelegram(`🔬 *KDR iniciado:*\nÁrea: \`${escapeMarkdown(kdrArea)}\`\nQuery: _${escapeMarkdown(kdrQuery)}_\n\nAguarde as propostas...`, telegramConfig, 'Markdown');
      } catch (err) {
        console.error('[Supervisor] Erro ao enfileirar KDR:', err);
        const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
        await sendTelegram('🚨 Erro ao iniciar pesquisa KDR.', telegramConfig);
      }
    } else if (text.startsWith('/novotema ') || text.startsWith('/sugerir ')) {
      const topicText = text.replace(/^\/(novotema|sugerir)\s+/i, '').trim();
      if (!topicText) {
        const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
        await sendTelegram('⚠️ Uso: `/novotema <tema>` ou `/sugerir <tema>`', telegramConfig, 'Markdown');
        continue;
      }

      // Trata comando como criação de tema manual para o canal KAIRO (@90kairo)
      const pool = getPool();
      try {
        const chanRes = await pool.query(
          "SELECT id, org_id FROM channel_registry WHERE slug = $1",
          [CHANNEL_SLUG]
        );
        if (chanRes.rows.length === 0) {
          const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
          await sendTelegram(`❌ Canal KAIRO (${CHANNEL_SLUG}) não encontrado no registro.`, telegramConfig);
          continue;
        }
        
        const channelId = chanRes.rows[0].id;
        const orgId = chanRes.rows[0].org_id;

        // Cria a nova unidade de conteúdo (content_units)
        const insertRes = await pool.query(`
          INSERT INTO content_units (org_id, channel_id, topic, state, metadata, attempt_counts)
          VALUES ($1, $2, $3, 'DISCOVERED', jsonb_build_object('topic', $3::text, 'origin', 'manual'), '{}')
          RETURNING id
        `, [orgId, channelId, topicText]);

        const contentId = insertRes.rows[0].id;

        // Salva a transição de estado no banco
        await pool.query(`
          INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
          VALUES ($1, 'DISCOVERED', 'DISCOVERED', 'telegram-manual-theme', $2)
        `, [contentId, `Produção manual iniciada via comando do Telegram: ${topicText}`]);

        // Enfileira o job na fila do pipeline
        const pipelineQueue = new Queue(SUPERVISOR_QUEUE, { connection });
        await pipelineQueue.add('EVALUATE_TRIGGER', {
          contentId,
          channelId,
          topic: topicText,
        });
        await pipelineQueue.close();

        const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
        const escTitle = escapeMarkdown(topicText);
        await sendTelegram(`⏳ *Tema Recebido:* *${escTitle}*\n\nIniciando a direção da narrativa e renderização do vídeo para o canal @90kairo! 🎬`, telegramConfig, 'Markdown');
      } catch (err) {
        console.error('[Supervisor] Erro ao criar tema via comando manual:', err);
        const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
        await sendTelegram('🚨 Erro ao iniciar a produção do tema enviado.', telegramConfig);
      }
    } else {
      const { sendTelegram } = await import('@cos/notifications/dist/telegram.js');
      await sendTelegram('Comando não reconhecido. Use /help para ver os comandos disponíveis.', telegramConfig);
    }
  }
}

// ─── Heartbeat ──────────────────────────────────────────────────────────────
async function sendHeartbeat(): Promise<void> {
  await notify('HEARTBEAT', {}).catch(() => {});
}

async function bootstrap() {
  console.log('🚀 Iniciando COS Supervisor...');

  try {
    await initDb();
    console.log('✅ Conectado ao PostgreSQL');
    // Desativa auto-publish e força publicação no TikTok para todos os canais
    await getPool().query(
      `UPDATE channel_registry 
       SET strategy = strategy || '{"autoPublish": false, "platformWeights": {"tiktok": 1}}'::jsonb`
    );
    console.log('[Supervisor] Enforced autoPublish = false and platformWeights = {"tiktok": 1} for all channels');

    // Recuperar itens presos em DISCOVERED (criados incorretamente na fila 'pipeline')
    const { rows: stuckUnits } = await getPool().query(`
      SELECT id, channel_id, topic FROM content_units WHERE state = 'DISCOVERED'
    `);
    if (stuckUnits.length > 0) {
      console.log(`[Supervisor] Recuperando ${stuckUnits.length} itens presos em DISCOVERED...`);
      const pipelineQueue = new Queue(SUPERVISOR_QUEUE, { connection });
      for (const unit of stuckUnits) {
        await pipelineQueue.add('EVALUATE_TRIGGER', {
          contentId: unit.id,
          channelId: unit.channel_id,
          topic: unit.topic
        });
        console.log(`[Supervisor] Reenfileirado: ${unit.topic} (${unit.id})`);
      }
      await pipelineQueue.close();
    }
  } catch (error) {
    console.error('❌ Falha ao conectar ao banco de dados:', error);
    process.exit(1);
  }

  // Inicializa notificações Telegram
  initNotifications({ botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID });

  const worker = new Worker(
    SUPERVISOR_QUEUE,
    async (job: Job) => {
      console.log(`[Job ${job.id}] Processando evento do tipo: ${job.name} (Unit: ${job.data.contentId})`);
      try {
        await handleSupervisorEvent(job);
        console.log(`[Job ${job.id}] Sucesso.`);
      } catch (error) {
        console.error(`[Job ${job.id}] Falha ao processar evento:`, error);
        throw error;
      }
    },
    {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`🚨 Job falhou ${job?.id}: ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error(`🚨 Worker Error:`, err);
  });

  worker.on('ready', () => {
    console.log(`✅ Worker escutando a fila: ${SUPERVISOR_QUEUE}`);
  });

  // Polling Telegram a cada 5 segundos
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    setInterval(() => { pollTelegram().catch(() => {}); }, 5_000);
    console.log('✅ Polling Telegram iniciado (5s)');
  }

  // Heartbeat horário
  setInterval(() => { sendHeartbeat().catch(() => {}); }, 60 * 60 * 1_000);
  // Heartbeat imediato ao iniciar (confirma que o sistema está online)
  // setTimeout(() => { sendHeartbeat().catch(() => {}); }, 3_000);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Encerrando Supervisor...');
    await worker.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(console.error);
