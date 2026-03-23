'use client';

import type { RecommendationCardData } from '@/lib/ai/response-schema';

export function RecommendationCard({ data }: { data: RecommendationCardData }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm">
      <div className="divide-y divide-border">
        {data.items.map((item, i) => (
          <div
            key={i}
            className={`px-5 py-4 animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="text-sm font-semibold text-text-primary sm:text-base">
              {item.name}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
              {item.reason}
            </p>
          </div>
        ))}
      </div>

      {data.highlights.length > 0 && (
        <div className="border-t border-border bg-success/[0.04] px-5 py-4">
          <div className="mb-2.5 text-[11px] tracking-wider text-success/70 uppercase">
            Highlights
          </div>
          <ul className="space-y-1.5">
            {data.highlights.map((h, i) => (
              <li key={i} className="flex gap-2 text-sm text-success/90">
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
