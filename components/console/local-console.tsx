'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ConsoleMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
};

type ToolInvocation = {
  toolName: 'lookup_component' | 'search_components' | 'calculate_resistor' | 'ohms_law';
  summary: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
};

type ModelStatus = {
  status: 'idle' | 'ready' | 'resolving-model' | 'loading-model' | 'error';
  ready: boolean;
  modelRef: string;
  usingDefaultModel: boolean;
  localModelPresent: boolean;
  downloadedModelPath?: string;
  error?: string;
  note: string;
};

const STARTER_PROMPTS = [
  'I want to build a simple LED circuit from scratch. Walk me through it.',
  'What resistor should I use with a red LED on 5V, and why?',
  'Explain transistors like I am smart but rusty.',
  'Help me think through an MVP for a tiny breadboard electronics project.',
];

function createMessage(
  role: ConsoleMessage['role'],
  content: string,
  toolInvocations?: ToolInvocation[]
): ConsoleMessage {
  return {
    id: `${role}-${crypto.randomUUID()}`,
    role,
    content,
    toolInvocations,
  };
}

function formatToolResultValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatToolResultValue(item)).join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function statusClasses(status: ModelStatus['status']) {
  if (status === 'ready') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'error') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (status === 'loading-model' || status === 'resolving-model') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  }

  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
}

