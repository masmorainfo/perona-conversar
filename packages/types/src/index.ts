// ============================================================
// @cos/types — Contratos TypeScript compartilhados
// Toda decisão arquitetural está refletida nesses tipos.
// ============================================================

// ─── Content State Machine ────────────────────────────────────────────────────

export const CONTENT_STATES = [
  'DISCOVERED',
  'EVALUATED',
  'APPROVED',
  'REJECTED',
  'DEFERRED',
  'RESEARCHED',
  'SCRIPTED',
  'REVISED',
  'CRITIC_OK',
  'CRITIC_FAIL',
  'STORYBOARD_PLANNED',
  'ABANDONED',
  'PRODUCED',
  'RENDERED',
  'QC_APPROVED',
  'QC_FAIL',
  'FAILED_QA',
  'CINEMATIC_REVIEWING',
  'PENDING_REVIEW',
  'READY_TO_PUBLISH',
  'PUBLISHED',
  'PUBLISHED_PARTIAL',
  'ANALYZED',
  'LEARNED',
  'QUEUE_ERROR',
] as const

export type ContentState = (typeof CONTENT_STATES)[number]

/** Estados terminais — não transitam mais */
export const TERMINAL_STATES: ReadonlySet<ContentState> = new Set([
  'REJECTED',
  'ABANDONED',
  'LEARNED',
])

/** Limites de retentativa por estado de falha */
export const RETRY_LIMITS: Record<string, { max: number; onExceed: ContentState }> = {
  CRITIC_FAIL: { max: 3, onExceed: 'ABANDONED' },
  QC_FAIL:     { max: 2, onExceed: 'ABANDONED' },
  CINEMATIC_FAIL: { max: 3, onExceed: 'ABANDONED' },
}

export interface ContentUnit {
  id: string
  channelId: string
  topic: string
  state: ContentState
  metadata: ContentMetadata
  attemptCounts: Partial<Record<string, number>>
  deferredUntil?: Date
  createdAt: Date
  updatedAt: Date
}

export interface ContentMetadata {
  // Preenchido pelo Editorial Intelligence
  editorialScore?: number
  editorialDirection?: string
  editorialReason?: string
  /** Arquétipo do Canon KAIRO identificado pelo Editorial. Ausente = não classificado. */
  canonArchetype?: CanonArchetype
  /** Emoção-alvo derivada do arquétipo (ex: 'Culpa + Grandeza') */
  canonTargetEmotion?: string

  // Preenchido pelo Decision Engine
  format?: ContentFormat
  durationSeconds?: { min: number; max: number }
  platforms?: Platform[]
  targetEmotion?: string
  cta?: string

  // Preenchido pelo Research Agent
  researchPackage?: ResearchPackage

  // Preenchido pelo Script Agent
  script?: Script

  // Preenchido pelo Critic Agent
  criticEvaluation?: CriticEvaluation

  // Preenchido pelo Media/Render
  assetUrls?: Record<string, string>
  videoFile?: string
  videoUrl?: string

  // Preenchido pelo Quality Control
  qcScore?: number
  qcChecklist?: QCChecklist

  // Preenchido pelo Cinematic Review
  cinematicEvaluation?: CinematicEvaluation

  // Preenchido pelo Publisher
  publicationResults?: PublicationResult[]

  // Preenchido pelo Signal Normalizer / Editorial (CLP)
  clpResult?: CLPResult

  // Preenchido pelo Analytics
  analyticsData?: AnalyticsData
}

export interface ContentTransition {
  id: string
  contentId: string
  fromState: ContentState
  toState: ContentState
  actor: string
  reason?: string
  payload?: Record<string, unknown>
  transitionedAt: Date
}

// ─── Canon KAIRO ─────────────────────────────────────────────────────────────
// Os cinco arquétipos narrativos que guiam a produção de conteúdo da KAIRO.
// Todo vídeo deve se encaixar em um deles — ou não deve ser produzido.

