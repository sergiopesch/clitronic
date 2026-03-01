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

// Clean, minimal welcome
const WELCOME_CONTENT = `
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│     ██████╗██╗     ██╗████████╗██████╗  ██████╗ ███╗   ██╗██╗ ██████╗  │
│    ██╔════╝██║     ██║╚══██╔══╝██╔══██╗██╔═══██╗████╗  ██║██║██╔════╝  │
│    ██║     ██║     ██║   ██║   ██████╔╝██║   ██║██╔██╗ ██║██║██║       │
│    ██║     ██║     ██║   ██║   ██╔══██╗██║   ██║██║╚██╗██║██║██║       │
│    ╚██████╗███████╗██║   ██║   ██║  ██║╚██████╔╝██║ ╚████║██║╚██████╗  │
│     ╚═════╝╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚══╝╚═╝ ╚═════╝  │
│                                                                        │
│                  ⚡ AI-Powered Electronics Companion                   │
│                                                                        │
│    Commands:  help • identify • list • info • key • clear             │
│    Or just ask anything about electronics!                             │
│    Drop an image to identify components.                               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
`;

const HELP_TEXT = `
  ┌─────────────────────────────────────────────────────────────┐
  │  COMMANDS                                                   │
  ├─────────────────────────────────────────────────────────────┤
  │  help              Show this help message                   │
  │  list [category]   List components (passive/active/etc)    │
  │  info <component>  Get component details                    │
  │  identify          Upload image to identify component       │
  │  clear             Clear terminal                           │
  │  key               Configure API key                        │
  ├─────────────────────────────────────────────────────────────┤
  │  Or just ask a question! Examples:                          │
  │    "What resistor for a 5V LED?"                            │
  │    "How does a transistor work?"                            │
  │    "Calculate voltage divider 5V to 3.3V"                   │
  └─────────────────────────────────────────────────────────────┘
`;

