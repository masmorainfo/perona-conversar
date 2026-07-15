import React, { useState, useEffect } from 'react';

export function DailyBriefing() {
  const [data, setData] = useState<any>(null);
  const [costData, setCostData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/cognitive')
      .then((res) => res.json())
      .then((d) => {
        setData(d.dailyBriefing);
        setCostData(d.costMetrics);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">03 // DAILY BRIEFING</h2>
          <p className="text-xs text-zinc-500 font-mono">Resumo executivo inteligente do que ocorreu no pipeline enquanto esteve ausente.</p>
        </div>
      </div>

      {data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main summary card */}
          <div className="md:col-span-2 border border-border bg-surface-2 rounded-lg p-6 space-y-4">
            <h3 className="text-xs font-mono font-bold text-accent uppercase tracking-wider">Atividade Geral</h3>
            <p className="text-sm font-sans text-foreground/80 leading-relaxed">{data.summary}</p>

            <div className="pt-4 border-t border-border space-y-2">
              <h4 className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Destaques Principais</h4>
              {data.highlights?.map((h: any) => (
                <div key={h.id} className="text-xs font-mono text-muted-foreground flex items-start gap-2">
                  <span className="text-success">✓</span>
                  <span>{h.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats card */}
          <div className="border border-border bg-surface-2 rounded-lg p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-mono font-bold text-accent uppercase tracking-wider">Indicadores de Conversão</h3>
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Taxa de Sucesso</span>
                  <span className="text-success font-bold">{data.stats?.successRate}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Vídeos Publicados</span>
                  <span className="text-white font-bold">{data.stats?.publishedCount}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Jobs Abandonados</span>
                  <span className="text-danger font-bold">{data.stats?.rejectedCount}</span>
                </div>
              </div>
              
              {/* Cost Metrics inside Stats Card */}
              {costData && (
                <div className="pt-2">
                  <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Monitoramento de Custos</h3>
                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-muted-foreground">Gasto Hoje</span>
                      <span className="text-white font-bold">${costData.todayUsd}</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-muted-foreground">Média (7 dias)</span>
                      <span className="text-white font-bold">${costData.avg7dUsd}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="text-[9px] text-muted-foreground font-mono border-t border-border mt-4 pt-3">
              Métricas computadas de forma automatizada pelo Learning Center.
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground font-mono py-12 text-center">Carregando briefing...</div>
      )}
    </div>
  );
}
