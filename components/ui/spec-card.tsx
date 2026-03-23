'use client';

import { useState } from 'react';
import type { SpecCardData } from '@/lib/ai/response-schema';

export function SpecCard({ data }: { data: SpecCardData }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = data.optionalDetails && data.optionalDetails.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-accent sm:text-lg">{data.title}</h3>
        {data.subtitle && (
          <p className="mt-1 text-sm text-text-muted">{data.subtitle}</p>
        )}
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        {data.keySpecs.map((spec, i) => (
          <div
            key={spec.label}
            className={`bg-surface-1/80 px-5 py-3 animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="text-[11px] tracking-wider text-text-muted uppercase">
              {spec.label}
            </div>
            <div className="mt-1 font-mono text-sm font-medium text-text-primary">
              {spec.value}
            </div>
          </div>
        ))}
      </div>

      {hasDetails && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center gap-1 border-t border-border px-5 py-2.5 text-xs text-accent transition hover:bg-surface-2/50"
          >
            {expanded ? 'Hide details' : 'Show details'}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              <polyline points="3,4.5 6,7.5 9,4.5" />
            </svg>
          </button>
          {expanded && (
            <div className="grid gap-px bg-border border-t border-border sm:grid-cols-2 animate-card-expand">
              {data.optionalDetails!.map((detail) => (
                <div key={detail.label} className="bg-surface-2/60 px-5 py-3">
                  <div className="text-[11px] tracking-wider text-text-muted uppercase">
                    {detail.label}
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">{detail.value}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
