'use client';

import { CardHeader, CountBadge } from './card-layout';
import { extractSafetyNotes, SafetyCallout } from './safety-callout';
import type { RecommendationCardData } from '@/lib/ai/response-schema';

export function RecommendationCard({ data }: { data: RecommendationCardData }) {
  const items = data.items ?? [];
  const safetyNotes = extractSafetyNotes([
    ...items.map((item) => item.reason),
    ...(data.highlights ?? []),
  ]);

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <CardHeader
        eyebrow="Recommendations"
        title="Recommended options"
        meta={
          items.length > 0 && (
            <CountBadge>
              {items.length} option{items.length !== 1 ? 's' : ''}
            </CountBadge>
          )
        }
      />
      <div className="divide-border divide-y">
        {items.map((item, i) => (
          <div
            key={`${item.name}-${i}`}
            className={`animate-fade-in-up px-4 py-4 stagger-${Math.min(i + 1, 6)} sm:px-5`}
          >
            <div className="text-text-primary text-[13px] font-semibold sm:text-base">
              {item.name}
            </div>
            <p className="text-text-secondary mt-1.5 text-[13px] leading-relaxed sm:text-sm">
              {item.reason}
            </p>
          </div>
        ))}
      </div>

      {(data.highlights ?? []).length > 0 && (
        <div className="border-border bg-success/[0.04] border-t px-4 py-4 sm:px-5">
          <div className="text-success/70 mb-2.5 text-[11px] tracking-wider uppercase">
            Highlights
          </div>
          <ul className="space-y-1.5">
            {(data.highlights ?? []).map((h, i) => (
              <li key={`${h}-${i}`} className="text-success/90 flex gap-2 text-[13px] sm:text-sm">
                <span className="mt-0.5">+</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SafetyCallout notes={safetyNotes} />
    </div>
  );
}