export type CanonArchetype =
  | 'heroi_tragico'       // Culpa + Grandeza — tons frios, piano lento
  | 'exilado_que_retorna' // Redenção + Melancolia — âmbar, arpejo crescente
  | 'eterno_segundo'      // Injustiça + Dignidade — verde musgo, música de câmara
  | 'martir_esquecido'    // Solidão + Legado — p&b com toque de vermelho, silêncio
  | 'momento_impossivel'  // Espanto + Êxtase — luz estourada, explosão orquestral

// ─── Channel Identity ─────────────────────────────────────────────────────────

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'threads'
export type ContentFormat = 'explicativo' | 'comparativo' | 'analise' | 'reacao' | 'tutorial' | 'noticia'
export type Priority = 'high' | 'normal' | 'low'

/** Imutável sem aprovação humana — define o que o canal É */
export interface ChannelCore {
  id: string
  name: string
  niche: string
  language: string
  mission: string

  audience: {
    ageRange: [number, number]
    interests: string[]
    painPoints: string[]
    aspiration: string
  }

  values: string[]

  editorialLimits: {
    alwaysIn: string[]       // sempre produz sobre esses temas
    alwaysOut: string[]      // nunca produz sobre esses temas
    humanReviewRequired: string[]  // precisa de aprovação humana
  }

  persona: {
    archetype: string
    tone: string
    forbiddenWords: string[]
    preferredWords: string[]
  }
}

/** Adaptativa — o Learning Engine pode atualizar dentro de contratos */
export interface ChannelStrategy {
  updatedAt: Date
  updatedBy: string

  contentPreferences: {
    preferredFormats: ContentFormat[]
    avoidFormats: ContentFormat[]
    optimalDurationSeconds: { min: number; max: number }
    optimalPostingTimes: string[]     // ex: ["08:00", "19:00"]
    preferredEmotions: string[]
  }

  performanceThresholds: {
    editorialApprovalMinScore: number  // 0-1
    criticApprovalMinScore: number     // 0-1
    qcApprovalMinScore: number         // 0-1
    publishMinScore: number            // 0-1
  }

  platformWeights: Partial<Record<Platform, number>>  // 0-1

  ctaPatterns: string[]
}

export interface ChannelConfig {
  id: string
  slug: string
  name: string
  inheritsFrom?: string    // template slug
  
  // Identidade Visual (Visual Identity Engine)
  visualPresetId?: string // ex: 'preset:gaming'
  visualDnaOverrides?: import('./vie').VisualDNAOverrides
  
  core: ChannelCore
  strategy: ChannelStrategy
  isActive: boolean
  priority: Priority
  createdAt: Date
  updatedAt: Date
}

// ─── Research Package ─────────────────────────────────────────────────────────

export interface ResearchPackage {
  topic: string
  summary: string
  keyFacts: string[]
  sources: ResearchSource[]
  relatedEntities: string[]
  researchedAt: Date
}

export interface ResearchSource {
  url: string
  title: string
  excerpt: string
  publishedAt?: Date
  credibilityScore?: number
}

// ─── Script ───────────────────────────────────────────────────────────────────

export interface Script {
  title: string
  hook: string             // abertura — primeiros 20s
  body: ScriptSection[]
  cta: string
  estimatedDurationSeconds: number
  keywords: string[]
  generatedAt: Date
  version: number          // incrementa a cada reescrita
}

export interface ScriptSection {
  id: string
  content: string
  durationSeconds: number
  visualNote?: string      // instrução para o Media Agent
}

// ─── Critic Evaluation ───────────────────────────────────────────────────────

export interface CriticEvaluation {
  overallScore: number     // 0-1
  approved: boolean
  dimensions: {
    clarity:     CriticDimension
    retention:   CriticDimension
    naturalness: CriticDimension
    rhythm:      CriticDimension
    originality: CriticDimension
    copyright:   CriticDimension
    seo:         CriticDimension
  }
  blockingIssues: string[]
  suggestions: CriticSuggestion[]
  attemptNumber: number
  maxAttempts: number
  evaluatedAt: Date
}

export interface CriticDimension {
  score: number            // 0-1
  note: string
  isBlocking: boolean
}

