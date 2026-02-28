'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiKey, ApiKeyModal } from '../api-key';

interface TerminalLine {
  type: 'text' | 'command' | 'response' | 'error' | 'system' | 'image' | 'welcome';
  content: string;
  imageUrl?: string;
}

const ASCII_LOGO = `
 ██████╗██╗     ██╗████████╗██████╗  ██████╗ ███╗   ██╗██╗ ██████╗
██╔════╝██║     ██║╚══██╔══╝██╔══██╗██╔═══██╗████╗  ██║██║██╔════╝
██║     ██║     ██║   ██║   ██████╔╝██║   ██║██╔██╗ ██║██║██║
██║     ██║     ██║   ██║   ██╔══██╗██║   ██║██║╚██╗██║██║██║
╚██████╗███████╗██║   ██║   ██║  ██║╚██████╔╝██║ ╚████║██║╚██████╗
 ╚═════╝╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝ ╚═════╝
`;

const WELCOME_TEXT = `
Your AI-powered hardware companion for electronics

Type a question or use these commands:
  help              Show all commands
  list [category]   List components (passive, active, input, output)
  info <component>  Component details (e.g., info led)
  clear             Clear terminal

`;

const HELP_TEXT = `
Commands:
  help                     Show this help message
  list [category]          List components (categories: passive, active, input, output)
  info <component>         Show detailed component information
  identify                 Upload an image to identify a component
  clear                    Clear the terminal
  settings                 Open API key settings

Ask anything about electronics:
  "What resistor do I need for an LED?"
  "How does a transistor work?"
  "Calculate voltage divider for 5V to 3.3V"

`;

export function RichTerminal() {
  const { apiKey, isConfigured } = useApiKey();
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'welcome', content: ASCII_LOGO },
    { type: 'system', content: WELCOME_TEXT },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addLine = useCallback((line: TerminalLine) => {
    setLines((prev) => [...prev, line]);
  }, []);

  const handleCommand = async (cmd: string) => {
    const trimmedCmd = cmd.trim();
    if (!trimmedCmd) return;

    // Add to history
    setCommandHistory((prev) => [...prev, trimmedCmd]);
    setHistoryIndex(-1);

    addLine({ type: 'command', content: trimmedCmd });

    const parts = trimmedCmd.split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1).join(' ');

    // Handle built-in commands
    if (command === 'help') {
      addLine({ type: 'system', content: HELP_TEXT });
      return;
    }

    if (command === 'clear') {
      setLines([
        { type: 'welcome', content: ASCII_LOGO },
        { type: 'system', content: WELCOME_TEXT },
      ]);
      return;
    }

    if (command === 'settings') {
      setShowSettings(true);
      return;
    }

    if (command === 'identify') {
      fileInputRef.current?.click();
      return;
    }

    // Check for API key
    if (!isConfigured) {
      addLine({
        type: 'error',
        content: '⚠️  API key required. Type "settings" to configure your Anthropic API key.',
      });
      return;
    }

    // Handle API commands
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
        // Treat as a question
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
        addLine({ type: 'error', content: `Error: ${error.error || 'Request failed'}` });
        setIsProcessing(false);
        return;
      }

      const text = await readStreamAsText(res);
      addLine({ type: 'response', content: text });
    } catch (err) {
      addLine({
        type: 'error',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }

    setIsProcessing(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isConfigured) {
      addLine({
        type: 'error',
        content: '⚠️  API key required. Type "settings" to configure your Anthropic API key.',
      });
      return;
    }

    // Show the image
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
          content: `Error: ${err instanceof Error ? err.message : 'Failed to identify'}`,
        });
      }

      setIsProcessing(false);
    };
    reader.readAsDataURL(file);

    // Reset input
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
      className="flex h-screen flex-col bg-[#0d1117] font-mono text-sm"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal content */}
      <div className="flex-1 overflow-y-auto p-4 pb-0">
        {lines.map((line, i) => (
          <TerminalLineRenderer key={i} line={line} />
        ))}

        {/* Input line */}
        <div className="flex items-center gap-2 py-2">
          <span className="text-emerald-400">❯</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            className="flex-1 border-none bg-transparent text-gray-100 caret-emerald-400 outline-none placeholder:text-gray-600"
            placeholder={isProcessing ? '' : 'Type a command or ask a question...'}
            autoFocus
          />
          {isProcessing && (
            <span className="flex items-center gap-2 text-amber-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400"></span>
              thinking...
            </span>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Settings modal */}
      <ApiKeyModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

function TerminalLineRenderer({ line }: { line: TerminalLine }) {
  switch (line.type) {
    case 'welcome':
      return (
        <pre className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
          {line.content}
        </pre>
      );

    case 'system':
      return <pre className="whitespace-pre-wrap text-gray-400">{line.content}</pre>;

    case 'command':
      return (
        <div className="flex items-center gap-2 text-gray-500">
          <span className="text-emerald-600">❯</span>
          <span className="text-gray-300">{line.content}</span>
        </div>
      );

    case 'error':
      return <div className="whitespace-pre-wrap text-red-400">{line.content}</div>;

    case 'image':
      return (
        <div className="my-2 max-w-md overflow-hidden rounded-lg border border-gray-700">
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
                    <code className="rounded bg-gray-800 px-1 py-0.5 text-amber-300">
                      {children}
                    </code>
                  );
                }
                return (
                  <code className="block overflow-x-auto rounded bg-gray-900 p-3 text-emerald-300">
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
                  className="text-blue-400 underline hover:text-blue-300"
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

async function readStreamAsText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return 'Error: No response body';

  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // Parse the Vercel AI SDK data stream format
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('0:"')) {
        try {
          const text = JSON.parse(line.slice(2));
          result += text;
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  return result || '(No response)';
}
