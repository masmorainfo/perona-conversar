// ============================================================
// @cos/state-machine — Máquina de estados do conteúdo
//
// Implementa exatamente o modelo definido na Decisão Arquitetural 1.
// Cada conteúdo produzido pelo sistema passa por esses estados.
// Apenas o Supervisor transita estados — nenhum agente transita diretamente.
// ============================================================

import { setup, assign } from 'xstate'
import type { CanonArchetype, ContentState } from '@cos/types'
import { RETRY_LIMITS } from '@cos/types'

// ─── Context da máquina ───────────────────────────────────────────────────────

// Metadados acumulados à medida que o pipeline avança.
// Usamos `unknown` para os campos opcionais para evitar problemas com
// exactOptionalPropertyTypes: a máquina acumula dados progressivamente.
export type ContentMachineMetadata = Record<string, unknown>

export interface ContentMachineContext {
  contentId: string
  channelId: string
  topic: string
  metadata: ContentMachineMetadata
  attemptCounts: Partial<Record<string, number>>
  lastError?: string
  deferredUntil?: Date
}

// ─── Eventos que a máquina aceita ─────────────────────────────────────────────

export type ContentMachineEvent =
  | { type: 'EVALUATE' }
  | { type: 'APPROVE'; score: number; direction: string; canonArchetype?: CanonArchetype; canonTargetEmotion?: string }
  | { type: 'REJECT'; reason: string }
  | { type: 'DEFER'; until: Date; reason: string }
  | { type: 'RESEARCH_COMPLETE'; researchPackage: ContentMachineMetadata }
  | { type: 'SCRIPT_COMPLETE'; script: ContentMachineMetadata }
  | { type: 'CRITIC_PASS'; evaluation: ContentMachineMetadata }
  | { type: 'CRITIC_FAIL'; evaluation: ContentMachineMetadata }
  | { type: 'STORYBOARD_COMPLETE'; manifestPath: string }
  | { type: 'MEDIA_COMPLETE'; assetUrls: Record<string, string> }
  | { type: 'RENDER_COMPLETE'; videoFile: string; qaWarnings?: string[] }
  | { type: 'QC_PASS'; score: number; checklist: ContentMachineMetadata }
  | { type: 'QC_FAIL'; reason: string }
  | { type: 'QA_FAIL_DETERMINISTIC'; reason: string }
  | { type: 'CINEMATIC_PASS'; evaluation: ContentMachineMetadata }
  | { type: 'CINEMATIC_FAIL'; evaluation: ContentMachineMetadata }
  | { type: 'PUBLISH_COMPLETE'; results: ContentMachineMetadata[] }
  | { type: 'ANALYTICS_COMPLETE'; data: ContentMachineMetadata }
  | { type: 'LEARNING_COMPLETE' }
  | { type: 'REVIEW_APPROVE'; metadata?: ContentMachineMetadata }
  | { type: 'REVIEW_REJECT'; reason: string }
  | { type: 'REVIEW_REGENERATE' }
  | { type: 'ABANDON'; reason: string }

// ─── Guard helpers ────────────────────────────────────────────────────────────

function incrementAttempt(
  counts: Partial<Record<string, number>>,
  key: string
): Partial<Record<string, number>> {
  return { ...counts, [key]: (counts[key] ?? 0) + 1 }
}

function hasExceededLimit(
  counts: Partial<Record<string, number>>,
  key: string
): boolean {
  const limit = RETRY_LIMITS[key]
  if (!limit) return false
  return (counts[key] ?? 0) >= limit.max
}

// ─── Definição da máquina ─────────────────────────────────────────────────────