export function RichTerminal() {
  const { apiKey, isConfigured, setApiKey } = useApiKey();
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'welcome', content: WELCOME_CONTENT },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldScrollRef = useRef(true);

  const addLine = useCallback((line: TerminalLine) => {
    setLines((prev) => [...prev, line]);
    shouldScrollRef.current = true;
  }, []);

  // Smooth scroll to bottom only when needed
  useEffect(() => {
    if (shouldScrollRef.current && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
      shouldScrollRef.current = false;
    }
  }, [lines, streamingContent]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleApiKeySave = useCallback(() => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      setShowApiKeyInput(false);
      addLine({ type: 'system', content: '✓ API key configured' });
    }
  }, [apiKeyInput, setApiKey, addLine]);

  // Process image for API (extract base64 from data URL)
  const processImageForApi = (dataUrl: string): { data: string; mediaType: string } => {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return { data: matches[2], mediaType: matches[1] };
    }
    return { data: dataUrl, mediaType: 'image/jpeg' };
  };

  // Send image for analysis
  const analyzeImage = useCallback(async (dataUrl: string, fileName: string) => {
    if (!isConfigured) {
      addLine({ type: 'error', content: '✗ API key required. Type "key" to configure.' });
      setShowApiKeyInput(true);
      return;
    }

    addLine({ type: 'command', content: `identify ${fileName}` });
    addLine({ type: 'image', content: '', imageUrl: dataUrl });
    setIsProcessing(true);

    try {
      const { data: imageData, mediaType } = processImageForApi(dataUrl);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey || '',
        },
        body: JSON.stringify({
          messages: [
            {
              id: Date.now().toString(),
              role: 'user',
              parts: [
                {
                  type: 'image',
                  image: imageData,
                  mimeType: mediaType,
                },
                {
                  type: 'text',
                  text: 'Identify this electronic component. Provide: 1) What it is, 2) Key specifications, 3) Common uses, 4) How to use it in a circuit. If there are markings or color codes, decode them.',
                },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        try {
          const error = JSON.parse(errorText);
          addLine({ type: 'error', content: `✗ ${error.error || 'Request failed'}` });
        } catch {
          addLine({ type: 'error', content: `✗ HTTP ${res.status}: ${res.statusText}` });
        }
      } else {
        const text = await streamResponse(res, (chunk) => {
          setStreamingContent((prev) => prev + chunk);
          shouldScrollRef.current = true;
        });
        setStreamingContent('');

        if (text.startsWith('Error:')) {
          addLine({ type: 'error', content: `✗ ${text}` });
        } else {
          addLine({ type: 'response', content: text });
        }
      }
    } catch (err) {
      setStreamingContent('');
      addLine({
        type: 'error',
        content: `✗ ${err instanceof Error ? err.message : 'Failed to analyze image'}`,
      });
    }

    setIsProcessing(false);
  }, [apiKey, isConfigured, addLine]);

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
      setLines([{ type: 'welcome', content: WELCOME_CONTENT }]);
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
        content: '✗ API key required. Type "key" to configure.',
      });
      setShowApiKeyInput(true);
      return;
    }

    setIsProcessing(true);

    try {
      let prompt = trimmedCmd;

      if (command === 'list') {
        prompt = args
          ? `List ${args} electronic components with brief descriptions.`
          : 'List electronic components by category with brief descriptions.';
      } else if (command === 'info') {
        if (!args) {
          addLine({ type: 'error', content: 'Usage: info <component>' });
          setIsProcessing(false);
          return;
        }
        prompt = `Provide detailed info about "${args}": specs, pinout, circuit examples, and tips.`;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey || '',
        },
        body: JSON.stringify({
          messages: [
            {
              id: Date.now().toString(),
              role: 'user',
              parts: [{ type: 'text', text: prompt }],
            },
          ],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        try {
          const error = JSON.parse(errorText);
          addLine({ type: 'error', content: `✗ ${error.error || 'Request failed'}` });
        } catch {
          addLine({ type: 'error', content: `✗ HTTP ${res.status}: ${res.statusText}` });
        }
        setIsProcessing(false);
        return;
      }

      const text = await streamResponse(res, (chunk) => {
        setStreamingContent((prev) => prev + chunk);
        shouldScrollRef.current = true;
      });
      setStreamingContent('');

      if (text.startsWith('Error:')) {
        addLine({ type: 'error', content: `✗ ${text}` });
      } else {
        addLine({ type: 'response', content: text });
      }
    } catch (err) {
      setStreamingContent('');
      addLine({
        type: 'error',
        content: `✗ ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }

    setIsProcessing(false);
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }, [isDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file?.type.startsWith('image/')) {
      addLine({ type: 'error', content: '✗ Please drop an image file' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      analyzeImage(dataUrl, file.name);
    };
    reader.readAsDataURL(file);
  }, [addLine, analyzeImage]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      analyzeImage(dataUrl, file.name);
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
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  return (
    <div
      className={`relative flex h-screen flex-col bg-[#0d1117] font-mono text-[13px] leading-relaxed ${
        isDragging ? 'ring-2 ring-inset ring-cyan-400' : ''
      }`}
      onClick={() => inputRef.current?.focus()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0d1117]/90 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-500/10 px-12 py-8 text-center">
            <div className="mb-3 text-5xl">📷</div>
            <div className="text-xl font-semibold text-cyan-400">Drop image</div>
            <div className="mt-1 text-sm text-gray-400">to identify component</div>
          </div>
        </div>
      )}

      {/* Terminal content */}
      <div ref={containerRef} className="flex-1 overflow-y-auto scroll-smooth px-4 py-3">
        {lines.map((line, i) => (
          <TerminalLine key={i} line={line} />
        ))}

        {/* Streaming content */}
        {streamingContent && (
          <div className="my-2 text-gray-200">
            <MarkdownContent content={streamingContent} />
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-cyan-400" />
          </div>
        )}

        {/* API Key input */}
        {showApiKeyInput && (
          <div
            className="my-3 max-w-lg rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 text-cyan-400">
              <span>⚡</span>
              <span className="font-medium">Anthropic API Key</span>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              Stored locally.{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-500 hover:underline"
              >
                Get one →
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
                className="flex-1 rounded border border-gray-700 bg-[#161b22] px-3 py-2 text-gray-100 placeholder:text-gray-600 focus:border-cyan-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleApiKeySave}
                disabled={!apiKeyInput.trim()}
                className="rounded bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Input line */}
        <div className="sticky bottom-0 flex items-center gap-2 bg-[#0d1117] py-2">
          <span className="text-cyan-500">❯</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            className="flex-1 bg-transparent text-gray-100 caret-cyan-400 outline-none placeholder:text-gray-600"
            placeholder={isProcessing ? 'Processing...' : 'Ask about electronics...'}
          />
          {isProcessing && (
            <span className="flex items-center gap-2 text-cyan-500 text-xs">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            </span>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t border-gray-800 bg-[#0d1117] px-4 py-1.5">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-cyan-500">
              ⚡ clitronic
            </span>
            <span className={isConfigured ? 'text-green-500' : 'text-amber-500'}>
              {isConfigured ? '● ready' : '○ need key'}
            </span>
          </div>
          <span className="text-gray-600">↑↓ history • help</span>
        </div>
      </div>

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

function TerminalLine({ line }: { line: TerminalLine }) {
  switch (line.type) {
    case 'welcome':
      return (
        <pre className="whitespace-pre text-cyan-500/90 text-xs leading-tight">
          {line.content}
        </pre>
      );

    case 'ascii':
      return (
        <pre className="whitespace-pre text-cyan-600/60 text-xs leading-tight">
          {line.content}
        </pre>
      );

    case 'system':
      return (
        <div className="py-1 text-green-400">{line.content}</div>
      );

    case 'command':
      return (
        <div className="flex items-center gap-2 py-1">
          <span className="text-cyan-600">❯</span>
          <span className="text-gray-300">{line.content}</span>
        </div>
      );

    case 'error':
      return (
        <div className="py-1 text-red-400">{line.content}</div>
      );

    case 'image':
      return (
        <div className="my-2 max-w-xs overflow-hidden rounded-lg border border-gray-700">
          <img src={line.imageUrl} alt="Component" className="w-full" />
        </div>
      );

    case 'response':
      return (
        <div className="my-2 text-gray-200">
          <MarkdownContent content={line.content} />
        </div>
      );

    default:
      return <div className="py-1 text-gray-300">{line.content}</div>;
  }
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-2 text-lg font-bold text-cyan-400">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 font-bold text-cyan-400">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 font-semibold text-cyan-300">{children}</h3>,
        p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        code: ({ className, children }) => {
          if (!className) {
            return <code className="rounded bg-gray-800 px-1.5 py-0.5 text-cyan-300 text-xs">{children}</code>;
          }
          return <code className="block rounded bg-gray-900 p-3 text-cyan-300 text-xs overflow-x-auto">{children}</code>;
        },
        pre: ({ children }) => <pre className="my-2 rounded bg-gray-900 p-3 overflow-x-auto">{children}</pre>,
        a: ({ href, children }) => (
          <a href={href} className="text-cyan-400 hover:underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        table: ({ children }) => <table className="my-2 text-sm border-collapse">{children}</table>,
        th: ({ children }) => <th className="border border-gray-700 bg-gray-800 px-3 py-1 text-left text-cyan-400">{children}</th>,
        td: ({ children }) => <td className="border border-gray-700 px-3 py-1">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

async function streamResponse(
  response: Response,
  onChunk: (chunk: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return 'Error: No response';

  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      result += chunk;
      onChunk(chunk);
    }

    const final = decoder.decode();
    if (final) {
      result += final;
      onChunk(final);
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : 'Stream error'}`;
  }

  const trimmed = result.trim();
  if (!trimmed || trimmed.includes('No output generated')) {
    return 'Error: Invalid API key or request failed. Please check your API key.';
  }

  return trimmed;
}
