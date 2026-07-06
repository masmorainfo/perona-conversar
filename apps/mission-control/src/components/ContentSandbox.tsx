import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

export function ContentSandbox({ contentUnits }: { contentUnits: any[] }) {
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState<any>(null);
  const [editorValue, setEditorValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contentUnits.length > 0 && !selectedId) {
      setSelectedId(contentUnits[0].id);
    }
  }, [contentUnits, selectedId]);

  useEffect(() => {
    if (selectedId) {
      fetch(`/api/content/${selectedId}`)
        .then((res) => res.json())
        .then((resData) => {
          setData(resData);
          const script = resData.contentUnit?.metadata?.script || { title: '', hook: '', body: [], cta: '' };
          setEditorValue(JSON.stringify(script, null, 2));
        });
    }
  }, [selectedId]);

  const handleSave = async () => {
    if (!selectedId || !data?.contentUnit) return;
    setSaving(true);
    try {
      const parsedScript = JSON.parse(editorValue);
      const updatedMetadata = {
        ...data.contentUnit.metadata,
        script: parsedScript,
      };

      const res = await fetch(`/api/content/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: updatedMetadata,
        }),
      });

      if (res.ok) {
        alert('Roteiro atualizado com sucesso no sandbox!');
      } else {
        alert('Erro ao atualizar o roteiro.');
      }
    } catch (e: any) {
      alert('Erro de validação do JSON: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">04 // CONTENT SANDBOX</h2>
          <p className="text-xs text-zinc-500 font-mono">Espaço de curadoria, inspeção de logs dos agentes e intervenção manual no roteiro.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Left list of content units */}
        <div className="col-span-1 border border-[#1e1e2e] bg-[#09090b] rounded-lg p-4 space-y-2 max-h-[500px] overflow-y-auto pr-2">
          <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider mb-3">Conteúdos Recentes</h3>
          {contentUnits.map((cu) => (
            <button
              key={cu.id}
              onClick={() => setSelectedId(cu.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono border transition-all duration-200 ${
                selectedId === cu.id
                  ? 'bg-[#18181b] border-[#cba6f7]/20 text-[#cba6f7] font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-[#18181b]/50'
              }`}
            >
              <div className="truncate">{cu.topic}</div>
              <div className="text-[10px] text-zinc-500 mt-1">{cu.state}</div>
            </button>
          ))}
        </div>

        {/* Right Sandbox Inspector */}
        <div className="col-span-3 space-y-6">
          {data && (
            <>
              {/* Unit Info card */}
              <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="bg-[#89b4fa]/20 text-[#89b4fa] font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {data.contentUnit.state}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-2 font-mono">{data.contentUnit.topic}</h3>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono text-zinc-400">
                  <div>Canal: <span className="text-white">{data.contentUnit.channel_name || 'Desconhecido'}</span></div>
                  <div>ID: <span className="text-white text-[10px]">{data.contentUnit.id}</span></div>
                </div>
              </div>

              {/* Monaco script editor */}
              <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">
                    Editor de Roteiro (Script JSON)
                  </h3>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold font-mono text-xs px-4 py-2 rounded-md transition-all duration-200 shadow-lg shadow-[#cba6f7]/10 disabled:opacity-50"
                  >
                    {saving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}
                  </button>
                </div>

                <div className="border border-[#1e1e2e] rounded-lg overflow-hidden h-[300px]">
                  <Editor
                    height="100%"
                    defaultLanguage="json"
                    theme="vs-dark"
                    value={editorValue}
                    onChange={(value) => setEditorValue(value || '')}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      fontFamily: 'Fira Code, JetBrains Mono, Courier New, monospace',
                      tabSize: 2,
                    }}
                  />
                </div>
              </div>

              {/* Logs / Transitions list */}
              <div className="border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 space-y-4">
                <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">
                  Timeline de Transições
                </h3>
                <div className="space-y-3 font-mono text-xs">
                  {data.transitions?.map((t: any) => (
                    <div key={t.id} className="border-b border-[#18181b] pb-2 flex flex-col gap-1">
                      <div className="flex items-center justify-between text-zinc-500">
                        <span>[{new Date(t.transitioned_at).toLocaleString()}]</span>
                        <span className="text-[#89b4fa] font-bold">{t.actor}</span>
                      </div>
                      <div>
                        Transição: <span className="text-zinc-400">{t.from_state}</span> → <span className="text-[#a6e3a1] font-semibold">{t.to_state}</span>
                      </div>
                      {t.reason && <div className="text-zinc-500 text-[11px]">Motivo: {t.reason}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
