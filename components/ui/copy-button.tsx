'use client';

import { useRef, useState } from 'react';

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export function CopyButton({
  text,
  label,
  copiedLabel = 'Copied',
  className = '',
}: {
  text: string;
  label: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  return (
    <button
      type="button"
      onClick={() => {
        void copyText(text).then(() => {
          setCopied(true);
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      className={`border-border bg-surface-2/70 text-text-muted hover:border-accent/30 hover:text-text-primary shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
