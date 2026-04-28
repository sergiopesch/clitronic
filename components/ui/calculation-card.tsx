'use client';

import { CardHeader } from './card-layout';
import { CopyButton } from './copy-button';
import { extractSafetyNotes, SafetyCallout } from './safety-callout';
import type { CalculationCardData } from '@/lib/ai/response-schema';

export function CalculationCard({ data }: { data: CalculationCardData }) {
  const resultText = `${data.result.label}: ${data.result.value}${
    data.result.note ? `\n${data.result.note}` : ''
  }`;
  const safetyNotes = extractSafetyNotes([
    data.title,
    data.formula,
    ...data.inputs.map((input) => `${input.label}: ${input.value}`),
    data.result.note,
  ]);

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <CardHeader
        eyebrow="Calculation"
        title={data.title}
        action={<CopyButton text={data.formula} label="Copy formula" />}
      />
      <div className="border-border border-b px-4 py-3 sm:px-5">
        <div className="bg-surface-0/60 text-text-secondary rounded-xl px-4 py-2.5 font-mono text-[11px] break-words sm:text-sm">
          {data.formula}
        </div>
      </div>

      <div className="bg-border grid gap-px sm:grid-cols-2">
        {(data.inputs ?? []).map((input, i) => (
          <div
            key={input.label}
            className={`bg-surface-1/80 animate-fade-in-up px-4 py-3 stagger-${Math.min(i + 1, 6)} sm:px-5`}
          >
            <div className="text-text-muted text-[11px] tracking-wider uppercase">
              {input.label}
            </div>
            <div className="text-text-primary mt-1 font-mono text-[13px] font-medium break-words sm:text-sm">
              {input.value}
            </div>
          </div>
        ))}
      </div>

      <div className="border-success/20 bg-success/[0.04] animate-fade-in-up border-t px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-success/70 text-[11px] tracking-wider uppercase">
            {data.result.label}
          </div>
          <CopyButton text={resultText} label="Copy result" />
        </div>
        <div className="text-success mt-1.5 font-mono text-lg font-bold break-words sm:text-2xl">
          {data.result.value}
        </div>
        {data.result.note && (
          <p className="text-text-muted mt-2 text-xs leading-relaxed">{data.result.note}</p>
        )}
      </div>
      <SafetyCallout notes={safetyNotes} />
    </div>
  );
}
