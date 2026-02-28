'use client';

import { useState } from 'react';
import { useApiKey } from './api-key-provider';
import { ApiKeyModal } from './api-key-modal';

export function ApiKeyIndicator() {
  const { isConfigured } = useApiKey();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Hide indicator once API key is configured
  if (isConfigured) {
    return <ApiKeyModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />;
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-amber-700 shadow-lg transition-all hover:scale-105 hover:bg-amber-200"
        title="Configure API Key"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
        <span className="text-sm font-medium">Set API Key</span>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
        </span>
      </button>

      <ApiKeyModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
