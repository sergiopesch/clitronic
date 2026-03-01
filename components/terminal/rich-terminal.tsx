'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiKey } from '../api-key';

interface TerminalLine {
  type: 'text' | 'command' | 'response' | 'error' | 'system' | 'image' | 'welcome' | 'ascii';
  content: string;
  imageUrl?: string;
}

// Clitronic branded ASCII art with circuit theme
const ASCII_LOGO = `
 ██████╗██╗     ██╗████████╗██████╗  ██████╗ ███╗   ██╗██╗ ██████╗
██╔════╝██║     ██║╚══██╔══╝██╔══██╗██╔═══██╗████╗  ██║██║██╔════╝
██║     ██║     ██║   ██║   ██████╔╝██║   ██║██╔██╗ ██║██║██║
██║     ██║     ██║   ██║   ██╔══██╗██║   ██║██║╚██╗██║██║██║
╚██████╗███████╗██║   ██║   ██║  ██║╚██████╔╝██║ ╚████║██║╚██████╗
 ╚═════╝╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝ ╚═════╝
`;

const CIRCUIT_ART = `┌──────────────────────────────────────────────────────────────────┐
│  ┌─[R1]─┬──●──[C1]──┐    Your AI-powered hardware companion     │
│  │      │           │    for electronics and robotics           │
│ [+]    [LED]       ─┴─                                          │
│  │      │          ───   Type 'help' for commands               │
│  └──────┴───────────┴─   or just ask anything!                  │
└──────────────────────────────────────────────────────────────────┘`;

const HELP_TEXT = `
┌─────────────────────────────────────────────────────────────────┐
│                        COMMANDS                                 │
├─────────────────────────────────────────────────────────────────┤
│  help                Show this help message                     │
│  list [category]     List components (passive/active/input/out) │
│  info <component>    Component details (e.g., info led)         │
│  identify            Upload an image to identify a component    │
│  clear               Clear the terminal                         │
│  key                 Set or update your Anthropic API key       │
├─────────────────────────────────────────────────────────────────┤
│  Or just type a question about electronics!                     │
│  Examples:                                                      │
│    "What resistor for a 5V LED?"                                │
│    "How does a transistor work?"                                │
│    "Calculate voltage divider 5V to 3.3V"                       │
└─────────────────────────────────────────────────────────────────┘
`;

