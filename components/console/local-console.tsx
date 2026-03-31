'use client';

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { UIRenderer } from '@/components/ui/ui-renderer';
import { Logo } from '@/components/ui/logo';
import { DAILY_LIMIT_DEFAULT, DAILY_LIMIT_MESSAGE } from '@/lib/ai/rate-limit';
import type { StructuredResponse } from '@/lib/ai/response-schema';

type ConversationEntry = {
  role: 'user' | 'assistant';
  content: string;
  structured?: StructuredResponse;
};

type ConversationTurn = {
  query: string;
  response: StructuredResponse;
};

const HINTS = [
  'What resistor for a red LED on 5V?',
  'Compare Arduino Uno vs Raspberry Pi Pico',
  'Explain how transistors work',
  'My LED circuit is not blinking — help',
  'Best components for a beginner starter kit',
  'Show me an ESP32 pinout',
  'Wire a servo to Arduino',
  'What are the specs of the ATmega328P?',
  'Show me what a breadboard looks like',
  'Compare power consumption: ESP32 vs ESP8266 vs Arduino Nano',
];

/**
 * Summarize an assistant response for conversation history.
 * Instead of sending the full JSON blob (which confuses the LLM about context),
 * send a compact human-readable summary so the model understands what was discussed.
 */
function summarizeAssistantResponse(structured: StructuredResponse): string {
  const component = structured.ui?.component;
  const data = structured.ui?.data as Record<string, unknown> | undefined;

  if (structured.mode === 'text' || !component) {
    return structured.text || '(responded with text)';
  }

  const parts: string[] = [`[Showed ${component}]`];

  // Add key identifying info so the LLM knows what topic was covered
  if (data) {
    const title = data.title || data.component || data.issue;
    if (typeof title === 'string') parts.push(title);

    if (data.items && Array.isArray(data.items)) {
      const itemNames = data.items
        .map((item: unknown) =>
          typeof item === 'string' ? item : (item as Record<string, unknown>)?.name
        )
        .filter(Boolean);
      if (itemNames.length > 0) parts.push(`Items: ${itemNames.join(', ')}`);
    }

    if (data.caption && typeof data.caption === 'string') parts.push(data.caption);
    if (data.searchQuery && typeof data.searchQuery === 'string')
      parts.push(`(searched: ${data.searchQuery})`);
  }

  if (structured.text) parts.push(structured.text);

  return parts.join(' — ');
}

const RATE_LIMIT_KEY = 'clitronic_daily';

function getDailyUsage(): { count: number; date: string } {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { count: number; date: string };
      if (parsed.date === new Date().toDateString()) return parsed;
    }
  } catch {}
  return { count: 0, date: new Date().toDateString() };
}

function incrementDailyUsage(): number {
  const usage = getDailyUsage();
  usage.count++;
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(usage));
  } catch {}
  return usage.count;
}

