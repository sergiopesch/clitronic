'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { UIRenderer } from '@/components/ui/ui-renderer';
import type { StructuredResponse } from '@/lib/ai/response-schema';

type ConversationEntry = {
  role: 'user' | 'assistant';
  content: string;
  structured?: StructuredResponse;
};

const STARTER_PROMPTS = [
  'What resistor for a red LED on 5V?',
  'Compare Arduino Uno vs Raspberry Pi Pico',
  'Explain how transistors work',
  'My LED circuit is not blinking — help',
  'Calculate a voltage divider for 3.3V from 5V',
  'Best components for a beginner starter kit',
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
            e.role === 'assistant' && e.structured
              ? JSON.stringify(e.structured)
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
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-surface-0">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.03] blur-[120px]" />
      </div>

      {/* Top bar — minimal, only visible when there's a response */}
      <header
        className={`relative z-10 flex items-center justify-between px-4 py-3 transition-all duration-500 sm:px-6 ${
          hasResponse || isLoading
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={reset}
          className="font-mono text-sm font-semibold text-accent transition hover:text-accent-dim"
        >
          clitronic
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-border px-3 py-1 text-xs text-text-muted transition hover:border-border-accent hover:text-text-primary"
        >
          new question
        </button>
      </header>

      {/* Main area */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
        {/* Idle state — centered input with starters */}
        {!hasResponse && !isLoading && !error && (
          <div className="flex w-full max-w-2xl flex-col items-center animate-fade-in-up">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
              clitron<span className="text-accent">ic</span>
            </h1>
            <p className="mt-2 text-center text-sm text-text-muted">
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

            {/* Starter prompts */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {STARTER_PROMPTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(s)}
                  className="rounded-full border border-border bg-surface-1/60 px-3.5 py-1.5 text-xs text-text-secondary backdrop-blur-sm transition hover:border-border-accent hover:text-text-primary hover:bg-surface-2/80"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Thinking state */}
        {isLoading && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-6 animate-fade-in-up">
            {currentQuery && (
              <div className="text-center text-sm text-text-secondary/80">
                {currentQuery}
              </div>
            )}
            <ThinkingIndicator />
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-4 animate-fade-in-up">
            <div className="rounded-xl border border-error/20 bg-error/5 px-5 py-4 text-center text-sm text-error">
              {error}
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-text-muted transition hover:text-text-primary"
            >
              Try again
            </button>
          </div>
        )}

        {/* Response — the star of the show */}
        {hasResponse && !isLoading && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-4 overflow-y-auto max-h-[calc(100dvh-180px)] py-4">
            {/* Query echo */}
            {currentQuery && (
              <div className="mb-2 text-center text-sm text-text-muted animate-fade-in-up">
                {currentQuery}
              </div>
            )}

            {/* The card/response */}
            <div key={responseKey} className="w-full animate-card-enter">
              <UIRenderer response={currentResponse} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom input — visible when response is showing */}
      {(hasResponse || error) && !isLoading && (
        <div className="relative z-10 border-t border-border/50 bg-surface-0/80 px-4 py-3 backdrop-blur-xl sm:px-6 animate-fade-in-up">
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

const InputBar = ({
  ref,
  ...props
}: InputBarProps & { ref: React.Ref<HTMLTextAreaElement> }) => {
  const { value, onChange, onSubmit, isLoading, size } = props;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={`flex items-end gap-2 rounded-2xl border border-border bg-surface-1/80 backdrop-blur-sm transition-colors focus-within:border-border-accent ${
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
        className={`flex-1 resize-none bg-transparent font-mono text-text-primary caret-accent outline-none placeholder:text-text-muted ${
          size === 'large'
            ? 'min-h-[44px] px-3 py-2.5 text-sm'
            : 'min-h-[36px] px-3 py-2 text-sm'
        }`}
      />
      <button
        type="submit"
        disabled={isLoading || value.trim().length === 0}
        className={`shrink-0 rounded-xl bg-accent font-medium text-surface-0 transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted ${
          size === 'large' ? 'px-5 py-2.5 text-sm' : 'px-4 py-2 text-xs'
        }`}
      >
        Ask
      </button>
    </form>
  );
};

/* ── Thinking Indicator ── */
function ThinkingIndicator() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center">
        {/* Outer glow ring */}
        <div className="absolute h-20 w-20 rounded-full animate-thinking-glow" />
        {/* Inner pulsing dot */}
        <div className="relative h-12 w-12 rounded-full border border-accent/20 bg-surface-1 flex items-center justify-center">
          <div className="flex gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent"
              style={{ animation: 'thinking-dots 1.4s ease-in-out infinite', animationDelay: '0ms' }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent"
              style={{ animation: 'thinking-dots 1.4s ease-in-out infinite', animationDelay: '200ms' }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent"
              style={{ animation: 'thinking-dots 1.4s ease-in-out infinite', animationDelay: '400ms' }}
            />
          </div>
        </div>
      </div>
      <span className="text-xs text-text-muted">Thinking...</span>
    </div>
  );
}
