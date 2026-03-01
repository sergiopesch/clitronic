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
│    Commands:  help • identify • list • info • clear                   │
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
  const [hasServerKey, setHasServerKey] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldScrollRef = useRef(true);

  const addLine = useCallback((line: TerminalLine) => {
    setLines((prev) => [...prev, line]);
    shouldScrollRef.current = true;
  }, []);

  // Check if server has API key configured
  useEffect(() => {
    fetch('/api/check-key')
      .then(res => res.json())
      .then(data => {
        setHasServerKey(data.hasServerKey === true);
      })
      .catch(() => {});
  }, []);

  // Scroll to bottom when needed
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

  const handleApiKeySave = useCallback(async () => {
    const key = apiKeyInput.trim();
    if (!key) return;

    // Validate key format
    if (!key.startsWith('sk-ant-')) {
      addLine({ type: 'error', content: '✗ Invalid key format. Key should start with sk-ant-' });
      return;
    }

    // Validate with server
    try {
      const res = await fetch('/api/check-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();

      if (data.valid) {
        setApiKey(key);
        setApiKeyInput('');
        setShowApiKeyInput(false);
        addLine({ type: 'system', content: '✓ API key configured' });
      } else {
        addLine({ type: 'error', content: `✗ ${data.error || 'Invalid API key'}` });
      }
    } catch {
      // If validation fails, still save it (validation is just format check)
      setApiKey(key);
      setApiKeyInput('');
      setShowApiKeyInput(false);
      addLine({ type: 'system', content: '✓ API key saved' });
    }
  }, [apiKeyInput, setApiKey, addLine]);

  // Check if we can make API calls
  const canMakeApiCalls = isConfigured || hasServerKey;

  // Resize image to reduce size
  const resizeImage = async (dataUrl: string, maxWidth = 1024): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = dataUrl;
    });
  };

  // Send image for analysis
  const analyzeImage = useCallback(async (dataUrl: string, fileName: string) => {
    if (!canMakeApiCalls) {
      addLine({ type: 'error', content: '✗ API key required. Type "key" to configure.' });
      setShowApiKeyInput(true);
      return;
    }

    addLine({ type: 'command', content: `identify ${fileName}` });

    // Resize image before sending
    const resizedDataUrl = await resizeImage(dataUrl);
    addLine({ type: 'image', content: '', imageUrl: resizedDataUrl });
    setIsProcessing(true);

    try {
      // Extract base64 from data URL
      const match = resizedDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error('Invalid image format');
      }

      const [, mediaType, imageData] = match;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          messages: [
            {
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
  }, [apiKey, canMakeApiCalls, addLine]);

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
      if (!canMakeApiCalls) {
        addLine({ type: 'error', content: '✗ API key required. Type "key" to configure.' });
        setShowApiKeyInput(true);
        return;
      }
      fileInputRef.current?.click();
      return;
    }

    // Commands that require API key
    if (!canMakeApiCalls) {
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
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          messages: [
            {
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

  // Handle paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            analyzeImage(dataUrl, 'pasted-image.png');
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  }, [analyzeImage]);

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
      className={`relative flex h-screen flex-col bg-[#0d1117] font-mono text-[13px] leading-relaxed select-text ${
        isDragging ? 'ring-2 ring-inset ring-cyan-400' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0d1117]/90 backdrop-blur-sm pointer-events-none">
          <div className="rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-500/10 px-12 py-8 text-center">
            <div className="mb-3 text-5xl">📷</div>
            <div className="text-xl font-semibold text-cyan-400">Drop image</div>
            <div className="mt-1 text-sm text-gray-400">to identify component</div>
          </div>
        </div>
      )}

      {/* Terminal content - selectable text */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-3 cursor-text"
        onClick={(e) => {
          // Only focus input if clicking on empty space
          if (e.target === containerRef.current) {
            inputRef.current?.focus();
          }
        }}
      >
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
            <p className="mb-2 text-xs text-gray-500">
              Enter your API key (stored locally in browser).{' '}
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
                placeholder="sk-ant-api03-..."
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
            <p className="mt-3 text-xs text-gray-600">
              Tip: For persistent setup, create <code className="text-cyan-600">.env.local</code> with:
              <br />
              <code className="text-cyan-500">ANTHROPIC_API_KEY=your-key</code>
            </p>
          </div>
        )}

        {/* Input line */}
        <div className="sticky bottom-0 flex items-center gap-2 bg-[#0d1117] py-2">
          <span className="text-cyan-500 select-none">❯</span>
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
            <span className="flex items-center gap-2 text-cyan-500 text-xs select-none">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            </span>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t border-gray-800 bg-[#0d1117] px-4 py-1.5 select-none">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-cyan-500">
              ⚡ clitronic
            </span>
            <span className={canMakeApiCalls ? 'text-green-500' : 'text-amber-500'}>
              {canMakeApiCalls ? '● ready' : '○ need key'}
            </span>
          </div>
          <span className="text-gray-600">↑↓ history • paste image • help</span>
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
        <pre className="whitespace-pre text-cyan-500/90 text-xs leading-tight select-text">
          {line.content}
        </pre>
      );

    case 'ascii':
      return (
        <pre className="whitespace-pre text-cyan-600/60 text-xs leading-tight select-text">
          {line.content}
        </pre>
      );

    case 'system':
      return (
        <div className="py-1 text-green-400 select-text">{line.content}</div>
      );

    case 'command':
      return (
        <div className="flex items-center gap-2 py-1 select-text">
          <span className="text-cyan-600 select-none">❯</span>
          <span className="text-gray-300">{line.content}</span>
        </div>
      );

    case 'error':
      return (
        <div className="py-1 text-red-400 select-text">{line.content}</div>
      );

    case 'image':
      return (
        <div className="my-2 max-w-xs overflow-hidden rounded-lg border border-gray-700">
          <img src={line.imageUrl} alt="Component" className="w-full" />
        </div>
      );

    case 'response':
      return (
        <div className="my-2 text-gray-200 select-text">
          <MarkdownContent content={line.content} />
        </div>
      );

    default:
      return <div className="py-1 text-gray-300 select-text">{line.content}</div>;
  }
}

// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 transition-colors"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
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
          const isBlock = className?.includes('language-');
          const codeText = String(children).replace(/\n$/, '');

          if (isBlock) {
            return (
              <div className="relative group">
                <CopyButton text={codeText} />
                <code className="block rounded bg-gray-900 p-3 text-cyan-300 text-xs overflow-x-auto">
                  {children}
                </code>
              </div>
            );
          }
          return (
            <code className="rounded bg-gray-800 px-1.5 py-0.5 text-cyan-300 text-xs cursor-text">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2 rounded bg-gray-900 overflow-x-auto">
            {children}
          </pre>
        ),
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
  if (!trimmed) {
    return 'Error: No response from API. Please try again.';
  }

  return trimmed;
}