export function RichTerminal() {
  const { apiKey, isConfigured, setApiKey } = useApiKey();
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'welcome', content: ASCII_LOGO },
    { type: 'ascii', content: CIRCUIT_ART },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLine = useCallback((line: TerminalLine) => {
    setLines((prev) => [...prev, line]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleApiKeySave = useCallback(() => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      setShowApiKeyInput(false);
      addLine({ type: 'system', content: '✓ API key saved successfully!' });
    }
  }, [apiKeyInput, setApiKey, addLine]);

  const handleCommand = async (cmd: string) => {
    const trimmedCmd = cmd.trim();
    if (!trimmedCmd) return;

    setCommandHistory((prev) => [...prev, trimmedCmd]);
    setHistoryIndex(-1);
    addLine({ type: 'command', content: trimmedCmd });

    const parts = trimmedCmd.split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1).join(' ');

    // Built-in commands
    if (command === 'help') {
      addLine({ type: 'ascii', content: HELP_TEXT });
      return;
    }

    if (command === 'clear') {
      setLines([
        { type: 'welcome', content: ASCII_LOGO },
        { type: 'ascii', content: CIRCUIT_ART },
      ]);
      return;
    }

    if (command === 'key') {
      setShowApiKeyInput(true);
      return;
    }

    if (command === 'identify') {
      if (!isConfigured) {
        addLine({ type: 'error', content: '✗ API key required. Type "key" to configure.' });
        setShowApiKeyInput(true);
        return;
      }
      fileInputRef.current?.click();
      return;
    }

    // Commands that require API key
    if (!isConfigured) {
      addLine({
        type: 'error',
        content: '✗ API key required. Type "key" to configure your Anthropic API key.',
      });
      setShowApiKeyInput(true);
      return;
    }

    setIsProcessing(true);

    try {
      let prompt = '';

      if (command === 'list') {
        prompt = args
          ? `List all ${args} components from your knowledge base. Format as a clean list with name and one-line description.`
          : 'List all components in your knowledge base grouped by category. Format as a clean list with name and one-line description.';
      } else if (command === 'info') {
        if (!args) {
          addLine({ type: 'error', content: 'Usage: info <component-name>' });
          setIsProcessing(false);
          return;
        }
        prompt = `Look up the component "${args}" using your lookup_component tool. Give me its full specs, pinout, circuit example, and tips.`;
      } else {
        prompt = trimmedCmd;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey || '',
        },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: prompt }] }],
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        addLine({ type: 'error', content: `✗ Error: ${error.error || 'Request failed'}` });
        setIsProcessing(false);
        return;
      }

      const text = await readStreamAsText(res);
      addLine({ type: 'response', content: text });
    } catch (err) {
      addLine({
        type: 'error',
        content: `✗ Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }

    setIsProcessing(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isConfigured) {
      addLine({ type: 'error', content: '✗ API key required. Type "key" to configure.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      addLine({ type: 'command', content: `identify ${file.name}` });
      addLine({ type: 'image', content: '', imageUrl: dataUrl });

      setIsProcessing(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey || '',
          },
          body: JSON.stringify({
            messages: [
              {
                id: '1',
                role: 'user',
                parts: [
                  { type: 'file', url: dataUrl, mediaType: file.type || 'image/jpeg' },
                  {
                    type: 'text',
                    text: 'Identify this electronic component. Tell me what it is, its specifications, how to use it, and any tips. If you can read markings or color codes, decode them.',
                  },
                ],
              },
            ],
          }),
        });

        const text = await readStreamAsText(res);
        addLine({ type: 'response', content: text });
      } catch (err) {
        addLine({
          type: 'error',
          content: `✗ Error: ${err instanceof Error ? err.message : 'Failed to identify'}`,
        });
      }

      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleCommand(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  return (
    <div
      className="flex h-screen flex-col bg-[#0a0e14] font-mono text-sm"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal content */}
      <div className="flex-1 overflow-y-auto p-4 pb-0">
        {lines.map((line, i) => (
          <TerminalLineRenderer key={i} line={line} />
        ))}

        {/* API Key inline input */}
        {showApiKeyInput && (
          <div
            className="my-3 rounded border border-cyan-500/30 bg-cyan-500/5 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 text-cyan-400">
              <span className="text-lg">⚡</span>
              <span className="font-semibold">Enter your Anthropic API Key</span>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              Stored locally in your browser.{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-500 hover:underline"
              >
                Get a key →
              </a>
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApiKeySave();
                  if (e.key === 'Escape') setShowApiKeyInput(false);
                }}
                placeholder="sk-ant-..."
                className="flex-1 rounded border border-cyan-500/30 bg-[#0a0e14] px-3 py-2 text-gray-100 placeholder:text-gray-600 focus:border-cyan-400 focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleApiKeySave}
                disabled={!apiKeyInput.trim()}
                className="rounded bg-cyan-600 px-4 py-2 font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setShowApiKeyInput(false)}
                className="rounded border border-gray-600 px-3 py-2 text-gray-400 transition-colors hover:bg-gray-800"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Input line */}
        <div className="flex items-center gap-2 py-2">
          <span className="text-cyan-400">❯</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            className="flex-1 border-none bg-transparent text-gray-100 caret-cyan-400 outline-none placeholder:text-gray-600"
            placeholder={isProcessing ? '' : 'Type a command or ask about electronics...'}
            autoFocus
          />
          {isProcessing && (
            <span className="flex items-center gap-2 text-cyan-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400"></span>
              processing...
            </span>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      <div className="border-t border-gray-800 bg-[#0a0e14] px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="text-cyan-500">⚡</span>
              clitronic
            </span>
            <span>
              {isConfigured ? (
                <span className="text-green-500">● connected</span>
              ) : (
                <span className="text-amber-500">○ no api key</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span>↑↓ history</span>
            <span>help for commands</span>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );
}

function TerminalLineRenderer({ line }: { line: TerminalLine }) {
  switch (line.type) {
    case 'welcome':
      return (
        <pre className="bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent">
          {line.content}
        </pre>
      );

    case 'ascii':
      return <pre className="whitespace-pre text-cyan-600/70">{line.content}</pre>;

    case 'system':
      return <pre className="whitespace-pre-wrap text-green-400">{line.content}</pre>;

    case 'command':
      return (
        <div className="flex items-center gap-2 text-gray-500">
          <span className="text-cyan-600">❯</span>
          <span className="text-gray-300">{line.content}</span>
        </div>
      );

    case 'error':
      return <div className="whitespace-pre-wrap text-red-400">{line.content}</div>;

    case 'image':
      return (
        <div className="my-2 max-w-sm overflow-hidden rounded border border-cyan-500/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={line.imageUrl} alt="Uploaded component" className="w-full" />
        </div>
      );

    case 'response':
      return (
        <div className="prose prose-invert prose-sm max-w-none py-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="mb-2 text-lg font-bold text-cyan-400">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-2 text-base font-bold text-cyan-400">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-1 text-sm font-bold text-cyan-300">{children}</h3>
              ),
              p: ({ children }) => <p className="mb-2 text-gray-300">{children}</p>,
              ul: ({ children }) => (
                <ul className="mb-2 list-inside list-disc text-gray-300">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-2 list-inside list-decimal text-gray-300">{children}</ol>
              ),
              li: ({ children }) => <li className="text-gray-300">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-bold text-white">{children}</strong>
              ),
              em: ({ children }) => <em className="text-gray-200">{children}</em>,
              code: ({ className, children }) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code className="rounded bg-gray-800 px-1 py-0.5 text-cyan-300">
                      {children}
                    </code>
                  );
                }
                return (
                  <code className="block overflow-x-auto rounded bg-gray-900 p-3 text-cyan-300">
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => (
                <pre className="my-2 overflow-x-auto rounded bg-gray-900 p-3">{children}</pre>
              ),
              table: ({ children }) => (
                <table className="my-2 w-full border-collapse text-sm">{children}</table>
              ),
              th: ({ children }) => (
                <th className="border border-gray-700 bg-gray-800 px-3 py-1 text-left text-cyan-400">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-gray-700 px-3 py-1 text-gray-300">{children}</td>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-cyan-400 underline hover:text-cyan-300"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-cyan-500 pl-3 text-gray-400 italic">
                  {children}
                </blockquote>
              ),
            }}
          >
            {line.content}
          </ReactMarkdown>
        </div>
      );

    default:
      return <div className="whitespace-pre-wrap text-gray-300">{line.content}</div>;
  }
}

// Parse AI SDK v5 UIMessage SSE stream format
async function readStreamAsText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return 'Error: No response body';

  const decoder = new TextDecoder();
  let result = '';
  let buffer = '';
  let errorMessage = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // SSE format: "data: {...}" or "data: [DONE]"
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);

        if (data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data);

          // Handle error messages
          if (parsed.type === 'error' && parsed.errorText) {
            errorMessage = parsed.errorText;
          }

          // Handle text deltas (the actual content)
          if (parsed.type === 'text-delta' && parsed.textDelta) {
            result += parsed.textDelta;
          }

          // Handle full text (some responses send complete text)
          if (parsed.type === 'text' && parsed.text) {
            result += parsed.text;
          }
        } catch {
          // Not JSON, skip
        }
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim().startsWith('data: ')) {
    const data = buffer.trim().slice(6);
    if (data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'text-delta' && parsed.textDelta) {
          result += parsed.textDelta;
        }
        if (parsed.type === 'error' && parsed.errorText) {
          errorMessage = parsed.errorText;
        }
      } catch {
        // skip
      }
    }
  }

  if (errorMessage) {
    return `Error: ${errorMessage}`;
  }

  return result || '(No response received)';
}
