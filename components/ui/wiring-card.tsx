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
  purple: '#a78bfa',
  brown: '#a3734c',
};

function getWireColor(wire?: string): string {
  if (!wire) return '#22d3ee';
  const lower = wire.toLowerCase();
  for (const [name, color] of Object.entries(WIRE_COLORS)) {
    if (lower.includes(name)) return color;
  }
  return '#22d3ee';
}

/** Derive a pin type color from the pin name for the node badges */
function getNodeAccent(name: string): { bg: string; border: string; text: string } {
  if (!name)
    return { bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.15)', text: '#22d3ee' };
  const lower = name.toLowerCase();
  if (
    lower.includes('vcc') ||
    lower.includes('5v') ||
    lower.includes('3.3v') ||
    lower.includes('vin')
  )
    return { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)', text: '#f87171' };
  if (lower.includes('gnd') || lower.includes('ground'))
    return { bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.25)', text: '#60a5fa' };
  if (
    lower.includes('signal') ||
    lower.includes('data') ||
    lower.includes('pwm') ||
    lower.includes('pin')
  )
    return { bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.25)', text: '#34d399' };
  return { bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.15)', text: '#22d3ee' };
}

export function WiringCard({ data }: { data: WiringCardData }) {
  const totalSteps = data.steps?.length ?? 0;

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      {/* Header */}
      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="bg-accent/10 border-accent/20 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-accent">
              <path
                d="M12 2v4m0 12v4M2 12h4m12 0h4M7.05 7.05l2.83 2.83m4.24 4.24l2.83 2.83M7.05 16.95l2.83-2.83m4.24-4.24l2.83-2.83"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-text-primary text-sm font-semibold sm:text-base">{data.title}</h3>
            {data.description && (
              <p className="text-text-muted mt-0.5 text-xs">{data.description}</p>
            )}
          </div>
          {totalSteps > 0 && (
            <div className="text-text-muted ml-auto font-mono text-[10px]">
              {totalSteps} step{totalSteps !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Steps — each is a visual card */}
      <div className="space-y-0">
        {data.steps?.map((step, i) => {
          const wireColor = getWireColor(step.wire);
          const fromAccent = getNodeAccent(step.from);
          const toAccent = getNodeAccent(step.to);
          const isLast = i === totalSteps - 1;

          return (
            <div
              key={i}
              className={`animate-fade-in-up border-border relative border-t px-4 py-3.5 sm:px-5 stagger-${Math.min(i + 1, 6)}`}
            >
              {/* Step progress line (left gutter) */}
              <div className="absolute top-0 bottom-0 left-4 flex w-5 flex-col items-center sm:left-5">
                <div
                  className="mt-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                  style={{
                    backgroundColor: wireColor + '18',
                    color: wireColor,
                    border: `1px solid ${wireColor}33`,
                  }}
                >
                  {i + 1}
                </div>
                {!isLast && (
                  <div
                    className="mt-1 w-[1.5px] flex-1 rounded-full"
                    style={{ backgroundColor: wireColor + '20' }}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="ml-8 sm:ml-9">
                {/* Connection visual */}
                <div className="flex items-center gap-2">
                  {/* From */}
                  <div
                    className="shrink-0 rounded-lg px-2.5 py-1"
                    style={{
                      backgroundColor: fromAccent.bg,
                      border: `1px solid ${fromAccent.border}`,
                    }}
                  >
                    <span
                      className="font-mono text-[11px] font-semibold"
                      style={{ color: fromAccent.text }}
                    >
                      {step.from}
                    </span>
                  </div>

                  {/* Arrow with wire */}
                  <div className="flex min-w-0 flex-1 flex-col items-center">
                    <div className="relative flex w-full items-center">
                      <div
                        className="h-[2px] flex-1 rounded-full"
                        style={{ backgroundColor: wireColor }}
                      />
                      <svg
                        width="6"
                        height="8"
                        viewBox="0 0 6 8"
                        className="shrink-0"
                        style={{ fill: wireColor }}
                      >
                        <polygon points="0,0 6,4 0,8" />
                      </svg>
                    </div>
                    {step.wire && (
                      <span
                        className="mt-0.5 font-mono text-[9px] font-medium"
                        style={{ color: wireColor }}
                      >
                        {step.wire}
                      </span>
                    )}
                  </div>

                  {/* To */}
                  <div
                    className="shrink-0 rounded-lg px-2.5 py-1"
                    style={{
                      backgroundColor: toAccent.bg,
                      border: `1px solid ${toAccent.border}`,
                    }}
                  >
                    <span
                      className="font-mono text-[11px] font-semibold"
                      style={{ color: toAccent.text }}
                    >
                      {step.to}
                    </span>
                  </div>
                </div>

                {/* Note */}
                {step.note && (
                  <p className="text-text-muted mt-1.5 text-[11px] leading-relaxed">{step.note}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <div className="border-warning/20 bg-warning/[0.04] border-t px-4 py-3 sm:px-5">
          <div className="space-y-1.5">
            {data.warnings.map((w, i) => (
              <div key={i} className="text-warning/90 flex items-start gap-2 text-xs">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="mt-0.5 shrink-0"
                >
                  <path
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
