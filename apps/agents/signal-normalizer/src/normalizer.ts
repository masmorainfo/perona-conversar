// RawSignalInput é definido aqui localmente (sensors/ foi removido no refactor)
export interface RawSignalInput {
  sensorName: string;
  externalId: string;
  payload: Record<string, any>;
}

export interface NormalizedSignal {
  source: string;
  externalId: string;
  title: string;
  originalTitle: string;   // título bruto antes da tradução (pode ser igual ao title)
  detectedLang: string;    // código ISO do idioma detectado, ex: 'ja', 'ar', 'latin', 'und'
  description: string;
  score: number; // 0 to 1 score based on source metrics
  rawPayload: any;
}

// ─── Heurística de detecção de idioma (sem LLM, custo zero) ──────────────────
// Cobertura global de scripts Unicode — 25 sistemas de escrita.
// Ordem importa: scripts mais ambíguos (CJK compartilhado entre ja/zh/ko)
// vêm antes, com Hiragana/Katakana como discriminador primário do japonês.
// Retorna código ISO 639-1 do idioma detectado, ou 'latin' para textos latinos.

const SCRIPT_PATTERNS: Array<{ lang: string; pattern: RegExp }> = [

  // ── Ásia Oriental ──────────────────────────────────────────────────────────
  { lang: 'ja', pattern: /[\u3040-\u309F\u30A0-\u30FF]/ },              // Hiragana / Katakana (discriminador único do japonês)
  { lang: 'ko', pattern: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/ }, // Hangul (coreano)
  { lang: 'zh', pattern: /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/ }, // CJK (chinês — vem após ja/ko para evitar falso positivo)

  // ── Oriente Médio / África do Norte ───────────────────────────────────────
  { lang: 'ar', pattern: /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/ }, // Árabe (inclui bloco árabe complementar e formas de apresentação)
  { lang: 'fa', pattern: /[\u06F0-\u06FF]/ },                           // Persa/Farsi (algarismos persas dentro do bloco árabe)
  { lang: 'he', pattern: /[\u0590-\u05FF\uFB1D-\uFB4F]/ },             // Hebraico (+ formas de apresentação)
  { lang: 'ur', pattern: /[\u0600-\u06FF]/ },                           // Urdu (compartilha bloco árabe — detectado por contexto após fa/ar)

  // ── Sul da Ásia ────────────────────────────────────────────────────────────
  { lang: 'hi', pattern: /[\u0900-\u097F]/ },                           // Devanagari: hindi, marathi, nepalês
  { lang: 'bn', pattern: /[\u0980-\u09FF]/ },                           // Bengali / Bangla
  { lang: 'pa', pattern: /[\u0A00-\u0A7F]/ },                           // Gurmukhi (punjabi)
  { lang: 'gu', pattern: /[\u0A80-\u0AFF]/ },                           // Gujarati
  { lang: 'or', pattern: /[\u0B00-\u0B7F]/ },                           // Oriya / Odia
  { lang: 'ta', pattern: /[\u0B80-\u0BFF]/ },                           // Tamil
  { lang: 'te', pattern: /[\u0C00-\u0C7F]/ },                           // Telugu
  { lang: 'kn', pattern: /[\u0C80-\u0CFF]/ },                           // Kannada
  { lang: 'ml', pattern: /[\u0D00-\u0D7F]/ },                           // Malayalam
  { lang: 'si', pattern: /[\u0D80-\u0DFF]/ },                           // Cingalês (sinhala)

  // ── Sudeste Asiático ───────────────────────────────────────────────────────
  { lang: 'th', pattern: /[\u0E00-\u0E7F]/ },                           // Tailandês
  { lang: 'lo', pattern: /[\u0E80-\u0EFF]/ },                           // Lao
  { lang: 'my', pattern: /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/ },// Birmanês (Myanmar)
  { lang: 'km', pattern: /[\u1780-\u17FF]/ },                           // Khmer (cambojano)

  // ── Europa Oriental / Cáucaso / África ────────────────────────────────────
  { lang: 'ru', pattern: /[\u0400-\u04FF\u0500-\u052F]/ },              // Cirílico (russo, ucraniano, búlgaro, sérvio...)
  { lang: 'el', pattern: /[\u0370-\u03FF\u1F00-\u1FFF]/ },             // Grego (+ grego extenso)
  { lang: 'hy', pattern: /[\u0530-\u058F\uFB13-\uFB17]/ },             // Armênio
  { lang: 'ka', pattern: /[\u10A0-\u10FF\u2D00-\u2D2F]/ },             // Georgiano (+ georgiano complementar)
  { lang: 'am', pattern: /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/ },// Etíope/Amárico (Ge'ez)

  // ── Ásia Central / Outros ─────────────────────────────────────────────────
  { lang: 'mn', pattern: /[\u1800-\u18AF]/ },                           // Mongol
  { lang: 'bo', pattern: /[\u0F00-\u0FFF]/ },                           // Tibetano
];

