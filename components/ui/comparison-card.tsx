'use client';

import type { ComparisonCardData } from '@/lib/ai/response-schema';

export function ComparisonCard({ data }: { data: ComparisonCardData }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="flex border-b border-border">
        <div className="w-1/3 px-4 py-2.5 text-[11px] tracking-wider text-text-muted uppercase" />
        {data.items.map((item) => (
          <div key={item} className="flex-1 px-4 py-2.5 text-center text-sm font-semibold text-accent">
            {item}
          </div>
        ))}
      </div>

      <div className="divide-y divide-border">
        {data.attributes.map((attr) => (
          <div key={attr.name} className="flex">
            <div className="w-1/3 px-4 py-2.5 text-xs text-text-muted">{attr.name}</div>
            {attr.values.map((val, i) => (
              <div key={i} className="flex-1 px-4 py-2.5 text-center font-mono text-sm text-text-primary">
                {val}
              </div>
            ))}
          </div>
        ))}
      </div>

      {data.keyDifferences.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 text-[11px] tracking-wider text-text-muted uppercase">Key differences</div>
          <ul className="space-y-1">
            {data.keyDifferences.map((diff, i) => (
              <li key={i} className="text-sm text-text-secondary">
                <span className="mr-1.5 text-accent">-</span>{diff}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
