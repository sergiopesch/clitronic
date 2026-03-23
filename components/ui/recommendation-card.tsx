'use client';

import type { RecommendationCardData } from '@/lib/ai/response-schema';

export function RecommendationCard({ data }: { data: RecommendationCardData }) {
  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <div className="divide-border divide-y">
        {data.items.map((item, i) => (
          <div key={i} className={`animate-fade-in-up px-5 py-4 stagger-${Math.min(i + 1, 6)}`}>
            <div className="text-text-primary text-sm font-semibold sm:text-base">{item.name}</div>
            <p className="text-text-secondary mt-1.5 text-sm leading-relaxed">{item.reason}</p>
          </div>
        ))}
      </div>

      {data.highlights.length > 0 && (
        <div className="border-border bg-success/[0.04] border-t px-5 py-4">
          <div className="text-success/70 mb-2.5 text-[11px] tracking-wider uppercase">
            Highlights
          </div>
          <ul className="space-y-1.5">
            {data.highlights.map((h, i) => (
              <li key={i} className="text-success/90 flex gap-2 text-sm">
                <span className="mt-0.5">+</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
