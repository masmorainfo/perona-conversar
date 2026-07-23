'use client';
// ────────────────────────────────────────────────────────────────────────────
// PipelineView.tsx — Inspetor do pipeline com a máquina de estados completa.
// Sugestão de destino: apps/mission-control/src/components/PipelineView.tsx
//
// Dependências novas:  pnpm add dagre   &&   pnpm add -D @types/dagre
// (React Flow já existe no projeto; imports abaixo no padrão 'reactflow' v11.
//  Se o projeto usa '@xyflow/react' v12, só troca a linha de import.)
//
// O que este componente entrega:
//  1. DAG com os 24 estados + loops de falha, auto-layout via dagre
//     (nada de coordenadas na mão).
//  2. Temas de nó: concluído / ativo / falha / terminal / pendente.
//  3. ★ Alerta STALLED: estado não-terminal parado além do limiar pulsa
//     em laranja com o tempo parado — o recurso que faltou a semana toda.
//  4. Gaveta (Payload Inspector): erro literal, attemptCounts, filas BullMQ,
//     timestamps e contador de execuções diárias.
//  5. Ações "Reexecutar etapa" e "Retroceder": só transições válidas,
//     modal de confirmação com MOTIVO OBRIGATÓRIO (vira auditoria no backend),
//     custo de execução visível antes do clique.
// ────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { STATES, EDGES, isStalled, minutesInState, type StateDef } from '../lib/pipeline-states';

// ── Tipos de entrada ─────────────────────────────────────────────────────────
// ADAPTE: alinhe com o shape real da unit vindo do seu fetch.
export interface QueueStat {
  queue: string;
  waiting: number;
  active: number;
  failed: number;
}

export interface PipelineUnit {
  id: string;
  topic: string;
  state: string;                        // estado atual (ex.: 'RESEARCHED')
  lastTransitionAt: string;             // ISO — updated_at da unit
  attemptCounts?: Record<string, number>; // metadata.attemptCounts
  lastError?: string | null;            // metadata.lastError (mensagem literal)
  visitedStates?: string[];             // opcional: histórico; sem ele, infere pelo caminho feliz
  executionsToday: number;              // consumo do limite diário
  executionsLimit: number;              // ex.: 15
  queueStats?: QueueStat[];             // snapshot BullMQ (opcional)
}

interface Props {
  unit: PipelineUnit;
  /** Token de operador validado pela rota /api/jobs/retry.
   *  ADAPTE: injete do seu mecanismo de sessão — nunca hardcode. */
  operatorToken: string;
  /** Chamado após ação manual bem-sucedida (para refetch). */
  onActionDone?: () => void;
}

// ── Layout automático (dagre) ────────────────────────────────────────────────
const NODE_W = 196;
const NODE_H = 64;

function layoutGraph(): { nodes: Array<{ id: string; x: number; y: number }> } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 34, ranksep: 46 });
  g.setDefaultEdgeLabel(() => ({}));
  Object.keys(STATES).forEach((id) => g.setNode(id, { width: NODE_W, height: NODE_H }));
  EDGES.forEach(([s, t]) => g.setEdge(s, t));
  dagre.layout(g);
  return {
    nodes: Object.keys(STATES).map((id) => {
      const n = g.node(id);
      return { id, x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 };
    }),
  };
}

// ── Tema visual por situação do nó ───────────────────────────────────────────
type NodeSituation = 'done' | 'active' | 'active-stalled' | 'failed-past' | 'terminal' | 'pending';

function situationFor(def: StateDef, unit: PipelineUnit): NodeSituation {
  if (def.id === unit.state) {
    return isStalled(def.id, unit.lastTransitionAt) ? 'active-stalled' : 'active';
  }
  const attempts = unit.attemptCounts?.[def.id] ?? 0;
  if (def.kind === 'fail' && attempts > 0) return 'failed-past'; // pipeline se recuperou aqui
  const visited = unit.visitedStates?.includes(def.id)
    ?? happyPathIndex(def.id) < happyPathIndex(unit.state); // fallback: ordem do caminho feliz
  if (def.kind === 'terminal-negative') return 'terminal';
  return visited ? 'done' : 'pending';
}