export interface CriticSuggestion {
  position: string         // ex: "0:00-0:20"
  issue: string
  recommendation: string
}

// ─── Quality Control ─────────────────────────────────────────────────────────

export interface QCChecklist {
  hasAudio: boolean
  hasSubtitles: boolean
  durationWithinRange: boolean
  resolutionMeetsRequirements: boolean
  noBlackFrames: boolean
  audioLevelAcceptable: boolean
}

// ─── Cinematic Review ────────────────────────────────────────────────────────

export interface CinematicEvaluation {
  approved: boolean
  reasons: string[]        // Motivos qualitativos de rejeição ("narração artificial", "ritmo mecânico")
  feedback: string
  suggestions: string[]
  attemptNumber: number
  maxAttempts: number
  evaluatedAt: Date
}

// ─── Publication ──────────────────────────────────────────────────────────────

export interface PublicationResult {
  platform: Platform
  status: 'success' | 'failed' | 'retrying'
  attempt: number
  platformUrl?: string
  errorMessage?: string
  publishedAt: Date
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export type SignalTier = 'short' | 'mid' | 'long'

export interface AnalyticsData {
  shortTerm: PlatformMetrics[]   // 0-48h
  midTerm: PlatformMetrics[]     // 2-30 days
  longTerm: PlatformMetrics[]    // 30-180 days
}

export interface PlatformMetrics {
  platform: Platform
  signalTier: SignalTier
  views: number
  ctr: number
  retentionPercent: number
  watchTimeSeconds: number
  shares: number
  comments: number
  recordedAt: Date
}

// ─── LLM Abstraction ─────────────────────────────────────────────────────────

export interface CompletionOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface LLMProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>
  embed(text: string): Promise<number[]>
}

// ─── Render Engine Abstraction ────────────────────────────────────────────────

export interface RenderOptions {
  resolution?: '1080p' | '720p' | '4k'
  fps?: 30 | 60
  format?: 'mp4' | 'webm'
}

export interface RenderEngine {
  render(
    script: Script,
    assets: Record<string, string>,
    config: ChannelConfig,
    options?: RenderOptions
  ): Promise<string>  // returns path to rendered video file
}

// ─── Content Localization Policy (CLP) ───────────────────────────────────────
// O COS não traduz conteúdos — ele LOCALIZA.
// Para cada termo estrangeiro, uma de 5 estratégias editoriais é aplicada:
//
//   KEEP      → manter como está (marcas, produtos, nomes, siglas globais)
//   TRANSLATE → traduzir (conceitos comuns com equivalente natural em PT-BR)
//   ADAPT     → adaptar criativamente (tradução literal soa estranha)
//   EXPLAIN   → contextualizar (relevância editorial mas dependente de cultura)
//   REMOVE    → eliminar (hashtags locais sem valor para o público brasileiro)
//
// Princípio: "Se um brasileiro médio assistir este vídeo,
//             ele compreenderá imediatamente esse termo?"

export type CLPStrategy = 'KEEP' | 'TRANSLATE' | 'ADAPT' | 'EXPLAIN' | 'REMOVE'

export interface LocalizationDecision {
  /** Termo estrangeiro original — ex: "ベスト32", "#ウエルシアボーナス" */
  originalTerm: string
  /** Estratégia editorial escolhida */
  strategy: CLPStrategy
  /** Forma final após aplicar a estratégia. Vazio ('') quando strategy = 'REMOVE' */
  localizedForm: string
  /** Justificativa editorial da decisão */
  reason: string
  /** Contexto cultural adicional fornecido pelo Research Agent */
  culturalContext?: string
  /** Agente que tomou a decisão */
  decidedBy: 'signal-normalizer' | 'editorial' | 'research' | 'learning-engine'
  decidedAt: Date
}

export interface CLPResult {
  /** Texto original antes de qualquer localização */
  originalText: string
  /** Texto final após todas as substituições CLP */
  localizedText: string
  /** Decisão para cada termo identificado */
  decisions: LocalizationDecision[]
  appliedAt: Date
}

// ─── Visual Identity Engine ───────────────────────────────────────────────────

export * from './vie'
