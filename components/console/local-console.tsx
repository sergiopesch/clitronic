'use client';

import { useEffect, useRef, useState } from 'react';
import { UIRenderer } from '@/components/ui/ui-renderer';
import type { StructuredResponse } from '@/lib/ai/response-schema';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structured?: StructuredResponse;
};

const STARTER_PROMPTS = [
  'Help me build a simple Arduino LED breadboard circuit. Give me the parts list and wiring plan.',
  'What resistor should I use with a red LED on 5V, and why?',
  'Compare Arduino Uno vs Raspberry Pi Pico for a beginner.',
  'My Arduino LED circuit is not blinking. Give me a debug checklist.',
];

export function LocalConsole() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isLoading]);

  const submitPrompt = async (value?: string) => {
    const nextPrompt = (value ?? prompt).trim();
    if (!nextPrompt || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: 'user',
      content: nextPrompt,
    };

    const history = [...messages, userMessage];
    setMessages(history);
    setPrompt('');
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({
            role: m.role,
            content: m.role === 'assistant' && m.structured
              ? JSON.stringify(m.structured)
              : m.content,
          })),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Request failed.');
      }

      const structured = (await response.json()) as StructuredResponse;

      const assistantMessage: ChatMessage = {
        id: `assistant-${crypto.randomUUID()}`,
        role: 'assistant',
        content: structured.text ?? '',
        structured,
      };

      setMessages([...history, assistantMessage]);
    } catch (submitError) {
      const msg = submitError instanceof Error ? submitError.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-surface-0">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-sm font-semibold text-accent">clitronic</h1>
          <span className="hidden text-xs text-text-muted sm:inline">/</span>
          <span className="hidden text-xs text-text-muted sm:inline">electronics companion</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            setError(null);
            textareaRef.current?.focus();
          }}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-border-accent hover:text-text-primary"
        >
          reset
        </button>
      </header>

      {/* Main content */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6">
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onSelectPrompt={(s) => void submitPrompt(s)} />
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent/80">
                    <span className="inline-block animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border pt-3">
          {error && (
            <div className="mb-3 rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-sm text-error">
              {error}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitPrompt();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submitPrompt();
                }
              }}
              rows={1}
              placeholder="Ask about a circuit, component, or electronics concept..."
              className="min-h-[40px] flex-1 resize-none rounded-lg border border-border bg-surface-1 px-3 py-2.5 font-mono text-sm text-text-primary caret-accent outline-none transition placeholder:text-text-muted focus:border-border-accent"
            />
            <button
              type="submit"
              disabled={isLoading || prompt.trim().length === 0}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-surface-0 transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
            >
              {isLoading ? 'running...' : 'send'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function EmptyState({ onSelectPrompt }: { onSelectPrompt: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <div className="font-mono text-2xl text-accent">&#9889;</div>
      <h2 className="mt-3 font-mono text-lg font-semibold text-text-primary">
        Ready to help with electronics.
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">
        Ask about circuits, components, calculations, or troubleshooting.
        Responses render as structured cards when visual detail helps.
      </p>

      <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {STARTER_PROMPTS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onSelectPrompt(starter)}
            className="rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-left text-sm text-text-secondary transition hover:border-border-accent hover:text-text-primary"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl border border-accent/20 bg-accent/8 px-4 py-3 text-sm text-text-primary">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message — render structured response
  if (message.structured) {
    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[90%]">
          <UIRenderer response={message.structured} />
        </div>
      </div>
    );
  }

  // Fallback for assistant messages without structured data
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary">
        {message.content}
      </div>
    </div>
  );
}
