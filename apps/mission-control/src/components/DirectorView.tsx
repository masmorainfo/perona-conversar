import React, { useState, useEffect } from 'react';

export function DirectorView() {
  const [directorData, setDirectorData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/director')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setDirectorData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono uppercase">04 // Director's Chair</h2>
          <p className="text-xs text-zinc-500 font-mono">Decisão artística e genes cinematográficos baseados no manifesto mais recente.</p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground font-mono text-sm border border-border border-dashed rounded-lg bg-surface-1">
          Aguardando manifesto cinematográfico...
        </div>
      ) : !directorData || !directorData.manifest ? (
        <div className="p-8 text-center text-muted-foreground font-mono text-sm border border-border border-dashed rounded-lg bg-surface-1">
          Nenhum manifesto recente encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Direction */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-surface-2 border border-border rounded-lg p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <svg className="w-24 h-24 text-accent" fill="currentColor" viewBox="0 0 24 24">
                   <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                </svg>
              </div>
              
              <h3 className="text-xs font-bold font-mono text-muted-foreground uppercase tracking-wider mb-2">Hipótese Emocional</h3>
              <p className="text-lg font-serif italic text-white mb-6 border-l-2 border-accent pl-4">
                "{directorData.manifest.emotionalHypothesis || 'Não definida'}"
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Arquétipo</span>
                  <span className="text-sm font-bold font-mono text-accent bg-accent/10 px-2 py-1 rounded inline-block">
                    {directorData.manifest.archetype || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block mb-1">Ritmo (Pacing)</span>
                  <span className="text-sm font-bold font-mono text-white bg-surface-1 px-2 py-1 rounded inline-block border border-border">
                    {directorData.manifest.pacing || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Scenes/Storyboard info (if available) */}
            <div className="bg-surface-2 border border-border rounded-lg p-6">
              <h3 className="text-sm font-bold font-mono text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">Estrutura Narrativa (Storyboard)</h3>
              
              {directorData.manifest.scenes && directorData.manifest.scenes.length > 0 ? (
                <div className="space-y-4">
                  {directorData.manifest.scenes.map((scene: any, idx: number) => (
                    <div key={idx} className="flex gap-4 p-3 bg-background/50 rounded border border-border">
                      <div className="font-mono text-xl font-bold text-muted-foreground opacity-50">
                        {(idx + 1).toString().padStart(2, '0')}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="text-xs font-bold font-mono text-white uppercase">{scene.type || 'Cena'}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{scene.duration || '0s'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-sans">{scene.narrative || scene.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-muted-foreground">Cenas não detalhadas no manifesto.</p>
              )}
            </div>
          </div>

          {/* Genes DNA */}
          <div className="space-y-6">
            <div className="bg-surface-2 border border-border rounded-lg p-6">
              <h3 className="text-sm font-bold font-mono text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2 flex items-center justify-between">
                DNA Ativo
                <span className="text-[10px] bg-danger/20 text-danger px-1.5 py-0.5 rounded">LEI ZERO</span>
              </h3>
              
              {directorData.manifest.selectedGenes && directorData.manifest.selectedGenes.length > 0 ? (
                <div className="space-y-3">
                  {directorData.manifest.selectedGenes.map((gene: any, idx: number) => (
                    <div key={idx} className="bg-background/80 p-3 rounded border border-border text-xs">
                      <div className="font-bold font-mono text-accent mb-1">{gene.name || gene.id || gene}</div>
                      {gene.description && <p className="text-muted-foreground font-sans line-clamp-2">{gene.description}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-muted-foreground">Nenhum gene específico injetado nesta narrativa.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
