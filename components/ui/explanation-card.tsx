'use client';

import { CardHeader, CountBadge } from './card-layout';
import { extractSafetyNotes, SafetyCallout } from './safety-callout';
import type { ExplanationCardData } from '@/lib/ai/response-schema';

export function ExplanationCard({ data }: { data: ExplanationCardData }) {
  const keyPoints = data.keyPoints ?? [];
  const safetyNotes = extractSafetyNotes([data.summary, ...keyPoints]);

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <CardHeader
        eyebrow="Explanation"
        title={data.title}
        meta={
          keyPoints.length > 0 && (
            <CountBadge>
              {keyPoints.length} point{keyPoints.length !== 1 ? 's' : ''}
            </CountBadge>
          )
        }
      />
      <div className="border-border border-b px-4 py-3 sm:px-5">
        <p className="text-text-secondary text-[13px] leading-relaxed sm:text-sm">{data.summary}</p>
      </div>

      <div className="divide-border space-y-0 divide-y">
        {keyPoints.map((point, i) => (
          <div
            key={`${point}-${i}`}
            className={`animate-fade-in-up flex gap-3.5 px-4 py-3.5 stagger-${Math.min(i + 1, 6)} sm:px-5`}
          >
            <span className="bg-accent/10 text-accent mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
              {i + 1}
            </span>
            <p className="text-text-primary text-[13px] leading-relaxed sm:text-sm">{point}</p>
          </div>
        ))}
      </div>
      <SafetyCallout notes={safetyNotes} />
    </div>
  );
}
