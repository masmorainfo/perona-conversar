/**
 * @cos/notifications — Formatadores de Eventos
 *
 * Cada função recebe o payload do evento e retorna
 * a mensagem formatada para o Telegram (Markdown).
 */

export type NotificationEventType =
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'EDITORIAL_APPROVED'
  | 'EDITORIAL_REJECTED'
  | 'ABANDONED'
  | 'CRITIC_STUCK'
  | 'JOB_FAILED'
  | 'HEARTBEAT'
  | 'VLS_EXPERIMENT_STARTED'
  | 'VLS_EXPERIMENT_CLOSED'
  | 'TEST';

export interface EventPayload {
  contentId?: string | undefined;
  topic?: string | undefined;
  channelSlug?: string | undefined;
  reason?: string | undefined;
  platforms?: string[] | undefined;
  platformUrls?: Record<string, string> | undefined;
  score?: number | undefined;
  durationSeconds?: number | undefined;
  jobName?: string | undefined;
  errorMessage?: string | undefined;
  // VLS
  experimentTitle?: string | undefined;
  experimentId?: string | undefined;
  hypothesisId?: string | undefined;
  // Genérico
  message?: string | undefined;
  summary?: string | undefined;
  videoFilename?: string | undefined;
}

let MISSION_CONTROL_URL = process.env['MISSION_CONTROL_URL'] ?? 'http://127.0.0.1:3000';
if (MISSION_CONTROL_URL.includes('localhost')) {
  MISSION_CONTROL_URL = MISSION_CONTROL_URL.replace('localhost', '127.0.0.1');
}

function shortId(id: string | undefined): string {
  return id ? id.slice(0, 8) : 'unknown';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

/**
 * Formata a mensagem para cada tipo de evento.
 * Retorna null se o evento não deve gerar notificação.
 */
export function formatEvent(
  type: NotificationEventType,
  payload: EventPayload,
): string | null {
  const id = shortId(payload.contentId);
  const topic = payload.topic ? `*${escapeMarkdown(payload.topic)}*` : '_(sem título)_';
  const channel = payload.channelSlug ? ` \`${payload.channelSlug}\`` : '';

  switch (type) {
    case 'PENDING_REVIEW': {
      const scoreText = payload.score !== undefined
        ? `${(payload.score * 100).toFixed(0)}%`
        : 'N/A';
      
      const durationText = payload.durationSeconds !== undefined
        ? formatDuration(payload.durationSeconds)
        : 'N/A';

      const summaryPart = payload.summary
        ? `📝 *Resumo:* _${escapeMarkdown(payload.summary)}_`
        : null;

      return [
        `📺 *Canal:*${channel}`,
        `📌 *Título:* ${topic}`,
        summaryPart,
        `⏱️ *Duração:* \`${durationText}\``,
        `⭐ *Score Editorial:* \`${scoreText}\``,
        `💬 *Status:* 🟡 Aguardando Revisão`,
      ].filter((x): x is string => x !== null).join('\n');
    }

    case 'PUBLISHED': {
      const platforms = payload.platforms?.join(', ') ?? 'plataformas';
      const urls = Object.entries(payload.platformUrls ?? {})
        .map(([p, url]) => `• [${p}](${url})`)
        .join('\n');
      return [
        `✅ *Vídeo publicado com sucesso*`,
        ``,
        `📌 Tópico: ${topic}`,
        `📺 Canal:${channel}`,
        `🚀 Plataformas: ${platforms}`,
        urls ? `\n🔗 Links:\n${urls}` : '',
      ].filter(Boolean).join('\n');
    }

    case 'EDITORIAL_APPROVED':
      return [
        `🟢 *Editorial aprovou nova oportunidade*`,
        ``,
        `📌 Tópico: ${topic}`,
        `📺 Canal:${channel}`,
        payload.score !== undefined
          ? `⭐ Score: ${(payload.score * 100).toFixed(0)}%`
          : '',
      ].filter(Boolean).join('\n');

    case 'EDITORIAL_REJECTED':
      return null; // Silencioso — rejeições são normais e frequentes

    case 'ABANDONED':
      return [
        `🚨 *Conteúdo abandonado*`,
        ``,
        `📌 Tópico: ${topic}`,
        `📺 Canal:${channel}`,
        `📋 Motivo: ${escapeMarkdown(payload.reason ?? 'não informado')}`,
      ].join('\n');

    case 'CRITIC_STUCK':
      return [
        `⚠️ *Roteiro travado no Critic*`,
        ``,
        `📌 Tópico: ${topic}`,
        `📺 Canal:${channel}`,
        `🔄 Atingiu o limite de tentativas`,
        `🆔 ID: \`${id}\``,
        ``,
        `Verifique o Mission Control para intervir manualmente.`,
      ].join('\n');

    case 'JOB_FAILED':
      return [
        `🚨 *Falha em agente COS*`,
        ``,
        `⚙️ Job: \`${payload.jobName ?? 'desconhecido'}\``,
        `📌 Conteúdo: \`${id}\``,
        `❌ Erro: ${escapeMarkdown(payload.errorMessage ?? 'desconhecido')}`,
      ].join('\n');

    case 'HEARTBEAT':
      return [
        `💓 *COS operando normalmente*`,
        `🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        `🏃 Todos os serviços ativos`,
      ].join('\n');

    case 'VLS_EXPERIMENT_STARTED':
      return [
        `🧪 *Experimento VLS iniciado*`,
        ``,
        `📌 Título: *${escapeMarkdown(payload.experimentTitle ?? 'desconhecido')}*`,
        `🔬 Hipótese: \`${payload.hypothesisId ?? 'N/A'}\``,
        `🆔 ID: \`${shortId(payload.experimentId)}\``,
      ].join('\n');

    case 'VLS_EXPERIMENT_CLOSED':
      return [
        `📊 *Experimento VLS encerrado — resultados disponíveis*`,
        ``,
        `📌 Título: *${escapeMarkdown(payload.experimentTitle ?? 'desconhecido')}*`,
        `🔬 Hipótese: \`${payload.hypothesisId ?? 'N/A'}\``,
        `🆔 ID: \`${shortId(payload.experimentId)}\``,
      ].join('\n');

    case 'TEST':
      return payload.message ?? '✅ COS Notification Service — teste bem-sucedido!';

    default:
      return null;
  }
}

/**
 * Escapa caracteres especiais do Markdown V1 do Telegram.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
