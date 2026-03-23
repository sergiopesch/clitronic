'use client';

import type { WiringCardData } from '@/lib/ai/response-schema';

const WIRE_COLORS: Record<string, string> = {
  red: '#f87171',
  black: '#71717a',
  yellow: '#fbbf24',
  green: '#34d399',
  blue: '#60a5fa',
  white: '#e5e5e5',
  orange: '#fb923c',
};

function getWireColor(wire?: string): string {
  if (!wire) return '#22d3ee';
  const lower = wire.toLowerCase();
  for (const [name, color] of Object.entries(WIRE_COLORS)) {
    if (lower.includes(name)) return color;
  }
  return '#22d3ee';
}

export function WiringCard({ data }: { data: WiringCardData }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm">
      <div className="border-b border-border px-5 py-4">
        <div className="text-[11px] tracking-wider text-accent/70 uppercase">Wiring Guide</div>
        <h3 className="mt-1 text-base font-semibold text-text-primary sm:text-lg">
          {data.title}
        </h3>
        {data.description && (
          <p className="mt-1.5 text-sm text-text-muted">{data.description}</p>
        )}
      </div>

      {/* Wiring steps */}
      <div className="divide-y divide-border">
        {data.steps.map((step, i) => {
          const wireColor = getWireColor(step.wire);
          return (
            <div
              key={i}
              className={`flex items-center gap-4 px-5 py-3.5 animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
            >
              {/* Step number */}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-xs font-semibold text-text-secondary">
                {i + 1}
              </span>

              {/* Connection visual */}
              <div className="flex flex-1 items-center gap-2 min-w-0">
                {/* From node */}
                <div className="shrink-0 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5">
                  <span className="font-mono text-xs font-medium text-text-primary">
                    {step.from}
                  </span>
                </div>

                {/* Wire line */}
                <div className="relative flex flex-1 items-center">
                  <div
                    className="h-[2px] w-full rounded-full"
                    style={{ backgroundColor: wireColor }}
                  />
                  {/* Arrow */}
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    className="absolute -right-1"
                    style={{ fill: wireColor }}
                  >
                    <polygon points="0,0 8,4 0,8" />
                  </svg>
                  {/* Wire label */}
                  {step.wire && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 -translate-y-full rounded px-1 text-[9px] font-mono font-medium"
                      style={{ color: wireColor }}
                    >
                      {step.wire}
                    </span>
                  )}
                </div>

                {/* To node */}
                <div className="shrink-0 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5">
                  <span className="font-mono text-xs font-medium text-text-primary">
                    {step.to}
                  </span>
                </div>
              </div>

              {/* Note */}
              {step.note && (
                <span className="hidden text-xs text-text-muted sm:block">
                  {step.note}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <div className="border-t border-warning/20 bg-warning/[0.04] px-5 py-3.5">
          <div className="mb-2 text-[11px] tracking-wider text-warning/70 uppercase">
            Warnings
          </div>
          <ul className="space-y-1.5">
            {data.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-xs text-warning/90">
                <span className="mt-0.5 shrink-0">!</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
