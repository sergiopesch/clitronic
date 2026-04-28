'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
      {/* Visual area — constrained height so card fits viewport */}
      <div className="bg-surface-0/40 flex justify-center overflow-x-auto px-3 py-4 sm:px-5 sm:py-5">
        {mode === 'photo' ? (
          <PhotoRenderer
            searchQuery={data.searchQuery ?? caption}
            imageCount={data.imageCount}
            caption={caption}
            description={data.description}
          />
        ) : (
          <DiagramRenderer type={data.diagramType ?? 'generic'} labels={data.labels} />
        )}
      </div>

      {/* Caption + description + notes in a compact footer */}
      <div className="border-border border-t px-4 py-3 sm:px-5 sm:py-4">
        <h3 className="text-accent text-sm font-semibold sm:text-base">{caption}</h3>
        {data.description && (
          <p className="text-text-secondary mt-1 text-xs leading-relaxed sm:text-sm">
            {data.description}
          </p>
        )}
        {data.notes && data.notes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {data.notes.map((note, i) => (
              <span
                key={`${note}-${i}`}
                className={`text-text-secondary animate-fade-in-up inline-flex items-center gap-1.5 text-xs stagger-${Math.min(i + 1, 6)}`}
              >
                <span className="bg-accent/10 text-accent inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px]">
                  {i + 1}
                </span>
                {note}
              </span>
            ))}
          </div>
        )}
      </div>
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
  imageCount?: number;
  caption: string;
  description?: string;
}

const QUERY_HISTORY_LIMIT = 12;
const SEEN_IMAGES_BY_QUERY = new Map<string, string[]>();

function normalizeImageUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  return trimmed;
}

const SEARCH_MESSAGES = [
  'Searching electronics image sources...',
  'Checking component names and labels...',
  'Filtering low-confidence matches...',
  'Verifying image format and source...',
  'Preparing visual reference...',
];

