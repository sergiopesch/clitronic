'use client';

import type { ExplanationCardData } from '@/lib/ai/response-schema';

export function ExplanationCard({ data }: { data: ExplanationCardData }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-accent sm:text-lg">{data.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{data.summary}</p>
      </div>

      <div className="space-y-0 divide-y divide-border">
        {data.keyPoints.map((point, i) => (
          <div
            key={i}
            className={`flex gap-3.5 px-5 py-3.5 animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed text-text-primary">{point}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
