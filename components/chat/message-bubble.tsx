'use client';

import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ComponentCard } from './component-card';
import type { ElectronicsComponent } from '@/lib/data/types';

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div
                key={i}
                className={`prose prose-sm max-w-none ${
                  isUser ? 'prose-invert' : 'dark:prose-invert'
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: ({ children }) => (
                      <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-sm text-zinc-100 dark:bg-zinc-950">
                        {children}
                      </pre>
                    ),
                    code: ({ children, className }) => {
                      const isInline = !className;
                      if (isInline) {
                        return (
                          <code className="rounded bg-zinc-200 px-1 py-0.5 text-sm dark:bg-zinc-700">
                            {children}
                          </code>
                        );
                      }
                      return <code className={className}>{children}</code>;
                    },
                    table: ({ children }) => (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">{children}</table>
                      </div>
                    ),
                  }}
                >
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }

          if (part.type === 'file') {
            const filePart = part as unknown as {
              type: 'file';
              url: string;
              mediaType: string;
            };
            if (filePart.mediaType?.startsWith('image/')) {
              return (
                <div key={i} className="mb-2">
                  <img src={filePart.url} alt="Uploaded" className="max-h-48 rounded-lg" />
                </div>
              );
            }
          }

          if (part.type === 'tool-invocation') {
            const inv = (
              part as unknown as {
                toolInvocation: {
                  state: string;
                  toolName: string;
                  result?: Record<string, unknown>;
                };
              }
            ).toolInvocation;
            if (!inv || inv.state !== 'result') return null;

            if (inv.toolName === 'lookup_component' && inv.result?.found) {
              return (
                <ComponentCard key={i} component={inv.result.component as ElectronicsComponent} />
              );
            }

            if (inv.toolName === 'search_components' && inv.result) {
              const components = (
                inv.result as {
                  components: Array<{
                    id: string;
                    name: string;
                    category: string;
                    description: string;
                  }>;
                }
              ).components;
              if (components?.length > 0) {
                return (
                  <div key={i} className="mt-3 space-y-2">
                    {components.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{c.name}</span>
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-700">
                            {c.category}
                          </span>
                        </div>
                        <p className="mt-1 text-sm opacity-80">{c.description.slice(0, 120)}...</p>
                      </div>
                    ))}
                  </div>
                );
              }
            }
            return null;
          }

          return null;
        })}
      </div>
    </div>
  );
}
