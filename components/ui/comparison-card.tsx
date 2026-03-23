'use client';

import type { ComparisonCardData } from '@/lib/ai/response-schema';

export function ComparisonCard({ data }: { data: ComparisonCardData }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm">
      {/* Header row with item names */}
      <div className="flex border-b border-border">
        <div className="w-2/5 px-5 py-3" />
        {data.items.map((item) => (
          <div
            key={item}
            className="flex-1 px-4 py-3 text-center text-sm font-semibold text-accent"
          >
            {item}
          </div>
        ))}
      </div>

      {/* Attribute rows */}
      <div className="divide-y divide-border">
        {data.attributes.map((attr, i) => (
          <div
            key={attr.name}
            className={`flex animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="w-2/5 px-5 py-3 text-xs text-text-muted">{attr.name}</div>
            {attr.values.map((val, j) => (
              <div
                key={j}
                className="flex-1 px-4 py-3 text-center font-mono text-sm text-text-primary"
              >
                {val}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Use cases */}
      {data.useCases && data.useCases.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <div className="mb-2.5 text-[11px] tracking-wider text-success/70 uppercase">
            Best for
          </div>
          <div className="space-y-2">
            {data.useCases.map((uc, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="font-medium text-text-primary">{uc.item}:</span>
                <span className="text-text-secondary">{uc.useCase}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key differences */}
      {data.keyDifferences.length > 0 && (
        <div className="border-t border-border bg-accent/[0.03] px-5 py-4">
          <div className="mb-2.5 text-[11px] tracking-wider text-accent/70 uppercase">
            Key differences
          </div>
          <ul className="space-y-1.5">
            {data.keyDifferences.map((diff, i) => (
              <li key={i} className="flex gap-2 text-sm text-text-secondary">
                <span className="mt-0.5 text-accent">-</span>
                <span>{diff}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
