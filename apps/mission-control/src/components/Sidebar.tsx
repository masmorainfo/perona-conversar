import React, { useState } from 'react';
import Link from 'next/link';

export function Sidebar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const sections = [
    {
      title: 'Observe',
      items: [
        { id: 'command', label: '01 // Command Center' },
        { id: 'supervisor', label: '02 // Supervisor status' },
      ],
    },
    {
      title: 'Think',
      items: [
        { id: 'briefing', label: '03 // Daily Briefing' },
        { id: 'strategy', label: '04 // Strategy Room' },
      ],
    },
    {
      title: 'Act',
      items: [
        { id: 'review', label: '05 // Review Queue', href: '/review' },
        { id: 'channels', label: '06 // Channels Editor' },
        { id: 'sandbox', label: '07 // Content Sandbox' },
      ],
    },
    {
      title: 'Learn',
      items: [
        { id: 'learning', label: '08 // Learning Center' },
      ],
    },
    {
      title: 'Explain',
      items: [
        { id: 'pipeline', label: '09 // Pipeline inspector' },
        { id: 'conversations', label: '10 // Agent Chats' },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Top Navbar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background z-30 w-full shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-accent to-info flex items-center justify-center font-bold text-background text-xs shadow-md shadow-accent/20">
            C
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-foreground font-mono">COS CONTROL</h1>
            <p className="text-[9px] text-muted-foreground font-mono">OP // ACTIVE</p>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors"
          aria-label="Toggle Menu"
        >
          {isMobileOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Menu Backdrop Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-30 md:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Main Sidebar Aside */}
      <aside className={`
        ${isMobileOpen ? 'fixed inset-y-0 left-0 w-64 z-40 flex shadow-2xl border-r border-border bg-background animate-in slide-in-from-left duration-200' : 'hidden'} 
        md:flex md:static md:w-64 md:border-r md:border-border md:bg-background flex-col justify-between select-none shrink-0 h-full
      `}>
        <div className="flex flex-col">
          {/* Workspace Brand Header */}
          <div className="p-6 border-b border-border flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-accent to-info flex items-center justify-center font-bold text-background text-xs shadow-md shadow-accent/20">
              C
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide text-foreground font-mono">COS CONTROL</h1>
              <p className="text-[10px] text-muted-foreground font-mono">OPERATIONAL COGNITIVE // UP</p>
            </div>
          </div>

          {/* Navigation Sectioned List */}
          <nav className="p-4 space-y-4">
            {sections.map((sec) => (
              <div key={sec.title} className="space-y-1">
                <h3 className="px-3 text-[10px] font-bold text-muted-foreground font-mono uppercase tracking-wider">
                  {sec.title}
                </h3>
                {sec.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const className = `w-full text-left px-3 py-1.5 rounded-md text-xs font-mono transition-all duration-200 border ${
                    isActive
                      ? 'bg-surface-1 text-accent border-accent/20 font-semibold shadow-inner'
                      : 'text-zinc-400 hover:text-foreground hover:bg-surface-1/50 border-transparent'
                  }`;

                  const handleClick = () => {
                    setActiveTab(item.id);
                    setIsMobileOpen(false); // Close sidebar on tap on mobile
                  };

                  if (item.href) {
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={className}
                        onClick={() => setIsMobileOpen(false)}
                      >
                        {item.label}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={handleClick}
                      className={className}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-border text-[10px] font-mono text-muted-foreground flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span>COGNITIVE LAYER: ACTIVE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span>SYS HEALTH: OK</span>
          </div>
        </div>
      </aside>
    </>
  );
}
