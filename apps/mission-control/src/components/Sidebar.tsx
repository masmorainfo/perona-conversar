import React, { useState } from 'react';
import Link from 'next/link';

export function Sidebar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const sections = [
    {
      title: 'Observe',
      items: [
        { id: 'overview', label: '00 // Overview', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
        { id: 'command', label: '01 // Command Center', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { id: 'supervisor', label: '02 // Supervisor status', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
      ],
    },
    {
      title: 'Think',
      items: [
        { id: 'briefing', label: '03 // Daily Briefing', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H15M9 11l3 3L22 4' },
        { id: 'director', label: '04 // Director View', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
        { id: 'strategy', label: '05 // Strategy Room', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
      ],
    },
    {
      title: 'Act',
      items: [
        { id: 'review', label: '06 // Review Queue', href: '/review', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
        { id: 'channels', label: '07 // Channels Editor', icon: 'M4 6h16M4 12h16m-7 6h7' },
        { id: 'sandbox', label: '08 // Content Sandbox', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
      ],
    },
    {
      title: 'Learn',
      items: [
        { id: 'learning', label: '09 // Learning Center', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
      ],
    },
    {
      title: 'Explain',
      items: [
        { id: 'pipeline', label: '10 // Pipeline inspector', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
        { id: 'conversations', label: '11 // Agent Chats', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
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

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border flex items-center justify-around pb-safe">
        {sections.flatMap(s => s.items).slice(0, 5).map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center py-2 px-3 space-y-1 ${
              activeTab === item.id ? 'text-accent' : 'text-muted-foreground'
            }`}
          >
            {item.icon && (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
            )}
            <span className="text-[9px] font-mono leading-none truncate max-w-[60px]">{item.label.split(' // ')[1] || item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
