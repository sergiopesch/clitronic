'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { ChatContainer } from '@/components/chat/chat-container';
import { TerminalPanel } from '@/components/terminal/terminal-panel';

type ViewMode = 'chat' | 'terminal' | 'split';

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  return (
    <div className="flex h-screen flex-col">
      <Header viewMode={viewMode} setViewMode={setViewMode} />
      <main className="flex min-h-0 flex-1">
        {/* Chat panel */}
        {(viewMode === 'chat' || viewMode === 'split') && (
          <div
            className={`flex flex-col ${viewMode === 'split' ? 'w-1/2 border-r border-zinc-200 dark:border-zinc-700' : 'w-full'}`}
          >
            <ChatContainer />
          </div>
        )}

        {/* Terminal panel */}
        {(viewMode === 'terminal' || viewMode === 'split') && (
          <div className={`flex flex-col ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
            <TerminalPanel />
          </div>
        )}
      </main>
    </div>
  );
}
