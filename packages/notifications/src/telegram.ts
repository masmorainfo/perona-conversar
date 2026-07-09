/**
 * @cos/notifications — Telegram Adapter
 *
 * HTTP direto para a Bot API do Telegram.
 * Sem SDK externo — usa fetch nativo (Node 20+).
 *
 * Configuração via variáveis de ambiente:
 *   TELEGRAM_BOT_TOKEN  — token do bot (via @BotFather)
 *   TELEGRAM_CHAT_ID    — ID do chat do operador
 */

const TELEGRAM_API = 'https://api.telegram.org';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

/**
 * Envia uma mensagem de texto ao operador via Telegram.
 * Suporta Markdown V2 para formatação e Inline Keyboard.
 * Retorna { ok: false } em caso de falha — nunca lança exceção.
 */
export async function sendTelegram(
  message: string,
  config: TelegramConfig,
  parseMode: 'Markdown' | 'HTML' | 'MarkdownV2' | undefined = 'Markdown',
  replyMarkup?: TelegramInlineKeyboardMarkup,
): Promise<SendResult> {
  try {
    const url = `${TELEGRAM_API}/bot${config.botToken}/sendMessage`;
    const body = JSON.stringify({
      chat_id: config.chatId,
      text: message,
      parse_mode: parseMode,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Notifications] Telegram API error ${response.status}: ${err}`);
      return { ok: false, error: err };
    }

    const data = (await response.json()) as any;
    return { ok: true, messageId: data.result?.message_id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Notifications] Falha ao enviar Telegram: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Edita o texto de uma mensagem enviada anteriormente.
 */
export async function editTelegramMessage(
  messageId: number,
  newMessage: string,
  config: TelegramConfig,
  parseMode: 'Markdown' | 'HTML' | 'MarkdownV2' | undefined = 'Markdown',
  replyMarkup?: TelegramInlineKeyboardMarkup,
): Promise<SendResult> {
  try {
    const url = `${TELEGRAM_API}/bot${config.botToken}/editMessageText`;
    const body = JSON.stringify({
      chat_id: config.chatId,
      message_id: messageId,
      text: newMessage,
      parse_mode: parseMode,
      disable_web_page_preview: true,
      reply_markup: replyMarkup || { inline_keyboard: [] },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Notifications] Telegram editMessageText error ${response.status}: ${err}`);
      return { ok: false, error: err };
    }

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Notifications] Falha ao editar mensagem Telegram: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Envia feedback de callback query para desativar o indicador de carregamento do botão.
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  config: TelegramConfig,
  text?: string,
  showAlert = false,
): Promise<SendResult> {
  try {
    const url = `${TELEGRAM_API}/bot${config.botToken}/answerCallbackQuery`;
    const body = JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text, show_alert: showAlert } : {}),
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Notifications] Telegram answerCallbackQuery error ${response.status}: ${err}`);
      return { ok: false, error: err };
    }

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Notifications] Falha ao responder callback query Telegram: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Busca updates recentes do bot (para polling).
 * Retorna array de updates ou [] em caso de falha.
 */
export async function getUpdates(
  config: TelegramConfig,
  offset?: number,
): Promise<TelegramUpdate[]> {
  try {
    const params = new URLSearchParams({ timeout: '5' });
    if (offset !== undefined) params.set('offset', String(offset));

    const url = `${TELEGRAM_API}/bot${config.botToken}/getUpdates?${params}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { ok: boolean; result: TelegramUpdate[] };
    return data.ok ? data.result : [];
  } catch {
    return [];
  }
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; username?: string };
    text?: string;
  };
  /** Mensagens em channels chegam como channel_post, não message. */
  channel_post?: {
    message_id: number;
    chat: { id: number };
    sender_chat?: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
    };
    data: string;
  };
}

