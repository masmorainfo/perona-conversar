import React, { useState } from 'react';

export function ReviewQueue({ channels, contentUnits, onAction }: { channels: any[], contentUnits: any[], onAction: () => void }) {
  const pendingUnits = contentUnits.filter(u => u.state === 'PENDING_REVIEW');
  const processingUnits = contentUnits.filter(u => !['PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ABANDONED', 'LEARNED', 'PUBLISHED_PARTIAL'].includes(u.state));
  const publishedUnits = contentUnits.filter(u => ['PUBLISHED', 'PUBLISHED_PARTIAL'].includes(u.state));
  
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scriptBody, setScriptBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openInspection = (unit: any) => {
    setSelectedUnit(unit);
    setTitle(unit.metadata?.script?.title || unit.topic);
    setDescription(unit.metadata?.script?.description || '');
    setScriptBody(
      unit.metadata?.script?.body?.map((sec: any) => sec.content).join('\n\n') || ''
    );
  };

  const closeInspection = () => {
    setSelectedUnit(null);
  };

  const handleAction = async (action: string) => {
    if (!selectedUnit) return;
    setIsSubmitting(true);
    
    // For editing, we might want to reconstruct the script body in a basic way
    // or just pass the text back. For simplicity, we can pass metadata updates.
    // In a real scenario, updating the script array requires mapping it back, but 
    // since this is just an MVP interface for the prototype:
    const updatedMetadata = {
      ...selectedUnit.metadata,
      script: {
        ...selectedUnit.metadata?.script,
        title,
        description,
        // Optional: rebuild body if edited. This assumes single block.
        body: [{ id: 'edited', content: scriptBody, durationSeconds: 0 }]
      }
    };

    try {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: selectedUnit.id,
          channelId: selectedUnit.channel_id,
          action,
          metadata: action === 'approve' ? updatedMetadata : undefined,
          reason: action === 'reject' ? 'Rejeitado manualmente na fila de revisão.' : undefined
        }),
      });
      closeInspection();
      onAction();
    } catch (err) {
      console.error('Failed to submit review action:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAutoPublish = async (channel: any) => {
    try {
      const newStrategy = { ...channel.strategy, autoPublish: !channel.strategy?.autoPublish };
      await fetch(`/api/channels/${channel.slug || channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: newStrategy }),
      });
      onAction();
    } catch (err) {
      console.error('Failed to toggle auto publish:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Summary Metrics */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-border pb-4 sm:pb-6 gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono flex items-center gap-3">
            05 // REVIEW QUEUE
            {pendingUnits.length > 0 && (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
              </span>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground font-mono mt-1">Human-in-the-Loop: Decisão final sobre o conteúdo gerado.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex gap-4">
            <div className="flex flex-col items-end">
              <span className="text-xl sm:text-2xl font-bold text-accent leading-none">{pendingUnits.length}</span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Aguardando</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xl sm:text-2xl font-bold text-info leading-none">{processingUnits.length}</span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Em Processo</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xl sm:text-2xl font-bold text-success leading-none">{publishedUnits.length}</span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Publicados</span>
            </div>
          </div>

          {/* Toggle Auto Publish */}
          {channels.length > 0 && (
            <div className="flex items-center gap-3 pl-4 sm:pl-6 border-l border-border">
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex flex-col">
                <span>Automação Total</span>
                <span className="text-foreground font-semibold">{channels[0].name}</span>
              </span>
              <button 
                onClick={() => toggleAutoPublish(channels[0])}
                className={`w-10 sm:w-12 h-5 sm:h-6 rounded-full relative transition-colors shadow-inner ${channels[0].strategy?.autoPublish ? 'bg-success' : 'bg-muted'}`}
                aria-label="Toggle Auto Publish"
              >
                <div className={`w-3.5 sm:w-4 h-3.5 sm:h-4 bg-white rounded-full absolute top-0.5 transition-transform shadow-md ${channels[0].strategy?.autoPublish ? 'translate-x-6 sm:translate-x-7' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Queue Content */}
      {pendingUnits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-muted-foreground border border-border rounded-3xl bg-gradient-to-b from-surface-1/40 to-background/40 backdrop-blur-sm shadow-inner">
          <div className="w-20 h-20 mb-6 rounded-full bg-surface-2/50 flex items-center justify-center border border-border ring-1 ring-border">
            <svg className="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-medium font-mono text-foreground mb-2 tracking-wide">Fila Limpa</p>
          <p className="text-sm text-muted-foreground">Nenhum conteúdo aguardando sua decisão no momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {pendingUnits.map(unit => {
            const editorialReason = unit.metadata?.editorialReason || 'Motivo não especificado.';
            const score = unit.metadata?.editorialScore ? Math.round(unit.metadata.editorialScore * 100) : null;
            const channel = channels.find(c => c.id === unit.channel_id);
            return (
              <div key={unit.id} className="group border border-border bg-surface-2/60 backdrop-blur-md rounded-2xl p-6 flex flex-col gap-5 shadow-lg transition-all hover:border-accent/50 hover:shadow-accent/20 hover:-translate-y-1 hover:bg-surface-2">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <span className="inline-block px-2.5 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] text-muted-foreground uppercase font-mono tracking-wider mb-3">
                      {channel?.name || 'Canal'}
                    </span>
                    <h3 className="font-bold text-base text-foreground leading-tight line-clamp-2 font-sans">{unit.topic}</h3>
                  </div>
                  {score && (
                    <div className="shrink-0 flex flex-col items-center justify-center bg-black/40 border border-white/5 rounded-lg p-2 min-w-[3rem]">
                      <span className="text-xs font-mono text-muted-foreground mb-0.5">SCORE</span>
                      <span className={`text-sm font-bold font-mono ${score >= 80 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-danger'}`}>
                        {score}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 flex flex-col gap-2 p-3 bg-surface-1/50 rounded-xl border border-white/5">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-mono flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Veredito da IA
                  </div>
                  <p className="text-sm text-foreground/80 line-clamp-3 leading-relaxed font-sans">{editorialReason}</p>
                </div>

                <button
                  onClick={() => openInspection(unit)}
                  className="w-full mt-2 bg-accent/10 hover:bg-accent text-accent hover:text-primary-foreground font-bold py-3 rounded-xl transition-all border border-accent/30 hover:border-accent shadow-sm flex items-center justify-center gap-2"
                >
                  <span>INSPECIONAR</span>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspection Modal - Professional Editor Layout */}
      {selectedUnit && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-1 sm:p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-[98vw] h-[98vh] sm:h-[95vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-border">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-surface-1/80 shrink-0">
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="px-2 py-0.5 bg-accent text-primary-foreground text-[10px] font-extrabold uppercase tracking-widest rounded-sm font-mono shadow-[0_0_10px_rgba(203,166,247,0.4)] animate-pulse shrink-0">
                      Review Mode
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono truncate">
                      {channels.find(c => c.id === selectedUnit.channel_id)?.name || 'Canal'}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-lg font-bold text-foreground leading-tight truncate max-w-xs sm:max-w-2xl font-sans">{selectedUnit.topic}</h3>
                </div>
              </div>
              <button onClick={closeInspection} className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-full transition-colors shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body - 60/40 Split */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden bg-black/40">
              
              {/* Left Column (60%): Media Player & AI Rationale */}
              <div className="w-full lg:w-3/5 flex flex-col border-b lg:border-b-0 lg:border-r border-border shrink-0 lg:shrink">
                
                {/* Massive Media Player */}
                <div className="aspect-video w-full lg:aspect-auto lg:flex-1 min-h-[200px] sm:min-h-[300px] lg:min-h-0 relative flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed p-2 sm:p-6 overflow-hidden bg-black/20">
                  {/* Subtle vignette effect */}
                  <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/60 pointer-events-none"></div>
                  
                  {selectedUnit.metadata?.videoUrl || selectedUnit.metadata?.videoFile ? (
                    <video 
                      src={selectedUnit.metadata?.videoUrl || `/media/${selectedUnit.metadata?.videoFile?.split('/').pop()}`} 
                      controls 
                      className="w-full h-full max-h-[40vh] lg:max-h-[70vh] object-contain drop-shadow-2xl z-10"
                    />
                  ) : (
                    <div className="aspect-[9/16] h-[30vh] sm:h-[50vh] lg:h-[60vh] bg-surface-1 rounded-2xl flex flex-col items-center justify-center text-muted-foreground border border-border shadow-2xl z-10 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-20"></div>
                      <svg className="w-12 h-12 sm:w-16 sm:h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs sm:text-sm font-mono tracking-widest uppercase">Mídia Ausente</span>
                    </div>
                  )}
                </div>

                {/* AI Rationale Panel (Docked at bottom of media) */}
                <div className="border-t border-border bg-surface-1/90 backdrop-blur-md p-4 sm:p-6 shrink-0 z-20">
                  <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                    {/* Score badge */}
                    <div className="shrink-0 flex sm:flex-col items-center justify-center bg-black/60 border border-border rounded-xl p-3 sm:p-4 min-w-[5rem] gap-2 sm:gap-0 shadow-inner w-full sm:w-auto">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:mb-1 font-mono">IA Score</span>
                      <span className="text-xl sm:text-2xl font-bold font-mono text-success ml-auto sm:ml-0">
                        {selectedUnit.metadata?.editorialScore ? (selectedUnit.metadata.editorialScore * 100).toFixed(0) : '--'}
                      </span>
                    </div>
                    {/* Reason text */}
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">Relatório Editorial</span>
                        <span className="sm:ml-auto text-[10px] text-muted-foreground font-mono w-full sm:w-auto">
                          Direção: <span className="text-foreground/80">{selectedUnit.metadata?.editorialDirection || 'Padrão'}</span>
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed font-serif italic border-l-2 border-accent/50 pl-3">
                        "{selectedUnit.metadata?.editorialReason || 'Motivo não especificado pela inteligência artificial.'}"
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column (40%): Workstation & Decision Panel */}
              <div className="w-full lg:w-2/5 flex flex-col bg-surface-1 border-t lg:border-t-0 lg:border-l border-border relative shrink-0">
                
                {/* Workstation (Scrollable form) */}
                <div className="flex-1 p-4 sm:p-6 space-y-4 sm:space-y-6">
                  
                  {/* Título */}
                  <div className="group">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase font-mono mb-2 tracking-widest group-focus-within:text-accent transition-colors">
                      Título da Publicação
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base font-semibold text-foreground focus:outline-none focus:border-accent/50 focus:bg-black/60 transition-all font-sans"
                    />
                  </div>

                  {/* Descrição */}
                  <div className="group">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase font-mono mb-2 tracking-widest group-focus-within:text-accent transition-colors">
                      Legenda e Hashtags
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="w-full bg-black/40 border border-white/5 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-foreground/90 focus:outline-none focus:border-accent/50 focus:bg-black/60 transition-all resize-none leading-relaxed font-sans"
                    />
                  </div>

                  {/* Roteiro */}
                  <div className="group flex-1 flex flex-col">
                    <label className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase font-mono mb-2 tracking-widest group-focus-within:text-accent transition-colors">
                      Transcrição / Roteiro Base
                    </label>
                    <textarea
                      value={scriptBody}
                      onChange={(e) => setScriptBody(e.target.value)}
                      className="min-h-[150px] sm:min-h-[250px] w-full bg-black/40 border border-white/5 rounded-lg px-3 sm:px-4 py-2 sm:py-4 text-xs sm:text-sm text-foreground/80 focus:outline-none focus:border-accent/50 focus:text-foreground focus:bg-black/60 transition-all resize-none leading-relaxed font-serif"
                    />
                  </div>
                </div>

                {/* Decision Panel (Fixed at bottom of right column) */}
                <div className="border-t border-border bg-surface-2 p-4 sm:p-6 shadow-[0_-20px_40px_rgba(0,0,0,0.5)] z-20 shrink-0">
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handleAction('approve')}
                      disabled={isSubmitting}
                      className="w-full px-4 sm:px-6 py-3 sm:py-4 rounded-xl text-xs sm:text-sm font-black tracking-widest bg-accent text-primary-foreground hover:bg-white hover:scale-[1.01] active:scale-95 transition-all shadow-[0_0_20px_rgba(203,166,247,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-3 uppercase font-sans"
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processando...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Aprovar & Publicar
                        </>
                      )}
                    </button>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAction('regenerate')}
                        disabled={isSubmitting}
                        className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-[11px] font-bold uppercase tracking-widest bg-white/5 border border-white/5 text-muted-foreground hover:bg-warning/10 hover:text-warning hover:border-warning/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-sans"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Regerar
                      </button>
                      <button
                        onClick={() => handleAction('reject')}
                        disabled={isSubmitting}
                        className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-[11px] font-bold uppercase tracking-widest bg-white/5 border border-white/5 text-muted-foreground hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-sans"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Rejeitar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
