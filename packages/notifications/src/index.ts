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
 *   await notify('PENDING_REVIEW', { contentId, topic, channelSlug, videoFile, hook, cta });
 */

import {
  sendTelegram,
  sendVideoWithCaption,
  sendVideoUrlWithCaption,
  type TelegramConfig,
  type TelegramInlineKeyboardMarkup,
  type SendResult,
} from './telegram.js';
import { formatEvent, type NotificationEventType, type EventPayload } from './events.js';

export type { NotificationEventType, EventPayload } from './events.js';
export {
  sendTelegram,
  sendVideoWithCaption,
  sendVideoUrlWithCaption,
  getUpdates,
  editTelegramMessage,
  editTelegramCaption,
  answerCallbackQuery,
} from './telegram.js';
export type {
  TelegramUpdate,
  TelegramInlineKeyboardButton,
  TelegramInlineKeyboardMarkup,
  SendResult,
} from './telegram.js';

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
 * Para PENDING_REVIEW com videoFile disponível, envia o vídeo nativo (sendVideoWithCaption).
 * Para outros eventos ou sem vídeo, envia texto simples.
 * Retorna { ok: false } silenciosamente se Telegram indisponível.
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

    // Hierarquia de botões KAIRO:
    // Linha 1: APROVAR (ação primária — full width)
    // Linha 2: Editar | Detalhes | Rejeitar (ações secundárias)
    replyMarkup = {
      inline_keyboard: [
        [
          { text: '✅  APROVAR', callback_data: `approve:${payload.contentId}` },
        ],
        [
          { text: '✏️ Editar', callback_data: `adjust:${payload.contentId}` },
          { text: 'ℹ️ Detalhes', callback_data: `details:${payload.contentId}` },
          { text: '❌ Rejeitar', callback_data: `reject:${payload.contentId}` },
        ],
      ],
    };

    // Tenta enviar como vídeo nativo — prioriza URL pública (cross-container) sobre path local
    if (payload.videoUrl) {
      const videoResult = await sendVideoUrlWithCaption(
        payload.videoUrl,
        message,
        _config,
        replyMarkup,
      ).catch((err) => {
        console.warn('[Notifications] sendVideoUrlWithCaption falhou, tentando path local:', err);
        return { ok: false, error: String(err) } as SendResult;
      });

      if (videoResult.ok) {
        return videoResult;
      }
      console.warn('[Notifications] Fallback para sendVideoWithCaption via path local.');
    }

    if (payload.videoFile) {
      const videoResult = await sendVideoWithCaption(
        payload.videoFile,
        message,
        _config,
        replyMarkup,
      ).catch((err) => {
        console.warn('[Notifications] sendVideoWithCaption falhou, caindo para texto:', err);
        return { ok: false, error: String(err) } as SendResult;
      });

      if (videoResult.ok) {
        return videoResult;
      }
      // Se falhou (vídeo não existe, timeout, etc.), cai para sendMessage abaixo
      console.warn('[Notifications] Fallback para mensagem de texto (vídeo indisponível).');
    }
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
