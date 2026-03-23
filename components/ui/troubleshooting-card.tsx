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

  const progress = data.steps.length > 0
    ? Math.round((checked.size / data.steps.length) * 100)
    : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] tracking-wider text-warning uppercase">
              Troubleshooting
            </div>
            <h3 className="mt-1 text-base font-semibold text-text-primary sm:text-lg">
              {data.issue}
            </h3>
          </div>
          {/* Progress ring */}
          <div className="flex h-10 w-10 items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-border"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${progress * 0.942} 100`}
                strokeLinecap="round"
                className="text-success transition-all duration-300"
                transform="rotate(-90 18 18)"
              />
            </svg>
            <span className="absolute font-mono text-[10px] text-text-muted">
              {checked.size}/{data.steps.length}
            </span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        {data.steps.map((step, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-surface-2/40 animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                checked.has(i)
                  ? 'border-success bg-success/20 text-success scale-110'
                  : 'border-border text-transparent hover:border-text-muted'
              }`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="2,6 5,9 10,3" />
              </svg>
            </span>
            <div className="flex-1">
              <div
                className={`text-sm font-medium transition-all ${
                  checked.has(i)
                    ? 'text-text-muted line-through'
                    : 'text-text-primary'
                }`}
              >
                {step.label}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
                {step.detail}
              </p>
            </div>
          </button>
        ))}
      </div>

      {data.tips.length > 0 && (
        <div className="border-t border-border bg-accent/[0.03] px-5 py-4">
          <div className="mb-2.5 text-[11px] tracking-wider text-accent/70 uppercase">
            Tips
          </div>
          <ul className="space-y-1.5">
            {data.tips.map((tip, i) => (
              <li key={i} className="text-xs leading-relaxed text-text-secondary">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
