'use client';
import React, { useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const PIPELINE_STAGES = [
  { id: 'DISCOVERED',  label: 'Discovered',  x: 50,   y: 150 },
  { id: 'EVALUATED',   label: 'Evaluated',   x: 220,  y: 150 },
  { id: 'APPROVED',    label: 'Approved',    x: 390,  y: 150 },
  { id: 'RESEARCHED',  label: 'Researched',  x: 560,  y: 150 },
  { id: 'SCRIPTED',    label: 'Scripted',    x: 730,  y: 150 },
  { id: 'CRITIC_OK',   label: 'Critic Pass', x: 900,  y: 150 },
  { id: 'PRODUCED',    label: 'Produced',    x: 1070, y: 150 },
  { id: 'RENDERED',    label: 'Rendered',    x: 1240, y: 150 },
  { id: 'PENDING_REVIEW', label: 'Pending Review', x: 1410, y: 150 },
  { id: 'READY_TO_PUBLISH', label: 'Ready Pub', x: 1580, y: 150 },
  { id: 'PUBLISHED',   label: 'Published',   x: 1750, y: 150 },
];

const STAGE_ORDER = PIPELINE_STAGES.map((s) => s.id);

const EDGES = PIPELINE_STAGES.slice(0, -1).map((s, i) => ({
  id: `e${i}`,
  source: s.id,
  target: PIPELINE_STAGES[i + 1].id,
  style: { stroke: 'var(--color-border)', strokeWidth: 1.5 },
  animated: false,
}));

function buildNodes(activeUnit: any, selectedUnitState: string) {
  const activeState = activeUnit?.state ?? '';
  const activeIndex = STAGE_ORDER.indexOf(activeState);

  return PIPELINE_STAGES.map((stage, i) => {
    const isCurrent = stage.id === activeState;
    const isPast = i < activeIndex;
    const isFuture = i > activeIndex;

    let bg = 'var(--color-surface-2)';
    let border = '1px solid var(--color-border)';
    let color = 'var(--color-muted-foreground)';

    if (isCurrent) {
      bg = 'var(--color-surface-1)';
      border = '1.5px solid var(--color-accent)';
      color = 'var(--color-accent)';
    } else if (isPast) {
      bg = 'var(--color-background)';
      border = '1px solid var(--color-success)';
      color = 'var(--color-success)';
    }

    return {
      id: stage.id,
      position: { x: stage.x, y: stage.y },
      data: {
        label: (
          <div className="flex flex-col items-center gap-1">
            <span className="font-bold text-[11px]">{stage.label}</span>
            {isCurrent && (
              <span className="text-[8px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-mono animate-pulse tracking-wider">
                ● ACTIVE
              </span>
            )}
            {isPast && (
              <span className="text-[8px] text-success font-mono tracking-wider">✓ DONE</span>
            )}
            {isFuture && (
              <span className="text-[8px] text-muted-foreground font-mono tracking-wider">PENDING</span>
            )}
          </div>
        ),
      },
      style: { background: bg, color, border, padding: '10px', width: 130, borderRadius: '6px', cursor: 'pointer' },
    };
  });
}

function buildEdges(activeUnit: any) {
  const activeIndex = STAGE_ORDER.indexOf(activeUnit?.state ?? '');
  return EDGES.map((e, i) => ({
    ...e,
    animated: i === activeIndex - 1,
    style: {
      stroke: i < activeIndex ? 'var(--color-success)' : i === activeIndex - 1 ? 'var(--color-accent)' : 'var(--color-border)',
      strokeWidth: i === activeIndex - 1 ? 2 : 1.5,
    },
  }));
}

function formatSafeDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime()) || d.getFullYear() > 2100 || d.getFullYear() < 2000) {
      return `⚠️ Data inválida (${dateStr})`;
    }
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return `⚠️ Data inválida (${dateStr})`;
  }
}