export const contentMachine = setup({
  types: {
    context: {} as ContentMachineContext,
    events: {} as ContentMachineEvent,
    input: {} as ContentMachineContext,
  },
  guards: {
    criticRetryAvailable: ({ context }) =>
      !hasExceededLimit(context.attemptCounts, 'CRITIC_FAIL'),
    qcRetryAvailable: ({ context }) =>
      !hasExceededLimit(context.attemptCounts, 'QC_FAIL'),
    cinematicRetryAvailable: ({ context }) =>
      !hasExceededLimit(context.attemptCounts, 'CINEMATIC_FAIL'),
  },
  actions: {
    incrementCriticFail: assign({
      attemptCounts: ({ context }) =>
        incrementAttempt(context.attemptCounts, 'CRITIC_FAIL'),
      metadata: ({ context, event }) => {
        if (event.type !== 'CRITIC_FAIL') return context.metadata
        return { ...context.metadata, criticEvaluation: event.evaluation }
      },
    }),
    incrementQcFail: assign({
      attemptCounts: ({ context }) =>
        incrementAttempt(context.attemptCounts, 'QC_FAIL'),
    }),
    incrementCinematicFail: assign({
      attemptCounts: ({ context }) =>
        incrementAttempt(context.attemptCounts, 'CINEMATIC_FAIL'),
      metadata: ({ context, event }) => {
        if (event.type !== 'CINEMATIC_FAIL') return context.metadata
        return { ...context.metadata, cinematicEvaluation: event.evaluation }
      },
    }),
    setCinematicOk: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'CINEMATIC_PASS') return context.metadata
        return { ...context.metadata, cinematicEvaluation: event.evaluation }
      },
    }),
    setEditorialResult: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'APPROVE') return context.metadata
        return {
          ...context.metadata,
          editorialScore: event.score,
          editorialDirection: event.direction,
          ...(event.canonArchetype ? { canonArchetype: event.canonArchetype } : {}),
          ...(event.canonTargetEmotion ? { canonTargetEmotion: event.canonTargetEmotion } : {}),
        }
      },
    }),
    setResearch: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'RESEARCH_COMPLETE') return context.metadata
        return { ...context.metadata, researchPackage: event.researchPackage }
      },
    }),
    setScript: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'SCRIPT_COMPLETE') return context.metadata
        return { ...context.metadata, script: event.script }
      },
    }),
    setCriticOk: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'CRITIC_PASS') return context.metadata
        return { ...context.metadata, criticEvaluation: event.evaluation }
      },
    }),
    setStoryboard: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'STORYBOARD_COMPLETE') return context.metadata
        return { ...context.metadata, storyManifestPath: event.manifestPath }
      },
    }),
    setMedia: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'MEDIA_COMPLETE') return context.metadata
        return { ...context.metadata, assetUrls: event.assetUrls }
      },
    }),
    setVideo: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'RENDER_COMPLETE') return context.metadata
        return { 
          ...context.metadata, 
          videoFile: event.videoFile,
          ...(event.qaWarnings ? { qaWarnings: event.qaWarnings } : {})
        }
      },
    }),
    setQcOk: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'QC_PASS') return context.metadata
        return { ...context.metadata, qcScore: event.score, qcChecklist: event.checklist }
      },
    }),
    setPublished: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'PUBLISH_COMPLETE') return context.metadata
        return { ...context.metadata, publicationResults: event.results }
      },
    }),
    setReviewOk: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'REVIEW_APPROVE') return context.metadata
        return { ...context.metadata, ...(event.metadata || {}) }
      },
    }),
    setAnalytics: assign({
      metadata: ({ context, event }) => {
        if (event.type !== 'ANALYTICS_COMPLETE') return context.metadata
        return { ...context.metadata, analyticsData: event.data }
      },
    }),
    setDeferred: assign({
      deferredUntil: ({ event }) =>
        event.type === 'DEFER' ? event.until : undefined,
    }),
  },
}).createMachine({
  id: 'content',
  initial: 'DISCOVERED',
  context: ({ input }) => input,

  states: {
    // ── Fase 1: Editorial ────────────────────────────────────────────────────
    DISCOVERED: {
      on: {
        EVALUATE: 'EVALUATED',
        ABANDON: 'ABANDONED',
      },
    },

    EVALUATED: {
      on: {
        APPROVE: { target: 'APPROVED', actions: 'setEditorialResult' },
        REJECT:  'REJECTED',
        DEFER:   { target: 'DEFERRED', actions: 'setDeferred' },
        ABANDON: 'ABANDONED',
      },
    },

    APPROVED: {
      on: {
        RESEARCH_COMPLETE: { target: 'RESEARCHED', actions: 'setResearch' },
        ABANDON: 'ABANDONED',
      },
    },

    REJECTED: { type: 'final' },

    DEFERRED: {
      on: {
        EVALUATE: 'EVALUATED',
        ABANDON: 'ABANDONED',
      },
    },

    // ── Fase 2: Script ───────────────────────────────────────────────────────
    RESEARCHED: {
      on: {
        SCRIPT_COMPLETE: { target: 'SCRIPTED', actions: 'setScript' },
        ABANDON: 'ABANDONED',
      },
    },

    SCRIPTED: {
      on: {
        CRITIC_PASS: { target: 'CRITIC_OK', actions: 'setCriticOk' },
        CRITIC_FAIL: [
          {
            guard: 'criticRetryAvailable',
            target: 'REVISED',
            actions: 'incrementCriticFail',
          },
          {
            target: 'ABANDONED',
            actions: 'incrementCriticFail',
          },
        ],
        ABANDON: 'ABANDONED',
      },
    },

    REVISED: {
      on: {
        SCRIPT_COMPLETE: { target: 'SCRIPTED', actions: 'setScript' },
        ABANDON: 'ABANDONED',
      },
    },

    CRITIC_OK: {
      on: {
        STORYBOARD_COMPLETE: { target: 'STORYBOARD_PLANNED', actions: 'setStoryboard' },
        ABANDON: 'ABANDONED',
      },
    },

    STORYBOARD_PLANNED: {
      on: {
        MEDIA_COMPLETE: { target: 'PRODUCED', actions: 'setMedia' },
        ABANDON: 'ABANDONED',
      },
    },

    // ── Fase 3: Produção ─────────────────────────────────────────────────────
    PRODUCED: {
      on: {
        RENDER_COMPLETE: { target: 'RENDERED', actions: 'setVideo' },
        QA_FAIL_DETERMINISTIC: 'FAILED_QA',
        ABANDON: 'ABANDONED',
      },
    },

    RENDERED: {
      on: {
        QC_PASS: { target: 'CINEMATIC_REVIEWING', actions: 'setQcOk' },
        QC_FAIL: [
          {
            guard: 'qcRetryAvailable',
            target: 'PRODUCED',
            actions: 'incrementQcFail',
          },
          {
            target: 'ABANDONED',
            actions: 'incrementQcFail',
          },
        ],
        QA_FAIL_DETERMINISTIC: 'FAILED_QA',
        ABANDON: 'ABANDONED',
      },
    },

    FAILED_QA: {
      on: {
        ABANDON: 'ABANDONED',
      },
    },

    CINEMATIC_REVIEWING: {
      on: {
        CINEMATIC_PASS: { target: 'PENDING_REVIEW', actions: 'setCinematicOk' },
        CINEMATIC_FAIL: [
          {
            guard: 'cinematicRetryAvailable',
            target: 'REVISED', // Volta ao estágio de re-escrita
            actions: 'incrementCinematicFail',
          },
          {
            target: 'ABANDONED',
            actions: 'incrementCinematicFail',
          },
        ],
        ABANDON: 'ABANDONED',
      },
    },

    PENDING_REVIEW: {
      on: {
        REVIEW_APPROVE: { target: 'READY_TO_PUBLISH', actions: 'setReviewOk' },
        REVIEW_REJECT: 'REJECTED',
        REVIEW_REGENERATE: 'RESEARCHED',
        ABANDON: 'ABANDONED',
      },
    },

    READY_TO_PUBLISH: {
      on: {
        PUBLISH_COMPLETE: { target: 'PUBLISHED', actions: 'setPublished' },
        ABANDON: 'ABANDONED',
      },
    },

    // ── Fase 4: Distribuição e Aprendizado ────────────────────────────────────
    PUBLISHED: {
      on: {
        ANALYTICS_COMPLETE: { target: 'ANALYZED', actions: 'setAnalytics' },
      },
    },

    PUBLISHED_PARTIAL: {
      on: {
        PUBLISH_COMPLETE: { target: 'PUBLISHED', actions: 'setPublished' },
        ANALYTICS_COMPLETE: { target: 'ANALYZED', actions: 'setAnalytics' },
      },
    },

    ANALYZED: {
      on: {
        LEARNING_COMPLETE: 'LEARNED',
      },
    },

    // ── Terminais ─────────────────────────────────────────────────────────────
    LEARNED:   { type: 'final' },
    ABANDONED: { type: 'final' },
  },
})

// ─── Exports ──────────────────────────────────────────────────────────────────

export type { ContentState }

/** Verifica se um estado é terminal */
export function isTerminalState(state: ContentState): boolean {
  return ['REJECTED', 'ABANDONED', 'LEARNED'].includes(state)
}

/** Retorna true para estados que precisam de intervenção humana */
export function requiresHumanReview(state: ContentState): boolean {
  return state === 'DEFERRED'
}