export function LocalConsole() {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch('/api/chat', { method: 'GET' });
        const payload = (await response.json()) as ModelStatus;
        setStatus(payload);
      } catch (statusError) {
        setError(
          statusError instanceof Error ? statusError.message : 'Failed to load local model status.'
        );
      } finally {
        setIsCheckingStatus(false);
      }
    };

    void loadStatus();
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isLoading]);

  const subtitle = useMemo(() => {
    if (status?.ready) return 'Local model ready. Text-only MVP.';
    if (status?.status === 'loading-model' || status?.status === 'resolving-model') {
      return 'Preparing the on-box model. First run can take a moment.';
    }
    if (status?.usingDefaultModel) {
      return 'No provider auth. No remote vendor calls. First prompt can auto-download the default GGUF.';
    }

    return 'Console-first local electronics copilot.';
  }, [status]);

  const submitPrompt = async (value?: string) => {
    const nextPrompt = (value ?? prompt).trim();
    if (!nextPrompt || isLoading) return;

    const nextMessages = [...messages, createMessage('user', nextPrompt)];
    setMessages(nextMessages);
    setPrompt('');
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        error?: string;
        status?: ModelStatus;
        toolInvocations?: ToolInvocation[];
      };

      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? 'Local chat failed.');
      }

      setMessages((current) => [
        ...current,
        createMessage('assistant', payload.message ?? '', payload.toolInvocations),
      ]);
      if (payload.status) setStatus(payload.status);
    } catch (submitError) {
      const nextError =
        submitError instanceof Error ? submitError.message : 'Local chat failed unexpectedly.';
      setError(nextError);
      setMessages((current) => [
        ...current,
        createMessage(
          'assistant',
          `I couldn't complete that local response yet.\n\n**Reason:** ${nextError}`
        ),
      ]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  return (
    <main className="min-h-screen bg-[#05070a] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
          <section className="rounded-3xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top,#0f1722,transparent_45%),linear-gradient(180deg,#081018,#06090d)] p-6 shadow-2xl shadow-cyan-950/20">
            <div className="flex flex-wrap items-center gap-3 text-xs tracking-[0.22em] text-cyan-300/80 uppercase">
              <span>Clitronic</span>
              <span className="text-zinc-600">•</span>
              <span>Console-first local MVP</span>
            </div>
            <h1 className="mt-4 max-w-3xl font-mono text-3xl font-semibold text-white sm:text-4xl">
              Local electronics chat, stripped back to the real loop.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
              This pass removes provider auth and the workbench from the main path. What remains is
              the core thing to validate: can a local open-source model hold a useful electronics
              conversation inside a console-first interface.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-zinc-400">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
                text only
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
                no provider auth
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
                no remote vendor calls
              </span>
            </div>
          </section>

          <aside className="rounded-3xl border border-zinc-800 bg-[#090d12] p-5">
            <div className="text-xs tracking-[0.2em] text-zinc-500 uppercase">Model state</div>
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${statusClasses(status?.status ?? 'idle')}`}
            >
              <div className="font-medium">
                {isCheckingStatus ? 'Checking local runtime…' : subtitle}
              </div>
              <p className="mt-2 text-xs leading-6 text-inherit/85">{status?.note}</p>
            </div>
            <dl className="mt-4 space-y-3 text-sm text-zinc-300">
              <div>
                <dt className="text-xs tracking-[0.18em] text-zinc-500 uppercase">
                  Configured model
                </dt>
                <dd className="mt-1 font-mono text-xs break-all text-zinc-300">
                  {status?.modelRef ?? 'Loading…'}
                </dd>
              </div>
              <div>
                <dt className="text-xs tracking-[0.18em] text-zinc-500 uppercase">
                  Cached locally
                </dt>
                <dd className="mt-1">{status?.localModelPresent ? 'yes' : 'not yet'}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-[0.18em] text-zinc-500 uppercase">
                  Current MVP limits
                </dt>
                <dd className="mt-1 text-zinc-400">
                  First local tools are now wired for calculation and component lookup. Voice,
                  images, and workbench visuals are still out of the main flow.
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        <section className="flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-[#080b10] shadow-2xl shadow-black/20">
          <div className="border-b border-zinc-800 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-sm text-zinc-200">/console</div>
                <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  textareaRef.current?.focus();
                }}
                className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-cyan-500/40 hover:text-white"
              >
                reset
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            {messages.length === 0 ? (
              <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center">
                <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs tracking-[0.2em] text-cyan-300 uppercase">
                  ready for conversation
                </div>
                <h2 className="mt-5 font-mono text-2xl text-white sm:text-3xl">
                  Start with a real electronics question.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                  The point of this MVP is simple: test whether the local chat loop feels sharp
                  enough before layering tools and workbench behaviour back in.
                </p>
                <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                  {STARTER_PROMPTS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => {
                        setPrompt(starter);
                        textareaRef.current?.focus();
                      }}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left text-sm text-zinc-300 transition hover:border-cyan-500/30 hover:bg-cyan-500/5 hover:text-white"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                {messages.map((message) => {
                  const isUser = message.role === 'user';

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl border px-4 py-3 sm:max-w-[82%] ${
                          isUser
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-50'
                            : 'border-zinc-800 bg-zinc-950/80 text-zinc-100'
                        }`}
                      >
                        <div className="mb-2 font-mono text-[11px] tracking-[0.22em] text-zinc-500 uppercase">
                          {isUser ? 'user' : 'clitronic'}
                        </div>
                        <div
                          className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : 'dark:prose-invert'}`}
                        >
                          {!isUser &&
                          message.toolInvocations &&
                          message.toolInvocations.length > 0 ? (
                            <div className="not-prose mb-4 space-y-2">
                              {message.toolInvocations.map((toolInvocation, index) => (
                                <div
                                  key={`${message.id}-tool-${index}`}
                                  className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3"
                                >
                                  <div className="font-mono text-[11px] tracking-[0.18em] text-cyan-300 uppercase">
                                    tool · {toolInvocation.toolName}
                                  </div>
                                  <p className="mt-2 text-sm text-zinc-200">
                                    {toolInvocation.summary}
                                  </p>
                                  <dl className="mt-3 space-y-2 text-xs text-zinc-400">
                                    {Object.entries(toolInvocation.result).map(([key, value]) => {
                                      if (key === 'component_context') return null;

                                      return (
                                        <div key={key}>
                                          <dt className="font-mono tracking-[0.16em] text-zinc-500 uppercase">
                                            {key.replaceAll('_', ' ')}
                                          </dt>
                                          <dd className="mt-1 break-words whitespace-pre-wrap text-zinc-300">
                                            {formatToolResultValue(value)}
                                          </dd>
                                        </div>
                                      );
                                    })}
                                  </dl>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              pre: ({ children }) => (
                                <pre className="overflow-x-auto rounded-xl bg-black/40 p-3 text-sm text-zinc-100">
                                  {children}
                                </pre>
                              ),
                              code: ({ children, className }) => {
                                if (!className) {
                                  return (
                                    <code className="rounded bg-white/10 px-1 py-0.5 text-[0.92em]">
                                      {children}
                                    </code>
                                  );
                                }

                                return <code className={className}>{children}</code>;
                              },
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isLoading ? (
                  <div className="flex justify-start">
                    <div className="max-w-[82%] rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
                      <div className="mb-2 font-mono text-[11px] tracking-[0.22em] text-amber-300/70 uppercase">
                        clitronic
                      </div>
                      Thinking locally… first run can take longer if the model still needs to
                      download.
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800 bg-[#090d12] px-4 py-4 sm:px-5">
            <div className="mx-auto max-w-3xl">
              {error ? (
                <div className="mb-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitPrompt();
                }}
                className="rounded-3xl border border-zinc-700 bg-black/30 p-3"
              >
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void submitPrompt();
                    }
                  }}
                  rows={4}
                  placeholder="Ask about a circuit, a component choice, or the shape of the product itself…"
                  className="min-h-[108px] w-full resize-none bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
                  <div className="text-xs text-zinc-500">
                    Text-only MVP for now. Shift+Enter for a new line.
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || prompt.trim().length === 0}
                    className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                  >
                    {isLoading ? 'running locally…' : 'send'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
