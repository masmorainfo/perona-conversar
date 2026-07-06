'use client';
import React, { useState, useEffect, useCallback } from 'react';

const STATE_COLORS: Record<string, string> = {
  DISCOVERED: '#89b4fa',
  EVALUATED: '#89dceb',
  APPROVED: '#a6e3a1',
  RESEARCHED: '#94e2d5',
  SCRIPTED: '#cba6f7',
  CRITIC_OK: '#f5c2e7',
  PRODUCED: '#fab387',
  RENDERED: '#f9e2af',
  PENDING_REVIEW: '#cba6f7',
  READY_TO_PUBLISH: '#a6e3a1',
  PUBLISHED: '#a6e3a1',
  REJECTED: '#f38ba8',
  ABANDONED: '#6c7086',
};

function QueueRow({ queue }: { queue: { name: string; counts: Record<string, number> } }) {
  const { waiting = 0, active = 0, failed = 0, completed = 0, delayed = 0 } = queue.counts;
  const isActive = active > 0;
  const hasFailed = failed > 0;

  return (
    <div className={`flex items-center justify-between px-4 py-2.5 rounded-md border transition-all ${
      isActive ? 'border-[#cba6f7]/30 bg-[#1a1a2e]' :
      hasFailed ? 'border-red-900/30 bg-[#18181b]' :
      'border-[#27272a] bg-[#18181b]'
    }`}>
      <div className="flex items-center gap-2.5">
        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-[#cba6f7] animate-pulse' : hasFailed ? 'bg-red-400' : 'bg-zinc-600'}`} />
        <span className="font-mono text-xs text-zinc-300 w-24 truncate">{queue.name}</span>
      </div>
      <div className="flex items-center gap-4 font-mono text-[10px]">
        <span className="text-zinc-500">wait <span className="text-white font-bold">{waiting}</span></span>
        <span className="text-[#cba6f7]">active <span className="font-bold">{active}</span></span>
        {failed > 0 && <span className="text-red-400">fail <span className="font-bold">{failed}</span></span>}
        {delayed > 0 && <span className="text-yellow-500">delay <span className="font-bold">{delayed}</span></span>}
        <span className="text-zinc-600">done <span className="text-zinc-400 font-bold">{completed}</span></span>
      </div>
    </div>
  );
}

export function SupervisorConsole() {
  const [data, setData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(() => {
    fetch('/api/supervisor')
      .then((res) => res.json())
      .then((d) => {
        if (!d.error) {
          setData(d);
          setLastUpdated(new Date());
        }
      });
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const statusColor =
    data?.summary?.status === 'PROCESSING' ? 'text-[#cba6f7]' :
    data?.summary?.status === 'QUEUED' ? 'text-yellow-400' : 'text-[#a6e3a1]';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">02 // SUPERVISOR CONSOLE</h2>
          <p className="text-xs text-zinc-500 font-mono">Telemetria em tempo real de todas as filas BullMQ e métricas do pipeline.</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] text-zinc-600 font-mono">
              atualizado {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button
            onClick={fetchData}
            className="text-[10px] font-mono px-3 py-1.5 border border-[#27272a] rounded text-zinc-400 hover:text-white hover:border-zinc-500 transition-all"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {data ? (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Status', value: data.summary?.status, className: statusColor },
              { label: 'Aguardando', value: data.summary?.totalWaiting, className: 'text-yellow-400' },
              { label: 'Processando', value: data.summary?.totalActive, className: 'text-[#cba6f7]' },
              { label: 'Concluídos', value: data.summary?.totalCompleted, className: 'text-[#a6e3a1]' },
              { label: 'Com Falha', value: data.summary?.totalFailed, className: data.summary?.totalFailed > 0 ? 'text-red-400' : 'text-zinc-600' },
            ].map((card) => (
              <div key={card.label} className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-4 text-center">
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">{card.label}</p>
                <p className={`text-xl font-bold font-mono mt-1 ${card.className}`}>{card.value ?? '—'}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Queue Telemetry — All Queues */}
            <div className="lg:col-span-2 border border-[#1e1e2e] bg-[#09090b] rounded-lg p-5 space-y-3">
              <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">
                Filas BullMQ — {data.queues?.length ?? 0} filas monitoradas
              </h3>
              <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                {data.queues?.map((q: any) => (
                  <QueueRow key={q.name} queue={q} />
                ))}
              </div>
            </div>

            {/* Right Column: State Distribution + Top Transitions */}
            <div className="space-y-4">
              {/* Pipeline State Distribution */}
              <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-5 space-y-3">
                <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">
                  Distribuição de Estados
                </h3>
                <div className="space-y-2">
                  {Object.entries(data.pipeline?.stateDistribution ?? {}).map(([state, count]: any) => (
                    <div key={state} className="flex items-center justify-between font-mono text-[10px]">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: STATE_COLORS[state] ?? '#6c7086' }}
                        />
                        <span className="text-zinc-400">{state}</span>
                      </div>
                      <span className="text-white font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Abandon Rate */}
              <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-5 space-y-3">
                <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">
                  Saúde do Pipeline
                </h3>
                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between border-b border-[#18181b] pb-2">
                    <span className="text-zinc-400">Total de Unidades</span>
                    <span className="text-white font-bold">{data.pipeline?.totalUnits}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#18181b] pb-2">
                    <span className="text-zinc-400">Taxa de Abandono</span>
                    <span className={`font-bold ${data.pipeline?.abandonRate > 0.2 ? 'text-red-400' : 'text-[#a6e3a1]'}`}>
                      {((data.pipeline?.abandonRate ?? 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="pt-1">
                    <p className="text-[10px] text-zinc-500 mb-1.5">Top Transições</p>
                    {data.pipeline?.topTransitions?.map((t: any) => (
                      <div key={t.toState} className="flex justify-between text-[10px] py-0.5">
                        <span className="text-zinc-500">→ {t.toState}</span>
                        <span className="text-zinc-300">{t.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-500 font-mono py-16 text-center animate-pulse">
          Conectando ao supervisor e coletando telemetria das filas...
        </div>
      )}
    </div>
  );
}
