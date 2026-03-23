'use client';

export function TextResponse({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
      <p className="text-sm leading-relaxed text-text-primary">{text}</p>
    </div>
  );
}
