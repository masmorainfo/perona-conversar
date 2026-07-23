// ────────────────────────────────────────────────────────────────────────────
// pipeline-states.ts — FONTE ÚNICA DA VERDADE do grafo da máquina de estados
// Compartilhado entre o PipelineView (client) e a rota /api/jobs/retry (server).
// Sugestão de destino: apps/mission-control/src/lib/pipeline-states.ts
// ────────────────────────────────────────────────────────────────────────────

export type StateKind =
  | 'happy'            // caminho feliz
  | 'fail'             // estado de falha recuperável (loop)
  | 'terminal-negative'// fim de linha negativo
  | 'human';           // aguarda decisão humana

export interface StateDef {
  id: string;
  label: string;          // rótulo curto exibido no nó (PT-BR)
  kind: StateKind;
  /** minutos parado neste estado antes de acender o alerta STALLED.
   *  null = estado onde esperar é normal (terminais e gates humanos). */
  stallAfterMinutes: number | null;
  /** fila BullMQ que reprocessa ESTA etapa num retry.
   *  ADAPTE: confira os nomes reais em getQueue(...) do supervisor. */
  retryQueue: string | null;
  /** estados anteriores para os quais o operador pode retroceder.
   *  Apenas transições que a máquina de estados reconhece. Nunca pular gate. */
  rollbackTargets: string[];
}

export const STATES: Record<string, StateDef> = {
  // ── Descoberta e avaliação ────────────────────────────────────────────────
  DISCOVERED:          { id: 'DISCOVERED',          label: 'Descoberto',           kind: 'happy', stallAfterMinutes: 15,  retryQueue: 'editorial', rollbackTargets: [] },
  EVALUATED:           { id: 'EVALUATED',           label: 'Avaliado',             kind: 'happy', stallAfterMinutes: 15,  retryQueue: 'editorial', rollbackTargets: [] },
  APPROVED:            { id: 'APPROVED',            label: 'Aprovado (Canon)',     kind: 'happy', stallAfterMinutes: 10,  retryQueue: 'research',    rollbackTargets: [] },
  DEFERRED:            { id: 'DEFERRED',            label: 'Adiado',               kind: 'human', stallAfterMinutes: null, retryQueue: 'editorial', rollbackTargets: ['EVALUATED'] },

  // ── Produção de conteúdo ─────────────────────────────────────────────────
  RESEARCHED:          { id: 'RESEARCHED',          label: 'Pesquisado',           kind: 'happy', stallAfterMinutes: 10,  retryQueue: 'script',      rollbackTargets: ['APPROVED'] },
  SCRIPTED:            { id: 'SCRIPTED',            label: 'Roteirizado',          kind: 'happy', stallAfterMinutes: 10,  retryQueue: 'critic',      rollbackTargets: ['RESEARCHED'] },
  CRITIC_OK:           { id: 'CRITIC_OK',           label: 'Critic OK',            kind: 'happy', stallAfterMinutes: 10,  retryQueue: 'storyboard',  rollbackTargets: ['RESEARCHED'] },
  CRITIC_FAIL:         { id: 'CRITIC_FAIL',         label: 'Critic reprovou',      kind: 'fail',  stallAfterMinutes: 10,  retryQueue: 'script',      rollbackTargets: ['RESEARCHED'] },
  REVISED:             { id: 'REVISED',             label: 'Em revisão',           kind: 'fail',  stallAfterMinutes: 10,  retryQueue: 'script',      rollbackTargets: ['RESEARCHED'] },

  // ── Produção audiovisual ─────────────────────────────────────────────────
  STORYBOARD_PLANNED:  { id: 'STORYBOARD_PLANNED',  label: 'Storyboard pronto',    kind: 'happy', stallAfterMinutes: 15,  retryQueue: 'media',       rollbackTargets: ['CRITIC_OK'] },
  PRODUCED:            { id: 'PRODUCED',            label: 'Assets produzidos',    kind: 'happy', stallAfterMinutes: 20,  retryQueue: 'render',      rollbackTargets: ['STORYBOARD_PLANNED'] },
  RENDERED:            { id: 'RENDERED',            label: 'Renderizado',          kind: 'happy', stallAfterMinutes: 10,  retryQueue: 'render',      rollbackTargets: ['PRODUCED'] },
  QC_APPROVED:         { id: 'QC_APPROVED',         label: 'QC aprovado',          kind: 'happy', stallAfterMinutes: 10,  retryQueue: 'render',      rollbackTargets: ['PRODUCED'] },
  QC_FAIL:             { id: 'QC_FAIL',             label: 'QC reprovou',          kind: 'fail',  stallAfterMinutes: 10,  retryQueue: 'quality',       rollbackTargets: ['PRODUCED', 'STORYBOARD_PLANNED'] },
  FAILED_QA:           { id: 'FAILED_QA',           label: 'QA determinístico ✗',  kind: 'fail',  stallAfterMinutes: 10,  retryQueue: 'media',       rollbackTargets: ['PRODUCED', 'STORYBOARD_PLANNED'] },

  // ── Revisão editorial e humana ───────────────────────────────────────────
  CINEMATIC_REVIEWING: { id: 'CINEMATIC_REVIEWING', label: 'Revisão cinemática',   kind: 'happy', stallAfterMinutes: 15,  retryQueue: 'cinematic-review',   rollbackTargets: ['RENDERED'] },
  CINEMATIC_FAIL:      { id: 'CINEMATIC_FAIL',      label: 'Cinemática reprovou',  kind: 'fail',  stallAfterMinutes: 10,  retryQueue: 'script',      rollbackTargets: ['RESEARCHED'] },
  PENDING_REVIEW:      { id: 'PENDING_REVIEW',      label: 'Aguardando operador',  kind: 'human', stallAfterMinutes: null, retryQueue: null,          rollbackTargets: ['RESEARCHED'] },

  // ── Publicação e aprendizado ─────────────────────────────────────────────
  READY_TO_PUBLISH:    { id: 'READY_TO_PUBLISH',    label: 'Pronto p/ publicar',   kind: 'happy', stallAfterMinutes: 30,  retryQueue: null,   rollbackTargets: ['PENDING_REVIEW'] },
  PUBLISHED:           { id: 'PUBLISHED',           label: 'Publicado',            kind: 'happy', stallAfterMinutes: null, retryQueue: null,          rollbackTargets: [] },
  ANALYZED:            { id: 'ANALYZED',            label: 'Analisado',            kind: 'happy', stallAfterMinutes: null, retryQueue: null,          rollbackTargets: [] },
  LEARNED:             { id: 'LEARNED',             label: 'Aprendido (VLS)',      kind: 'happy', stallAfterMinutes: null, retryQueue: null,          rollbackTargets: [] },

  // ── Terminais negativos ──────────────────────────────────────────────────
  REJECTED:            { id: 'REJECTED',            label: 'Rejeitado',            kind: 'terminal-negative', stallAfterMinutes: null, retryQueue: null, rollbackTargets: ['RESEARCHED'] },
  ABANDONED:           { id: 'ABANDONED',           label: 'Abandonado',           kind: 'terminal-negative', stallAfterMinutes: null, retryQueue: null, rollbackTargets: ['RESEARCHED'] },

  // ── Falhas estruturais ───────────────────────────────────────────────────
  QUEUE_ERROR:         { id: 'QUEUE_ERROR',         label: 'Erro de Fila',         kind: 'fail', stallAfterMinutes: 5, retryQueue: null, rollbackTargets: ['RESEARCHED', 'EVALUATED'] },
};

