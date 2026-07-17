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

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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
 * Suporta Markdown para formatação e Inline Keyboard.
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
      signal: AbortSignal.timeout(10_000),
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
 * Envia um vídeo nativo ao Telegram com caption formatada e botões inline.
 * Gera um thumbnail tipo "cartaz" via FFmpeg (frame 1s, 9:16).
 * Caption usa Markdown para formatação — limit: 1024 chars.
 * Retorna { ok: false, error: 'video_not_found' } se arquivo não existe (caller deve fallback para sendTelegram).
 */
export async function sendVideoWithCaption(
  videoPath: string,
  caption: string,
  config: TelegramConfig,
  replyMarkup?: TelegramInlineKeyboardMarkup,
): Promise<SendResult> {
  try {
    if (!fs.existsSync(videoPath)) {
      console.warn(`[Notifications] Vídeo não encontrado: ${videoPath}. Fallback para sendMessage.`);
      return { ok: false, error: 'video_not_found' };
    }

    const url = `${TELEGRAM_API}/bot${config.botToken}/sendVideo`;

    // Monta FormData multipart — usa globals nativos do Node 18+
    // (FormData e Blob são globals no Node 18+, sem necessidade de importar undici)
    const form = new globalThis.FormData();
    form.append('chat_id', config.chatId);
    form.append('caption', caption.slice(0, 1024)); // Telegram caption limit
    form.append('parse_mode', 'Markdown');
    form.append('supports_streaming', 'true');

    if (replyMarkup) {
      form.append('reply_markup', JSON.stringify(replyMarkup));
    }

    // Anexa o arquivo de vídeo
    const videoBuffer = fs.readFileSync(videoPath);
    const videoBlob = new globalThis.Blob([videoBuffer], { type: 'video/mp4' });
    form.append('video', videoBlob, path.basename(videoPath));


    // Gera thumbnail tipo cartaz:
    // 1) Extrai frame em 1s, escala para 9:16 vertical (320x568)
    // 2) Overlay com gradiente escuro na base (legibilidade do título)
    // 3) Queima o título com drawtext (Bebas Neue ou fallback sans-serif bold)
    const thumbPath = videoPath.replace(/\.mp4$/, '_tg_thumb.jpg');
    const titleForThumb = (caption.split('\n').find(l => l.startsWith('"')) || '')
      .replace(/^"|"$/g, '')          // remove aspas
      .replace(/'/g, "\u2019")        // apóstrofo typográfico (evita problema de escape no shell)
      .slice(0, 40);                  // trunca para não estourar o frame

    try {
      // Tenta com fonte Bebas Neue (instalada) ou fallback para DejaVu Bold
      const fontFilter = titleForThumb
        ? `:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${titleForThumb}':fontcolor=white:fontsize=22:x=(w-text_w)/2:y=h-80:shadowcolor=black:shadowx=1:shadowy=1`
        : '';
      const gradientFilter = `drawbox=x=0:y=h*0.55:w=iw:h=h*0.45:color=black@0.6:t=fill`;
      const textFilter = titleForThumb
        ? `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${titleForThumb}':fontcolor=white:fontsize=20:x=(w-text_w)/2:y=h-60:shadowcolor=black@0.8:shadowx=2:shadowy=2`
        : '';
      const vf = [
        'scale=320:568:force_original_aspect_ratio=decrease',
        'pad=320:568:(ow-iw)/2:(oh-ih)/2:black',
        gradientFilter,
        ...(textFilter ? [textFilter] : []),
      ].join(',');

      execSync(
        `ffmpeg -nostdin -y -ss 1 -i "${videoPath}" -vframes 1 -vf "${vf}" "${thumbPath}"`,
        { timeout: 15_000, stdio: 'pipe' }
      );
    } catch {
      // Fallback: tenta sem drawtext (só frame + scale)
      try {
        execSync(
          `ffmpeg -nostdin -y -ss 1 -i "${videoPath}" -vframes 1 ` +
          `-vf "scale=320:568:force_original_aspect_ratio=decrease,pad=320:568:(ow-iw)/2:(oh-ih)/2:black" ` +
          `"${thumbPath}"`,
          { timeout: 10_000, stdio: 'pipe' }
        );
      } catch {
        console.warn('[Notifications] Falha ao gerar thumbnail — enviando sem capa.');
      }
    }

    if (fs.existsSync(thumbPath)) {
      const thumbBuffer = fs.readFileSync(thumbPath);
      const thumbBlob = new globalThis.Blob([thumbBuffer], { type: 'image/jpeg' });
      form.append('thumbnail', thumbBlob, path.basename(thumbPath));
    }

    const response = await fetch(url, {
      method: 'POST',
      body: form as any, // globalThis.FormData vs undici-types compat
      signal: AbortSignal.timeout(120_000), // 2min para upload do arquivo
    });

    // Limpeza do thumbnail temporário
    if (fs.existsSync(thumbPath)) {
      try { fs.unlinkSync(thumbPath); } catch {}
    }

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Notifications] Telegram sendVideo error ${response.status}: ${err}`);
      return { ok: false, error: err };
    }

    const data = (await response.json()) as any;
    return { ok: true, messageId: data.result?.message_id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Notifications] Falha ao enviar vídeo para Telegram: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Envia vídeo ao Telegram passando uma URL pública.
 * O Telegram baixa o arquivo diretamente — o container não precisa ter o vídeo localmente.
 * Preferido sobre sendVideoWithCaption quando videoUrl está disponível.
 */
export async function sendVideoUrlWithCaption(
  videoUrl: string,
  caption: string,
  config: TelegramConfig,
  replyMarkup?: TelegramInlineKeyboardMarkup,
): Promise<SendResult> {
  try {
    const url = `${TELEGRAM_API}/bot${config.botToken}/sendVideo`;
    const body: Record<string, unknown> = {
      chat_id: config.chatId,
      video: videoUrl,
      caption: caption.slice(0, 1024),
      parse_mode: 'Markdown',
      supports_streaming: true,
    };
    if (replyMarkup) {
      body['reply_markup'] = replyMarkup;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Notifications] Telegram sendVideo (URL) error ${response.status}: ${err}`);
      return { ok: false, error: err };
    }

    const data = (await response.json()) as any;
    return { ok: true, messageId: data.result?.message_id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Notifications] Falha ao enviar vídeo (URL) para Telegram: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Edita o texto de uma mensagem de texto enviada anteriormente.
 * Para mensagens de vídeo, use editTelegramCaption em vez desta.
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
 * Edita a caption de uma mensagem de vídeo/foto enviada anteriormente.
 * Usar sempre que a mensagem original foi enviada via sendVideoWithCaption.
 */
export async function editTelegramCaption(
  messageId: number,
  newCaption: string,
  config: TelegramConfig,
  parseMode: 'Markdown' | 'HTML' | 'MarkdownV2' | undefined = 'Markdown',
  replyMarkup?: TelegramInlineKeyboardMarkup,
): Promise<SendResult> {
  try {
    const url = `${TELEGRAM_API}/bot${config.botToken}/editMessageCaption`;
    const body = JSON.stringify({
      chat_id: config.chatId,
      message_id: messageId,
      caption: newCaption.slice(0, 1024),
      parse_mode: parseMode,
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
      console.error(`[Notifications] Telegram editMessageCaption error ${response.status}: ${err}`);
      return { ok: false, error: err };
    }

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Notifications] Falha ao editar caption Telegram: ${msg}`);
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
