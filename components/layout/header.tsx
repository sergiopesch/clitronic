'use client';

type ViewMode = 'chat' | 'terminal' | 'split';

interface HeaderProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function Header({ viewMode, setViewMode }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <span className="text-xl">&#9889;</span>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Clitronic</h1>
        <span className="hidden rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 sm:inline dark:bg-blue-900 dark:text-blue-200">
          Hardware Companion
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
        <button
          onClick={() => setViewMode('chat')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === 'chat'
              ? 'bg-blue-600 text-white'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setViewMode('split')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === 'split'
              ? 'bg-blue-600 text-white'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          Split
        </button>
        <button
          onClick={() => setViewMode('terminal')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === 'terminal'
              ? 'bg-blue-600 text-white'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          Terminal
        </button>
      </div>
    </header>
  );
}
