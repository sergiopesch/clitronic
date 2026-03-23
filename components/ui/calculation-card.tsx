'use client';

import type { CalculationCardData } from '@/lib/ai/response-schema';

export function CalculationCard({ data }: { data: CalculationCardData }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-accent">{data.title}</h3>
        <div className="mt-1.5 rounded-lg bg-surface-0/60 px-3 py-2 font-mono text-xs text-text-secondary">
          {data.formula}
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        {data.inputs.map((input) => (
          <div key={input.label} className="bg-surface-1 px-4 py-2.5">
            <div className="text-[11px] tracking-wider text-text-muted uppercase">{input.label}</div>
            <div className="mt-0.5 font-mono text-sm text-text-primary">{input.value}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-success/5 px-4 py-3">
        <div className="text-[11px] tracking-wider text-success uppercase">{data.result.label}</div>
        <div className="mt-1 font-mono text-lg font-semibold text-success">{data.result.value}</div>
        {data.result.note && (
          <p className="mt-1 text-xs text-text-muted">{data.result.note}</p>
        )}
      </div>
    </div>
  );
}
