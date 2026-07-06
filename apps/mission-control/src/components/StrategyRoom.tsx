import React from 'react';

export function StrategyRoom() {
  // Simulação de recomendações editoriais e janelas ideais encontradas pelo sistema
  const opportunities = [
    {
      id: 'o1',
      title: 'Alta demanda por tutoriais de Rust concorrente',
      confidence: 0.94,
      trendSource: 'Análise de engajamento externa via API',
      action: 'Recomendado injetar temas como "Rust Channels e Select na prática".'
    },
    {
      id: 'o2',
      title: 'Melhor horário de postagem identificado: Terças às 19:00',
      confidence: 0.88,
      trendSource: 'Histórico de visualizações do canal',
      action: 'Adicionado no optimalPostingTimes.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">06 // STRATEGY ROOM</h2>
          <p className="text-xs text-zinc-500 font-mono">Recomendações estratégicas baseadas em dados históricos do canal e tendências externas.</p>
        </div>
      </div>

      <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 space-y-4">
        <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">Oportunidades Editoriais Detectadas</h3>
        <div className="space-y-4">
          {opportunities.map((o) => (
            <div key={o.id} className="bg-[#18181b]/50 border border-[#1e1e2e] rounded-lg p-5 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center text-zinc-500">
                <span>Grau de Confiança: {(o.confidence * 100).toFixed(0)}%</span>
                <span className="bg-[#89b4fa]/20 text-[#89b4fa] px-2 py-0.5 rounded text-[10px] font-bold">RECOMENDAÇÃO</span>
              </div>
              <h4 className="text-white text-sm font-bold">{o.title}</h4>
              <p className="text-zinc-400">{o.action}</p>
              <div className="text-zinc-500 text-[10px]">Origem: {o.trendSource}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
