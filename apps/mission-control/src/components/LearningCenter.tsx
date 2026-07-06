import React from 'react';

export function LearningCenter() {
  // Simulação de lições aprendidas pelo Learning Engine
  const learnings = [
    {
      id: 'l1',
      date: '2026-06-27T01:10:00Z',
      type: 'VOCABULARY_RESTRICTION',
      description: 'O público rejeitou o uso excessivo de termos formais no vídeo sobre Concorrencia. O termo "portanto" foi adicionado à lista de palavras proibidas do canal.',
      impact: 'Estratégia de canais e regras de persona atualizadas.'
    },
    {
      id: 'l2',
      date: '2026-06-27T00:45:00Z',
      type: 'ENGAGEMENT_OPTIMIZATION',
      description: 'Vídeos com duração acima de 120s retiveram 15% mais público. A duração ideal sugerida na estratégia foi expandida para [120s, 180s].',
      impact: 'Parâmetro optimalDurationSeconds modificado de forma adaptativa no registry.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">05 // LEARNING CENTER</h2>
          <p className="text-xs text-zinc-500 font-mono">Exposição de insights, diretrizes e regras que o sistema aprendeu de forma adaptativa.</p>
        </div>
      </div>

      <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 space-y-4">
        <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">Diretrizes Coletadas</h3>
        <div className="space-y-4">
          {learnings.map((l) => (
            <div key={l.id} className="bg-[#18181b]/50 border border-[#1e1e2e] rounded-lg p-5 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center text-zinc-500">
                <span>[{new Date(l.date).toLocaleString()}]</span>
                <span className="bg-[#cba6f7]/20 text-[#cba6f7] px-2 py-0.5 rounded text-[10px] font-bold">{l.type}</span>
              </div>
              <div className="text-zinc-200 text-sm leading-relaxed">{l.description}</div>
              <div className="text-zinc-500">
                Impacto: <span className="text-[#a6e3a1]">{l.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
