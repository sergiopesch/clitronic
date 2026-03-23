'use client';

import { useState } from 'react';
import type { SpecCardData } from '@/lib/ai/response-schema';

export function SpecCard({ data }: { data: SpecCardData }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = data.optionalDetails && data.optionalDetails.length > 0;

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-accent">{data.title}</h3>
        {data.subtitle && (
          <p className="mt-1 text-xs text-text-muted">{data.subtitle}</p>
        )}
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        {data.keySpecs.map((spec) => (
          <div key={spec.label} className="bg-surface-1 px-4 py-2.5">
            <div className="text-[11px] tracking-wider text-text-muted uppercase">{spec.label}</div>
            <div className="mt-0.5 font-mono text-sm text-text-primary">{spec.value}</div>
          </div>
        ))}
      </div>

      {hasDetails && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full border-t border-border px-4 py-2 text-left text-xs text-accent transition hover:bg-surface-2"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <div className="grid gap-px bg-border border-t border-border sm:grid-cols-2">
              {data.optionalDetails!.map((detail) => (
                <div key={detail.label} className="bg-surface-2 px-4 py-2.5">
                  <div className="text-[11px] tracking-wider text-text-muted uppercase">{detail.label}</div>
                  <div className="mt-0.5 text-sm text-text-secondary">{detail.value}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
