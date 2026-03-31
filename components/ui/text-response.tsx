'use client';

import { useEffect, useMemo, useState } from 'react';

function getWordDelay(token: string): number {
  const baseDelay = 185;
  const trimmed = token.trim();
  if (!trimmed) return baseDelay;
  if (/[.?!]$/.test(trimmed)) return baseDelay + 170;
  if (/[,:;]$/.test(trimmed)) return baseDelay + 90;
  return baseDelay;
}

export function TextResponse({ text }: { text: string }) {
  const tokens = useMemo(() => text.match(/\S+\s*/g) ?? [], [text]);
  const [visibleWords, setVisibleWords] = useState(0);

  useEffect(() => {
    if (tokens.length === 0) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let nextIndex = 0;

    const step = () => {
      if (cancelled) return;
      nextIndex += 1;
      setVisibleWords(nextIndex);

      if (nextIndex >= tokens.length) return;
      timeoutId = window.setTimeout(step, getWordDelay(tokens[nextIndex - 1] ?? ''));
    };

    timeoutId = window.setTimeout(step, getWordDelay(tokens[0] ?? ''));
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [tokens]);

  const displayed = tokens.slice(0, visibleWords).join('');
  const done = visibleWords >= tokens.length;

  return (
    <div
      aria-live="polite"
      className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border px-4 py-3.5 backdrop-blur-sm sm:px-5 sm:py-4"
    >
      {!done && (
        <div className="mb-3 flex items-end gap-[3px] opacity-65">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={`text-wave-${i}`}
              className="bg-success/25 inline-block w-[2px] rounded-full"
              style={{
                height: `${3 + ((i * 5) % 7)}px`,
                animation: 'thinking-dots 1.05s ease-in-out infinite',
                animationDelay: `${i * 55}ms`,
              }}
            />
          ))}
        </div>
      )}
      <p className="text-text-primary text-[13px] leading-relaxed sm:text-base">
        {displayed}
        {!done && (
          <span className="bg-accent animate-cursor-blink ml-0.5 inline-block h-4 w-[2px]" />
        )}
      </p>
    </div>
  );
}
