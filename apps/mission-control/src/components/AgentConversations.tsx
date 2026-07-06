import React, { useState, useEffect } from 'react';

export function AgentConversations() {
  const [conversations, setConversations] = useState<any>(null);
  const [selectedContentId, setSelectedContentId] = useState('');

  useEffect(() => {
    fetch('/api/cognitive')
      .then((res) => res.json())
      .then((data) => {
        setConversations(data.agentConversations);
        const keys = Object.keys(data.agentConversations || {});
        if (keys.length > 0) {
          setSelectedContentId(keys[0]);
        }
      });
  }, []);

  const activeChat = conversations ? conversations[selectedContentId] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white font-mono">09 // AGENT CHATS (INTERNAL CONVERSATIONS)</h2>
          <p className="text-xs text-zinc-500 font-mono">Inspeção da comunicação interna e alinhamento de roteiros entre os agentes em tempo real.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Left Side: Active Content Jobs */}
        <div className="col-span-1 border border-[#1e1e2e] bg-[#09090b] rounded-lg p-4 space-y-2">
          <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider mb-3">Jobs com Conversação</h3>
          {conversations && Object.keys(conversations).map((id) => (
            <button
              key={id}
              onClick={() => setSelectedContentId(id)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono border transition-all duration-200 ${
                selectedContentId === id
                  ? 'bg-[#18181b] border-[#cba6f7]/20 text-[#cba6f7] font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-[#18181b]/50'
              }`}
            >
              <div className="truncate">Job: {id.slice(0, 8)}...</div>
              <div className="text-[10px] text-zinc-500 mt-1">Interação Script/Critic</div>
            </button>
          ))}
        </div>

        {/* Right Side: Chat box */}
        <div className="col-span-3 border border-[#1e1e2e] bg-[#09090b] rounded-lg p-6 flex flex-col justify-between h-[450px]">
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            <h3 className="text-xs font-mono font-semibold text-[#cba6f7] uppercase tracking-wider border-b border-[#18181b] pb-2">
              Internal Chat Log
            </h3>
            {activeChat?.map((msg: any, idx: number) => {
              const isCritic = msg.sender.includes('Critic');
              return (
                <div key={idx} className={`flex flex-col gap-1 max-w-[80%] font-mono text-xs ${isCritic ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                  <span className="text-[9px] text-zinc-500">{msg.sender}</span>
                  <div className={`p-3 rounded-lg leading-relaxed ${isCritic ? 'bg-[#cba6f7] text-black font-medium' : 'bg-[#18181b] border border-[#1e1e2e] text-zinc-200'}`}>
                    {msg.message}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[9px] text-zinc-600 font-mono border-t border-[#1e1e2e] pt-3">
            COS Engine // Comunicação privada estabelecida via filas BullMQ.
          </div>
        </div>
      </div>
    </div>
  );
}
