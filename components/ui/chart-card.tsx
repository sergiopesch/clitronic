'use client';

import type { ChartCardData } from '@/lib/ai/response-schema';

const BAR_COLORS: Record<string, { bar: string; bg: string }> = {
  accent: { bar: '#22d3ee', bg: 'rgba(34, 211, 238, 0.15)' },
  success: { bar: '#34d399', bg: 'rgba(52, 211, 153, 0.15)' },
  warning: { bar: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' },
  error: { bar: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
};

export function ChartCard({ data }: { data: ChartCardData }) {
  const maxValue = Math.max(...data.bars.map((b) => b.value), 1);

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <div className="border-border border-b px-5 py-4">
        <h3 className="text-accent text-base font-semibold sm:text-lg">{data.title}</h3>
        {data.subtitle && <p className="text-text-muted mt-1 text-sm">{data.subtitle}</p>}
      </div>

      <div className="space-y-3 px-5 py-5">
        {data.bars.map((bar, i) => {
          const pct = (bar.value / maxValue) * 100;
          const palette = BAR_COLORS[bar.color ?? 'accent'] ?? BAR_COLORS.accent;

          return (
            <div key={bar.label} className={`animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-text-primary text-sm">{bar.label}</span>
                <span className="font-mono text-sm font-semibold" style={{ color: palette.bar }}>
                  {bar.value}
                  {bar.unit && (
                    <span className="text-text-muted ml-0.5 text-xs font-normal">{bar.unit}</span>
                  )}
                </span>
              </div>

              {/* Bar track */}
              <div
                className="h-3 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: palette.bg }}
              >
                {/* Animated fill */}
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: palette.bar,
                    animation: `bar-grow-${i} 800ms cubic-bezier(0.16, 1, 0.3, 1) both`,
                    animationDelay: `${i * 100 + 200}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline keyframes for bar growth */}
      <style>{`
        ${data.bars
          .map(
            (_, i) => `
          @keyframes bar-grow-${i} {
            from { width: 0%; }
          }
        `
          )
          .join('')}
      `}</style>
    </div>
  );
}
