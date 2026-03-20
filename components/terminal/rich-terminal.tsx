'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiKey } from '../api-key';
import { useLongPress, useVoiceRecording } from '@/hooks';
import { VoiceIndicator, type VoiceState } from '@/components/voice';
import { playAudioFeedback, preloadAudioFeedback } from '@/lib/utils/audio';
import { AnimatedWelcome } from './animated-welcome';
import {
  ComponentDiagramPreview,
  GraphPreview,
  TopologyMap,
  WorkbenchPreview,
  WindowsHelp,
} from '@/components/studio/previews';
import {
  analyzeCircuit,
  applyStructuredCommand,
  createCircuitDocument,
  parseCircuitCommand,
} from '@/lib/circuit';
import type { CircuitDocument, CircuitPanel } from '@/lib/circuit';

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
  onRefresh: () => void;
}

const DEFAULT_WORKSPACE: CircuitDocument = createCircuitDocument(
  'simple led circuit with a resistor and battery',
  'draft'
);

const HELP_TEXT = `
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CLITRONIC STUDIO COMMANDS                                              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  help                         Show this help message                     │
  │  auth                         Connect Claude Code or OpenAI Codex        │
  │  clear                        Clear terminal history                     │
  │  identify                     Upload an image to identify a component    │
  │  reset                        Reset the circuit workspace                 │
  │  whatswrong                   Diagnose missing links/params               │
  │  build <idea>                 Sketch a circuit document                  │
  │  add <component>              Add a component to the active circuit      │
  │  connect <a> to <b>           Create a connection in the active circuit   │
  │  remove <component>           Remove a component from the active circuit   │
  │  set <node> <param> = <val>   Set a component parameter                    │
  │  simulate                     Switch the workspace into simulation mode  │
  │  show <window>                Open teacher/inspector/graph/topology etc. │
  │  hide <window>                Close a supporting window                  │
  │  explain <question>           Ask the teacher about the active circuit   │
  │  focus <window>               Bring a window forward                     │
  │  diagram <part>               Open a component diagram card              │
  │  list [category]              List components from the knowledge base    │
  │  info <component>             Get component details                      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  Example flow                                                         │
  │    build a simple led circuit with a 9v battery                        │
  │    add resistor                                                        │
  │    connect battery to resistor                                          │
  │    set battery voltage = 9V                                             │
  │    set resistor resistance = 220Ω                                       │
  │    show topology                                                        │
  │    show diagram led                                                     │
  │    simulate                                                            │
  │    focus graph                                                         │
  └──────────────────────────────────────────────────────────────────────────┘
`;

const AUTH_REQUIRED_MESSAGE = '✗ Authentication required. Type "auth" to connect.';

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

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getOpenPanelTitles(workspace: CircuitDocument): string[] {
  return workspace.panels
    .filter((panel) => panel.state?.isOpen !== false)
    .map((panel) => panel.title);
}

function getOpenWindowSummary(workspace: CircuitDocument): string {
  return getOpenPanelTitles(workspace).join(' • ') || 'none';
}