/**
 * Detecta o idioma de um texto usando heurística de scripts Unicode.
 * Retorna 'latin' para textos de escrita latina (PT, EN, ES, TR, FR, DE, etc.)
 * ou o código ISO 639-1 para scripts não-latinos que precisam de tradução para PT-BR.
 * 'und' = undetermined (texto vazio ou muito curto para classificar).
 *
 * Cobertura: 27 scripts / ~80% dos trending topics globais não-latinos.
 */
export function detectLanguage(text: string): string {
  if (!text || text.trim().length === 0) return 'und';

  for (const { lang, pattern } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) return lang;
  }

  // Texto contém apenas caracteres latinos/ASCII — retornamos 'latin'
  // (PT, EN, ES, FR, DE, IT, TR, etc. — não requer transliteração de script)
  return 'latin';
}

/**
 * Retorna true se o idioma detectado indica que o texto
 * NÃO está em escrita latina — portanto requer localização CLP para PT-BR.
 */
export function needsLocalization(lang: string): boolean {
  return lang !== 'latin' && lang !== 'und';
}

/** @deprecated Use needsLocalization() */
export const needsTranslation = needsLocalization;

export function normalizeSignal(raw: RawSignalInput): NormalizedSignal {
  const source = raw.sensorName;
  const externalId = raw.externalId;
  const rawPayload = raw.payload;

  let title = '';
  let description = '';
  let score = 0.5; // default fallback

  switch (source) {
    case 'Trends24':
      title = rawPayload.topic || '';
      description = `Trending topic on Trends24 under ${rawPayload.category || 'General'} category.`;
      score = rawPayload.volume ? 0.8 : 0.6;
      break;

    case 'GoogleTrends':
      title = rawPayload.query || '';
      description = `Google Search Trend. Reason: ${rawPayload.trendingReason || 'N/A'}`;
      score = 0.9;
      break;

    case 'Reddit':
      title = rawPayload.title || '';
      description = `Reddit post on ${rawPayload.subreddit || 'Reddit'} with ${rawPayload.ups || 0} upvotes and ${rawPayload.numComments || 0} comments.`;
      score = Math.min((rawPayload.ups || 0) / 2000, 1.0);
      break;

    case 'X':
      title = rawPayload.text ? (rawPayload.text.length > 60 ? rawPayload.text.substring(0, 60) + '...' : rawPayload.text) : '';
      description = `Viral tweet by @${rawPayload.username || 'unknown'}: "${rawPayload.text || ''}"`;
      score = Math.min((rawPayload.likes || 0) / 5000, 1.0);
      break;

    case 'YouTube':
      title = rawPayload.title || '';
      description = `YouTube video by "${rawPayload.channelName || ''}" with ${rawPayload.views || 0} views.`;
      score = Math.min((rawPayload.views || 0) / 500000, 1.0);
      break;

    case 'RSS':
      title = rawPayload.title || '';
      description = `RSS Feed item from "${rawPayload.feedName || ''}". Link: ${rawPayload.link || ''}`;
      score = 0.7;
      break;

    default:
      title = JSON.stringify(rawPayload);
      description = 'Unknown signal payload';
      score = 0.5;
  }

  const detectedLang = detectLanguage(title);

  return {
    source,
    externalId,
    title,           // será sobrescrito com PT-BR pelo index.ts após translateBatch
    originalTitle: title,
    detectedLang,
    description,
    score,
    rawPayload,
  };
}
