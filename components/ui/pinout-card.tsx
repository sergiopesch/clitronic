'use client';

import { CardHeader, CountBadge } from './card-layout';
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
  const pins = data.pins ?? [];
  const totalPins = pins.length;
  const halfCount = Math.ceil(totalPins / 2);
  const leftPins = pins.slice(0, halfCount);
  const rightPins = pins.slice(halfCount).reverse();

  const chipHeight = Math.max(halfCount * 36, 120);

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <CardHeader
        eyebrow="Pinout"
        title={data.component}
        subtitle={data.description}
        meta={
          totalPins > 0 && (
            <CountBadge>
              {totalPins} pin{totalPins !== 1 ? 's' : ''}
            </CountBadge>
          )
        }
      />

      {totalPins === 0 && (
        <div className="text-text-muted px-4 py-8 text-center text-sm sm:px-5">
          No pin data available.
        </div>
      )}

      {/* SVG Pinout Diagram */}
      {totalPins > 0 && (
        <div className="flex justify-center overflow-x-auto px-3 py-5 sm:px-5 sm:py-6">
          <svg
            viewBox={`0 0 400 ${chipHeight + 40}`}
            className="h-auto w-full max-w-[400px]"
            style={{
              height: `${Math.min(chipHeight + 40, 400)}px`,
              maxHeight: '52vh',
            }}
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
            <circle
              cx="200"
              cy="20"
              r="6"
              fill="#090d12"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
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
                <g
                  key={`l-${pin.number}`}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {/* Pin line */}
                  <line
                    x1="90"
                    y1={y}
                    x2="120"
                    y2={y}
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Pin dot */}
                  <circle cx="120" cy={y} r="3" fill={color} />
                  {/* Pin number */}
                  <text
                    x="115"
                    y={y + 4}
                    textAnchor="end"
                    fill={color}
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {pin.number}
                  </text>
                  {/* Pin label bg */}
                  <rect x="4" y={y - 10} width={80} height="20" rx="4" fill={bg} />
                  {/* Pin label */}
                  <text
                    x="44"
                    y={y + 4}
                    textAnchor="middle"
                    fill={color}
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
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
                <g
                  key={`r-${pin.number}`}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${(i + halfCount) * 40}ms` }}
                >
                  {/* Pin line */}
                  <line
                    x1="280"
                    y1={y}
                    x2="310"
                    y2={y}
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Pin dot */}
                  <circle cx="280" cy={y} r="3" fill={color} />
                  {/* Pin number */}
                  <text
                    x="285"
                    y={y + 4}
                    textAnchor="start"
                    fill={color}
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {pin.number}
                  </text>
                  {/* Pin label bg */}
                  <rect x="316" y={y - 10} width={80} height="20" rx="4" fill={bg} />
                  {/* Pin label */}
                  <text
                    x="356"
                    y={y + 4}
                    textAnchor="middle"
                    fill={color}
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {pin.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Pin type legend */}
      {totalPins > 0 && (
        <div className="border-border flex flex-wrap gap-3 border-t px-4 py-3 sm:px-5">
          {(['power', 'ground', 'digital', 'analog'] as const).map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: PIN_COLORS[type] }}
              />
              <span className="text-text-muted text-[10px] tracking-wider uppercase">{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
