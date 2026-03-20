'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LearningMonitor } from '@/components/console/learning-monitor';
import {
  mergeTeacherStates,
  type TeacherState,
  type TeacherToolInvocation,
} from '@/lib/teacher-state';

type ConsoleMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: TeacherToolInvocation[];
  teacherState?: TeacherState;
};

type ModelStatus = {
  status: 'idle' | 'ready' | 'resolving-model' | 'loading-model' | 'error';
  ready: boolean;
  runtimeMode: 'local-model' | 'guided-tools';
  modelRef: string;
  usingDefaultModel: boolean;
  localModelPresent: boolean;
  downloadedModelPath?: string;
  error?: string;
  note: string;
};

const LOCAL_STARTER_PROMPTS = [
  'I want to build a simple LED circuit from scratch. Walk me through it.',
  'What resistor should I use with a red LED on 5V, and why?',
  'Explain transistors like I am smart but rusty.',
  'Help me think through an MVP for a tiny breadboard electronics project.',
];

const HOSTED_STARTER_PROMPTS = [
  'Help me build a simple Arduino LED breadboard circuit. Give me the parts list and wiring plan.',
  'Help me build a Raspberry Pi LED circuit. Give me the parts list and wiring plan.',
  'My Arduino LED circuit is not blinking. Give me a debug checklist.',
  'What resistor should I use with a red LED on 5V, and why?',
];

