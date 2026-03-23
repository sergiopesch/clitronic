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
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <div className="border-border border-b px-5 py-4">
        <div className="text-accent/70 text-[11px] tracking-wider uppercase">Wiring Guide</div>
        <h3 className="text-text-primary mt-1 text-base font-semibold sm:text-lg">{data.title}</h3>
        {data.description && <p className="text-text-muted mt-1.5 text-sm">{data.description}</p>}
      </div>

      {/* Wiring steps */}
      <div className="divide-border divide-y">
        {data.steps.map((step, i) => {
          const wireColor = getWireColor(step.wire);
          return (
            <div
              key={i}
              className={`animate-fade-in-up flex items-center gap-4 px-5 py-3.5 stagger-${Math.min(i + 1, 6)}`}
            >
              {/* Step number */}
              <span className="bg-surface-3 text-text-secondary flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
                {i + 1}
              </span>

              {/* Connection visual */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {/* From node */}
                <div className="border-border bg-surface-2/60 shrink-0 rounded-lg border px-2.5 py-1.5">
                  <span className="text-text-primary font-mono text-xs font-medium">
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
                      className="absolute left-1/2 -translate-x-1/2 -translate-y-full rounded px-1 font-mono text-[9px] font-medium"
                      style={{ color: wireColor }}
                    >
                      {step.wire}
                    </span>
                  )}
                </div>

                {/* To node */}
                <div className="border-border bg-surface-2/60 shrink-0 rounded-lg border px-2.5 py-1.5">
                  <span className="text-text-primary font-mono text-xs font-medium">{step.to}</span>
                </div>
              </div>

              {/* Note */}
              {step.note && (
                <span className="text-text-muted hidden text-xs sm:block">{step.note}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <div className="border-warning/20 bg-warning/[0.04] border-t px-5 py-3.5">
          <div className="text-warning/70 mb-2 text-[11px] tracking-wider uppercase">Warnings</div>
          <ul className="space-y-1.5">
            {data.warnings.map((w, i) => (
              <li key={i} className="text-warning/90 flex gap-2 text-xs">
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
