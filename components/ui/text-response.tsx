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
    <div className="border-border bg-surface-1/80 rounded-2xl border px-4 py-3.5 backdrop-blur-sm sm:px-5 sm:py-4">
      <p className="text-text-primary text-[13px] leading-relaxed sm:text-base">
        {displayed}
        {!done && (
          <span className="bg-accent animate-cursor-blink ml-0.5 inline-block h-4 w-[2px]" />
        )}
      </p>
    </div>
  );
}
