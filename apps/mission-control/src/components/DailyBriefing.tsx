import React, { useState, useEffect } from 'react';

export function DailyBriefing() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/cognitive')
      .then((res) => res.json())
      .then((d) => setData(d.dailyBriefing));
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
          <div className="md:col-span-2 border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 space-y-4">
            <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">Atividade Geral</h3>
            <p className="text-sm font-mono text-zinc-300 leading-relaxed">{data.summary}</p>

            <div className="pt-4 border-t border-[#18181b] space-y-2">
              <h4 className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Destaques Principais</h4>
              {data.highlights?.map((h: any) => (
                <div key={h.id} className="text-xs font-mono text-zinc-400 flex items-start gap-2">
                  <span className="text-[#a6e3a1]">✓</span>
                  <span>{h.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats card */}
          <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">Indicadores de Conversão</h3>
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-[#18181b] pb-2">
                  <span className="text-zinc-500">Taxa de Sucesso</span>
                  <span className="text-[#a6e3a1] font-bold">{data.stats?.successRate}</span>
                </div>
                <div className="flex justify-between border-b border-[#18181b] pb-2">
                  <span className="text-zinc-500">Vídeos Publicados</span>
                  <span className="text-white font-bold">{data.stats?.publishedCount}</span>
                </div>
                <div className="flex justify-between border-b border-[#18181b] pb-2">
                  <span className="text-zinc-500">Jobs Abandados</span>
                  <span className="text-red-400 font-bold">{data.stats?.rejectedCount}</span>
                </div>
              </div>
            </div>
            <div className="text-[9px] text-zinc-600 font-mono border-t border-[#1e1e2e] pt-3">
              Métricas computadas de forma automatizada pelo Learning Center.
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-500 font-mono py-12 text-center">Carregando briefing...</div>
      )}
    </div>
  );
}
