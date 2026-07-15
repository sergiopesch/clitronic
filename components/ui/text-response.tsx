'use client';

export function TextResponse({ text }: { text: string }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border px-4 py-3.5 backdrop-blur-sm sm:px-5 sm:py-4"
    >
      <p className="text-text-primary text-[13px] leading-relaxed sm:text-base">{text}</p>
    </div>
  );
}
