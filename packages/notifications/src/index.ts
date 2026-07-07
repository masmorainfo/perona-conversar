/**
 * @cos/notifications — Ponto de Entrada
 *
 * Uso:
 *   import { notify, initNotifications } from '@cos/notifications';
 *
 *   // Na inicialização do Supervisor:
 *   initNotifications({
 *     botToken: process.env.TELEGRAM_BOT_TOKEN!,
 *     chatId: process.env.TELEGRAM_CHAT_ID!,
 *   });
 *
 *   // Em qualquer lugar:
 *   await notify('PENDING_REVIEW', { contentId, topic, channelSlug });
 */

import { sendTelegram, type TelegramConfig, type TelegramInlineKeyboardMarkup, type SendResult } from './telegram.js';
import { formatEvent, type NotificationEventType, type EventPayload } from './events.js';

export type { NotificationEventType, EventPayload } from './events.js';
export { getUpdates, editTelegramMessage, answerCallbackQuery } from './telegram.js';
export type { TelegramUpdate, TelegramInlineKeyboardButton, TelegramInlineKeyboardMarkup, SendResult } from './telegram.js';

let _config: TelegramConfig | null = null;

/**
 * Inicializa o serviço de notificações com as credenciais Telegram.
 * Deve ser chamado uma vez no bootstrap do Supervisor.
 */
export function initNotifications(config: TelegramConfig): void {
  if (!config.botToken || !config.chatId) {
    console.warn('[Notifications] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausente — notificações desativadas.');
    return;
  }
  _config = config;
  console.log('[Notifications] ✅ Serviço de notificações Telegram inicializado.');
}

/**
 * Envia uma notificação para o operador.
 *
 * Se o Telegram estiver indisponível, apenas loga o erro.
 */
export async function notify(
  type: NotificationEventType,
  payload: EventPayload = {},
): Promise<SendResult | undefined> {
  if (!_config) {
    console.debug(`[Notifications] Ignorado (não inicializado): ${type}`);
    return undefined;
  }

  const message = formatEvent(type, payload);
  if (message === null) {
    // Evento silencioso por design (ex: EDITORIAL_REJECTED)
    return undefined;
  }

  let replyMarkup: TelegramInlineKeyboardMarkup | undefined = undefined;

  if (type === 'PENDING_REVIEW' && payload.contentId) {
    let MISSION_CONTROL_URL = process.env['MISSION_CONTROL_URL'] 
      || (process.env['RAILWAY_PUBLIC_DOMAIN'] ? `https://${process.env['RAILWAY_PUBLIC_DOMAIN']}` : undefined)
      || process.env['PUBLIC_URL']
      || 'http://127.0.0.1:3000';
    if (MISSION_CONTROL_URL.includes('localhost')) {
      MISSION_CONTROL_URL = MISSION_CONTROL_URL.replace('localhost', '127.0.0.1');
    }
    
    const previewUrl = payload.videoFilename
      ? `${MISSION_CONTROL_URL}/api/media/${payload.videoFilename}`
      : `${MISSION_CONTROL_URL}/review`;

    replyMarkup = {
      inline_keyboard: [
        [
          { text: '▶️ Assistir', url: previewUrl },
          { text: '📚 Ver Fontes', callback_data: `sources_story:${payload.contentId}` }
        ],
        [
          { text: '🟢 Publicar', callback_data: `approve:${payload.contentId}` },
          { text: '🔴 Rejeitar', callback_data: `reject:${payload.contentId}` }
        ],
        [
          { text: '🧪 Trocar Hipótese VLS', callback_data: `swap_hypothesis:${payload.contentId}` },
          { text: '🔍 Por que esta História?', callback_data: `why_story:${payload.contentId}` }
        ],
        [
          { text: '⏭️ Pular esta História', callback_data: `skip_story:${payload.contentId}` }
        ]
      ]
    };
  }

  return await sendTelegram(message, _config, 'Markdown', replyMarkup).catch((err) => {
    // Erro já logado dentro de sendTelegram — não propagar
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  });
}

/**
 * Retorna true se o serviço está configurado e ativo.
 */
export function isNotificationsEnabled(): boolean {
  return _config !== null;
}