const HAPPY_ORDER = [
  'DISCOVERED','EVALUATED','APPROVED','RESEARCHED','SCRIPTED','CRITIC_OK',
  'STORYBOARD_PLANNED','PRODUCED','RENDERED','QC_APPROVED','CINEMATIC_REVIEWING',
  'PENDING_REVIEW','READY_TO_PUBLISH','PUBLISHED','ANALYZED','LEARNED',
];
function happyPathIndex(id: string): number {
  const i = HAPPY_ORDER.indexOf(id);
  return i === -1 ? -1 : i;
}

// ── Nó customizado ───────────────────────────────────────────────────────────
interface NodeData {
  def: StateDef;
  situation: NodeSituation;
  minutes: number;
  attempts: number;
}

function StateNode({ data }: NodeProps<NodeData>) {
  const { def, situation, minutes, attempts } = data;
  return (
    <div className={`pi-node pi-${situation}`}>
      <Handle type="target" position={Position.Top} className="pi-handle" />
      <div className="pi-node-label">
        {situation === 'failed-past' || def.kind === 'fail' ? '⚠️ ' : ''}
        {def.label}
      </div>
      {situation === 'active' && <div className="pi-badge">● ATIVO · {minutes} min</div>}
      {situation === 'active-stalled' && <div className="pi-badge pi-badge-stall">⏱ PARADO HÁ {minutes} MIN</div>}
      {attempts > 0 && situation !== 'active' && situation !== 'active-stalled' && (
        <div className="pi-badge pi-badge-attempts">{attempts}× tentativas</div>
      )}
      <Handle type="source" position={Position.Bottom} className="pi-handle" />
    </div>
  );
}
const nodeTypes = { state: StateNode };

