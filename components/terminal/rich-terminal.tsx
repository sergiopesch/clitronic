'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiKey } from '../api-key';

interface TerminalLine {
  type: 'text' | 'command' | 'response' | 'error' | 'system' | 'image' | 'welcome' | 'listening';
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

const WELCOME_TEXT = `Your AI-powered hardware companion for electronics

🎤 Speak  📷 Camera  📁 Upload  ⌨️  Type

Ask anything about electronics or identify components!
`;

export function RichTerminal() {
  const { apiKey, isConfigured, setApiKey } = useApiKey();
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'welcome', content: ASCII_LOGO },
    { type: 'system', content: WELCOME_TEXT },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const handleCommandRef = useRef<(cmd: string) => void>(() => {});

  // Define addLine first since other functions depend on it
  const addLine = useCallback((line: TerminalLine) => {
    setLines((prev) => [...prev, line]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join('');

          if (event.results[0]?.isFinal) {
            setIsListening(false);
            // Use queueMicrotask to defer command execution
            queueMicrotask(() => {
              handleCommandRef.current(transcript);
            });
          } else {
            setInput(transcript);
          }
        };

        recognition.onerror = () => {
          setIsListening(false);
          setLines((prev) => [
            ...prev,
            { type: 'error', content: '🎤 Voice recognition error. Please try again.' },
          ]);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const startVoiceInput = useCallback(() => {
    if (!isConfigured) {
      setShowApiKeyInput(true);
      addLine({
        type: 'error',
        content: '⚠️  API key required. Enter your Anthropic API key below.',
      });
      return;
    }

    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      setInput('');
      addLine({ type: 'listening', content: '🎤 Listening... Speak now!' });
      recognitionRef.current.start();
    }
  }, [isConfigured, isListening, addLine]);

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const handleCameraCapture = useCallback(() => {
    if (!isConfigured) {
      setShowApiKeyInput(true);
      addLine({
        type: 'error',
        content: '⚠️  API key required. Enter your Anthropic API key below.',
      });
      return;
    }
    cameraInputRef.current?.click();
  }, [isConfigured, addLine]);

  const handleFileUpload = useCallback(() => {
    if (!isConfigured) {
      setShowApiKeyInput(true);
      addLine({
        type: 'error',
        content: '⚠️  API key required. Enter your Anthropic API key below.',
      });
      return;
    }
    fileInputRef.current?.click();
  }, [isConfigured, addLine]);

  const handleApiKeySave = useCallback(() => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      setShowApiKeyInput(false);
      addLine({ type: 'system', content: '✅ API key saved! You can now use all features.' });
    }
  }, [apiKeyInput, setApiKey, addLine]);

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
      addLine({
        type: 'system',
        content: `
Commands:
  help              Show this help message
  list [category]   List components (passive, active, input, output)
  info <component>  Component details
  clear             Clear the terminal

Or just ask anything about electronics!
`,
      });
      return;
    }

    if (command === 'clear') {
      setLines([
        { type: 'welcome', content: ASCII_LOGO },
        { type: 'system', content: WELCOME_TEXT },
      ]);
      return;
    }

    // Check for API key
    if (!isConfigured) {
      setShowApiKeyInput(true);
      addLine({
        type: 'error',
        content: '⚠️  API key required. Enter your Anthropic API key below.',
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

  // Keep ref updated with latest handleCommand
  useEffect(() => {
    handleCommandRef.current = handleCommand;
  });

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
    <div className="flex h-screen flex-col bg-[#0d1117] font-mono text-sm">
      {/* Terminal content */}
      <div className="flex-1 overflow-y-auto p-4 pb-0" onClick={() => inputRef.current?.focus()}>
        {lines.map((line, i) => (
          <TerminalLineRenderer key={i} line={line} />
        ))}

        {/* API Key inline input */}
        {showApiKeyInput && !isConfigured && (
          <div
            className="my-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 text-amber-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              <span className="font-semibold">Enter your Anthropic API Key</span>
            </div>
            <p className="mb-3 text-xs text-gray-400">
              Your key is stored locally and never sent to our servers.{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                Get a key →
              </a>
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApiKeySave()}
                placeholder="sk-ant-..."
                className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 placeholder:text-gray-500 focus:border-cyan-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleApiKeySave}
                disabled={!apiKeyInput.trim()}
                className="rounded-lg bg-cyan-600 px-4 py-2 font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setShowApiKeyInput(false)}
                className="rounded-lg border border-gray-600 px-3 py-2 text-gray-400 transition-colors hover:bg-gray-800"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Input line */}
        <div className="flex items-center gap-2 py-2">
          <span className={isListening ? 'animate-pulse text-red-400' : 'text-emerald-400'}>❯</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing || isListening}
            className="flex-1 border-none bg-transparent text-gray-100 caret-emerald-400 outline-none placeholder:text-gray-600"
            placeholder={
              isListening
                ? '🎤 Listening...'
                : isProcessing
                  ? ''
                  : 'Ask anything about electronics...'
            }
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

      {/* Multimodal Action Bar */}
      <div className="border-t border-gray-800 bg-[#0d1117] p-4">
        <div className="flex items-center justify-center gap-3">
          {/* Voice Button */}
          <button
            onClick={isListening ? stopVoiceInput : startVoiceInput}
            disabled={isProcessing}
            className={`flex items-center gap-2 rounded-full px-6 py-3 font-medium transition-all ${
              isListening
                ? 'animate-pulse bg-red-500 text-white'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            {isListening ? 'Stop' : 'Speak'}
          </button>

          {/* Camera Button */}
          <button
            onClick={handleCameraCapture}
            disabled={isProcessing}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-3 font-medium text-white transition-all hover:from-cyan-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Camera
          </button>

          {/* Upload Button */}
          <button
            onClick={handleFileUpload}
            disabled={isProcessing}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 font-medium text-white transition-all hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Upload
          </button>

          {/* API Key indicator/button */}
          {!isConfigured && (
            <button
              onClick={() => setShowApiKeyInput(true)}
              className="flex items-center gap-2 rounded-full bg-amber-500/20 px-4 py-3 text-amber-400 transition-all hover:bg-amber-500/30"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
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
        <pre className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
          {line.content}
        </pre>
      );

    case 'system':
      return <pre className="whitespace-pre-wrap text-gray-400">{line.content}</pre>;

    case 'listening':
      return (
        <div className="flex items-center gap-2 py-1 text-pink-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-pink-400"></span>
          <span>{line.content}</span>
        </div>
      );

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
