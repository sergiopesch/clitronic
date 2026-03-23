'use client';

import { useState } from 'react';
import type { SpecCardData } from '@/lib/ai/response-schema';

export function SpecCard({ data }: { data: SpecCardData }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = data.optionalDetails && data.optionalDetails.length > 0;

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <div className="border-border border-b px-5 py-4">
        <h3 className="text-accent text-base font-semibold sm:text-lg">{data.title}</h3>
        {data.subtitle && <p className="text-text-muted mt-1 text-sm">{data.subtitle}</p>}
      </div>

      <div className="bg-border grid gap-px sm:grid-cols-2">
        {(data.keySpecs ?? []).map((spec, i) => (
          <div
            key={spec.label}
            className={`bg-surface-1/80 animate-fade-in-up px-5 py-3 stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="text-text-muted text-[11px] tracking-wider uppercase">{spec.label}</div>
            <div className="text-text-primary mt-1 font-mono text-sm font-medium">{spec.value}</div>
          </div>
        ))}
      </div>

      {hasDetails && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="border-border text-accent hover:bg-surface-2/50 flex w-full items-center justify-center gap-1 border-t px-5 py-2.5 text-xs transition"
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
            <div className="bg-border border-border animate-card-expand grid gap-px border-t sm:grid-cols-2">
              {data.optionalDetails!.map((detail) => (
                <div key={detail.label} className="bg-surface-2/60 px-5 py-3">
                  <div className="text-text-muted text-[11px] tracking-wider uppercase">
                    {detail.label}
                  </div>
                  <div className="text-text-secondary mt-1 text-sm">{detail.value}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
