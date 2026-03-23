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

function StatusDot({ status }: { status: ModelStatus['status'] }) {
  if (status === 'ready')
    return <span className="inline-block h-2 w-2 rounded-full bg-success" />;
  if (status === 'error')
    return <span className="inline-block h-2 w-2 rounded-full bg-error" />;
  if (status === 'loading-model' || status === 'resolving-model')
    return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-warning" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-text-muted" />;
}

export function LocalConsole() {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [showModelInfo, setShowModelInfo] = useState(false);
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
      ? 'guided engine'
      : (status?.modelRef ?? 'loading');

  const modeLabel =
    status?.runtimeMode === 'guided-tools'
      ? 'guided'
      : status?.runtimeMode === 'local-model'
        ? 'local'
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
    <main className="flex min-h-screen flex-col bg-surface-0">
      {/* ── Slim header ── */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-sm font-semibold text-accent">clitronic</h1>
          <span className="hidden text-xs text-text-muted sm:inline">/</span>
          <span className="hidden text-xs text-text-muted sm:inline">{subtitle}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowModelInfo(!showModelInfo)}
            className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-border-accent hover:text-text-primary"
          >
            <StatusDot status={status?.status ?? 'idle'} />
            <span className="hidden sm:inline">{modeLabel}</span>
          </button>
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
        </div>
      </header>

      {/* ── Collapsible model info ── */}
      {showModelInfo && (
        <div className="border-b border-border bg-surface-1 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-secondary">
            <div>
              <span className="text-text-muted">Engine:</span>{' '}
              <span className="font-mono">{engineLabel}</span>
            </div>
            <div>
              <span className="text-text-muted">Mode:</span> {modeLabel}
            </div>
            <div>
              <span className="text-text-muted">Cached:</span>{' '}
              {status?.localModelPresent ? 'yes' : 'not yet'}
            </div>
            {status?.note && (
              <div className="basis-full text-text-muted">{status.note}</div>
            )}
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="mx-auto flex w-full max-w-[96rem] flex-1 gap-4 overflow-hidden px-4 py-4 sm:px-6">
        {/* Chat column */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {messages.length === 0 ? (
              <EmptyState
                starterPrompts={starterPrompts}
                runtimeMode={status?.runtimeMode}
                isCheckingStatus={isCheckingStatus}
                onSelectPrompt={(starter) => void submitPrompt(starter)}
              />
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                {messages.map((message) => (
                  <MessageRow key={message.id} message={message} />
                ))}

                {isLoading && messages[messages.length - 1]?.content.length === 0 && (
                  <div className="flex justify-start">
                    <div className="max-w-[82%] rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning/90">
                      {status?.runtimeMode === 'guided-tools'
                        ? 'Working through the guided tool layer...'
                        : 'Thinking locally... first run can take longer if the model still needs to download.'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Chat input ── */}
          <div className="border-t border-border bg-surface-2 px-4 py-3 sm:px-5">
            <div className="mx-auto max-w-3xl">
              {error && (
                <div className="mb-3 rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-sm text-error">
                  {error}
                </div>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitPrompt();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    // Auto-grow
                    const el = event.target;
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void submitPrompt();
                    }
                  }}
                  rows={1}
                  placeholder="Ask about a circuit, a component, or an electronics concept..."
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
        </section>

        {/* Learning monitor column */}
        <div className="hidden w-[380px] shrink-0 xl:block 2xl:w-[440px]">
          <LearningMonitor
            teacherState={latestTeacherState}
            isLoading={isLoading}
            onQuickPrompt={(nextPrompt) => void submitPrompt(nextPrompt)}
          />
        </div>
      </div>
    </main>
  );
}

function EmptyState({
  starterPrompts,
  runtimeMode,
  isCheckingStatus,
  onSelectPrompt,
}: {
  starterPrompts: string[];
  runtimeMode?: string;
  isCheckingStatus: boolean;
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <div className="font-mono text-2xl text-accent">&#9889;</div>
      <h2 className="mt-3 font-mono text-lg font-semibold text-text-primary">
        {isCheckingStatus
          ? 'Starting up...'
          : runtimeMode === 'guided-tools'
            ? 'Ready to help with electronics.'
            : 'Start with a real question.'}
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">
        {runtimeMode === 'guided-tools'
          ? 'Guided mode can help with parts lists, wiring plans, resistor calculations, and debug checklists.'
          : 'Ask about circuits, components, or breadboard projects. The monitor panel will follow along with diagrams and reference material.'}
      </p>

      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {starterPrompts.map((starter) => (
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

function MessageRow({ message }: { message: ConsoleMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 ${
          isUser
            ? 'border border-accent/20 bg-accent/8 text-text-primary'
            : 'border border-border bg-surface-2 text-text-primary'
        }`}
      >
        {!isUser && message.toolInvocations && message.toolInvocations.length > 0 && (
          <div className="not-prose mb-3 space-y-2">
            {message.toolInvocations.map((toolInvocation, index) => (
              <div
                key={`${message.id}-tool-${index}`}
                className="rounded-lg border border-accent/15 bg-accent/5 p-3"
              >
                <div className="font-mono text-[11px] tracking-widest text-accent/80 uppercase">
                  {toolInvocation.toolName}
                </div>
                <p className="mt-1.5 text-sm text-text-secondary">{toolInvocation.summary}</p>
                <dl className="mt-2 space-y-1.5 text-xs text-text-muted">
                  {Object.entries(toolInvocation.result).map(([key, value]) => {
                    if (key === 'component_context' || key.startsWith('monitor_')) return null;
                    return (
                      <div key={key}>
                        <dt className="font-mono tracking-wider text-text-muted uppercase">
                          {key.replaceAll('_', ' ')}
                        </dt>
                        <dd className="mt-0.5 break-words whitespace-pre-wrap text-text-secondary">
                          {formatToolResultValue(value)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        )}

        <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : 'dark:prose-invert'}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre: ({ children }) => (
                <pre className="overflow-x-auto rounded-lg bg-surface-0/60 p-3 text-sm text-text-primary">
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
}
