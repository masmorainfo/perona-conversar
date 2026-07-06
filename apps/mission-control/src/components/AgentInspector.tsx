import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

export function AgentInspector() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data) => {
        setAgents(data.agents);
        if (data.agents?.length > 0) {
          setSelectedAgentId(data.agents[0].id);
        }
      });
  }, []);

  const activeAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">04 // AGENT INSPECTOR</h2>
          <p className="text-xs text-zinc-500 font-mono">Status operacional dos agentes, latências, prompts de sistema e controle de custos.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Left Side: Agent list */}
        <div className="col-span-1 border border-[#1e1e2e] bg-[#09090b] rounded-lg p-4 space-y-2">
          <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider mb-3">Agentes Operacionais</h3>
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAgentId(a.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono border transition-all duration-200 ${
                selectedAgentId === a.id
                  ? 'bg-[#18181b] border-[#cba6f7]/20 text-[#cba6f7] font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-[#18181b]/50'
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        {/* Right Side: Details and Monaco prompt display */}
        <div className="col-span-3 space-y-6">
          {activeAgent && (
            <>
              {/* Telemetry card */}
              <div className="grid grid-cols-3 gap-4 font-mono text-xs">
                <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-4">
                  <div className="text-zinc-500">STATUS</div>
                  <div className="text-sm font-bold text-[#a6e3a1] mt-1">{activeAgent.status}</div>
                </div>
                <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-4">
                  <div className="text-zinc-500">CUSTO MÉDIO POR RUN</div>
                  <div className="text-sm font-bold text-white mt-1">${activeAgent.tokenCostUsd}</div>
                </div>
                <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-4">
                  <div className="text-zinc-500">LATÊNCIA MÉDIA</div>
                  <div className="text-sm font-bold text-white mt-1">{activeAgent.latencyMs}ms</div>
                </div>
              </div>

              {/* Prompt Editor (Read-Only prompt review in Monaco) */}
              <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 space-y-4">
                <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">
                  System Prompt do Agente ({activeAgent.name})
                </h3>
                <div className="border border-[#1e1e2e] rounded-lg overflow-hidden h-[300px]">
                  <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    theme="vs-dark"
                    value={activeAgent.prompt}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      fontFamily: 'Fira Code, JetBrains Mono, Courier New, monospace',
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