function PhotoRenderer({ searchQuery, imageCount, caption, description }: PhotoRendererProps) {
  const query = searchQuery || caption || '';
  const count = Math.min(Math.max(Math.floor(imageCount ?? 1), 1), 6);
  const queryKey = query.trim().toLowerCase();

  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(query ? 'loading' : 'error');
  const [images, setImages] = useState<
    { url: string; thumbnail?: string; attribution?: string | null }[]
  >([]);
  const [msgIndex, setMsgIndex] = useState(0);
  const msgRef = useRef(0);

  const readSeenForQuery = useCallback((): string[] => {
    return queryKey ? (SEEN_IMAGES_BY_QUERY.get(queryKey) ?? []) : [];
  }, [queryKey]);

  const recordSeenForQuery = useCallback(
    (urls: string[]) => {
      if (!queryKey || urls.length === 0) return;
      const existing = SEEN_IMAGES_BY_QUERY.get(queryKey) ?? [];
      const next = [...existing];
      for (const url of urls) {
        if (!next.includes(url)) next.push(url);
      }
      SEEN_IMAGES_BY_QUERY.set(queryKey, next.slice(-QUERY_HISTORY_LIMIT));
    },
    [queryKey]
  );

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
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4500);

    const params = new URLSearchParams({ q: query, caption });
    const fetchCount = Math.max(count, 4);
    params.set('count', String(fetchCount));
    if (description) {
      params.set('description', description);
    }
    const excludedUrls = readSeenForQuery().slice(-6);
    for (const excludedUrl of excludedUrls) {
      params.append('exclude', excludedUrl);
    }
    fetch(`/api/image-search?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(
        (data: {
          url?: string | null;
          thumbnail?: string;
          attribution?: string;
          images?: { url?: string; thumbnail?: string; attribution?: string }[];
          confident?: boolean;
        }) => {
          if (cancelled) return;
          const candidates = (data.images ?? [])
            .map((item) => ({
              url: normalizeImageUrl(item.url) ?? '',
              thumbnail: normalizeImageUrl(item.thumbnail) ?? undefined,
              attribution: item.attribution ?? null,
            }))
            .filter((item) => Boolean(item.url));

          const full = normalizeImageUrl(data.url);
          const thumb = normalizeImageUrl(data.thumbnail);
          const unseenCandidates = candidates.filter((item) => !excludedUrls.includes(item.url));
          const selectedCandidates = (
            unseenCandidates.length > 0 ? unseenCandidates : candidates
          ).slice(0, count);

          if (selectedCandidates.length > 0) {
            setImages(selectedCandidates);
            recordSeenForQuery(selectedCandidates.map((item) => item.url));
            setState('loaded');
          } else if (full || thumb) {
            const fallbackItems = [
              {
                url: full ?? thumb!,
                thumbnail: thumb ?? undefined,
                attribution: data.attribution ?? null,
              },
            ];
            setImages(fallbackItems);
            recordSeenForQuery(fallbackItems.map((item) => item.url));
            setState('loaded');
          } else {
            setState('error');
          }
        }
      )
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [caption, count, description, query, readSeenForQuery, recordSeenForQuery]);

  if (state === 'loading') {
    return (
      <div className="bg-surface-2/60 relative h-40 w-full overflow-hidden rounded-xl sm:h-52">
        <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="bg-accent/20 h-5 w-5 animate-pulse rounded-full" />
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

  if (state === 'error' || images.length === 0) {
    // Smart fallback: if a matching built-in diagram exists, show that instead of an error
    const diagramType = matchDiagramType(query);
    if (diagramType) {
      return <DiagramRenderer type={diagramType} />;
    }

    return (
      <div className="border-border bg-surface-2/40 flex h-32 w-full items-center justify-center rounded-xl border sm:h-40">
        <div className="text-text-muted text-center text-sm">
          <div className="mb-1 text-xl opacity-30">{'{ ? }'}</div>
          <p className="text-xs">No confident image match found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid w-full gap-2 ${images.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
      {images.map((item, idx) => (
        <PhotoTile
          key={`${item.url}-${idx}`}
          url={item.url}
          thumbnail={item.thumbnail}
          alt={`${caption} ${idx + 1}`}
          attribution={item.attribution}
        />
      ))}
    </div>
  );
}

function PhotoTile({
  url,
  thumbnail,
  alt,
  attribution,
}: {
  url: string;
  thumbnail?: string;
  alt: string;
  attribution?: string | null;
}) {
  const candidateSources = [url, thumbnail].filter((value): value is string => Boolean(value));
  const [srcIndex, setSrcIndex] = useState(0);
  const [src, setSrc] = useState(candidateSources[0] ?? url);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="border-border bg-surface-2/40 text-text-muted flex h-36 w-full items-center justify-center rounded-xl border text-xs sm:h-44">
        <span>Image unavailable</span>
      </div>
    );
  }

  const advanceToNextSource = () => {
    const nextIndex = srcIndex + 1;
    if (nextIndex < candidateSources.length) {
      setSrcIndex(nextIndex);
      setSrc(candidateSources[nextIndex]!);
      setLoaded(false);
      return;
    }
    setFailed(true);
  };

  return (
    <div className="relative flex w-full justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={toProxyUrl(src)}
        alt={alt}
        className={`max-h-[32vh] w-auto max-w-full rounded-xl object-contain transition-opacity duration-500 sm:max-h-[36vh] ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={(event) => {
          const element = event.currentTarget;
          if (element.naturalWidth < 2 || element.naturalHeight < 2) {
            advanceToNextSource();
            return;
          }
          setLoaded(true);
        }}
        onError={advanceToNextSource}
        loading="eager"
        referrerPolicy="no-referrer"
      />
      {attribution && (
        <div className="text-text-muted absolute right-1 bottom-1 rounded bg-black/40 px-1.5 py-0.5 text-[9px] opacity-70">
          {attribution}
        </div>
      )}
    </div>
  );
}

function toProxyUrl(rawUrl: string): string {
  const params = new URLSearchParams({ url: rawUrl });
  return `/api/image-proxy?${params.toString()}`;
}

/* ── Diagram type matcher for photo fallback ── */

const DIAGRAM_KEYWORDS: [string[], string][] = [
  [['breadboard'], 'breadboard'],
  [['voltage', 'divider'], 'voltage-divider'],
  [['led', 'circuit'], 'led-circuit'],
  [['pull', 'up'], 'pull-up'],
  [['pull', 'down'], 'pull-down'],
  [['pwm', 'pulse', 'width'], 'pwm'],
  [['capacitor', 'charge', 'rc'], 'capacitor-charge'],
];

function matchDiagramType(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [keywords, type] of DIAGRAM_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return type;
  }
  return null;
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
