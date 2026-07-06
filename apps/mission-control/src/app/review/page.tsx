'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ReviewQueue } from '@/components/ReviewQueue';

export default function ReviewPage() {
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
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen lg:h-screen bg-[#09090b] text-[#fafafa] overflow-y-auto lg:overflow-hidden">
      <main className="flex-1 p-4 sm:p-8 relative flex flex-col gap-4">
        <div>
          <Link href="/" className="text-[#cba6f7] hover:underline font-mono text-sm">
            &larr; Voltar ao Mission Control
          </Link>
        </div>
        <ReviewQueue 
          channels={statusData.channels}
          contentUnits={statusData.contentUnits}
          onAction={fetchStatus}
        />
      </main>
    </div>
  );
}
