// ============================================================
// @cos/events — Definições de filas e eventos BullMQ
//
// REGRA: nenhum agente chama outro diretamente.
// Toda comunicação acontece através dessas filas.
// O Supervisor é o único que sabe o que fazer com cada evento.
// ============================================================

import type { ContentState, ResearchPackage, Script, CriticEvaluation, CinematicEvaluation, CanonArchetype } from '@cos/types'

// ─── Queue Names ──────────────────────────────────────────────────────────────

export const SUPERVISOR_QUEUE = 'pipeline';
export const RAW_SIGNALS_QUEUE = 'raw_signals';
export const NORMALIZED_SIGNAL_QUEUE = 'normalized_signals';
export const OPPORTUNITY_TRIGGER_QUEUE = 'opportunity_trigger';

/** Gera o nome de uma fila específica de um canal */
export function queueName(queue: QueueType, channelId: string): string {
  return `${queue}-${channelId}`
}

export const QUEUE_TYPES = [
  'pipeline',    // fila principal do Supervisor
  'editorial',   // Editorial Intelligence
  'research',    // Research Agent
  'script',      // Script Agent
  'critic',      // Critic Agent
  'storyboard',  // Storyboard Agent (Layer 2)
  'media',       // Media Agent (Layer 3 - asset generation)
  'render',      // Render Engine
  'quality',     // Quality Control
  'cinematic-review', // Cinematic Review
  'publish',     // Publisher (prefixed with platform)
  'analytics',   // Analytics Agent
  'learning',    // Learning Engine
] as const

export type QueueType = (typeof QUEUE_TYPES)[number]

/** Nomes de filas de publicação por plataforma */
export const PUBLISH_QUEUE = {
  youtube:   (channelId: string) => `publish-youtube-${channelId}`,
  tiktok:    (channelId: string) => `publish-tiktok-${channelId}`,
  instagram: (channelId: string) => `publish-instagram-${channelId}`,
  facebook:  (channelId: string) => `publish-facebook-${channelId}`,
  threads:   (channelId: string) => `publish-threads-${channelId}`,
} as const

// ─── Job Payloads (o que cada fila recebe) ────────────────────────────────────

/** Emitido pelos Sensores (World Observer) para o Signal Normalizer */
export interface RawSignalJobData {
  sensorName: string
  externalId: string
  payload: any
}


/** Emitido pelo Supervisor para a Editorial Intelligence */
export interface EditorialJobData {
  contentId: string
  channelId: string
  topic: string
  opportunityId?: string
  trendSignal?: {
    source: string
    score: number
    capturedAt: Date
  }
}

/** Resultado da Editorial Intelligence → Supervisor */
export interface EditorialResultData {
  contentId: string
  channelId: string
  approved: boolean
  score: number
  direction?: string
  reason: string
  /** Arquétipo do Canon KAIRO identificado. Ausente se tópico foi rejeitado por falta de profundidade. */
  canonArchetype?: CanonArchetype
  /** Emoção-alvo derivada do arquétipo (ex: 'Culpa + Grandeza') */
  canonTargetEmotion?: string
  /** Correções CLP sugeridas pelo Editorial (refinamento sobre o Signal Normalizer) */
  clpOverrides?: Array<{
    originalTerm: string
    strategy: 'KEEP' | 'TRANSLATE' | 'ADAPT' | 'EXPLAIN' | 'REMOVE'
    localizedForm: string
    reason: string
  }>
}

/** Emitido pelo Supervisor para o Research Agent */
export interface ResearchJobData {
  contentId: string
  channelId: string
  topic: string
  editorialDirection?: string
}

/** Resultado do Research Agent → Supervisor */
export interface ResearchResultData {
  contentId: string
  channelId: string
  researchPackage: ResearchPackage
}

/** Emitido pelo Supervisor para o Script Agent */
export interface ScriptJobData {
  contentId: string
  channelId: string
  researchPackage: ResearchPackage
  previousScript?: Script           // presente em caso de reescrita
  criticFeedback?: CriticEvaluation // presente em caso de reescrita
  attemptNumber: number
}