// ── Componente principal ─────────────────────────────────────────────────────
export function PipelineView({ unit, operatorToken, onActionDone }: Props) {
  const [selected, setSelected] = useState<StateDef | null>(null);
  const [confirming, setConfirming] = useState<{ action: 'retry' | 'rollback'; target?: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const layout = layoutGraph();
    const nodes: Node<NodeData>[] = layout.nodes.map(({ id, x, y }) => {
      const def = STATES[id];
      return {
        id,
        type: 'state',
        position: { x, y },
        data: {
          def,
          situation: situationFor(def, unit),
          minutes: id === unit.state ? minutesInState(unit.lastTransitionAt) : 0,
          attempts: unit.attemptCounts?.[id] ?? 0,
        },
      };
    });
    const edges: Edge[] = EDGES.map(([s, t]) => {
      const isFailEdge = STATES[t].kind === 'fail' || STATES[t].kind === 'terminal-negative';
      return {
        id: `${s}->${t}`,
        source: s,
        target: t,
        animated: s === unit.state,
        className: isFailEdge ? 'pi-edge-fail' : 'pi-edge',
      };
    });
    return { nodes, edges };
  }, [unit]);

  const runAction = useCallback(async () => {
    if (!confirming || reason.trim().length < 5) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/jobs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-operator-token': operatorToken },
        body: JSON.stringify({
          contentId: unit.id,
          currentState: unit.state,
          action: confirming.action,
          targetState: confirming.target,
          reason: reason.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setFeedback(`✅ ${body.message ?? 'Ação registrada e enfileirada.'}`);
      setConfirming(null);
      setReason('');
      onActionDone?.();
    } catch (err: any) {
      setFeedback(`🚨 Falhou: ${err.message}`); // erro literal, sem maquiagem
    } finally {
      setBusy(false);
    }
  }, [confirming, reason, unit, operatorToken, onActionDone]);

  const current = STATES[unit.state];
  const executionsLeft = unit.executionsLimit - unit.executionsToday;

  return (
    <div className="pi-root">
      <PipelineStyles />

      <div className="pi-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelected(STATES[node.id])}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} />
          <MiniMap pannable zoomable className="pi-minimap" />
          <Controls />
        </ReactFlow>
      </div>

      {/* ── Gaveta: Payload Inspector ─────────────────────────────────────── */}
      {selected && (
        <aside className="pi-drawer" aria-label={`Detalhes do estado ${selected.label}`}>
          <header className="pi-drawer-head">
            <h3>{selected.label}</h3>
            <button className="pi-x" onClick={() => setSelected(null)} aria-label="Fechar">✕</button>
          </header>

          <dl className="pi-meta">
            <dt>Unit</dt><dd className="pi-mono">{unit.id}</dd>
            <dt>Estado atual da unit</dt><dd>{current?.label ?? unit.state}</dd>
            <dt>Nesse estado há</dt><dd>{minutesInState(unit.lastTransitionAt)} min</dd>
            <dt>Tentativas ({selected.id})</dt><dd>{unit.attemptCounts?.[selected.id] ?? 0}</dd>
          </dl>

          {unit.lastError && (
            <section className="pi-error">
              <h4>Último erro (literal)</h4>
              <pre>{unit.lastError}</pre>
            </section>
          )}

          {unit.queueStats && unit.queueStats.length > 0 && (
            <section>
              <h4>Filas BullMQ</h4>
              <table className="pi-queues">
                <thead><tr><th>fila</th><th>esperando</th><th>ativos</th><th>falhos</th></tr></thead>
                <tbody>
                  {unit.queueStats.map((q) => (
                    <tr key={q.queue} className={q.failed > 0 ? 'pi-row-bad' : ''}>
                      <td>{q.queue}</td><td>{q.waiting}</td><td>{q.active}</td><td>{q.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Ações só aparecem no nó do estado ATUAL — agir em outro nó não faz sentido */}
          {selected.id === unit.state && (
            <section className="pi-actions">
              <h4>Ações do operador</h4>
              <p className="pi-cost">
                Execuções hoje: <b>{unit.executionsToday}/{unit.executionsLimit}</b>
                {' '}({executionsLeft} restantes — cada ação abaixo consome 1)
              </p>

              {current?.retryQueue && (
                <button
                  className="pi-btn"
                  disabled={executionsLeft <= 0}
                  onClick={() => setConfirming({ action: 'retry' })}
                >
                  Reexecutar etapa atual
                </button>
              )}

              {current?.rollbackTargets.map((t) => (
                <button
                  key={t}
                  className="pi-btn pi-btn-ghost"
                  disabled={executionsLeft <= 0}
                  onClick={() => setConfirming({ action: 'rollback', target: t })}
                >
                  Retroceder para {STATES[t]?.label ?? t}
                </button>
              ))}

              {executionsLeft <= 0 && (
                <p className="pi-warn">Limite diário de execuções atingido. Ações liberam no próximo ciclo.</p>
              )}
            </section>
          )}

          {feedback && <p className="pi-feedback">{feedback}</p>}
        </aside>
      )}

      {/* ── Modal de confirmação com motivo obrigatório ───────────────────── */}
      {confirming && (
        <div className="pi-modal-backdrop" role="dialog" aria-modal="true">
          <div className="pi-modal">
            <h3>
              {confirming.action === 'retry'
                ? `Reexecutar a etapa "${current?.label}"`
                : `Retroceder para "${STATES[confirming.target!]?.label}"`}
            </h3>
            <p>
              Isso injeta um <b>evento na máquina de estados</b> (nunca reset direto no banco),
              consome <b>1 execução</b> do limite diário e fica registrado na auditoria com o seu motivo.
            </p>
            <label>
              Motivo (obrigatório, mín. 5 caracteres)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: worker de script não consumiu o job após deploy; log mostra fila vazia"
                rows={3}
              />
            </label>
            <div className="pi-modal-btns">
              <button className="pi-btn pi-btn-ghost" onClick={() => { setConfirming(null); setReason(''); }}>
                Cancelar
              </button>
              <button className="pi-btn" disabled={busy || reason.trim().length < 5} onClick={runAction}>
                {busy ? 'Enviando…' : 'Confirmar e registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estilos (escopados com prefixo pi-, herdam o tema via CSS vars) ─────────
function PipelineStyles() {
  return (
    <style>{`
      .pi-root { position: relative; width: 100%; height: 100%; min-height: 640px; }
      .pi-canvas { position: absolute; inset: 0; }

      .pi-node {
        width: ${NODE_W}px; min-height: ${NODE_H}px; padding: 10px 12px;
        border-radius: 10px; border: 1.5px solid var(--pi-border, #3a3f4a);
        background: var(--pi-node-bg, #14161c); color: var(--pi-fg, #e8eaf0);
        font: 600 13px/1.3 var(--pi-font, inherit); text-align: center;
      }
      .pi-node-label { display: block; }
      .pi-handle { opacity: 0; }

      .pi-done            { border-color: var(--pi-ok, #2f9e6e); background: color-mix(in srgb, var(--pi-ok, #2f9e6e) 12%, var(--pi-node-bg, #14161c)); }
      .pi-active          { border-color: var(--pi-active, #d9a441); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pi-active, #d9a441) 35%, transparent); animation: pi-pulse 1.6s ease-in-out infinite; }
      .pi-active-stalled  { border-color: var(--pi-stall, #e8722c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pi-stall, #e8722c) 45%, transparent); animation: pi-pulse 0.9s ease-in-out infinite; }
      .pi-failed-past     { border-color: var(--pi-bad, #d64545); background: color-mix(in srgb, var(--pi-bad, #d64545) 14%, var(--pi-node-bg, #14161c)); }
      .pi-terminal        { border-color: #4a4f58; color: #8a8f9a; background: #101216; }
      .pi-pending         { opacity: .45; }

      @keyframes pi-pulse { 50% { box-shadow: 0 0 0 7px transparent; } }
      @media (prefers-reduced-motion: reduce) {
        .pi-active, .pi-active-stalled { animation: none; }
      }

      .pi-badge { margin-top: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: .04em;
                  color: var(--pi-active, #d9a441); }
      .pi-badge-stall { color: var(--pi-stall, #e8722c); }
      .pi-badge-attempts { color: var(--pi-bad, #d64545); }

      .pi-edge path { stroke: var(--pi-border, #3a3f4a); }
      .pi-edge-fail path { stroke: var(--pi-bad, #d64545); stroke-dasharray: 5 4; }

      .pi-drawer {
        position: absolute; top: 0; right: 0; bottom: 0; width: 380px; overflow-y: auto;
        background: var(--pi-panel, #0f1116); border-left: 1px solid var(--pi-border, #3a3f4a);
        color: var(--pi-fg, #e8eaf0); padding: 18px; z-index: 8;
      }
      .pi-drawer-head { display: flex; justify-content: space-between; align-items: center; }
      .pi-drawer h3 { margin: 0; font-size: 16px; }
      .pi-drawer h4 { margin: 18px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; opacity: .75; }
      .pi-x { background: none; border: 0; color: inherit; font-size: 16px; cursor: pointer; }

      .pi-meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; margin-top: 12px; }
      .pi-meta dt { opacity: .6; }
      .pi-mono { font-family: ui-monospace, monospace; font-size: 11.5px; word-break: break-all; }

      .pi-error pre {
        background: color-mix(in srgb, var(--pi-bad, #d64545) 12%, #000);
        border: 1px solid var(--pi-bad, #d64545); border-radius: 8px;
        padding: 10px; font-size: 11.5px; white-space: pre-wrap; word-break: break-word;
      }

      .pi-queues { width: 100%; border-collapse: collapse; font-size: 12px; }
      .pi-queues th, .pi-queues td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--pi-border, #3a3f4a); }
      .pi-row-bad td { color: var(--pi-bad, #d64545); font-weight: 700; }

      .pi-actions .pi-btn { display: block; width: 100%; margin-top: 8px; }
      .pi-cost { font-size: 12.5px; }
      .pi-warn { font-size: 12px; color: var(--pi-stall, #e8722c); }
      .pi-feedback { margin-top: 14px; font-size: 13px; white-space: pre-wrap; }

      .pi-btn {
        padding: 9px 14px; border-radius: 8px; border: 1px solid var(--pi-active, #d9a441);
        background: var(--pi-active, #d9a441); color: #14161c; font-weight: 700; cursor: pointer;
      }
      .pi-btn:disabled { opacity: .45; cursor: not-allowed; }
      .pi-btn-ghost { background: transparent; color: var(--pi-fg, #e8eaf0); border-color: var(--pi-border, #3a3f4a); }

      .pi-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 40; }
      .pi-modal { width: min(480px, 92vw); background: var(--pi-panel, #0f1116); color: var(--pi-fg, #e8eaf0);
                  border: 1px solid var(--pi-border, #3a3f4a); border-radius: 12px; padding: 20px; }
      .pi-modal h3 { margin-top: 0; }
      .pi-modal label { display: block; font-size: 12.5px; margin-top: 10px; }
      .pi-modal textarea { width: 100%; margin-top: 6px; border-radius: 8px; padding: 8px;
                           background: #14161c; color: inherit; border: 1px solid var(--pi-border, #3a3f4a); }
      .pi-modal-btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }

      .pi-minimap { background: var(--pi-panel, #0f1116) !important; }
    `}</style>
  );
}
