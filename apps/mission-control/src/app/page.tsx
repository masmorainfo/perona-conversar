'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { CommandCenter } from '@/components/CommandCenter';
import { PipelineView } from '@/components/PipelineView';
import { SupervisorConsole } from '@/components/SupervisorConsole';
import { AgentInspector } from '@/components/AgentInspector';
import { LearningCenter } from '@/components/LearningCenter';
import { StrategyRoom } from '@/components/StrategyRoom';
import { WorkspaceChannels } from '@/components/WorkspaceChannels';
import { ContentSandbox } from '@/components/ContentSandbox';
import { DailyBriefing } from '@/components/DailyBriefing';
import { AgentConversations } from '@/components/AgentConversations';
import { ReviewQueue } from '@/components/ReviewQueue';

export default function Home() {
  const [activeTab, setActiveTab] = useState('command');
  const [statusData, setStatusData] = useState<any>({
    channels: [],
    contentUnits: [],
    transitions: [],
  });

  const fetchStatus = () => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setStatusData(data);
        }
      })
      .catch((err) => console.error('Error fetching dashboard status:', err));
  };

  useEffect(() => {
    fetchStatus();
    // Poll telemetry every 2 seconds for real-time vibe
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleInject = async (channelId: string, topic: string) => {
    fetchStatus();
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#09090b] text-[#fafafa] overflow-hidden">
      {/* Sidebar navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Workspace content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        {activeTab === 'command' && (
          <CommandCenter
            channels={statusData.channels}
            contentUnits={statusData.contentUnits}
            transitions={statusData.transitions}
            onInject={handleInject}
          />
        )}

        {activeTab === 'pipeline' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white font-mono">08 // PIPELINE INSPECTOR</h2>
                <p className="text-xs text-zinc-500 font-mono">React Flow interativo com análise e depuração profunda de payloads.</p>
              </div>
            </div>
            <PipelineView contentUnits={statusData.contentUnits} />
          </div>
        )}

        {activeTab === 'supervisor' && <SupervisorConsole />}

        {activeTab === 'briefing' && <DailyBriefing />}

        {activeTab === 'strategy' && <StrategyRoom />}

        {activeTab === 'learning' && <LearningCenter />}

        {activeTab === 'conversations' && <AgentConversations />}

        {activeTab === 'channels' && (
          <WorkspaceChannels channels={statusData.channels} />
        )}



        {activeTab === 'sandbox' && (
          <ContentSandbox contentUnits={statusData.contentUnits} />
        )}
      </main>
    </div>
  );
}
