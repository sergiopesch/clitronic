'use client';

import { useState } from 'react';
import { CardHeader, CountBadge, DisclosureToggle } from './card-layout';
import { extractSafetyNotes, SafetyCallout } from './safety-callout';
import type { TroubleshootingCardData } from '@/lib/ai/response-schema';

const COLLAPSED_CHECK_LIMIT = 5;

export function TroubleshootingCard({ data }: { data: TroubleshootingCardData }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const steps = data.steps ?? [];
  const tips = data.tips ?? [];
  const shouldCollapse = steps.length > COLLAPSED_CHECK_LIMIT;
  const visibleSteps = shouldCollapse && !expanded ? steps.slice(0, COLLAPSED_CHECK_LIMIT) : steps;
  const hiddenCheckCount = Math.max(steps.length - COLLAPSED_CHECK_LIMIT, 0);
  const safetyNotes = extractSafetyNotes([
    data.issue,
    ...steps.flatMap((step) => [step.label, step.detail]),
    ...tips,
  ]);
  const progress = steps.length > 0 ? Math.round((checked.size / steps.length) * 100) : 0;

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <CardHeader
        eyebrow="Troubleshooting"
        title={data.issue}
        meta={
          <CountBadge>
            {steps.length} check{steps.length !== 1 ? 's' : ''}
          </CountBadge>
        }
        action={
          <div className="relative flex h-10 w-10 items-center justify-center" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-border"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${progress * 0.942} 100`}
                strokeLinecap="round"
                className="text-success transition-all duration-300"
                transform="rotate(-90 18 18)"
              />
            </svg>
            <span className="text-text-muted absolute font-mono text-[10px]">
              {checked.size}/{steps.length}
            </span>
          </div>
        }
      />

      <SafetyCallout notes={safetyNotes} />

      <div className="divide-border divide-y">
        {visibleSteps.map((step, i) => (
          <button
            key={`${step.label}-${i}`}
            type="button"
            onClick={() => toggle(i)}
            aria-pressed={checked.has(i)}
            className={`hover:bg-surface-2/40 animate-fade-in-up flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors stagger-${Math.min(i + 1, 6)} sm:px-5`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                checked.has(i)
                  ? 'border-success bg-success/20 text-success scale-110'
                  : 'border-border hover:border-text-muted text-transparent'
              }`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="2,6 5,9 10,3" />
              </svg>
            </span>
            <div className="flex-1">
              <div
                className={`text-[13px] font-medium transition-all sm:text-sm ${
                  checked.has(i) ? 'text-text-muted line-through' : 'text-text-primary'
                }`}
              >
                {step.label}
              </div>
              <p className="text-text-muted mt-0.5 text-xs leading-relaxed">{step.detail}</p>
            </div>
          </button>
        ))}
      </div>

      <DisclosureToggle
        expanded={expanded}
        hiddenCount={hiddenCheckCount}
        itemSingular="check"
        itemPlural="checks"
        onClick={() => setExpanded((current) => !current)}
      />

      {tips.length > 0 && (
        <div className="border-border bg-accent/[0.03] border-t px-4 py-4 sm:px-5">
          <div className="text-accent/70 mb-2.5 text-[11px] tracking-wider uppercase">Tips</div>
          <ul className="space-y-1.5">
            {tips.map((tip, i) => (
              <li key={`${tip}-${i}`} className="text-text-secondary text-xs leading-relaxed">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