export function LocalConsole() {
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [currentResponse, setCurrentResponse] = useState<StructuredResponse | null>(null);
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseKey, setResponseKey] = useState(0);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasResponse = currentResponse !== null;
  const isViewingHistory = viewingIndex !== null;

  // What's actually displayed — historical or current
  const displayedQuery = isViewingHistory ? turns[viewingIndex]?.query : currentQuery;
  const displayedResponse = isViewingHistory
    ? (turns[viewingIndex]?.response ?? null)
    : currentResponse;

  const submit = useCallback(
    async (value?: string) => {
      const text = (value ?? prompt).trim();
      if (!text || isLoading) return;

      // Client-side daily limit check (backup for serverless cold starts)
      const usage = getDailyUsage();
      if (usage.count >= DAILY_LIMIT_DEFAULT) {
        setPrompt('');
        setCurrentQuery(text);
        setCurrentResponse({
          intent: 'rate_limit',
          mode: 'text',
          ui: null,
          text: DAILY_LIMIT_MESSAGE,
          behavior: null,
        } as StructuredResponse);
        setResponseKey((k) => k + 1);
        return;
      }

      setPrompt('');
      setError(null);
      setCurrentQuery(text);
      setCurrentResponse(null);
      setViewingIndex(null);
      setIsLoading(true);

      const messages = [
        ...history.map((e) => ({
          role: e.role,
          content:
            e.role === 'assistant' && e.structured
              ? summarizeAssistantResponse(e.structured)
              : e.content,
        })),
        { role: 'user', content: text },
      ];

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
        });

        if (!res.ok) {
          const payload = (await res.json()) as { error?: string };
          throw new Error(payload.error ?? 'Request failed.');
        }

        const structured = (await res.json()) as StructuredResponse;

        if (process.env.NODE_ENV === 'development') {
          console.log('[clitronic] API response:', JSON.stringify(structured, null, 2));
        }

        incrementDailyUsage();
        setCurrentResponse(structured);
        setResponseKey((k) => k + 1);
        setTurns((prev) => [...prev, { query: text, response: structured }]);
        setHistory((prev) => [
          ...prev,
          { role: 'user', content: text },
          { role: 'assistant', content: structured.text ?? '', structured },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setIsLoading(false);
      }
    },
    [prompt, isLoading, history]
  );

  const reset = () => {
    setHistory([]);
    setTurns([]);
    setCurrentResponse(null);
    setCurrentQuery(null);
    setError(null);
    setPrompt('');
    setViewingIndex(null);
    inputRef.current?.focus();
  };

  const goToLatest = () => {
    setViewingIndex(null);
  };

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  return (
    <main className="bg-surface-0 relative flex min-h-[100dvh] flex-col">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-accent/[0.03] absolute top-1/3 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]" />
      </div>

      {/* Timeline — left edge */}
      {turns.length > 1 && !isLoading && (
        <Timeline
          turns={turns}
          activeIndex={viewingIndex ?? turns.length - 1}
          onSelect={(i) => {
            if (i === turns.length - 1) {
              goToLatest();
            } else {
              setViewingIndex(i);
            }
          }}
        />
      )}

      {/* Top bar */}
      <header
        className={`relative z-10 flex items-start justify-between gap-2 px-4 py-3 transition-all duration-500 sm:items-center sm:px-6 ${
          hasResponse || isLoading
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-4 opacity-0'
        }`}
      >
        <button type="button" onClick={reset} className="transition hover:opacity-80">
          <Logo scale={0.8} />
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isViewingHistory && (
            <button
              type="button"
              onClick={goToLatest}
              className="border-accent/30 text-accent hover:bg-accent/10 rounded-full border px-3 py-1 text-xs transition"
            >
              back to latest
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            className="border-border text-text-muted hover:border-border-accent hover:text-text-primary rounded-full border px-3 py-1 text-xs transition"
          >
            new question
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
        {/* Idle state */}
        {!hasResponse && !isLoading && !error && (
          <div className="animate-fade-in-up flex w-full max-w-2xl flex-col items-center">
            <Logo scale={1.6} />
            <p className="text-text-muted mt-2 text-center text-sm">
              Your electronics companion. Ask anything.
            </p>
            <div className="mt-8 w-full">
              <InputBar
                ref={inputRef}
                value={prompt}
                onChange={setPrompt}
                onSubmit={() => void submit()}
                isLoading={false}
                size="large"
              />
            </div>
            <FloatingHints hints={HINTS} onSelect={(h) => void submit(h)} />
          </div>
        )}

        {/* Thinking state */}
        {isLoading && (
          <div className="animate-fade-in-up flex w-full max-w-2xl flex-col items-center gap-6">
            {currentQuery && (
              <div className="text-text-secondary/80 text-center text-sm">{currentQuery}</div>
            )}
            <ThinkingIndicator />
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="animate-fade-in-up flex w-full max-w-2xl flex-col items-center gap-4">
            <div className="border-error/20 bg-error/5 text-error rounded-xl border px-5 py-4 text-center text-sm">
              {error}
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-text-muted hover:text-text-primary text-xs transition"
            >
              Try again
            </button>
          </div>
        )}

        {/* Response */}
        {(hasResponse || isViewingHistory) && !isLoading && displayedResponse && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-3 py-2">
            {displayedQuery && (
              <div className="text-text-muted animate-fade-in-up mb-2 text-center text-sm">
                {isViewingHistory && (
                  <span className="text-accent/50 mr-1.5 font-mono text-[10px]">
                    {(viewingIndex ?? 0) + 1}/{turns.length}
                  </span>
                )}
                {displayedQuery}
              </div>
            )}
            <div
              key={isViewingHistory ? `hist-${viewingIndex}` : responseKey}
              className="animate-card-enter w-full"
            >
              <UIRenderer response={displayedResponse} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom input */}
      {(hasResponse || error) && !isLoading && (
        <div className="border-border/50 bg-surface-0/80 animate-fade-in-up relative z-10 border-t px-4 py-3 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur-xl sm:px-6">
          <div className="mx-auto max-w-2xl">
            <InputBar
              ref={inputRef}
              value={prompt}
              onChange={setPrompt}
              onSubmit={() => void submit()}
              isLoading={false}
              size="compact"
            />
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Timeline ── */

interface TimelineProps {
  turns: ConversationTurn[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

function Timeline({ turns, activeIndex, onSelect }: TimelineProps) {
  return (
    <div className="animate-fade-in-up fixed top-1/2 left-3 z-20 hidden -translate-y-1/2 sm:left-4 sm:flex md:left-5">
      <div className="relative flex flex-col items-center">
        {/* The line */}
        <div
          className="bg-border absolute w-px"
          style={{
            top: 4,
            bottom: 4,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />

        {/* Dots */}
        {turns.map((turn, i) => {
          const isActive = i === activeIndex;
          const isLatest = i === turns.length - 1;
          return (
            <div key={i} className="group relative flex items-center" style={{ padding: '6px 0' }}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                className="relative z-10 transition-all duration-200"
                aria-label={`Go to: ${turn.query}`}
              >
                <div
                  className={`rounded-full transition-all duration-200 ${
                    isActive
                      ? 'bg-accent h-2.5 w-2.5 shadow-[0_0_8px_rgba(34,211,238,0.4)]'
                      : isLatest
                        ? 'bg-accent/40 hover:bg-accent/70 h-2 w-2'
                        : 'bg-text-muted/30 hover:bg-text-muted/60 h-1.5 w-1.5'
                  }`}
                />
              </button>

              {/* Tooltip — appears on hover */}
              <div className="pointer-events-none absolute left-6 flex items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <div className="border-border bg-surface-2/95 text-text-secondary max-w-[200px] truncate rounded-lg border px-2.5 py-1 text-[11px] whitespace-nowrap backdrop-blur-md">
                  {turn.query}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Input Bar ── */
interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  size: 'large' | 'compact';
}

const InputBar = forwardRef<HTMLTextAreaElement, InputBarProps>(function InputBar(
  { value, onChange, onSubmit, isLoading, size },
  ref
) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={`border-border bg-surface-1/80 focus-within:border-border-accent flex items-end gap-2 rounded-2xl border backdrop-blur-sm transition-colors ${
        size === 'large' ? 'p-2' : 'p-1.5'
      }`}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          const el = e.target;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder="Ask about electronics..."
        className={`text-text-primary caret-accent placeholder:text-text-muted flex-1 resize-none bg-transparent font-mono outline-none ${
          size === 'large' ? 'min-h-[44px] px-3 py-2.5 text-sm' : 'min-h-[36px] px-3 py-2 text-sm'
        }`}
      />
      <button
        type="submit"
        disabled={isLoading || value.trim().length === 0}
        className={`bg-accent text-surface-0 hover:bg-accent-dim disabled:bg-surface-3 disabled:text-text-muted shrink-0 rounded-xl font-medium transition disabled:cursor-not-allowed ${
          size === 'large' ? 'px-5 py-2.5 text-sm' : 'px-4 py-2 text-xs'
        }`}
      >
        Ask
      </button>
    </form>
  );
});

/* ── Floating Hints ── */

function FloatingHints({ hints, onSelect }: { hints: string[]; onSelect: (h: string) => void }) {
  const prevRef = useRef(-1);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    let key = 0;
    const pick = () => {
      let next: number;
      do {
        next = Math.floor(Math.random() * hints.length);
      } while (next === prevRef.current && hints.length > 1);
      prevRef.current = next;
      key++;
      setHint({ text: hints[next], key });
    };

    const init = setTimeout(pick, 50);
    const timer = setInterval(pick, 4000);
    return () => {
      clearTimeout(init);
      clearInterval(timer);
    };
  }, [hints]);

  if (!hint) return <div className="mt-10 h-[32px]" />;

  return (
    <div className="mt-10 flex h-[32px] items-center justify-center">
      <button
        key={hint.key}
        type="button"
        onClick={() => onSelect(hint.text)}
        className="hint-pill border-border/40 text-text-muted/50 hover:border-accent/20 hover:text-text-secondary cursor-pointer rounded-full border bg-white/[0.02] px-5 py-1.5 font-mono text-[11px] backdrop-blur-sm transition-colors duration-300"
      >
        {hint.text}
      </button>
    </div>
  );
}

/* ── Thinking Indicator ── */
function ThinkingIndicator() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center">
        <div className="animate-thinking-glow absolute h-20 w-20 rounded-full" />
        <div className="border-accent/20 bg-surface-1 relative flex h-12 w-12 items-center justify-center rounded-full border">
          <div className="flex gap-1">
            <span
              className="bg-accent h-1.5 w-1.5 rounded-full"
              style={{
                animation: 'thinking-dots 1.4s ease-in-out infinite',
                animationDelay: '0ms',
              }}
            />
            <span
              className="bg-accent h-1.5 w-1.5 rounded-full"
              style={{
                animation: 'thinking-dots 1.4s ease-in-out infinite',
                animationDelay: '200ms',
              }}
            />
            <span
              className="bg-accent h-1.5 w-1.5 rounded-full"
              style={{
                animation: 'thinking-dots 1.4s ease-in-out infinite',
                animationDelay: '400ms',
              }}
            />
          </div>
        </div>
      </div>
      <span className="text-text-muted text-xs">Thinking...</span>
    </div>
  );
}