function buildTeacherPrompt(userInput: string, workspace: CircuitDocument): string {
  const nodes = workspace.nodes.length
    ? workspace.nodes.map((node) => node.label).join(', ')
    : 'none yet';
  const panels = getOpenPanelTitles(workspace).join(', ') || 'workbench only';

  return `You are helping design Clitronic as a command-first adaptive electronics studio.

The current workspace state is:
- circuit title: ${workspace.title}
- mode: ${workspace.mode}
- nodes: ${nodes}
- open panels: ${panels}
- circuit summary: ${workspace.summary}

The user command or question is: ${userInput}

Respond as the teacher layer inside the product, not as a generic assistant. Keep it concise and practical.
Structure the answer with these headings:
## What Clitronic should do
## Why this view matters
## Next commands to try

Tie the explanation to the active circuit and to adaptive windows opening or changing.`;
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
  const [view, setView] = useState<'workbench' | 'console'>(() => {
    if (typeof window === 'undefined') return 'console';
    try {
      const stored = window.localStorage.getItem('clitronic_view_v2');
      if (stored === 'workbench' || stored === 'console') return stored;
    } catch {
      // ignore
    }
    return 'console';
  });
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [workspace, setWorkspace] = useState<CircuitDocument>(DEFAULT_WORKSPACE);

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

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');

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

  useEffect(() => {
    if (isRecording) {
      setVoiceState('recording');
    } else if (isTranscribing) {
      setVoiceState('transcribing');
    } else {
      setVoiceState('idle');
    }
  }, [isRecording, isTranscribing]);

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

  useEffect(() => {
    preloadAudioFeedback();
  }, []);

  useEffect(() => {
    if (!showAuthPanel) return;
    void refreshProviders();
  }, [refreshProviders, showAuthPanel]);

  useEffect(() => {
    try {
      window.localStorage.setItem('clitronic_view_v2', view);
    } catch {
      // ignore
    }
  }, [view]);

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

  useEffect(() => {
    if (view !== 'console') return;
    if (shouldScrollRef.current && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
      shouldScrollRef.current = false;
    }
  }, [lines, streamingContent, view]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const panelSummary = useMemo(() => getOpenPanelTitles(workspace).join(' • '), [workspace]);

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

  const askTeacher = useCallback(
    async (userInput: string, state: CircuitDocument) => {
      if (!canMakeApiCalls) {
        showAuthRequiredError();
        return;
      }

      const prompt = buildTeacherPrompt(userInput, state);
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
        setWorkspace(DEFAULT_WORKSPACE);
        return;
      }

      if (command === 'reset') {
        setLines([{ type: 'welcome', content: '' }]);
        const nextWorkspace = createCircuitDocument(
          'simple led circuit with a resistor and battery',
          'draft'
        );
        setWorkspace(nextWorkspace);
        addLine({ type: 'system', content: '✓ Workspace reset' });
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

      if (command === 'build') {
        const parsed = parseCircuitCommand(trimmedCmd);
        const nextWorkspace = await applyStructuredCommand(workspace, parsed);
        setWorkspace(nextWorkspace);
        setView('workbench');
        addLine({
          type: 'system',
          content: `✓ Built ${nextWorkspace.title}`,
        });
        addLine({
          type: 'system',
          content: `→ Open windows: ${getOpenWindowSummary(nextWorkspace)}`,
        });
        return;
      }

      if (
        command === 'add' ||
        command === 'connect' ||
        command === 'show' ||
        command === 'hide' ||
        command === 'remove' ||
        command === 'set' ||
        command === 'simulate' ||
        command === 'focus' ||
        command === 'diagram' ||
        command === 'whatswrong' ||
        command === 'diagnose'
      ) {
        const parsed = parseCircuitCommand(trimmedCmd);
        const nextWorkspace = await applyStructuredCommand(workspace, parsed);
        setWorkspace(nextWorkspace);
        if (command === 'show' || command === 'focus' || command === 'diagram') {
          setView('workbench');
        }
        addLine({
          type: 'system',
          content: `✓ Updated circuit document via ${command} command`,
        });
        addLine({
          type: 'system',
          content: `→ Open windows: ${getOpenWindowSummary(nextWorkspace)}`,
        });
        return;
      }

      if (command === 'explain') {
        setIsProcessing(true);
        try {
          await askTeacher(args || 'Explain the current circuit state', workspace);
        } finally {
          setIsProcessing(false);
        }
        return;
      }

      if (command !== 'list' && command !== 'info' && !canMakeApiCalls) {
        showAuthRequiredError();
        return;
      }

      setIsProcessing(true);

      try {
        if (command === 'list') {
          const prompt = args
            ? `List ${args} electronic components with brief descriptions.`
            : 'List electronic components by category with brief descriptions.';

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
            return;
          }

          const text = await streamResponse(res, (chunk) => {
            setStreamingContent((prev) => prev + chunk);
            shouldScrollRef.current = true;
          });
          setStreamingContent('');
          addLine({ type: text.startsWith('Error:') ? 'error' : 'response', content: text });
          return;
        }

        if (command === 'info') {
          if (!args) {
            addLine({ type: 'error', content: 'Usage: info <component>' });
            return;
          }

          const prompt = `Provide detailed info about "${args}": specs, pinout, circuit examples, and tips.`;
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
            return;
          }

          const text = await streamResponse(res, (chunk) => {
            setStreamingContent((prev) => prev + chunk);
            shouldScrollRef.current = true;
          });
          setStreamingContent('');
          addLine({ type: text.startsWith('Error:') ? 'error' : 'response', content: text });
          return;
        }

        const draftWorkspace = createCircuitDocument(
          trimmedCmd,
          workspace.mode === 'simulating' ? 'simulating' : 'preview'
        );
        setWorkspace(draftWorkspace);
        await askTeacher(trimmedCmd, draftWorkspace);
      } catch (err) {
        setStreamingContent('');
        addLine({
          type: 'error',
          content: `✗ ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [addLine, askTeacher, authSource, canMakeApiCalls, showAuthRequiredError, workspace]
  );

  const submitCurrentInput = useCallback(() => {
    if (isProcessing || !input.trim()) return;
    const currentInput = input;
    setInput('');
    void handleCommand(currentInput);
  }, [handleCommand, input, isProcessing]);

  const runQuickCommand = useCallback(
    (command: string) => {
      if (isProcessing) return;
      setInput('');
      void handleCommand(command);
    },
    [handleCommand, isProcessing]
  );

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
      className={`relative min-h-[100dvh] overflow-hidden bg-[#070b11] font-sans text-[14px] leading-relaxed text-gray-200 select-text ${
        isDragging ? 'ring-2 ring-cyan-400 ring-inset' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.07),transparent_40%)]" />

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[#070b11]/90 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-500/10 px-8 py-6 text-center">
            <div className="mb-3 text-4xl">📷</div>
            <div className="text-lg font-semibold text-cyan-300">
              Drop image to identify component
            </div>
            <div className="mt-1 text-xs text-gray-400">JPEG, PNG, WEBP supported</div>
          </div>
        </div>
      )}

      <VoiceIndicator state={voiceState} />

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <header className="border-b border-cyan-900/30 bg-[#070b11]/80 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[10rem]">
              <div className="text-base font-semibold text-white">Clitronic</div>
              <div className="mt-0.5 text-sm text-gray-400">
                Console-first electronics learning studio
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden rounded-full border border-white/10 bg-white/5 p-1 text-[12px] text-gray-300 sm:flex">
                <button
                  onClick={() => setView('workbench')}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    view === 'workbench'
                      ? 'bg-white/15 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Workbench"
                >
                  Workbench
                </button>
                <button
                  onClick={() => setView('console')}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    view === 'console'
                      ? 'bg-white/15 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Console"
                >
                  Console
                </button>
              </div>

              <button
                onClick={() => setShowAuthPanel(true)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10"
              >
                Auth
              </button>
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-400">
            <span className={canMakeApiCalls ? 'text-emerald-300' : 'text-amber-300'}>
              {canMakeApiCalls ? `Connected: ${authLabel(authSource)}` : 'Authentication required'}
            </span>
            <span className="mx-2 text-gray-600">•</span>
            <span>
              {workspace.mode === 'simulating'
                ? 'Simulation live'
                : workspace.mode === 'preview'
                  ? 'Preview'
                  : 'Draft'}
            </span>
            <span className="mx-2 text-gray-600">•</span>
            <span>Focus: {titleCase(workspace.windowState.focusedWindow)}</span>
            <span className="mx-2 text-gray-600">•</span>
            <span
              className={
                voiceSupported && voiceAvailable && canMakeApiCalls
                  ? 'text-cyan-300'
                  : 'text-gray-500'
              }
            >
              {voiceSupported && voiceAvailable && canMakeApiCalls
                ? 'Voice ready (hold space)'
                : 'Voice unavailable'}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          {view === 'console' ? (
            <div
              ref={containerRef}
              className="h-full overflow-y-auto px-4 py-3 font-mono text-[13px]"
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
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <AdaptiveStudio workspace={workspace} onQuickCommand={runQuickCommand} />
            </div>
          )}
        </main>

        <footer
          className="border-t border-white/10 bg-[#070b11]/85 px-3 pt-3 backdrop-blur"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
            <span>
              Open windows: <span className="text-cyan-400">{panelSummary || '—'}</span>
            </span>
            <button
              onClick={() => setView(view === 'console' ? 'workbench' : 'console')}
              className="text-cyan-400 hover:text-cyan-300 hover:underline"
            >
              {view === 'console' ? 'back to workbench' : 'open console'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-900/40 bg-[#0d1117] px-3 py-2 sm:flex-nowrap">
            <span className="font-mono text-cyan-400 select-none">❯</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              aria-label="Command input"
              className="flex-1 bg-transparent font-mono text-gray-100 caret-cyan-400 outline-none placeholder:text-gray-600"
              placeholder={
                isProcessing ? 'Processing...' : 'Try: build a simple led circuit with a 9v battery'
              }
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
            <span>
              {voiceSupported && voiceAvailable && canMakeApiCalls
                ? 'Hold space for voice input'
                : ''}
            </span>
            <span>build • add • connect • show • hide • diagram • simulate • explain</span>
          </div>
        </footer>
      </div>

      {showAuthPanel && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={() => setShowAuthPanel(false)}
        >
          <div className="w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
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
              onRefresh={() => {
                void refreshProviders();
              }}
            />
          </div>
        </div>
      )}

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

function AdaptiveStudio({
  workspace,
  onQuickCommand,
}: {
  workspace: CircuitDocument;
  onQuickCommand: (command: string) => void;
}) {
  const analysis = analyzeCircuit(workspace);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const headlineSummary = useMemo(() => {
    const summary = workspace.summary.trim();
    if (!summary) return 'Start with a build command to open a circuit workspace.';
    const firstSentence = summary.split(/(?<=[.!?])\s+/)[0];
    return firstSentence ?? summary;
  }, [workspace.summary]);

  const stats = useMemo(() => {
    return [
      {
        label: 'Mode',
        value:
          workspace.mode === 'simulating'
            ? 'Simulation'
            : workspace.mode === 'preview'
              ? 'Preview'
              : 'Draft',
      },
      { label: 'Components', value: String(workspace.nodes.length) },
      { label: 'Connections', value: String(workspace.connections.length) },
    ];
  }, [workspace.connections.length, workspace.mode, workspace.nodes.length]);

  const teacherEvents = useMemo(() => {
    const merged = [...workspace.events, ...analysis.derivedEvents];
    return Array.from(new Map(merged.map((event) => [event.id, event])).values()).slice(0, 5);
  }, [analysis.derivedEvents, workspace.events]);

  const openPanels = useMemo(
    () =>
      workspace.panels
        .filter((panel) => panel.state?.isOpen)
        .sort((left, right) => (left.state?.order ?? 999) - (right.state?.order ?? 999)),
    [workspace.panels]
  );

  const workbenchPanel = openPanels.find((panel) => panel.kind === 'workbench');
  const teacherPanel = openPanels.find((panel) => panel.kind === 'teacher');
  const inspectorPanel = openPanels.find((panel) => panel.kind === 'inspector');
  const topologyPanel = openPanels.find((panel) => panel.kind === 'topology');
  const graphPanel = openPanels.find((panel) => panel.kind === 'graph');
  const diagramPanel = openPanels.find((panel) => panel.kind === 'diagram');

  const windowCommands = [
    ['show teacher', 'Teacher'],
    ['show inspector', 'Inspector'],
    ['show topology', 'Topology'],
    ['show graph', 'Graph'],
    ['show workbench', 'Workbench'],
  ] as const;

  return (
    <aside className="relative flex min-h-0 flex-col bg-[#0b1118]/92 px-4 py-4 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-[#0a0f15] px-3 py-2 text-xs text-gray-400">
        <span className="text-[11px] tracking-[0.16em] text-gray-500 uppercase">
          Workbench view
        </span>
        <span className="text-gray-500">
          Console controls this space. Windows here are supporting instruments.
        </span>
      </div>

      <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-gray-400">Circuit document</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {workspace.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
              {headlineSummary}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-200"
                >
                  <span className="text-gray-400">{stat.label}:</span> {stat.value}
                </div>
              ))}
            </div>
            <button
              onClick={() => setDetailsOpen((prev) => !prev)}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              {detailsOpen ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>

        {detailsOpen && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {workspace.metrics.map((metric) => (
              <div
                key={`${metric.label}-${metric.value}`}
                className="rounded-xl border border-gray-800 bg-[#0a0f15] p-3"
              >
                <div className="text-[11px] tracking-[0.16em] text-gray-500 uppercase">
                  {metric.label}
                </div>
                <div className="mt-1 text-sm font-medium text-gray-100">{metric.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {windowCommands.map(([command, label]) => (
            <button
              key={command}
              onClick={() => onQuickCommand(command)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-200 transition hover:bg-white/10"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => onQuickCommand('show diagram led')}
            className="rounded-full border border-emerald-700/30 bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-500/50 hover:bg-emerald-900/30"
          >
            Diagram: LED
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] tracking-[0.16em] text-gray-500 uppercase">
              Window state
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Focus: {workspace.windowState.focusedWindow} • Open:{' '}
              {workspace.windowState.openWindows.join(', ') || 'none'}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <WindowsHelp workspace={workspace} />
        </div>
      </div>

      {workbenchPanel ? (
        <WindowCard panel={workbenchPanel}>
          <WorkbenchPreview
            nodes={workspace.nodes}
            connections={workspace.connections}
            mode={workspace.mode}
          />
        </WindowCard>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-gray-800 bg-[#0a0f15] p-5 text-sm text-gray-400">
          The workbench window is hidden. Use <code className="text-cyan-300">show workbench</code>{' '}
          to bring the spatial sketch back.
        </div>
      )}

      {teacherPanel ? (
        <div className="mt-4">
          <WindowCard panel={teacherPanel}>
            <div className="space-y-3 text-sm text-gray-300">
              {teacherEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3"
                >
                  <div className="font-semibold text-emerald-200">{event.title}</div>
                  <div className="mt-1 leading-relaxed text-emerald-100/80">{event.detail}</div>
                </div>
              ))}
            </div>
          </WindowCard>
        </div>
      ) : null}

      {inspectorPanel ? (
        <div className="mt-4">
          <WindowCard panel={inspectorPanel}>
            <div className="space-y-4 text-sm text-gray-300">
              <div>
                <div className="mb-2 text-[11px] tracking-[0.16em] text-gray-500 uppercase">
                  Detected circuit nodes
                </div>
                <div className="flex flex-wrap gap-2">
                  {workspace.nodes.length ? (
                    workspace.nodes.map((node) => (
                      <span
                        key={node.id}
                        className="rounded-full border border-amber-700/30 bg-amber-950/20 px-2.5 py-1 text-xs text-amber-200"
                      >
                        {node.label}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500">No nodes yet.</span>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] tracking-[0.16em] text-gray-500 uppercase">
                  Simulation checklist
                </div>
                <div className="space-y-2">
                  {analysis.checklist.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-gray-800 bg-[#0a0f15] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-white">{item.label}</div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${item.status === 'ready' ? 'border-emerald-700/40 bg-emerald-950/30 text-emerald-200' : item.status === 'inferred' ? 'border-amber-700/40 bg-amber-950/30 text-amber-200' : 'border-rose-700/40 bg-rose-950/30 text-rose-200'}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-gray-400">
                        {item.detail}
                      </div>
                      {item.command ? (
                        <button
                          onClick={() => onQuickCommand(item.command!)}
                          className="mt-2 rounded-full border border-cyan-700/30 bg-cyan-950/20 px-3 py-1 text-[11px] text-cyan-200 transition hover:border-cyan-500/50 hover:bg-cyan-900/30"
                        >
                          {item.command}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] tracking-[0.16em] text-gray-500 uppercase">
                  Parameters
                </div>
                <div className="space-y-2">
                  {workspace.nodes.map((node) =>
                    node.parameters && node.parameters.length > 0 ? (
                      <div
                        key={`${node.id}-params`}
                        className="rounded-lg border border-gray-800 bg-[#0a0f15] px-3 py-2"
                      >
                        <div className="text-xs font-semibold text-amber-200">{node.label}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {node.parameters.map((param) => (
                            <span
                              key={`${node.id}-${param.key}`}
                              className="rounded-full border border-amber-700/30 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-100"
                            >
                              {param.label}: {param.value}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] tracking-[0.16em] text-gray-500 uppercase">
                  Recommended fixes
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.suggestedFixes.length > 0 ? (
                    analysis.suggestedFixes.map((fix) => (
                      <button
                        key={fix}
                        onClick={() => onQuickCommand(fix)}
                        className="rounded-full border border-emerald-700/30 bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-500/50 hover:bg-emerald-900/30"
                      >
                        {fix}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500">No targeted fixes suggested.</span>
                  )}
                </div>
              </div>
            </div>
          </WindowCard>
        </div>
      ) : null}

      {topologyPanel ? (
        <div className="mt-4">
          <WindowCard panel={topologyPanel}>
            <TopologyMap
              nodes={workspace.nodes}
              connections={workspace.connections}
              analysis={analysis}
              onQuickCommand={onQuickCommand}
            />
          </WindowCard>
        </div>
      ) : null}

      {graphPanel ? (
        <div className="mt-4">
          <WindowCard panel={graphPanel}>
            <GraphPreview
              workspace={workspace}
              analysis={analysis}
              onQuickCommand={onQuickCommand}
            />
          </WindowCard>
        </div>
      ) : null}

      {diagramPanel && workspace.windowState.diagram ? (
        <div className="mt-4">
          <WindowCard panel={diagramPanel}>
            <ComponentDiagramPreview componentKey={workspace.windowState.diagram.componentKey} />
          </WindowCard>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs font-medium text-gray-400">Suggested next commands</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {workspace.nextActions.map((action) => (
            <button
              key={action}
              onClick={() => onQuickCommand(action)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-gray-200 transition hover:bg-white/10"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function WindowCard({ panel, children }: { panel?: CircuitPanel; children: React.ReactNode }) {
  if (!panel) return null;

  const accentClasses: Record<CircuitPanel['accent'], string> = {
    cyan: 'border-cyan-900/30 bg-cyan-950/10 text-cyan-200',
    emerald: 'border-emerald-900/30 bg-emerald-950/10 text-emerald-200',
    amber: 'border-amber-900/30 bg-amber-950/10 text-amber-200',
    violet: 'border-violet-900/30 bg-violet-950/10 text-violet-200',
  };

  const open = panel.state?.isOpen ?? true;
  if (!open) return null;

  return (
    <section className="rounded-2xl border border-gray-800 bg-[#0f1721] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] tracking-[0.18em] uppercase ${accentClasses[panel.accent]}`}
          >
            {panel.kind}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">{panel.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">{panel.description}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0a0f15] px-2 py-1 text-[11px] text-gray-500">
          adaptive
        </div>
      </div>
      {children}
    </section>
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
  onRefresh,
}: AuthPanelProps) {
  const claudeAvailable = claudeProvider?.available;
  const codexAvailable = codexProvider?.available;
  const anyProviderAvailable = claudeAvailable === true || codexAvailable === true;

  return (
    <div className="rounded-xl border border-cyan-500/25 bg-[#0f1722]/95 p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.08)] backdrop-blur">
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
                claudeAvailable ? 'bg-green-900/40 text-green-300' : 'bg-gray-800/70 text-gray-400'
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
                codexAvailable ? 'bg-green-900/40 text-green-300' : 'bg-gray-800/70 text-gray-400'
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

      {!anyProviderAvailable && !isCheckingAuth && (
        <div className="mt-3 rounded border border-amber-500/30 bg-amber-950/30 p-2 text-xs text-amber-200">
          <p>No providers are available in this deployment right now.</p>
          <p className="mt-1 text-amber-300/90">
            For hosted testing, configure server credentials: `ANTHROPIC_API_KEY` and/or
            `OPENAI_API_KEY`.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          Current connection:{' '}
          <span className={isConfigured ? 'text-cyan-300' : 'text-amber-300'}>
            {authLabel(authSource)}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className="text-cyan-400 hover:text-cyan-300 hover:underline">
            refresh
          </button>
          {isConfigured && (
            <button
              onClick={onDisconnect}
              className="text-red-400 hover:text-red-300 hover:underline"
            >
              disconnect
            </button>
          )}
        </div>
      </div>

      {isCheckingAuth && (
        <p className="mt-2 text-xs text-cyan-400">Checking provider availability...</p>
      )}
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
