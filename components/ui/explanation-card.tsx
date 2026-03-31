'use client';

import type { ExplanationCardData } from '@/lib/ai/response-schema';

export function ExplanationCard({ data }: { data: ExplanationCardData }) {
  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <div className="border-border border-b px-4 py-4 sm:px-5">
        <h3 className="text-accent text-base font-semibold sm:text-lg">{data.title}</h3>
        <p className="text-text-secondary mt-2 text-sm leading-relaxed">{data.summary}</p>
      </div>

      <div className="divide-border space-y-0 divide-y">
        {(data.keyPoints ?? []).map((point, i) => (
          <div
            key={`${point}-${i}`}
            className={`animate-fade-in-up flex gap-3.5 px-4 py-3.5 stagger-${Math.min(i + 1, 6)} sm:px-5`}
          >
            <span className="bg-accent/10 text-accent mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
              {i + 1}
            </span>
            <p className="text-text-primary text-sm leading-relaxed">{point}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
