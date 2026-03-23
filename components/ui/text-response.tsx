'use client';

import { useEffect, useState } from 'react';

export function TextResponse({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, 12);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="rounded-2xl border border-border bg-surface-1/80 px-5 py-4 backdrop-blur-sm">
      <p className="text-sm leading-relaxed text-text-primary sm:text-base">
        {displayed}
        {!done && (
          <span className="ml-0.5 inline-block h-4 w-[2px] bg-accent animate-cursor-blink" />
        )}
      </p>
    </div>
  );
}