/** Resultado do Script Agent → Supervisor */
export interface ScriptResultData {
  contentId: string
  channelId: string
  script: Script
}

/** Emitido pelo Supervisor para o Critic Agent */
export interface CriticJobData {
  contentId: string
  channelId: string
  script: Script
  attemptNumber: number
}

/** Resultado do Critic Agent → Supervisor */
export interface CriticResultData {
  contentId: string
  channelId: string
  evaluation: CriticEvaluation
}

/** Emitido pelo Supervisor para o Storyboard Agent */
export interface StoryboardJobData {
  contentId: string
  channelId: string
  script: Script
  canonArchetype?: CanonArchetype
  canonTargetEmotion?: string
}

/** Resultado do Storyboard Agent → Supervisor */
export interface StoryboardResultData {
  contentId: string
  channelId: string
  manifestPath: string
}

/** Emitido pelo Supervisor para o Media Agent */
export interface MediaJobData {
  contentId: string
  channelId: string
  script: Script
  storyManifestPath: string
  /** Arquétipo do Canon KAIRO — define o estilo visual das imagens geradas */
  canonArchetype?: CanonArchetype
  canonTargetEmotion?: string
}

/** Resultado do Media Agent → Supervisor */
export interface MediaResultData {
  contentId: string
  channelId: string
  assetUrls: Record<string, string>
}

/** Emitido pelo Supervisor para o Render Engine */
export interface RenderJobData {
  contentId: string
  channelId: string
  script: Script
  assetUrls: Record<string, string>
  /** Arquétipo do Canon KAIRO — define paleta e tipografia do vídeo */
  canonArchetype?: CanonArchetype
  canonTargetEmotion?: string
}

/** Resultado do Render Engine → Supervisor */
export interface RenderResultData {
  contentId: string
  channelId: string
  videoFilePath: string
  /** URL pública do vídeo no Zernio S3 — disponível entre containers */
  videoUrl?: string
}

/** Emitido pelo Supervisor para o Quality Control */
export interface QualityJobData {
  contentId: string
  channelId: string
  videoFilePath: string
}

/** Resultado do Quality Control → Supervisor */
export interface QualityResultData {
  contentId: string
  channelId: string
  approved: boolean
  score: number
  checklist: Record<string, boolean>
  reason?: string
}

/** Emitido pelo Supervisor para o Cinematic Review Agent */
export interface CinematicJobData {
  contentId: string
  channelId: string
  videoFilePath: string
  script: Script
  attemptNumber: number
}

/** Resultado do Cinematic Review Agent → Supervisor */
export interface CinematicResultData {
  contentId: string
  channelId: string
  approved: boolean
  evaluation: CinematicEvaluation
  reason?: string
}

/** Emitido pelo Supervisor para Publisher (por plataforma) */
export interface PublishJobData {
  contentId: string
  channelId: string
  platform: string
  videoFilePath: string
  metadata: {
    title: string
    description: string
    tags: string[]
  }
  attemptNumber: number
}

/** Resultado do Publisher → Supervisor */
export interface PublishResultData {
  contentId: string
  channelId: string
  platform: string
  success: boolean
  platformUrl?: string
  errorMessage?: string
  attemptNumber: number
}

/** Emitido pelo Supervisor para o Analytics Agent */
export interface AnalyticsJobData {
  contentId: string
  channelId: string
  publicationResults: Array<{
    platform: string
    platformUrl: string
  }>
}

/** Emitido pelo Supervisor para o Learning Engine */
export interface LearningJobData {
  contentId: string
  channelId: string
}

// ─── Pipeline Events (transições de estado emitidas pelo Supervisor) ──────────

export interface StateTransitionEvent {
  contentId: string
  channelId: string
  fromState: ContentState
  toState: ContentState
  actor: string
  reason?: string
  timestamp: Date
}
