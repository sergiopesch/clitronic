'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiKey } from '../api-key';
import { useLongPress, useVoiceRecording } from '@/hooks';
import { VoiceIndicator, type VoiceState } from '@/components/voice';
import { playAudioFeedback, preloadAudioFeedback } from '@/lib/utils/audio';
import { AnimatedWelcome } from './animated-welcome';

interface TerminalLine {
  type: 'text' | 'command' | 'response' | 'error' | 'system' | 'image' | 'welcome' | 'ascii';
  content: string;
  imageUrl?: string;
}

interface ProviderAvailability {
  id: 'claude-code' | 'openai-codex';
  name: string;
  available: boolean;
  reason?: string;
  source?: string;
}

interface AuthPanelProps {
  isCheckingAuth: boolean;
  isConfigured: boolean;
  authSource: 'claude-code' | 'openai-codex' | null;
  claudeProvider?: ProviderAvailability;
  codexProvider?: ProviderAvailability;
  onConnectClaude: () => void;
  onConnectCodex: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

const HELP_TEXT = `
  ┌─────────────────────────────────────────────────────────────┐
  │  COMMANDS                                                   │
  ├─────────────────────────────────────────────────────────────┤
  │  help              Show this help message                   │
  │  auth              Connect Claude Code or OpenAI Codex      │
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

const AUTH_REQUIRED_MESSAGE = '✗ Authentication required. Type "auth" to connect.';
const QUICK_COMMANDS = ['help', 'list', 'info resistor', 'identify', 'auth'];
const COACHMARK_DISMISSED_KEY = 'clitronic_coachmark_dismissed_v1';

function authLabel(authSource: 'claude-code' | 'openai-codex' | null): string {
  if (authSource === 'claude-code') return 'Claude Code';
  if (authSource === 'openai-codex') return 'OpenAI Codex';
  return 'Not connected';
}

function providerSourceLabel(source?: string): string {
  switch (source) {
    case 'claude-code':
      return 'Claude Code local credentials';
    case 'codex-access-token':
      return 'Codex local access token';
    case 'codex-api-key':
      return 'Codex local API key';
    case 'env-auth-token':
      return 'Server environment auth token';
    case 'env-access-token':
      return 'Server environment access token';
    case 'env-api-key':
      return 'Server environment API key';
    default:
      return 'Credential source unavailable';
  }
}

export function RichTerminal() {
  const {
    authSource,
    isConfigured,
    clearApiKey,
    connectClaudeCode,
    connectOpenAICodex,
    claudeCodeAvailable,
    codexAvailable,
    isCheckingAuth,
    providers,
    refreshProviders,
  } = useApiKey();
  const [lines, setLines] = useState<TerminalLine[]>([{ type: 'welcome', content: '' }]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showCoachmark, setShowCoachmark] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldScrollRef = useRef(true);

  const claudeProvider = providers.find((provider) => provider.id === 'claude-code');
  const codexProvider = providers.find((provider) => provider.id === 'openai-codex');

  const addLine = useCallback((line: TerminalLine) => {
    setLines((prev) => [...prev, line]);
    shouldScrollRef.current = true;
  }, []);

  // Voice mode state
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');

  // Consider auth "available" unless provider check explicitly marks it unavailable.
  const currentAuthAvailable =
    authSource === 'claude-code'
      ? claudeCodeAvailable !== false
      : authSource === 'openai-codex'
        ? codexAvailable !== false
        : false;

  const canMakeApiCalls = isConfigured && currentAuthAvailable;
  const voiceAvailable = codexAvailable === true;

  const showAuthRequiredError = useCallback(() => {
    addLine({ type: 'error', content: AUTH_REQUIRED_MESSAGE });
    setShowAuthPanel(true);
  }, [addLine]);

  // Voice recording hook
  const {
    isRecording,
    isTranscribing,
    isSupported: voiceSupported,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    authProvider: authSource,
    onTranscription: useCallback(
      (text: string) => {
        setInput(text);
        inputRef.current?.focus();
        addLine({ type: 'system', content: `🎤 "${text}"` });
      },
      [addLine]
    ),
    onError: useCallback(
      (error: string) => {
        addLine({ type: 'error', content: `✗ Voice: ${error}` });
      },
      [addLine]
    ),
  });

  // Update voice state based on recording/transcribing status
  useEffect(() => {
    if (isRecording) {
      setVoiceState('recording');
    } else if (isTranscribing) {
      setVoiceState('transcribing');
    } else {
      setVoiceState('idle');
    }
  }, [isRecording, isTranscribing]);

  // Long-press spacebar for voice recording
  useLongPress({
    onStart: useCallback(() => {
      if (!canMakeApiCalls || !voiceAvailable || isProcessing) return;
      void playAudioFeedback('start');
      void startRecording();
    }, [canMakeApiCalls, voiceAvailable, isProcessing, startRecording]),
    onEnd: useCallback(() => {
      void playAudioFeedback('end');
      void stopRecording();
    }, [stopRecording]),
    enabled: voiceSupported && voiceAvailable && canMakeApiCalls && !isProcessing && !showAuthPanel,
  });

  // Preload audio feedback on mount
  useEffect(() => {
    preloadAudioFeedback();
  }, []);

  // First-run coachmark: visible until dismissed or auth is configured.
  useEffect(() => {
    if (isConfigured) {
      setShowCoachmark(false);
      localStorage.setItem(COACHMARK_DISMISSED_KEY, '1');
      return;
    }

    const dismissed = localStorage.getItem(COACHMARK_DISMISSED_KEY) === '1';
    setShowCoachmark(!dismissed);
  }, [isConfigured]);

  // Refresh providers whenever auth panel opens to keep availability current.
  useEffect(() => {
    if (!showAuthPanel) return;
    void refreshProviders();
  }, [refreshProviders, showAuthPanel]);

  // Allow Esc to quickly close auth panel.
  useEffect(() => {
    if (!showAuthPanel) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAuthPanel(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAuthPanel]);

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

  const handleConnectClaudeCode = useCallback(async () => {
    const result = await connectClaudeCode();
    if (!result.success) {
      addLine({ type: 'error', content: `✗ ${result.error || 'Failed to connect Claude Code'}` });
      return;
    }
    setShowAuthPanel(false);
    addLine({ type: 'system', content: '✓ Connected with Claude Code' });
  }, [addLine, connectClaudeCode]);

  const handleConnectOpenAICodex = useCallback(async () => {
    const result = await connectOpenAICodex();
    if (!result.success) {
      addLine({ type: 'error', content: `✗ ${result.error || 'Failed to connect OpenAI Codex'}` });
      return;
    }
    setShowAuthPanel(false);
    addLine({ type: 'system', content: '✓ Connected with OpenAI Codex' });
  }, [addLine, connectOpenAICodex]);

  const disconnectAuth = useCallback(() => {
    clearApiKey();
    addLine({ type: 'system', content: '✓ Disconnected authentication provider' });
  }, [addLine, clearApiKey]);

  // Resize image to reduce size
  const resizeImage = async (dataUrl: string, maxWidth = 1024): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
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
  const analyzeImage = useCallback(
    async (dataUrl: string, fileName: string) => {
      if (!canMakeApiCalls) {
        showAuthRequiredError();
        return;
      }

      addLine({ type: 'command', content: `identify ${fileName}` });

      const resizedDataUrl = await resizeImage(dataUrl);
      addLine({ type: 'image', content: '', imageUrl: resizedDataUrl });
      setIsProcessing(true);

      try {
        const match = resizedDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          throw new Error('Invalid image format');
        }

        const [, mediaType, imageData] = match;

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authSource ? { 'x-auth-provider': authSource } : {}),
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
    },
    [addLine, authSource, canMakeApiCalls, showAuthRequiredError]
  );

  const handleCommand = useCallback(
    async (cmd: string) => {
      const trimmedCmd = cmd.trim();
      if (!trimmedCmd) return;

      setCommandHistory((prev) => [...prev, trimmedCmd]);
      setHistoryIndex(-1);
      addLine({ type: 'command', content: trimmedCmd });

      const parts = trimmedCmd.split(/\s+/);
      const command = parts[0]?.toLowerCase();
      const args = parts.slice(1).join(' ');

      if (command === 'help') {
        addLine({ type: 'ascii', content: HELP_TEXT });
        return;
      }

      if (command === 'clear') {
        setLines([{ type: 'welcome', content: '' }]);
        return;
      }

      if (command === 'auth' || command === 'key') {
        setShowAuthPanel(true);
        return;
      }

      if (command === 'identify') {
        if (!canMakeApiCalls) {
          showAuthRequiredError();
          return;
        }
        fileInputRef.current?.click();
        return;
      }

      if (!canMakeApiCalls) {
        showAuthRequiredError();
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
            ...(authSource ? { 'x-auth-provider': authSource } : {}),
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
    },
    [addLine, authSource, canMakeApiCalls, showAuthRequiredError]
  );

  const submitCurrentInput = useCallback(() => {
    if (isProcessing || !input.trim()) return;
    const currentInput = input;
    setInput('');
    void handleCommand(currentInput);
  }, [handleCommand, input, isProcessing]);

  const dismissCoachmark = useCallback((persist = true) => {
    setShowCoachmark(false);
    if (persist) {
      localStorage.setItem(COACHMARK_DISMISSED_KEY, '1');
    }
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragging) setIsDragging(true);
    },
    [isDragging]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
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
        void analyzeImage(dataUrl, file.name);
      };
      reader.readAsDataURL(file);
    },
    [addLine, analyzeImage]
  );

  // Handle paste for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
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
              void analyzeImage(dataUrl, 'pasted-image.png');
            };
            reader.readAsDataURL(file);
          }
          return;
        }
      }
    },
    [analyzeImage]
  );

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      void analyzeImage(dataUrl, file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isProcessing) {
      e.preventDefault();
      submitCurrentInput();
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
      className={`relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#070b11] font-mono text-[13px] leading-relaxed text-gray-200 select-text sm:text-[14px] ${
        isDragging ? 'ring-2 ring-cyan-400 ring-inset' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_35%)]" />

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[#070b11]/90 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-500/10 px-8 py-6 text-center">
            <div className="mb-3 text-4xl">📷</div>
            <div className="text-lg font-semibold text-cyan-300">Drop image to identify component</div>
            <div className="mt-1 text-xs text-gray-400">JPEG, PNG, WEBP supported</div>
          </div>
        </div>
      )}

      <VoiceIndicator state={voiceState} />

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <header className="border-b border-cyan-900/30 bg-[#070b11]/80 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] tracking-[0.22em] text-cyan-400 uppercase">Clitronic</div>
              <h1 className="text-sm font-semibold tracking-[0.04em] text-cyan-200">
                Electronics Copilot Terminal
              </h1>
              <p className="mt-1 text-xs text-gray-500">
                Connect once, then ask questions, run commands, or drop component photos.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => {
                  void handleCommand('help');
                }}
                className="rounded border border-cyan-800/50 bg-cyan-900/15 px-2.5 py-1.5 text-cyan-300 hover:bg-cyan-900/30"
              >
                help
              </button>
              <button
                onClick={() => {
                  void handleCommand('identify');
                }}
                className="rounded border border-cyan-800/50 bg-cyan-900/15 px-2.5 py-1.5 text-cyan-300 hover:bg-cyan-900/30"
              >
                identify
              </button>
              <button
                onClick={() => setShowAuthPanel((prev) => !prev)}
                className="rounded border border-emerald-800/50 bg-emerald-900/15 px-2.5 py-1.5 text-emerald-300 hover:bg-emerald-900/30"
              >
                auth
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span
              className={`rounded-full border px-2 py-0.5 ${
                canMakeApiCalls
                  ? 'border-green-500/30 bg-green-950/50 text-green-300'
                  : 'border-amber-500/30 bg-amber-950/40 text-amber-300'
              }`}
            >
              {canMakeApiCalls ? `Connected: ${authLabel(authSource)}` : 'Authentication required'}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 ${
                voiceSupported && voiceAvailable && canMakeApiCalls
                  ? 'border-cyan-500/30 bg-cyan-950/40 text-cyan-300'
                  : 'border-gray-600/40 bg-gray-900/60 text-gray-400'
              }`}
            >
              {voiceSupported && voiceAvailable && canMakeApiCalls
                ? 'Voice ready (hold space)'
                : 'Voice unavailable'}
            </span>
            <span className="rounded-full border border-gray-700/50 bg-gray-900/60 px-2 py-0.5 text-gray-400">
              Drag/drop or paste images enabled
            </span>
          </div>
        </header>

        <div
          ref={containerRef}
          className="flex-1 cursor-text overflow-y-auto px-4 py-3"
          onClick={(e) => {
            if (e.target === containerRef.current) {
              inputRef.current?.focus();
            }
          }}
        >
          {lines.map((line, i) => (
            <TerminalLine key={i} line={line} />
          ))}

          {streamingContent && (
            <div className="my-2 text-gray-200" aria-live="polite">
              <MarkdownContent content={streamingContent} />
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-cyan-400" />
            </div>
          )}

          {showAuthPanel && (
            <AuthPanel
              isCheckingAuth={isCheckingAuth}
              isConfigured={isConfigured}
              authSource={authSource}
              claudeProvider={claudeProvider as ProviderAvailability | undefined}
              codexProvider={codexProvider as ProviderAvailability | undefined}
              onConnectClaude={() => {
                void handleConnectClaudeCode();
              }}
              onConnectCodex={() => {
                void handleConnectOpenAICodex();
              }}
              onDisconnect={disconnectAuth}
              onClose={() => setShowAuthPanel(false)}
            />
          )}

          {showCoachmark && !showAuthPanel && (
            <Coachmark
              onConnect={() => {
                setShowAuthPanel(true);
                dismissCoachmark(false);
              }}
              onTryPrompt={() => {
                setInput('What resistor do I need for a 5V LED?');
                inputRef.current?.focus();
                dismissCoachmark();
              }}
              onDismiss={() => dismissCoachmark()}
            />
          )}
        </div>

        <footer
          className="border-t border-cyan-900/30 bg-[#070b11]/90 px-3 pt-3 backdrop-blur"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
        >
          <div className="-mx-1 mb-2 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2 px-1">
              {QUICK_COMMANDS.map((command) => (
                <button
                  key={command}
                  onClick={() => {
                    void handleCommand(command);
                  }}
                  className="rounded border border-gray-700/70 bg-gray-900/80 px-2 py-1 text-[11px] text-gray-300 hover:border-cyan-700 hover:text-cyan-300"
                >
                  {command}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-900/40 bg-[#0d1117] px-3 py-2 sm:flex-nowrap">
            <span className="text-cyan-500 select-none">❯</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              aria-label="Terminal command input"
              className="flex-1 bg-transparent text-gray-100 caret-cyan-400 outline-none placeholder:text-gray-600"
              placeholder={isProcessing ? 'Processing...' : 'Ask about electronics or run a command...'}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="rounded border border-gray-700/80 px-2 py-1.5 text-xs text-gray-300 hover:border-cyan-700 hover:text-cyan-300 disabled:opacity-40"
              title="Upload image"
            >
              Upload
            </button>

            <button
              onClick={submitCurrentInput}
              disabled={isProcessing || !input.trim()}
              className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-[#032a31] transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-900 disabled:text-cyan-500"
            >
              Send
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
            <span>{voiceSupported && voiceAvailable && canMakeApiCalls ? 'Hold space for voice input' : ''}</span>
            <span>↑↓ command history • paste image • ESC closes auth panel</span>
          </div>
        </footer>
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

function Coachmark({
  onConnect,
  onTryPrompt,
  onDismiss,
}: {
  onConnect: () => void;
  onTryPrompt: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="my-3 max-w-3xl rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-amber-200 uppercase">Quick Start</p>
          <p className="mt-1 text-sm text-amber-100/95">
            Connect a provider first, then ask questions or run commands.
          </p>
          <p className="mt-1 text-xs text-amber-300/85">
            {'Recommended: "auth" -> choose provider -> ask "What resistor do I need for a 5V LED?"'}
          </p>
        </div>

        <button
          onClick={onDismiss}
          className="rounded border border-amber-700/70 px-2 py-1 text-xs text-amber-300 hover:border-amber-500 hover:text-amber-200"
        >
          dismiss
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onConnect}
          className="rounded bg-amber-300 px-3 py-1.5 text-xs font-semibold text-[#281800] hover:bg-amber-200"
        >
          Open Auth Panel
        </button>
        <button
          onClick={onTryPrompt}
          className="rounded border border-amber-700/70 px-3 py-1.5 text-xs text-amber-300 hover:border-amber-500 hover:text-amber-200"
        >
          Fill Example Prompt
        </button>
      </div>
    </div>
  );
}

function AuthPanel({
  isCheckingAuth,
  isConfigured,
  authSource,
  claudeProvider,
  codexProvider,
  onConnectClaude,
  onConnectCodex,
  onDisconnect,
  onClose,
}: AuthPanelProps) {
  const claudeAvailable = claudeProvider?.available;
  const codexAvailable = codexProvider?.available;

  return (
    <div className="my-3 max-w-3xl rounded-xl border border-cyan-500/25 bg-[#0f1722]/90 p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.08)] backdrop-blur">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-cyan-200">Authentication Providers</div>
          <p className="mt-1 text-xs text-gray-400">
            Connect one provider. The app stores only your provider selection, never raw keys.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
        >
          close
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={onConnectClaude}
          disabled={isCheckingAuth || claudeAvailable === false}
          className="rounded-lg border border-cyan-700/40 bg-cyan-950/20 p-3 text-left transition-colors hover:bg-cyan-950/35 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-cyan-200">Claude Code</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                claudeAvailable
                  ? 'bg-green-900/40 text-green-300'
                  : 'bg-gray-800/70 text-gray-400'
              }`}
            >
              {claudeAvailable ? 'Available' : 'Unavailable'}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-300">
            Uses local Claude Code login and supports tool-enabled responses.
          </p>
          {claudeProvider?.source && (
            <p className="mt-1 text-[11px] text-cyan-400/85">
              Source: {providerSourceLabel(claudeProvider.source)}
            </p>
          )}
          {claudeProvider?.reason && !claudeProvider.available && (
            <p className="mt-1 text-[11px] text-amber-300/90">{claudeProvider.reason}</p>
          )}
        </button>

        <button
          onClick={onConnectCodex}
          disabled={isCheckingAuth || codexAvailable === false}
          className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-3 text-left transition-colors hover:bg-emerald-950/35 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-emerald-200">OpenAI Codex</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                codexAvailable
                  ? 'bg-green-900/40 text-green-300'
                  : 'bg-gray-800/70 text-gray-400'
              }`}
            >
              {codexAvailable ? 'Available' : 'Unavailable'}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-300">
            Uses local Codex auth and unlocks speech-to-text voice input.
          </p>
          {codexProvider?.source && (
            <p className="mt-1 text-[11px] text-emerald-400/85">
              Source: {providerSourceLabel(codexProvider.source)}
            </p>
          )}
          {codexProvider?.reason && !codexProvider.available && (
            <p className="mt-1 text-[11px] text-amber-300/90">{codexProvider.reason}</p>
          )}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          Current connection:{' '}
          <span className={isConfigured ? 'text-cyan-300' : 'text-amber-300'}>
            {authLabel(authSource)}
          </span>
        </span>
        {isConfigured && (
          <button onClick={onDisconnect} className="text-red-400 hover:text-red-300 hover:underline">
            disconnect
          </button>
        )}
      </div>

      {isCheckingAuth && <p className="mt-2 text-xs text-cyan-400">Checking provider availability...</p>}
    </div>
  );
}

function TerminalLine({ line }: { line: TerminalLine }) {
  switch (line.type) {
    case 'welcome':
      return <AnimatedWelcome />;

    case 'ascii':
      return (
        <pre className="text-xs leading-tight whitespace-pre text-cyan-600/60 select-text">
          {line.content}
        </pre>
      );

    case 'system':
      return <div className="py-1 text-green-400 select-text">{line.content}</div>;

    case 'command':
      return (
        <div className="flex items-center gap-2 py-1 select-text">
          <span className="text-cyan-600 select-none">❯</span>
          <span className="text-gray-300">{line.content}</span>
        </div>
      );

    case 'error':
      return <div className="py-1 text-red-400 select-text">{line.content}</div>;

    case 'image':
      if (!line.imageUrl) return null;
      return (
        <div className="my-2 max-w-sm overflow-hidden rounded-lg border border-gray-700">
          <Image
            src={line.imageUrl}
            alt="Uploaded component"
            width={640}
            height={400}
            unoptimized
            className="h-auto w-full"
          />
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
      className="absolute top-2 right-2 rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-600"
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
              <div className="group relative">
                <CopyButton text={codeText} />
                <code className="block overflow-x-auto rounded bg-gray-900 p-3 text-xs text-cyan-300">
                  {children}
                </code>
              </div>
            );
          }
          return (
            <code className="cursor-text rounded bg-gray-800 px-1.5 py-0.5 text-xs text-cyan-300">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded bg-gray-900">{children}</pre>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-cyan-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        table: ({ children }) => <table className="my-2 border-collapse text-sm">{children}</table>,
        th: ({ children }) => (
          <th className="border border-gray-700 bg-gray-800 px-3 py-1 text-left text-cyan-400">
            {children}
          </th>
        ),
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
