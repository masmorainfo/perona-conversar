import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

export function WorkspaceChannels({ channels }: { channels: any[] }) {
  const [selectedChannelSlug, setSelectedChannelSlug] = useState('');
  const [channelData, setChannelData] = useState<any>(null);
  const [editorValue, setEditorValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (channels.length > 0 && !selectedChannelSlug) {
      setSelectedChannelSlug(channels[0].slug);
    }
  }, [channels, selectedChannelSlug]);

  useEffect(() => {
    if (selectedChannelSlug) {
      fetch(`/api/channels/${selectedChannelSlug}`)
        .then((res) => res.json())
        .then((data) => {
          setChannelData(data);
          setEditorValue(JSON.stringify(data, null, 2));
        });
    }
  }, [selectedChannelSlug]);

  const handleSave = async () => {
    if (!selectedChannelSlug) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(editorValue);
      const res = await fetch(`/api/channels/${selectedChannelSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          core: parsed.core,
          strategy: parsed.strategy,
        }),
      });
      if (res.ok) {
        alert('Configurações do canal salvas com sucesso!');
      } else {
        alert('Erro ao salvar as configurações.');
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
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">03 // WORKSPACE CHANNELS</h2>
          <p className="text-xs text-zinc-500 font-mono">Cockpit de edição de identidades (persona, limits, prompts) em Monaco.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Left List */}
        <div className="col-span-1 border border-[#1e1e2e] bg-[#09090b] rounded-lg p-4 space-y-2">
          <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider mb-3">Lista de Canais</h3>
          {channels.map((chan) => (
            <button
              key={chan.id}
              onClick={() => setSelectedChannelSlug(chan.slug)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono border transition-all duration-200 ${
                selectedChannelSlug === chan.slug
                  ? 'bg-[#18181b] border-[#cba6f7]/20 text-[#cba6f7] font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-[#18181b]/50'
              }`}
            >
              {chan.name}
            </button>
          ))}
        </div>

        {/* Right Monaco Editor panel */}
        <div className="col-span-3 border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider">
              Configurações do Canal (JSON)
            </h3>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold font-mono text-xs px-4 py-2 rounded-md transition-all duration-200 shadow-lg shadow-[#cba6f7]/10 disabled:opacity-50"
            >
              {saving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}
            </button>
          </div>

          <div className="border border-[#1e1e2e] rounded-lg overflow-hidden h-[400px]">
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
      </div>
    </div>
  );
}