function createMessage(
  role: ConsoleMessage['role'],
  content: string,
  toolInvocations?: TeacherToolInvocation[],
  teacherState?: TeacherState
): ConsoleMessage {
  return {
    id: `${role}-${crypto.randomUUID()}`,
    role,
    content,
    toolInvocations,
    teacherState,
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
    if (status?.runtimeMode === 'guided-tools') {
      return 'Guided electronics mode. Planning, calculation, and debugging are ready.';
    }

    if (status?.ready) return 'Local model ready. Text-only MVP.';
    if (status?.status === 'loading-model' || status?.status === 'resolving-model') {
      return 'Preparing the on-box model. First run can take a moment.';
    }
    if (status?.usingDefaultModel) {
      return 'No provider auth. No remote vendor calls. First prompt can auto-download the default GGUF.';
    }

    return 'Console-first local electronics copilot.';
  }, [status]);

  const starterPrompts =
    status?.runtimeMode === 'guided-tools' ? HOSTED_STARTER_PROMPTS : LOCAL_STARTER_PROMPTS;

  const engineLabel =
    status?.runtimeMode === 'guided-tools'
      ? 'Clitronic guided engine'
      : (status?.modelRef ?? 'Loading…');

  const modeLabel =
    status?.runtimeMode === 'guided-tools'
      ? 'guided mode'
      : status?.runtimeMode === 'local-model'
        ? 'local model mode'
        : 'loading';

  const latestTeacherState = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.teacherState)?.teacherState;

  const submitPrompt = async (value?: string) => {
    const nextPrompt = (value ?? prompt).trim();
    if (!nextPrompt || isLoading) return;

    const nextUserMessage = createMessage('user', nextPrompt);
    const nextMessages = [...messages, nextUserMessage];
    const assistantId = `assistant-${crypto.randomUUID()}`;
    setMessages([
      ...nextMessages,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        teacherState: latestTeacherState,
      },
    ]);
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

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Local chat failed.');
      }

      if (!response.body) {
        throw new Error('Local chat stream was unavailable.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let toolInvocations: TeacherToolInvocation[] = [];
      let teacherState = latestTeacherState;

      const updateAssistantMessage = () => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: assistantContent,
                  toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
                  teacherState,
                }
              : message
          )
        );
      };

      const handleEvent = (event: Record<string, unknown>) => {
        if (event.type === 'status' && event.status) {
          setStatus(event.status as ModelStatus);
          return;
        }

        if (event.type === 'tool-invocations' && Array.isArray(event.toolInvocations)) {
          toolInvocations = event.toolInvocations as TeacherToolInvocation[];
          updateAssistantMessage();
          return;
        }

        if (event.type === 'teacher-state' && event.teacherState) {
          teacherState = mergeTeacherStates(latestTeacherState, event.teacherState as TeacherState);
          updateAssistantMessage();
          return;
        }

        if (event.type === 'text-delta') {
          assistantContent += String(event.delta ?? '');
          updateAssistantMessage();
          return;
        }

        if (event.type === 'error') {
          if (event.status) setStatus(event.status as ModelStatus);
          throw new Error(String(event.error ?? 'Local chat failed.'));
        }
      };

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          handleEvent(JSON.parse(trimmed) as Record<string, unknown>);
        }
      }

      if (buffer.trim()) {
        handleEvent(JSON.parse(buffer) as Record<string, unknown>);
      }
    } catch (submitError) {
      const nextError =
        submitError instanceof Error ? submitError.message : 'Local chat failed unexpectedly.';
      setError(nextError);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: `I couldn't complete that local response yet.\n\n**Reason:** ${nextError}`,
              }
            : message
        )
      );
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  return (
    <main className="min-h-screen bg-[#05070a] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-[96rem] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
          <section className="rounded-3xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top,#0f1722,transparent_45%),linear-gradient(180deg,#081018,#06090d)] p-6 shadow-2xl shadow-cyan-950/20">
            <div className="flex flex-wrap items-center gap-3 text-xs tracking-[0.22em] text-cyan-300/80 uppercase">
              <span>Clitronic</span>
              <span className="text-zinc-600">•</span>
              <span>Console-first local MVP</span>
            </div>
            <h1 className="mt-4 max-w-3xl font-mono text-3xl font-semibold text-white sm:text-4xl">
              {status?.runtimeMode === 'guided-tools'
                ? 'Electronics guidance that can plan, calculate, and debug.'
                : 'Local electronics chat, stripped back to the real loop.'}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
              {status?.runtimeMode === 'guided-tools'
                ? 'Clitronic can already do useful work here: pick resistor values, explain components, generate starter plans, and help debug simple learner circuits without hiding behind vague chat.'
                : 'This pass removes provider auth and the workbench from the main path. What remains is the core thing to validate: can a local open-source model hold a useful electronics conversation inside a console-first interface.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-zinc-400">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
                chat-led learning
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
                no provider auth
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
                no remote vendor calls
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5">
                guided tools live
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
                <dt className="text-xs tracking-[0.18em] text-zinc-500 uppercase">Active engine</dt>
                <dd className="mt-1 font-mono text-xs break-all text-zinc-300">{engineLabel}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-[0.18em] text-zinc-500 uppercase">
                  Interaction mode
                </dt>
                <dd className="mt-1">{modeLabel}</dd>
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
                  The current monitor supports guided visuals for calculations, component lookup,
                  circuit planning, and LED debugging. Voice input and richer open-ended simulation
                  flows are the next expansion points.
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        <div className="grid min-h-[60vh] flex-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
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
                    {status?.runtimeMode === 'guided-tools'
                      ? 'Guided mode is now good for concrete learner help: parts lists, wiring plans, resistor picks, and first-pass debug guidance.'
                      : 'The point of this MVP is simple: test whether the local chat loop feels sharp enough before layering tools and workbench behaviour back in.'}
                  </p>
                  <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                    {starterPrompts.map((starter) => (
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
                                        if (
                                          key === 'component_context' ||
                                          key.startsWith('monitor_')
                                        ) {
                                          return null;
                                        }

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

                  {isLoading && messages[messages.length - 1]?.content.length === 0 ? (
                    <div className="flex justify-start">
                      <div className="max-w-[82%] rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
                        <div className="mb-2 font-mono text-[11px] tracking-[0.22em] text-amber-300/70 uppercase">
                          clitronic
                        </div>
                        {status?.runtimeMode === 'guided-tools'
                          ? 'Working through the guided tool layer…'
                          : 'Thinking locally… first run can take longer if the model still needs to download.'}
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
                      Chat-led learning surface. Shift+Enter for a new line.
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

          <LearningMonitor
            teacherState={latestTeacherState}
            isLoading={isLoading}
            onQuickPrompt={(nextPrompt) => {
              setPrompt(nextPrompt);
              textareaRef.current?.focus();
            }}
          />
        </div>
      </div>
    </main>
  );
}
