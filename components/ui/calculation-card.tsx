'use client';

import type { CalculationCardData } from '@/lib/ai/response-schema';

export function CalculationCard({ data }: { data: CalculationCardData }) {
  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <div className="border-border border-b px-5 py-4">
        <h3 className="text-accent text-base font-semibold sm:text-lg">{data.title}</h3>
        <div className="bg-surface-0/60 text-text-secondary mt-2 rounded-xl px-4 py-2.5 font-mono text-xs sm:text-sm">
          {data.formula}
        </div>
      </div>

      <div className="bg-border grid gap-px sm:grid-cols-2">
        {data.inputs.map((input, i) => (
          <div
            key={input.label}
            className={`bg-surface-1/80 animate-fade-in-up px-5 py-3 stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="text-text-muted text-[11px] tracking-wider uppercase">
              {input.label}
            </div>
            <div className="text-text-primary mt-1 font-mono text-sm font-medium">
              {input.value}
            </div>
          </div>
        ))}
      </div>

      <div className="border-success/20 bg-success/[0.04] animate-fade-in-up border-t px-5 py-4">
        <div className="text-success/70 text-[11px] tracking-wider uppercase">
          {data.result.label}
        </div>
        <div className="text-success mt-1.5 font-mono text-xl font-bold sm:text-2xl">
          {data.result.value}
        </div>
        {data.result.note && (
          <p className="text-text-muted mt-2 text-xs leading-relaxed">{data.result.note}</p>
        )}
      </div>
    </div>
  );
}
