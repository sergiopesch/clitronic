'use client';

import type { ComparisonCardData } from '@/lib/ai/response-schema';

export function ComparisonCard({ data }: { data: ComparisonCardData }) {
  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      {/* Mobile layout: stacked rows to avoid horizontal overflow */}
      <div className="divide-border divide-y sm:hidden">
        {(data.attributes ?? []).map((attr, i) => (
          <div
            key={`${attr.name}-mobile-${i}`}
            className={`animate-fade-in-up px-4 py-3.5 stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="text-text-muted text-[11px] tracking-wider uppercase">{attr.name}</div>
            <div className="mt-2 space-y-1.5">
              {(data.items ?? []).map((item, idx) => (
                <div
                  key={`${attr.name}-${item}-mobile-${idx}`}
                  className="bg-surface-2/50 border-border/60 rounded-lg border px-2.5 py-2"
                >
                  <div className="text-accent text-[11px] font-semibold">{item}</div>
                  <div className="text-text-primary mt-0.5 font-mono text-xs break-words">
                    {attr.values?.[idx] ?? '-'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tablet/Desktop layout: table-like compare view */}
      <div className="hidden overflow-x-auto sm:block">
        <div className="min-w-[560px]">
          {/* Header row with item names */}
          <div className="border-border flex border-b">
            <div className="w-2/5 px-4 py-3 sm:px-5" />
            {(data.items ?? []).map((item) => (
              <div
                key={item}
                className="text-accent flex-1 px-3 py-3 text-center text-xs font-semibold break-words sm:px-4 sm:text-sm"
              >
                {item}
              </div>
            ))}
          </div>

          {/* Attribute rows */}
          <div className="divide-border divide-y">
            {(data.attributes ?? []).map((attr, i) => (
              <div
                key={`${attr.name}-${i}`}
                className={`animate-fade-in-up flex stagger-${Math.min(i + 1, 6)}`}
              >
                <div className="text-text-muted w-2/5 px-4 py-3 text-xs break-words sm:px-5">
                  {attr.name}
                </div>
                {(attr.values ?? []).map((val, j) => (
                  <div
                    key={`${attr.name}-${j}-${val}`}
                    className="text-text-primary flex-1 px-3 py-3 text-center font-mono text-xs break-words sm:px-4 sm:text-sm"
                  >
                    {val}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Use cases */}
      {data.useCases && data.useCases.length > 0 && (
        <div className="border-border border-t px-4 py-4 sm:px-5">
          <div className="text-success/70 mb-2.5 text-[11px] tracking-wider uppercase">
            Best for
          </div>
          <div className="space-y-2">
            {data.useCases.map((uc, i) => (
              <div key={`${uc.item}-${i}`} className="flex gap-2 text-sm">
                <span className="text-text-primary font-medium">{uc.item}:</span>
                <span className="text-text-secondary">{uc.useCase}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key differences */}
      {(data.keyDifferences ?? []).length > 0 && (
        <div className="border-border bg-accent/[0.03] border-t px-4 py-4 sm:px-5">
          <div className="text-accent/70 mb-2.5 text-[11px] tracking-wider uppercase">
            Key differences
          </div>
          <ul className="space-y-1.5">
            {(data.keyDifferences ?? []).map((diff, i) => (
              <li key={`${diff}-${i}`} className="text-text-secondary flex gap-2 text-sm">
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
