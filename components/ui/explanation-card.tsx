'use client';

import type { ExplanationCardData } from '@/lib/ai/response-schema';

export function ExplanationCard({ data }: { data: ExplanationCardData }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-accent">{data.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{data.summary}</p>
      </div>

      <div className="px-4 py-3 space-y-2">
        {data.keyPoints.map((point, i) => (
          <div key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-[11px] text-accent">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed text-text-primary">{point}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
