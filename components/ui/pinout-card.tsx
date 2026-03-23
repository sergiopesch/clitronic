'use client';

import type { PinoutCardData } from '@/lib/ai/response-schema';

const PIN_COLORS: Record<string, string> = {
  power: '#f87171',
  ground: '#71717a',
  digital: '#22d3ee',
  analog: '#34d399',
  other: '#a1a1aa',
};

const PIN_BG: Record<string, string> = {
  power: 'rgba(248, 113, 113, 0.15)',
  ground: 'rgba(113, 113, 122, 0.15)',
  digital: 'rgba(34, 211, 238, 0.15)',
  analog: 'rgba(52, 211, 153, 0.15)',
  other: 'rgba(161, 161, 170, 0.10)',
};

export function PinoutCard({ data }: { data: PinoutCardData }) {
  const totalPins = data.pins.length;
  const halfCount = Math.ceil(totalPins / 2);
  const leftPins = data.pins.slice(0, halfCount);
  const rightPins = data.pins.slice(halfCount).reverse();

  const chipHeight = Math.max(halfCount * 36, 120);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-accent sm:text-lg">{data.component}</h3>
        {data.description && (
          <p className="mt-1 text-sm text-text-muted">{data.description}</p>
        )}
      </div>

      {/* SVG Pinout Diagram */}
      <div className="flex justify-center px-5 py-6 overflow-x-auto">
        <svg
          viewBox={`0 0 400 ${chipHeight + 40}`}
          className="w-full max-w-[400px]"
          style={{ height: `${Math.min(chipHeight + 40, 400)}px` }}
        >
          {/* IC Body */}
          <rect
            x="120"
            y="20"
            width="160"
            height={chipHeight}
            rx="4"
            fill="#0f1722"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1.5"
          />
          {/* Notch */}
          <circle cx="200" cy="20" r="6" fill="#090d12" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          {/* Chip label */}
          <text
            x="200"
            y={chipHeight / 2 + 20}
            textAnchor="middle"
            fill="#71717a"
            fontSize="10"
            fontFamily="monospace"
          >
            {data.component}
          </text>

          {/* Left pins */}
          {leftPins.map((pin, i) => {
            const y = 38 + i * 36;
            const color = PIN_COLORS[pin.type] ?? PIN_COLORS.other;
            const bg = PIN_BG[pin.type] ?? PIN_BG.other;
            return (
              <g key={`l-${pin.number}`} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                {/* Pin line */}
                <line x1="90" y1={y} x2="120" y2={y} stroke={color} strokeWidth="2" strokeLinecap="round" />
                {/* Pin dot */}
                <circle cx="120" cy={y} r="3" fill={color} />
                {/* Pin number */}
                <text x="115" y={y + 4} textAnchor="end" fill={color} fontSize="9" fontFamily="monospace">{pin.number}</text>
                {/* Pin label bg */}
                <rect x="4" y={y - 10} width={80} height="20" rx="4" fill={bg} />
                {/* Pin label */}
                <text x="44" y={y + 4} textAnchor="middle" fill={color} fontSize="9" fontFamily="monospace" fontWeight="600">
                  {pin.label}
                </text>
              </g>
            );
          })}

          {/* Right pins */}
          {rightPins.map((pin, i) => {
            const y = 38 + i * 36;
            const color = PIN_COLORS[pin.type] ?? PIN_COLORS.other;
            const bg = PIN_BG[pin.type] ?? PIN_BG.other;
            return (
              <g key={`r-${pin.number}`} className="animate-fade-in-up" style={{ animationDelay: `${(i + halfCount) * 40}ms` }}>
                {/* Pin line */}
                <line x1="280" y1={y} x2="310" y2={y} stroke={color} strokeWidth="2" strokeLinecap="round" />
                {/* Pin dot */}
                <circle cx="280" cy={y} r="3" fill={color} />
                {/* Pin number */}
                <text x="285" y={y + 4} textAnchor="start" fill={color} fontSize="9" fontFamily="monospace">{pin.number}</text>
                {/* Pin label bg */}
                <rect x="316" y={y - 10} width={80} height="20" rx="4" fill={bg} />
                {/* Pin label */}
                <text x="356" y={y + 4} textAnchor="middle" fill={color} fontSize="9" fontFamily="monospace" fontWeight="600">
                  {pin.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Pin type legend */}
      <div className="flex flex-wrap gap-3 border-t border-border px-5 py-3">
        {(['power', 'ground', 'digital', 'analog'] as const).map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: PIN_COLORS[type] }}
            />
            <span className="text-[10px] uppercase tracking-wider text-text-muted">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
