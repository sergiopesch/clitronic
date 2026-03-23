'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImageBlockData } from '@/lib/ai/response-schema';

/**
 * Dual-mode image block:
 * - "diagram" → renders built-in SVG electronics diagrams
 * - "photo"  → fetches a real image via /api/image-search
 */
export function ImageBlock({ data }: { data: ImageBlockData }) {
  // Guard against malformed data from LLM
  if (!data || typeof data !== 'object') {
    return <FallbackCard message="Could not render image block." />;
  }

  const caption = data.caption ?? 'Electronics component';
  const mode = data.imageMode ?? (data.diagramType ? 'diagram' : 'photo');

  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      {/* Visual area */}
      <div className="bg-surface-0/40 flex justify-center px-5 py-6">
        {mode === 'photo' ? (
          <PhotoRenderer searchQuery={data.searchQuery ?? caption} caption={caption} />
        ) : (
          <DiagramRenderer type={data.diagramType ?? 'generic'} labels={data.labels} />
        )}
      </div>

      {/* Caption */}
      <div className="border-border border-t px-5 py-4">
        <h3 className="text-accent text-base font-semibold sm:text-lg">{caption}</h3>
        {data.description && (
          <p className="text-text-secondary mt-2 text-sm leading-relaxed">{data.description}</p>
        )}
      </div>

      {/* Notes */}
      {data.notes && data.notes.length > 0 && (
        <div className="border-border border-t px-5 py-3.5">
          <div className="space-y-1.5">
            {data.notes.map((note, i) => (
              <div
                key={i}
                className={`text-text-secondary animate-fade-in-up flex gap-2.5 text-sm stagger-${Math.min(i + 1, 6)}`}
              >
                <span className="bg-accent/10 text-accent mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FallbackCard({ message }: { message: string }) {
  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border p-6 backdrop-blur-sm">
      <p className="text-text-muted text-center text-sm">{message}</p>
    </div>
  );
}

/* ── Photo Renderer ── */

interface PhotoRendererProps {
  searchQuery?: string;
  caption: string;
}

const SEARCH_MESSAGES = [
  'Scanning the interwebs...',
  'Asking the electrons nicely...',
  'Rummaging through datasheets...',
  'Almost got it, hold my capacitor...',
  'Checking every pixel...',
  'Decoding image frequencies...',
  'Soldering together some results...',
];

function PhotoRenderer({ searchQuery, caption }: PhotoRendererProps) {
  const query = searchQuery || caption || '';

  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(query ? 'loading' : 'error');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [msgIndex, setMsgIndex] = useState(0);
  const msgRef = useRef(0);

  // Rotate fun messages while loading
  useEffect(() => {
    if (state !== 'loading') return;
    const timer = setInterval(() => {
      msgRef.current = (msgRef.current + 1) % SEARCH_MESSAGES.length;
      setMsgIndex(msgRef.current);
    }, 2000);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (!query) return;

    let cancelled = false;

    fetch(`/api/image-search?q=${encodeURIComponent(query)}`)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then((data: { url?: string | null; thumbnail?: string; attribution?: string }) => {
        if (cancelled) return;
        if (data.url) {
          setImageUrl(data.thumbnail ?? data.url);
          setAttribution(data.attribution ?? null);
          setState('loaded');
        } else {
          setState('error');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  if (state === 'loading') {
    return (
      <div className="bg-surface-2/60 relative aspect-[4/3] w-full overflow-hidden rounded-xl">
        <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="bg-accent/20 h-6 w-6 animate-pulse rounded-full" />
          <div
            key={msgIndex}
            className="text-text-muted animate-fade-in-up px-4 text-center font-mono text-[11px]"
          >
            {SEARCH_MESSAGES[msgIndex]}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error' || !imageUrl) {
    return (
      <div className="border-border bg-surface-2/40 flex aspect-[4/3] w-full items-center justify-center rounded-xl border">
        <div className="text-text-muted text-center text-sm">
          <div className="mb-2 text-2xl opacity-30">{'{ ? }'}</div>
          <p>{"Couldn't find a good image for this one."}</p>
          <p className="mt-1 text-xs opacity-50">Try a more specific query!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={caption}
        className="max-h-[400px] w-full rounded-xl object-contain opacity-0 transition-opacity duration-500"
        onLoad={(e) => {
          (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
        }}
        onError={() => setState('error')}
        loading="eager"
      />
      {attribution && (
        <div className="text-text-muted mt-1.5 text-right text-[10px] opacity-60">
          {attribution}
        </div>
      )}
    </div>
  );
}

/* ── Diagram Renderer ── */

interface DiagramRendererProps {
  type: string;
  labels?: Record<string, string>;
}

function DiagramRenderer({ type, labels }: DiagramRendererProps) {
  const lower = type.toLowerCase().replace(/[\s_-]+/g, '');

  if (lower.includes('breadboard')) return <BreadboardDiagram labels={labels} />;
  if (lower.includes('voltagedivider')) return <VoltageDividerDiagram labels={labels} />;
  if (lower.includes('led') && lower.includes('circuit'))
    return <LEDCircuitDiagram labels={labels} />;
  if (lower.includes('pullup') || lower.includes('pulldown'))
    return <PullResistorDiagram labels={labels} />;
  if (lower.includes('pwm')) return <PWMDiagram labels={labels} />;
  if (lower.includes('capacitor') && lower.includes('charg'))
    return <CapacitorChargeDiagram labels={labels} />;

  // Fallback: generic concept block diagram
  return <GenericDiagram labels={labels} />;
}

/* ── SVG Label helper ── */
type TextAnchor = 'start' | 'middle' | 'end';

function SvgLabel({
  x,
  y,
  text,
  color = '#a1a1aa',
  size = 9,
  anchor = 'middle' as TextAnchor,
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  size?: number;
  anchor?: TextAnchor;
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={size} fontFamily="monospace">
      {text}
    </text>
  );
}

/* ── Breadboard Diagram ── */
function BreadboardDiagram({ labels }: { labels?: Record<string, string> }) {
  const powerLabel = labels?.power ?? '+5V / 3.3V';
  const groundLabel = labels?.ground ?? 'GND';

  return (
    <svg viewBox="0 0 360 220" className="w-full max-w-[360px]" style={{ height: '220px' }}>
      {/* Board body */}
      <rect
        x="20"
        y="10"
        width="320"
        height="200"
        rx="8"
        fill="#0f1722"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />

      {/* Power rails — top */}
      <rect x="40" y="24" width="280" height="12" rx="2" fill="rgba(248,113,113,0.12)" />
      <line
        x1="40"
        y1="30"
        x2="320"
        y2="30"
        stroke="#f87171"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <SvgLabel x={34} y={33} text="+" color="#f87171" size={10} anchor="end" />

      <rect x="40" y="40" width="280" height="12" rx="2" fill="rgba(96,165,250,0.10)" />
      <line
        x1="40"
        y1="46"
        x2="320"
        y2="46"
        stroke="#60a5fa"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <SvgLabel x={34} y={49} text="-" color="#60a5fa" size={10} anchor="end" />

      {/* Center gap */}
      <rect
        x="40"
        y="103"
        width="280"
        height="14"
        rx="3"
        fill="#090d12"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="1"
      />
      <SvgLabel x={180} y={113} text="center gap" color="#71717a" size={8} />

      {/* Connection rows — top half */}
      {Array.from({ length: 5 }).map((_, row) => (
        <g key={`t${row}`}>
          {Array.from({ length: 25 }).map((_, col) => (
            <circle
              key={`t${row}-${col}`}
              cx={52 + col * 11.2}
              cy={62 + row * 8}
              r="2"
              fill={col % 5 === 2 ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)'}
            />
          ))}
        </g>
      ))}

      {/* Connection rows — bottom half */}
      {Array.from({ length: 5 }).map((_, row) => (
        <g key={`b${row}`}>
          {Array.from({ length: 25 }).map((_, col) => (
            <circle
              key={`b${row}-${col}`}
              cx={52 + col * 11.2}
              cy={124 + row * 8}
              r="2"
              fill={col % 5 === 2 ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)'}
            />
          ))}
        </g>
      ))}

      {/* Power rails — bottom */}
      <rect x="40" y="168" width="280" height="12" rx="2" fill="rgba(248,113,113,0.12)" />
      <line
        x1="40"
        y1="174"
        x2="320"
        y2="174"
        stroke="#f87171"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />

      <rect x="40" y="184" width="280" height="12" rx="2" fill="rgba(96,165,250,0.10)" />
      <line
        x1="40"
        y1="190"
        x2="320"
        y2="190"
        stroke="#60a5fa"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />

      {/* Labels */}
      <SvgLabel x={180} y={18} text={powerLabel} color="#f87171" size={8} />
      <SvgLabel x={180} y={208} text={groundLabel} color="#60a5fa" size={8} />

      {/* Column group indicator */}
      <rect
        x="49"
        y="58"
        width="10"
        height="43"
        rx="2"
        fill="none"
        stroke="rgba(34,211,238,0.2)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <SvgLabel x={54} y={55} text="5-hole group" color="#22d3ee" size={7} />
    </svg>
  );
}

/* ── Voltage Divider ── */
function VoltageDividerDiagram({ labels }: { labels?: Record<string, string> }) {
  const vin = labels?.vin ?? 'Vin';
  const vout = labels?.vout ?? 'Vout';
  const r1 = labels?.r1 ?? 'R1';
  const r2 = labels?.r2 ?? 'R2';

  return (
    <svg viewBox="0 0 200 240" className="w-full max-w-[200px]" style={{ height: '240px' }}>
      {/* Vin line */}
      <line x1="100" y1="20" x2="100" y2="50" stroke="#f87171" strokeWidth="2" />
      <SvgLabel x={100} y={15} text={vin} color="#f87171" size={11} />

      {/* R1 */}
      <rect
        x="85"
        y="50"
        width="30"
        height="60"
        rx="3"
        fill="rgba(34,211,238,0.1)"
        stroke="#22d3ee"
        strokeWidth="1.5"
      />
      <SvgLabel x={100} y={84} text={r1} color="#22d3ee" size={10} />

      {/* Junction */}
      <line x1="100" y1="110" x2="100" y2="130" stroke="#a1a1aa" strokeWidth="2" />
      <circle cx="100" cy="120" r="3" fill="#34d399" />
      <line x1="100" y1="120" x2="160" y2="120" stroke="#34d399" strokeWidth="1.5" />
      <SvgLabel x={165} y={124} text={vout} color="#34d399" size={11} anchor="start" />

      {/* R2 */}
      <rect
        x="85"
        y="130"
        width="30"
        height="60"
        rx="3"
        fill="rgba(34,211,238,0.1)"
        stroke="#22d3ee"
        strokeWidth="1.5"
      />
      <SvgLabel x={100} y={164} text={r2} color="#22d3ee" size={10} />

      {/* GND line */}
      <line x1="100" y1="190" x2="100" y2="220" stroke="#60a5fa" strokeWidth="2" />
      <line x1="85" y1="220" x2="115" y2="220" stroke="#60a5fa" strokeWidth="2" />
      <line x1="90" y1="225" x2="110" y2="225" stroke="#60a5fa" strokeWidth="1.5" />
      <line x1="95" y1="230" x2="105" y2="230" stroke="#60a5fa" strokeWidth="1" />
      <SvgLabel x={100} y={240} text="GND" color="#60a5fa" size={9} />
    </svg>
  );
}

/* ── LED Circuit ── */
function LEDCircuitDiagram({ labels }: { labels?: Record<string, string> }) {
  const v = labels?.voltage ?? '5V';
  const r = labels?.resistor ?? '220Ω';

  return (
    <svg viewBox="0 0 240 200" className="w-full max-w-[240px]" style={{ height: '200px' }}>
      {/* VCC */}
      <SvgLabel x={40} y={20} text={v} color="#f87171" size={11} />
      <line x1="40" y1="25" x2="40" y2="50" stroke="#f87171" strokeWidth="2" />

      {/* Resistor */}
      <rect
        x="25"
        y="50"
        width="30"
        height="50"
        rx="3"
        fill="rgba(34,211,238,0.1)"
        stroke="#22d3ee"
        strokeWidth="1.5"
      />
      <SvgLabel x={40} y={79} text={r} color="#22d3ee" size={9} />

      {/* Wire to LED */}
      <line x1="40" y1="100" x2="40" y2="120" stroke="#a1a1aa" strokeWidth="2" />

      {/* LED triangle */}
      <polygon
        points="25,120 55,120 40,145"
        fill="rgba(52,211,153,0.2)"
        stroke="#34d399"
        strokeWidth="1.5"
      />
      <line x1="25" y1="145" x2="55" y2="145" stroke="#34d399" strokeWidth="1.5" />
      {/* LED arrows (light emission) */}
      <line x1="50" y1="125" x2="62" y2="118" stroke="#34d399" strokeWidth="1" />
      <line x1="53" y1="132" x2="65" y2="125" stroke="#34d399" strokeWidth="1" />
      <SvgLabel x={72} y={128} text="LED" color="#34d399" size={9} anchor="start" />

      {/* Wire to GND */}
      <line x1="40" y1="145" x2="40" y2="175" stroke="#60a5fa" strokeWidth="2" />

      {/* GND symbol */}
      <line x1="25" y1="175" x2="55" y2="175" stroke="#60a5fa" strokeWidth="2" />
      <line x1="30" y1="180" x2="50" y2="180" stroke="#60a5fa" strokeWidth="1.5" />
      <line x1="35" y1="185" x2="45" y2="185" stroke="#60a5fa" strokeWidth="1" />
      <SvgLabel x={40} y={198} text="GND" color="#60a5fa" size={9} />

      {/* Current flow arrow */}
      <line x1="120" y1="40" x2="120" y2="170" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <polygon points="116,160 124,160 120,170" fill="rgba(255,255,255,0.1)" />
      <SvgLabel x={140} y={110} text="Current flow" color="#71717a" size={8} anchor="start" />
    </svg>
  );
}

/* ── Pull-up/Pull-down Resistor ── */
function PullResistorDiagram({ labels }: { labels?: Record<string, string> }) {
  const type = labels?.type ?? 'pull-up';
  const r = labels?.resistor ?? '10kΩ';
  const isPullUp = type.toLowerCase().includes('up');

  return (
    <svg viewBox="0 0 220 200" className="w-full max-w-[220px]" style={{ height: '200px' }}>
      {isPullUp ? (
        <>
          <SvgLabel x={60} y={15} text="VCC" color="#f87171" size={10} />
          <line x1="60" y1="20" x2="60" y2="40" stroke="#f87171" strokeWidth="2" />
          <rect
            x="45"
            y="40"
            width="30"
            height="45"
            rx="3"
            fill="rgba(34,211,238,0.1)"
            stroke="#22d3ee"
            strokeWidth="1.5"
          />
          <SvgLabel x={60} y={66} text={r} color="#22d3ee" size={9} />
          <line x1="60" y1="85" x2="60" y2="110" stroke="#a1a1aa" strokeWidth="2" />
          <circle cx="60" cy="110" r="4" fill="#34d399" />
          <line x1="60" y1="110" x2="140" y2="110" stroke="#34d399" strokeWidth="1.5" />
          <SvgLabel x={145} y={114} text="GPIO" color="#34d399" size={10} anchor="start" />
          <line
            x1="60"
            y1="110"
            x2="60"
            y2="150"
            stroke="#a1a1aa"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <SvgLabel x={60} y={165} text="Switch to GND" color="#71717a" size={8} />
        </>
      ) : (
        <>
          <SvgLabel x={60} y={15} text="GPIO" color="#34d399" size={10} />
          <line x1="60" y1="20" x2="60" y2="60" stroke="#a1a1aa" strokeWidth="2" />
          <circle cx="60" cy="60" r="4" fill="#34d399" />
          <line x1="60" y1="60" x2="140" y2="60" stroke="#34d399" strokeWidth="1.5" />
          <SvgLabel x={145} y={64} text="Signal" color="#34d399" size={10} anchor="start" />
          <rect
            x="45"
            y="70"
            width="30"
            height="45"
            rx="3"
            fill="rgba(34,211,238,0.1)"
            stroke="#22d3ee"
            strokeWidth="1.5"
          />
          <SvgLabel x={60} y={96} text={r} color="#22d3ee" size={9} />
          <line x1="60" y1="115" x2="60" y2="145" stroke="#60a5fa" strokeWidth="2" />
          <line x1="45" y1="145" x2="75" y2="145" stroke="#60a5fa" strokeWidth="2" />
          <SvgLabel x={60} y={160} text="GND" color="#60a5fa" size={9} />
        </>
      )}
      <SvgLabel x={110} y={190} text={`${type} resistor`} color="#a1a1aa" size={9} />
    </svg>
  );
}

/* ── PWM Diagram ── */
function PWMDiagram({ labels }: { labels?: Record<string, string> }) {
  const duty = labels?.duty ?? '50%';

  return (
    <svg viewBox="0 0 320 160" className="w-full max-w-[320px]" style={{ height: '160px' }}>
      {/* Axis */}
      <line x1="30" y1="120" x2="300" y2="120" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <line x1="30" y1="20" x2="30" y2="120" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <SvgLabel x={15} y={25} text="HIGH" color="#71717a" size={8} />
      <SvgLabel x={15} y={122} text="LOW" color="#71717a" size={8} />
      <SvgLabel x={300} y={135} text="Time" color="#71717a" size={8} />

      {/* PWM waveform */}
      <polyline
        points="40,120 40,30 100,30 100,120 160,120 160,30 220,30 220,120 280,120 280,30"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Fill under HIGH portions */}
      <rect x="40" y="30" width="60" height="90" fill="rgba(34,211,238,0.08)" />
      <rect x="160" y="30" width="60" height="90" fill="rgba(34,211,238,0.08)" />

      {/* Duty cycle annotation */}
      <line x1="40" y1="15" x2="100" y2="15" stroke="#34d399" strokeWidth="1.5" />
      <SvgLabel x={70} y={11} text={`ON (${duty})`} color="#34d399" size={8} />
      <line
        x1="100"
        y1="15"
        x2="160"
        y2="15"
        stroke="#f87171"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <SvgLabel x={130} y={11} text="OFF" color="#f87171" size={8} />

      {/* Period bracket */}
      <line x1="40" y1="140" x2="160" y2="140" stroke="#a1a1aa" strokeWidth="1" />
      <SvgLabel x={100} y={153} text="1 Period" color="#a1a1aa" size={8} />
    </svg>
  );
}

/* ── Capacitor Charge Curve ── */
function CapacitorChargeDiagram({ labels }: { labels?: Record<string, string> }) {
  const vmax = labels?.voltage ?? 'Vmax';

  return (
    <svg viewBox="0 0 300 180" className="w-full max-w-[300px]" style={{ height: '180px' }}>
      {/* Axes */}
      <line x1="40" y1="150" x2="280" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <line x1="40" y1="20" x2="40" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <SvgLabel x={25} y={25} text={vmax} color="#f87171" size={8} />
      <SvgLabel x={280} y={165} text="Time" color="#71717a" size={8} />
      <SvgLabel x={25} y={153} text="0V" color="#71717a" size={8} />

      {/* Vmax dashed line */}
      <line
        x1="40"
        y1="30"
        x2="280"
        y2="30"
        stroke="#f87171"
        strokeWidth="1"
        strokeDasharray="4 3"
      />

      {/* Charge curve (RC exponential) */}
      <path
        d="M 40 150 C 80 150, 80 40, 140 38 L 280 35"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2.5"
      />
      {/* Fill under curve */}
      <path
        d="M 40 150 C 80 150, 80 40, 140 38 L 280 35 L 280 150 Z"
        fill="rgba(34,211,238,0.06)"
      />

      {/* Time constant markers */}
      <line
        x1="100"
        y1="150"
        x2="100"
        y2="70"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <SvgLabel x={100} y={163} text="τ" color="#a1a1aa" size={9} />
      <SvgLabel x={160} y={163} text="2τ" color="#a1a1aa" size={9} />
      <SvgLabel x={220} y={163} text="3τ" color="#a1a1aa" size={9} />

      <SvgLabel x={160} y={90} text="63% at τ = RC" color="#22d3ee" size={8} />
    </svg>
  );
}

/* ── Generic fallback diagram ── */
function GenericDiagram({ labels }: { labels?: Record<string, string> }) {
  const entries = Object.entries(labels ?? {});
  if (entries.length === 0) {
    return (
      <div className="flex h-32 w-full items-center justify-center">
        <div className="border-border bg-surface-2/40 text-text-muted rounded-xl border px-6 py-4 text-sm">
          Visual diagram
        </div>
      </div>
    );
  }

  const nodeCount = entries.length;
  const svgWidth = Math.max(nodeCount * 100, 200);

  return (
    <svg
      viewBox={`0 0 ${svgWidth} 100`}
      className="w-full"
      style={{ height: '100px', maxWidth: `${svgWidth}px` }}
    >
      {entries.map(([key, value], i) => {
        const x = (i + 0.5) * (svgWidth / nodeCount);
        return (
          <g key={key}>
            <rect
              x={x - 40}
              y="20"
              width="80"
              height="40"
              rx="6"
              fill="rgba(34,211,238,0.08)"
              stroke="rgba(34,211,238,0.2)"
              strokeWidth="1"
            />
            <SvgLabel x={x} y={36} text={key} color="#22d3ee" size={9} />
            <SvgLabel x={x} y={50} text={value} color="#a1a1aa" size={8} />
            {i < nodeCount - 1 && (
              <line
                x1={x + 40}
                y1="40"
                x2={x + svgWidth / nodeCount - 40}
                y2="40"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1.5"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
