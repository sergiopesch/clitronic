'use client';

import { useState } from 'react';
import type { TroubleshootingCardData } from '@/lib/ai/response-schema';

export function TroubleshootingCard({ data }: { data: TroubleshootingCardData }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[11px] tracking-wider text-warning uppercase">Troubleshooting</div>
        <h3 className="mt-1 text-sm font-semibold text-text-primary">{data.issue}</h3>
      </div>

      <div className="divide-y divide-border">
        {data.steps.map((step, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                checked.has(i)
                  ? 'border-success bg-success/20 text-success'
                  : 'border-border text-text-muted'
              }`}
            >
              {checked.has(i) && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="2,6 5,9 10,3" />
                </svg>
              )}
            </span>
            <div>
              <div className={`text-sm font-medium ${checked.has(i) ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                {step.label}
              </div>
              <p className="mt-0.5 text-xs text-text-muted">{step.detail}</p>
            </div>
          </button>
        ))}
      </div>

      {data.tips.length > 0 && (
        <div className="border-t border-border bg-accent/5 px-4 py-3">
          <div className="mb-1.5 text-[11px] tracking-wider text-accent uppercase">Tips</div>
          <ul className="space-y-1">
            {data.tips.map((tip, i) => (
              <li key={i} className="text-xs text-text-secondary">{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
