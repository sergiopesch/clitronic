'use client';

import type { CalculationCardData } from '@/lib/ai/response-schema';

export function CalculationCard({ data }: { data: CalculationCardData }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-accent sm:text-lg">{data.title}</h3>
        <div className="mt-2 rounded-xl bg-surface-0/60 px-4 py-2.5 font-mono text-xs text-text-secondary sm:text-sm">
          {data.formula}
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        {data.inputs.map((input, i) => (
          <div
            key={input.label}
            className={`bg-surface-1/80 px-5 py-3 animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="text-[11px] tracking-wider text-text-muted uppercase">
              {input.label}
            </div>
            <div className="mt-1 font-mono text-sm font-medium text-text-primary">
              {input.value}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-success/20 bg-success/[0.04] px-5 py-4 animate-fade-in-up">
        <div className="text-[11px] tracking-wider text-success/70 uppercase">
          {data.result.label}
        </div>
        <div className="mt-1.5 font-mono text-xl font-bold text-success sm:text-2xl">
          {data.result.value}
        </div>
        {data.result.note && (
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            {data.result.note}
          </p>
        )}
      </div>
    </div>
  );
}