/** Arestas do grafo (origem → destino). Inclui caminho feliz e loops de falha. */
export const EDGES: Array<[string, string]> = [
  // caminho feliz
  ['DISCOVERED', 'EVALUATED'],
  ['EVALUATED', 'APPROVED'],
  ['APPROVED', 'RESEARCHED'],
  ['RESEARCHED', 'SCRIPTED'],
  ['SCRIPTED', 'CRITIC_OK'],
  ['CRITIC_OK', 'STORYBOARD_PLANNED'],
  ['STORYBOARD_PLANNED', 'PRODUCED'],
  ['PRODUCED', 'RENDERED'],
  ['RENDERED', 'QC_APPROVED'],
  ['QC_APPROVED', 'CINEMATIC_REVIEWING'],
  ['CINEMATIC_REVIEWING', 'PENDING_REVIEW'],
  ['PENDING_REVIEW', 'READY_TO_PUBLISH'],
  ['READY_TO_PUBLISH', 'PUBLISHED'],
  ['PUBLISHED', 'ANALYZED'],
  ['ANALYZED', 'LEARNED'],
  // avaliação: rejeição/adiamento precoce
  ['EVALUATED', 'REJECTED'],
  ['EVALUATED', 'DEFERRED'],
  ['DEFERRED', 'EVALUATED'],
  // loop do Critic
  ['SCRIPTED', 'CRITIC_FAIL'],
  ['CRITIC_FAIL', 'REVISED'],
  ['REVISED', 'SCRIPTED'],
  ['CRITIC_FAIL', 'ABANDONED'],
  ['REVISED', 'ABANDONED'],
  // loop de QC
  ['RENDERED', 'QC_FAIL'],
  ['QC_FAIL', 'PRODUCED'],
  ['QC_FAIL', 'ABANDONED'],
  // QA determinístico
  ['PRODUCED', 'FAILED_QA'],
  ['RENDERED', 'FAILED_QA'],
  ['FAILED_QA', 'ABANDONED'],
  // loop cinemático
  ['CINEMATIC_REVIEWING', 'CINEMATIC_FAIL'],
  ['CINEMATIC_FAIL', 'REVISED'],
  ['CINEMATIC_FAIL', 'ABANDONED'],
  // decisão humana
  ['PENDING_REVIEW', 'REJECTED'],
  ['PENDING_REVIEW', 'RESEARCHED'],
];

/** Valida uma ação manual do operador. Única função que a rota de retry consulta. */
export function isValidManualAction(
  currentState: string,
  action: 'retry' | 'rollback',
  targetState?: string
): { ok: boolean; reason?: string; queue?: string } {
  const def = STATES[currentState];
  if (!def) return { ok: false, reason: `Estado desconhecido: ${currentState}` };

  if (action === 'retry') {
    if (!def.retryQueue) {
      return { ok: false, reason: `${currentState} não tem etapa reexecutável.` };
    }
    return { ok: true, queue: def.retryQueue };
  }

  // rollback
  if (!targetState) return { ok: false, reason: 'Rollback exige estado de destino.' };
  if (!def.rollbackTargets.includes(targetState)) {
    return {
      ok: false,
      reason: `Retroceder de ${currentState} para ${targetState} não é uma transição válida.`,
    };
  }
  const target = STATES[targetState];
  return { ok: true, queue: target?.retryQueue ?? undefined };
}

/** Minutos desde a última transição; usado no alerta STALLED. */
export function minutesInState(lastTransitionAt: string | Date): number {
  const t = typeof lastTransitionAt === 'string' ? new Date(lastTransitionAt) : lastTransitionAt;
  return Math.floor((Date.now() - t.getTime()) / 60000);
}

export function isStalled(stateId: string, lastTransitionAt: string | Date): boolean {
  const def = STATES[stateId];
  if (!def || def.stallAfterMinutes === null) return false;
  return minutesInState(lastTransitionAt) >= def.stallAfterMinutes;
}
