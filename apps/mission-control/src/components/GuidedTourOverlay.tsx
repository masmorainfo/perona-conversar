'use client';

import React, { useEffect, useState } from 'react';

type TourState = {
  step: number;
  title: string;
  content: string;
};

export function GuidedTourOverlay() {
  const [state, setState] = useState<TourState | null>(null);
  const [loading, setLoading] = useState(false);

  // Poll for state changes
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('/api/tour');
        if (res.ok) {
          const data = await res.json();
          setState(data);
        }
      } catch (err) {
        console.error('Error fetching tour state:', err);
      }
    };
    
    fetchState();
    const interval = setInterval(fetchState, 1500); // Check every 1.5s
    return () => clearInterval(interval);
  }, []);

  const handleAdvance = async () => {
    setLoading(true);
    try {
      await fetch('/api/tour', { method: 'POST' });
    } catch (err) {
      console.error('Error advancing tour:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!state || state.step === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '40px',
      right: '40px',
      width: '400px',
      backgroundColor: 'var(--cos-panel-bg)',
      border: '1px solid var(--cos-border)',
      borderRadius: '12px',
      padding: '24px',
      zIndex: 9999,
      boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: 'var(--cos-accent)',
          boxShadow: '0 0 10px var(--cos-accent)'
        }} />
        <h3 style={{ margin: 0, color: 'var(--cos-text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>
          {state.title}
        </h3>
      </div>
      
      <div style={{ color: 'var(--cos-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '24px', whiteSpace: 'pre-wrap' }}>
        {state.content}
      </div>
      
      <button 
        onClick={handleAdvance} 
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: 'var(--cos-accent)',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'wait' : 'pointer',
          fontWeight: 500,
          opacity: loading ? 0.7 : 1,
          transition: 'opacity 0.2s'
        }}
      >
        {loading ? 'Processando...' : 'Avançar para Próxima Etapa'}
      </button>
    </div>
  );
}
