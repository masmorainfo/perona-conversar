import React, { useState } from 'react';

export function CommandCenter({
  channels,
  contentUnits,
  transitions,
  onInject,
}: {
  channels: any[];
  contentUnits: any[];
  transitions: any[];
  onInject: (channelId: string, topic: string) => Promise<void>;
}) {
  const [command, setCommand] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [injecting, setInjecting] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command || !selectedChannel) return;
    setInjecting(true);

    const logMsg = `> Executando comando: "${command}"...`;
    setTerminalOutput((prev) => [logMsg, ...prev]);

    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, channelId: selectedChannel }),
      });
      const data = await res.json();
      if (res.ok) {
        setTerminalOutput((prev) => [`✓ ${data.message}`, ...prev]);
        setCommand('');
        onInject('', ''); // Trigger status refresh
      } else {
        setTerminalOutput((prev) => [`🚨 Erro: ${data.error}`, ...prev]);
      }
    } catch (err: any) {
      setTerminalOutput((prev) => [`🚨 Erro de rede: ${err.message}`, ...prev]);
    } finally {
      setInjecting(false);
    }
  };

  // Calcular contagens de estado básicas
  const counts = contentUnits.reduce((acc: any, curr: any) => {
    acc[curr.state] = (acc[curr.state] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground font-mono">01 // COMMAND CENTER</h2>
          <p className="text-xs text-muted-foreground font-mono">Console operacional principal do Content Operating System.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns: AI Console & Stream */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Command Console */}
          <div className="border border-border bg-card rounded-lg p-6 space-y-4">
            <h3 className="text-xs font-mono font-semibold text-accent uppercase tracking-wider">AI Command Console</h3>
            <form onSubmit={handleCommandSubmit} className="space-y-4">
              <div className="flex gap-4">
                <select
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  className="bg-surface-2 border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  required
                >
                  <option value="">Selecione o canal</option>
                  {channels.map((chan) => (
                    <option key={chan.id} value={chan.id}>
                      {chan.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Escreva um comando. Ex: injetar Como funcionam ponteiros em Go..."
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="flex-1 bg-surface-2 border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  required
                />
              </div>

              <div className="flex justify-between items-center">
                <div className="text-[10px] text-muted-foreground font-mono">
                  Dica: digite <span className="text-accent">"injetar [Tema]"</span> para iniciar o pipeline
                </div>
                <button
                  type="submit"
                  disabled={injecting}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold font-mono text-xs px-4 py-2 rounded-md transition-all duration-200 shadow-lg shadow-primary/10 disabled:opacity-50"
                >
                  {injecting ? 'EXECUTANDO...' : 'EXECUTAR COMANDO'}
                </button>
              </div>
            </form>

            {/* Console Terminal Outputs */}
            {terminalOutput.length > 0 && (
              <div className="bg-surface-2/30 border border-border rounded-md p-4 max-h-32 overflow-y-auto font-mono text-[11px] space-y-1 text-muted-foreground">
                {terminalOutput.map((log, idx) => (
                  <div key={idx}>{log}</div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed / Global Timeline */}
          <div className="border border-border bg-card rounded-lg p-6 space-y-4">
            <h3 className="text-xs font-mono font-semibold text-accent uppercase tracking-wider">Global Timeline</h3>
            <div className="space-y-3 max-h-90 overflow-y-auto pr-2">
              {transitions.length === 0 ? (
                <div className="text-xs text-muted-foreground font-mono py-8 text-center">Nenhum evento registrado ainda.</div>
              ) : (
                transitions.map((t) => (
                  <div key={t.id} className="text-xs font-mono border-b border-border pb-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">[{new Date(t.transitioned_at).toLocaleTimeString()}]</span>
                      <span className="text-info font-bold">{t.actor}</span>
                    </div>
                    <div className="text-foreground/80">
                      Tópico: <span className="text-foreground font-medium">{t.topic}</span>
                    </div>
                    <div className="text-[11px]">
                      <span className="text-muted-foreground">{t.from_state}</span>
                      <span className="text-muted-foreground mx-2">→</span>
                      <span className="text-success font-semibold">{t.to_state}</span>
                      {t.reason && <span className="text-muted-foreground ml-2">({t.reason})</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Telemetry & Alert Center */}
        <div className="space-y-6">
          {/* Alert Center */}
          <div className="border border-border bg-card rounded-lg p-6 space-y-4">
            <h3 className="text-xs font-mono font-semibold text-accent uppercase tracking-wider">Alert Center</h3>
            <div className="space-y-2 font-mono text-[11px]">
              <div className="flex justify-between items-center bg-surface-2/50 border border-border rounded-md p-2">
                <span className="text-foreground/90">Banco de Dados (Postgres)</span>
                <span className="text-success font-bold">ONLINE</span>
              </div>
              <div className="flex justify-between items-center bg-surface-2/50 border border-border rounded-md p-2">
                <span className="text-foreground/90">Fila de Jobs (Redis)</span>
                <span className="text-success font-bold">ONLINE</span>
              </div>
              <div className="flex justify-between items-center bg-surface-2/50 border border-border rounded-md p-2">
                <span className="text-foreground/90">Tavily Web Search API</span>
                <span className="text-success font-bold">ONLINE</span>
              </div>
            </div>
          </div>

          <div className="border border-border bg-card rounded-lg p-6 space-y-4">
            <h3 className="text-xs font-mono font-semibold text-accent uppercase tracking-wider">Pipeline Telemetry</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-2/50 border border-border rounded-md p-3 text-center">
                <div className="text-muted-foreground font-mono text-[10px]">PUBLISHED</div>
                <div className="text-2xl font-bold text-success font-mono mt-1">{counts['PUBLISHED'] || 0}</div>
              </div>
              <div className="bg-surface-2/50 border border-border rounded-md p-3 text-center">
                <div className="text-muted-foreground font-mono text-[10px]">IN PROGRESS</div>
                <div className="text-2xl font-bold text-info font-mono mt-1">
                  {Object.keys(counts).filter(k => k !== 'PUBLISHED' && k !== 'ABANDONED' && k !== 'REJECTED').reduce((a, b) => a + counts[b], 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