function buildPayload(unit: any, nodeId: string) {
  if (!unit) return { info: 'Nenhum job ativo selecionado.' };
  const meta = unit.metadata ?? {};

  switch (nodeId) {
    case 'DISCOVERED':
      return { topic: unit.topic, channel: unit.channel_name, insertedAt: formatSafeDate(unit.created_at) };
    case 'EVALUATED':
      return meta.editorialScore !== undefined
        ? {
            score: `${(meta.editorialScore * 100).toFixed(0)}%`,
            direction: meta.editorialDirection ?? 'N/A',
            canonArchetype: meta.canonArchetype ?? 'N/A',
            canonTargetEmotion: meta.canonTargetEmotion ?? 'N/A',
          }
        : { info: 'Aguardando dado real do Editorial Agent.' };
    case 'APPROVED':
      return { topic: unit.topic, state: unit.state, approvedAt: formatSafeDate(unit.updated_at) };
    case 'RESEARCHED':
      return meta.researchPackage
        ? {
            query: meta.researchPackage.query,
            factsCount: meta.researchPackage.facts?.length ?? 0,
            topFacts: meta.researchPackage.facts?.slice(0, 2),
            sourcesCount: meta.researchPackage.sources?.length ?? 0,
          }
        : { info: 'Pacote de pesquisa ainda não disponível.' };
    case 'SCRIPTED':
      return meta.script
        ? {
            hookPreview: meta.script.hook?.slice(0, 120) + '...',
            durationTarget: meta.script.estimatedDurationSeconds ?? meta.script.durationSeconds,
            sectionsCount: meta.script.sections?.length ?? 0,
          }
        : { info: 'Script ainda não gerado.' };
    case 'CRITIC_OK':
      return meta.criticEvaluation
        ? {
            approved: meta.criticEvaluation.approved ?? true,
            feedback: meta.criticEvaluation.feedback ?? meta.criticEvaluation.summary ?? 'Aprovado pelo Critic',
          }
        : { info: 'Revisão do Critic ainda não disponível.' };
    case 'PRODUCED':
      return meta.assetUrls
        ? {
            assetCount: Object.keys(meta.assetUrls).length,
            assets: Object.keys(meta.assetUrls).slice(0, 5),
            storyManifest: meta.storyManifestPath ? '✓ Presente' : '✗ Ausente',
          }
        : { info: 'Pacote de mídia ainda não gerado.' };
    case 'RENDERED':
      return meta.videoFile
        ? {
            videoFile: meta.videoFile,
            qaWarnings: meta.qaWarnings ?? 'Nenhum',
          }
        : { info: 'Saída de renderização ainda não disponível.' };
    case 'PENDING_REVIEW':
      return {
        qcScore: meta.qcScore ?? 'N/A',
        qcChecklist: meta.qcChecklist ?? 'N/A',
        cinematicEvaluation: meta.cinematicEvaluation
          ? { approved: meta.cinematicEvaluation.approved, feedback: meta.cinematicEvaluation.feedback ?? meta.cinematicEvaluation.summary }
          : 'N/A',
        editorialScore: meta.editorialScore !== undefined ? `${(meta.editorialScore * 100).toFixed(0)}%` : 'N/A',
      };
    case 'READY_TO_PUBLISH':
      return { info: 'Pronto para publicação.' };
    case 'PUBLISHED':
      return meta.publicationResults
        ? {
            platforms: (meta.publicationResults as any[]).map((r: any) => ({
              platform: r.platform,
              success: r.success,
              url: r.platformUrl ?? 'N/A',
            })),
          }
        : { info: 'Publicação concluída.' };
    default:
      return { info: 'Selecione um nó do pipeline para inspecionar seus metadados.' };
  }
}

export function PipelineView({ contentUnits }: { contentUnits: any[] }) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  // Primeiro ativo, depois todos como selecionável
  const activeUnit = useMemo(() => {
    if (selectedUnitId) return contentUnits.find((cu) => cu.id === selectedUnitId) ?? contentUnits[0];
    return contentUnits.find((cu) => cu.state !== 'PUBLISHED' && cu.state !== 'ABANDONED' && cu.state !== 'REJECTED') ?? contentUnits[0];
  }, [contentUnits, selectedUnitId]);

  const nodes = useMemo(() => buildNodes(activeUnit, selectedNode ?? ''), [activeUnit, selectedNode]);
  const edges = useMemo(() => buildEdges(activeUnit), [activeUnit]);
  const payload = useMemo(() => buildPayload(activeUnit, selectedNode ?? ''), [activeUnit, selectedNode]);

  return (
    <div className="flex flex-col gap-6">
      {/* Job Selector */}
      {contentUnits.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Inspecionar Job:</span>
          {contentUnits.slice(0, 8).map((cu) => (
            <button
              key={cu.id}
              onClick={() => { setSelectedUnitId(cu.id); setSelectedNode(null); }}
              className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-all ${
                (activeUnit?.id === cu.id)
                  ? 'border-accent/40 bg-surface-1 text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              }`}
            >
              {cu.topic.slice(0, 35)}{cu.topic.length > 35 ? '…' : ''}{' '}
              <span className="opacity-50">({cu.state})</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-6">
        {/* React Flow Panel */}
        <div className="flex-1 h-[480px] border border-border bg-card rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-xs font-mono font-semibold text-accent uppercase tracking-wider">Pipeline Inspector // React Flow</h3>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {activeUnit
                  ? `Job: "${activeUnit.topic}" · Estado atual: ${activeUnit.state}`
                  : 'Nenhum job encontrado. Injete um tema para começar.'}
              </p>
            </div>
            <span className="text-[9px] text-muted-foreground font-mono bg-surface-2 border border-border px-2 py-1 rounded">
              Clique num nó para inspecionar
            </span>
          </div>

          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={(_evt, node) => setSelectedNode(node.id)}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1e1e2e" gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(n) => {
                  const s = n.style as any;
                  return s?.background ?? 'var(--color-surface-2)';
                }}
                style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)' }}
              />
            </ReactFlow>
          </div>
        </div>

        {/* Payload Inspector Drawer */}
        <div className={`w-72 border border-border bg-card rounded-lg p-5 flex flex-col gap-4 font-mono text-xs transition-all duration-300 ${selectedNode ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex justify-between items-center border-b border-border pb-3">
            <div>
              <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">{selectedNode ?? '—'}</span>
              <p className="text-[9px] text-muted-foreground mt-0.5">Payload da Fase</p>
            </div>
            {selectedNode && (
              <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            <pre className="bg-surface-2 border border-border rounded-md p-3 text-[10px] text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>

          {activeUnit?.metadata && selectedNode && (
            <div className="text-[9px] text-muted-foreground border-t border-border pt-3">
              Fonte: Postgres · campo <span className="text-accent">metadata</span> do content_unit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
