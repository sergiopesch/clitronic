'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { UIRenderer } from '@/components/ui/ui-renderer';
import { Logo } from '@/components/ui/logo';
import type { StructuredResponse } from '@/lib/ai/response-schema';

type ConversationEntry = {
  role: 'user' | 'assistant';
  content: string;
  structured?: StructuredResponse;
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

export function LocalConsole() {
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [currentResponse, setCurrentResponse] = useState<StructuredResponse | null>(null);
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseKey, setResponseKey] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasResponse = currentResponse !== null;

  const submit = useCallback(
    async (value?: string) => {
      const text = (value ?? prompt).trim();
      if (!text || isLoading) return;

      setPrompt('');
      setError(null);
      setCurrentQuery(text);
      setCurrentResponse(null);
      setIsLoading(true);

      // Build conversation for context
      const messages = [
        ...history.map((e) => ({
          role: e.role,
          content:
            e.role === 'assistant' && e.structured ? JSON.stringify(e.structured) : e.content,
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

        setCurrentResponse(structured);
        setResponseKey((k) => k + 1);
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
    setCurrentResponse(null);
    setCurrentQuery(null);
    setError(null);
    setPrompt('');
    inputRef.current?.focus();
  };

  // Auto-focus input
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  return (
    <main className="bg-surface-0 relative flex min-h-[100dvh] flex-col">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-accent/[0.03] absolute top-1/3 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]" />
      </div>

      {/* Top bar — minimal, only visible when there's a response */}
      <header
        className={`relative z-10 flex items-center justify-between px-4 py-3 transition-all duration-500 sm:px-6 ${
          hasResponse || isLoading
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-4 opacity-0'
        }`}
      >
        <button type="button" onClick={reset} className="transition hover:opacity-80">
          <Logo scale={0.8} />
        </button>
        <button
          type="button"
          onClick={reset}
          className="border-border text-text-muted hover:border-border-accent hover:text-text-primary rounded-full border px-3 py-1 text-xs transition"
        >
          new question
        </button>
      </header>

      {/* Main area */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
        {/* Idle state — centered input with starters */}
        {!hasResponse && !isLoading && !error && (
          <div className="animate-fade-in-up flex w-full max-w-2xl flex-col items-center">
            <Logo scale={1.6} />
            <p className="text-text-muted mt-2 text-center text-sm">
              Your electronics companion. Ask anything.
            </p>

            {/* Input */}
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

            {/* Floating hint pills — ambient, cycling */}
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

        {/* Response — the star of the show */}
        {hasResponse && !isLoading && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-3 py-2">
            {/* Query echo */}
            {currentQuery && (
              <div className="text-text-muted animate-fade-in-up mb-2 text-center text-sm">
                {currentQuery}
              </div>
            )}

            {/* The card/response */}
            <div key={responseKey} className="animate-card-enter w-full">
              <UIRenderer response={currentResponse} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom input — visible when response is showing */}
      {(hasResponse || error) && !isLoading && (
        <div className="border-border/50 bg-surface-0/80 animate-fade-in-up relative z-10 border-t px-4 py-3 backdrop-blur-xl sm:px-6">
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

/* ── Input Bar ── */
interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  size: 'large' | 'compact';
}

const InputBar = ({ ref, ...props }: InputBarProps & { ref: React.Ref<HTMLTextAreaElement> }) => {
  const { value, onChange, onSubmit, isLoading, size } = props;

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
};

/* ── Floating Hints ── */

function FloatingHints({ hints, onSelect }: { hints: string[]; onSelect: (h: string) => void }) {
  // Use a ref to track the previous index and avoid same hint repeating
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

    // Initial pick after mount
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
        {/* Outer glow ring */}
        <div className="animate-thinking-glow absolute h-20 w-20 rounded-full" />
        {/* Inner pulsing dot */}
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
