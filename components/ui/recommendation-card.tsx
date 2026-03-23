'use client';

import type { RecommendationCardData } from '@/lib/ai/response-schema';

export function RecommendationCard({ data }: { data: RecommendationCardData }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="divide-y divide-border">
        {data.items.map((item, i) => (
          <div key={i} className="px-4 py-3">
            <div className="text-sm font-semibold text-text-primary">{item.name}</div>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{item.reason}</p>
          </div>
        ))}
      </div>

      {data.highlights.length > 0 && (
        <div className="border-t border-border bg-success/5 px-4 py-3">
          <div className="mb-1.5 text-[11px] tracking-wider text-success uppercase">Highlights</div>
          <ul className="space-y-1">
            {data.highlights.map((h, i) => (
              <li key={i} className="text-sm text-success/90">
                <span className="mr-1.5">+</span>{h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
