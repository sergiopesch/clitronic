'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface VoiceTranscriptStripProps {
  userText: string;
  agentText: string;
  showUserCursor?: boolean;
  showAgentCursor?: boolean;
  userStreaming?: boolean;
  agentStreaming?: boolean;
  collapsed?: boolean;
}

function StreamLine({
  label,
  text,
  accent,
  badgeTone,
  showCursor,
  streaming,
}: {
  label: string;
  text: string;
  accent: 'accent' | 'success';
  badgeTone: string;
  showCursor: boolean;
  streaming: boolean;
}) {
  if (!text.trim() && !showCursor) return null;
  const waveColorClass = accent === 'success' ? 'bg-success/25' : 'bg-accent/25';
  return (
    <div className="relative flex items-start gap-2.5">
      {streaming && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 overflow-hidden opacity-55">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent" />
          <div className="flex h-full items-end gap-[3px] px-1">
            {Array.from({ length: 24 }).map((_, i) => {
              const base = 2 + ((i * 3) % 6);
              return (
                <span
                  key={`${label}-wave-${i}`}
                  className={`inline-block w-[2px] rounded-full ${waveColorClass}`}
                  style={{
                    height: `${base}px`,
                    animation: 'thinking-dots 0.95s ease-in-out infinite',
                    animationDelay: `${i * 45}ms`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
      <span
        className={`mt-0.5 inline-flex w-8 shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.11em] uppercase ${badgeTone}`}
      >
        {label}
      </span>
      <p className="text-text-primary min-h-[1.2rem] text-sm leading-relaxed">
        {text}
        {showCursor && (
          <span
            className={`animate-cursor-blink ml-0.5 inline-block h-3.5 w-[2px] align-middle ${
              accent === 'success' ? 'bg-success' : 'bg-accent'
            }`}
          />
        )}
      </p>
    </div>
  );
}

type StreamPace = 'user' | 'agent';

function useProgressiveText(source: string, streaming: boolean, pace: StreamPace) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [visibleWords, setVisibleWords] = useState(0);

  const finalWordTokens = useMemo(() => source.match(/\S+\s*/g) ?? [], [source]);
  const committedWordTokens = useMemo(() => source.match(/\S+\s+/g) ?? [], [source]);
  const committedText = useMemo(() => committedWordTokens.join(''), [committedWordTokens]);
  const trailingText = source.slice(committedText.length);
  const targetWordCount = streaming ? committedWordTokens.length : finalWordTokens.length;

  useEffect(() => {
    if (pace === 'user' || prefersReducedMotion) return;

    if (!source.trim()) {
      const id = window.requestAnimationFrame(() => {
        setVisibleWords(0);
      });
      return () => window.cancelAnimationFrame(id);
    }

    // Handle transcript resets/new turns where the visible queue gets ahead.
    if (visibleWords > targetWordCount) {
      const id = window.requestAnimationFrame(() => {
        setVisibleWords(targetWordCount);
      });
      return () => window.cancelAnimationFrame(id);
    }

    if (visibleWords >= targetWordCount) return;

    const backlog = targetWordCount - visibleWords;
    const baseDelay = 170;
    const delay =
      backlog > 12 ? Math.max(60, baseDelay - 30) : backlog > 6 ? baseDelay : baseDelay + 55;
    const id = window.setTimeout(() => {
      setVisibleWords((prev) => Math.min(prev + 1, targetWordCount));
    }, delay);

    return () => window.clearTimeout(id);
  }, [pace, prefersReducedMotion, source, targetWordCount, visibleWords]);

  if (pace === 'user') return source;
  if (prefersReducedMotion) return source;

  const visibleText = finalWordTokens.slice(0, visibleWords).join('');
  if (!streaming) return visibleText;

  return visibleWords >= committedWordTokens.length ? `${visibleText}${trailingText}` : visibleText;
}

export function VoiceTranscriptStrip({
  userText,
  agentText,
  showUserCursor = false,
  showAgentCursor = false,
  userStreaming = false,
  agentStreaming = false,
  collapsed = false,
}: VoiceTranscriptStripProps) {
  const userDisplay = useProgressiveText(userText, userStreaming, 'user');
  const agentDisplay = useProgressiveText(agentText, agentStreaming, 'agent');
  const hasUser = Boolean(userDisplay.trim()) || showUserCursor;
  const hasAgent = Boolean(agentDisplay.trim()) || showAgentCursor;
  const showUserLine = hasUser;
  const showAgentLine = hasAgent;
  const stripTone = useMemo(
    () => (userStreaming || agentStreaming ? 'opacity-100' : 'opacity-90'),
    [agentStreaming, userStreaming]
  );
  if (!showUserLine && !showAgentLine && !collapsed) return null;

  return (
    <div
      aria-live="polite"
      className={`relative w-full overflow-hidden transition-all duration-400 ease-out ${
        collapsed
          ? 'max-h-0 translate-y-1 opacity-0 blur-[2px]'
          : 'blur-0 max-h-56 translate-y-0 overflow-y-auto opacity-100'
      } ${stripTone}`}
    >
      <div className="from-accent/8 via-accent/0 pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent opacity-70" />
      <div className="flex flex-col gap-2.5 py-1">
        {showUserLine && (
          <StreamLine
            label="You"
            text={userDisplay}
            showCursor={showUserCursor}
            accent="accent"
            badgeTone="bg-accent/12 text-accent"
            streaming={userStreaming}
          />
        )}
        {showAgentLine && (
          <StreamLine
            label="AI"
            text={agentDisplay}
            showCursor={showAgentCursor}
            accent="success"
            badgeTone="bg-success/14 text-success"
            streaming={agentStreaming}
          />
        )}
      </div>
    </div>
  );
}
