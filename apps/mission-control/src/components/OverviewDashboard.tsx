import React, { useState, useEffect } from 'react';

export function OverviewDashboard({ channels, contentUnits }: { channels: any[], contentUnits: any[] }) {
  const [cognitiveData, setCognitiveData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/cognitive')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setCognitiveData(data);
      })
      .catch(err => console.error(err));
  }, []);

  const totalProcessed = contentUnits.length;
  const inProgress = contentUnits.filter(c => !['PUBLISHED', 'LEARNED', 'REJECTED', 'ABANDONED'].includes(c.state)).length;
  const published = contentUnits.filter(c => ['PUBLISHED', 'LEARNED'].includes(c.state)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">00 // OVERVIEW</h2>
          <p className="text-xs text-zinc-500 font-mono">Visão geral do ecossistema e decisões pendentes.</p>
        </div>
      </div>

      {/* Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-surface-2 border border-border flex flex-col gap-2 relative overflow-hidden group hover:border-success/50 transition-colors">
          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
            <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(166,227,161,0.8)]" />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Unidades Totais</span>
          <span className="text-3xl font-bold font-mono text-white">{totalProcessed}</span>
        </div>
        <div className="p-4 rounded-lg bg-surface-2 border border-border flex flex-col gap-2 relative overflow-hidden group hover:border-warning/50 transition-colors">
          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
            <div className="w-2 h-2 rounded-full bg-warning shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Em Progresso</span>
          <span className="text-3xl font-bold font-mono text-white">{inProgress}</span>
        </div>
        <div className="p-4 rounded-lg bg-surface-2 border border-border flex flex-col gap-2 relative overflow-hidden group hover:border-info/50 transition-colors">
           <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
            <div className="w-2 h-2 rounded-full bg-info shadow-[0_0_8px_rgba(137,180,250,0.8)]" />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Publicados</span>
          <span className="text-3xl font-bold font-mono text-white">{published}</span>
        </div>
        <div className="p-4 rounded-lg bg-surface-2 border border-border flex flex-col gap-2 relative overflow-hidden group hover:border-danger/50 transition-colors">
          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
            <div className="w-2 h-2 rounded-full bg-danger shadow-[0_0_8px_rgba(220,20,60,0.8)]" />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Custo Hoje</span>
          <span className="text-3xl font-bold font-mono text-white">
            ${cognitiveData?.costMetrics?.todayUsd || '0.00'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pulso do Dia */}
        <div className="bg-surface-2 border border-border rounded-lg p-5">
           <h3 className="text-sm font-bold font-mono text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">Pulso do Dia</h3>
           <p className="text-sm text-foreground/80 leading-relaxed font-sans">
             {cognitiveData?.dailyBriefing?.summary || 'Carregando resumo...'}
           </p>
           {cognitiveData?.dailyBriefing?.highlights && cognitiveData.dailyBriefing.highlights.length > 0 && (
             <div className="mt-4 space-y-2">
               {cognitiveData.dailyBriefing.highlights.map((h: any) => (
                 <div key={h.id} className="text-xs font-mono text-muted-foreground flex gap-2 items-start">
                   <span className="mt-1 text-accent">—</span>
                   <span>{h.text}</span>
                 </div>
               ))}
             </div>
           )}
        </div>

        {/* Decisões Pendentes */}
        <div className="bg-surface-2 border border-border rounded-lg p-5">
           <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
             <h3 className="text-sm font-bold font-mono text-muted-foreground uppercase tracking-wider">Decisões Pendentes (Telegram)</h3>
             {cognitiveData?.pendingDecisions?.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-warning/20 text-warning text-[10px] font-bold shadow-[0_0_10px_rgba(212,175,55,0.2)]">
                  {cognitiveData.pendingDecisions.length} REQUER AÇÃO
                </span>
             )}
           </div>
           
           {!cognitiveData ? (
             <div className="text-xs font-mono text-muted-foreground flex h-32 items-center justify-center">Carregando banco de dados...</div>
           ) : cognitiveData.pendingDecisions?.length === 0 ? (
             <div className="text-sm text-muted-foreground p-6 text-center bg-background/50 rounded border border-border border-dashed h-32 flex flex-col justify-center">
               <p className="font-mono">Nenhuma decisão pendente na fila.</p>
               <p className="text-[10px] mt-1 opacity-50">O pipeline está limpo.</p>
             </div>
           ) : (
             <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
               {cognitiveData.pendingDecisions.map((dec: any) => (
                 <div key={dec.id} className="flex gap-4 bg-background/50 p-3 rounded-lg border border-border hover:border-accent/50 transition-colors">
                   {dec.thumbnail ? (
                     <img src={dec.thumbnail} alt={dec.topic} className="w-20 h-28 object-cover rounded shadow-md border border-border" />
                   ) : (
                     <div className="w-20 h-28 bg-surface-1 rounded flex items-center justify-center text-[10px] font-mono text-muted-foreground text-center p-1 border border-border">
                       Sem Thumb
                     </div>
                   )}
                   <div className="flex-1 flex flex-col justify-between">
                     <div>
                       <div className="flex justify-between items-start gap-2">
                         <h4 className="font-bold text-sm line-clamp-1 text-white">{dec.topic}</h4>
                         {dec.score !== null && (
                           <span className="text-[10px] font-mono px-1.5 py-0.5 bg-surface-1 rounded border border-border whitespace-nowrap">
                             Score: <span className="text-accent">{dec.score}</span>
                           </span>
                         )}
                       </div>
                       <p className="text-xs text-muted-foreground mt-1 line-clamp-3 font-sans">
                         {dec.summary}
                       </p>
                     </div>
                     <a 
                       href="https://t.me/KairoBot" 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="self-start text-[10px] font-bold font-mono text-background bg-accent hover:bg-white uppercase tracking-wider mt-2 flex items-center gap-1 px-3 py-1.5 rounded transition-colors shadow-[0_0_10px_rgba(212,175,55,0.3)]"
                     >
                       Decidir no Telegram 
                       <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                       </svg>
                     </a>
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
