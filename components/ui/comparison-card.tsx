'use client';

import type { ComparisonCardData } from '@/lib/ai/response-schema';

export function ComparisonCard({ data }: { data: ComparisonCardData }) {
  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      {/* Header row with item names */}
      <div className="border-border flex border-b">
        <div className="w-2/5 px-5 py-3" />
        {(data.items ?? []).map((item) => (
          <div
            key={item}
            className="text-accent flex-1 px-4 py-3 text-center text-sm font-semibold"
          >
            {item}
          </div>
        ))}
      </div>

      {/* Attribute rows */}
      <div className="divide-border divide-y">
        {(data.attributes ?? []).map((attr, i) => (
          <div key={attr.name} className={`animate-fade-in-up flex stagger-${Math.min(i + 1, 6)}`}>
            <div className="text-text-muted w-2/5 px-5 py-3 text-xs">{attr.name}</div>
            {(attr.values ?? []).map((val, j) => (
              <div
                key={j}
                className="text-text-primary flex-1 px-4 py-3 text-center font-mono text-sm"
              >
                {val}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Use cases */}
      {data.useCases && data.useCases.length > 0 && (
        <div className="border-border border-t px-5 py-4">
          <div className="text-success/70 mb-2.5 text-[11px] tracking-wider uppercase">
            Best for
          </div>
          <div className="space-y-2">
            {data.useCases.map((uc, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="text-text-primary font-medium">{uc.item}:</span>
                <span className="text-text-secondary">{uc.useCase}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key differences */}
      {(data.keyDifferences ?? []).length > 0 && (
        <div className="border-border bg-accent/[0.03] border-t px-5 py-4">
          <div className="text-accent/70 mb-2.5 text-[11px] tracking-wider uppercase">
            Key differences
          </div>
          <ul className="space-y-1.5">
            {(data.keyDifferences ?? []).map((diff, i) => (
              <li key={i} className="text-text-secondary flex gap-2 text-sm">
                <span className="text-accent mt-0.5">-</span>
                <span>{diff}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
