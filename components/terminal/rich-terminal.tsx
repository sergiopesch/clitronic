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
import { electronicsComponents } from '@/lib/data/components';

type PanelKind = 'scene' | 'teacher' | 'inspector' | 'graph' | 'next-step';
type SimulationMode = 'idle' | 'preview' | 'simulating';

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

interface TeacherEvent {
  id: string;
  title: string;
  detail: string;
}

interface AdaptivePanel {
  id: string;
  kind: PanelKind;
  title: string;
  description: string;
  accent: 'cyan' | 'emerald' | 'amber' | 'violet';
}

interface WorkspaceState {
  mode: SimulationMode;
  circuitTitle: string;
  circuitSummary: string;
  nodes: string[];
  insights: string[];
  metrics: Array<{ label: string; value: string }>;
  teacherEvents: TeacherEvent[];
  panels: AdaptivePanel[];
  nextActions: string[];
}

const DEFAULT_WORKSPACE: WorkspaceState = {
  mode: 'idle',
  circuitTitle: 'No active circuit',
  circuitSummary:
    'This first version turns Clitronic into a command-first studio. Commands drive the experience; adaptive windows explain what matters.',
  nodes: ['battery', 'resistor', 'led'],
  insights: [
    'The terminal is the spine of the interface.',
    'Windows appear to explain state, not just decorate it.',
    'The teacher panel should react to what the learner is doing now.',
  ],
  metrics: [
    { label: 'Mode', value: 'Concept sketch' },
    { label: 'Teacher', value: 'Observing' },
    { label: 'Windows', value: 'Adaptive' },
  ],
  teacherEvents: [
    {
      id: 'default-observer',
      title: 'Teacher by your side',
      detail:
        'As the learner acts, Clitronic should open the right lens: physical layout, explanation, warning, graph, or next step.',
    },
  ],
  panels: [
    {
      id: 'scene-panel',
      kind: 'scene',
      title: 'Workbench',
      description: 'A spatial view of the build. In later versions this becomes the 3D circuit bench.',
      accent: 'cyan',
    },
    {
      id: 'teacher-panel',
      kind: 'teacher',
      title: 'Teacher',
      description: 'Context-aware guidance tied to the exact circuit state.',
      accent: 'emerald',
    },
    {
      id: 'inspector-panel',
      kind: 'inspector',
      title: 'Inspector',
      description: 'Key values, pin states, warnings, and the current explanation surface.',
      accent: 'amber',
    },
  ],
  nextActions: [
    'build a simple led circuit with a 9v battery',
    'simulate',
    'explain why the led is dim',
  ],
};

const HELP_TEXT = `
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CLITRONIC STUDIO COMMANDS                                              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  help                         Show this help message                     │
  │  auth                         Connect Claude Code or OpenAI Codex        │
  │  clear                        Clear terminal history                     │
  │  identify                     Upload an image to identify a component    │
  │  build <idea>                 Sketch a circuit and open teaching views   │
  │  simulate                     Switch the workspace into simulation mode  │
  │  explain <question>           Ask the teacher about the active circuit   │
  │  focus <panel>                Emphasise teacher / graph / inspector      │
  │  list [category]              List components from the knowledge base    │
  │  info <component>             Get component details                      │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  Example flow                                                         │
  │    build a simple led circuit with a 9v battery                        │
  │    simulate                                                            │
  │    explain why the led is dim                                          │
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferCircuitTokens(input: string): string[] {
  const source = input.toLowerCase();
  const matches = electronicsComponents
    .filter((component) => source.includes(component.id) || source.includes(component.name.toLowerCase()))
    .map((component) => component.id.replace(/-/g, ' '));

  if (source.includes('battery')) matches.unshift('battery');
  if (source.includes('ground') || source.includes('gnd')) matches.push('ground');
  if (source.includes('wire')) matches.push('wire');

  if (matches.length === 0) {
    if (source.includes('sensor')) matches.push('sensor');
    if (source.includes('circuit')) matches.push('circuit');
  }

  return unique(matches).slice(0, 6);
}

function createWorkspaceFromPrompt(prompt: string, previous?: WorkspaceState): WorkspaceState {
  const normalized = prompt.trim();
  const source = normalized.toLowerCase();
  const nodes = inferCircuitTokens(normalized);
  const hasLed = nodes.includes('led');
  const hasResistor = nodes.includes('resistor');
  const hasBattery = nodes.includes('battery');
  const hasCapacitor = nodes.includes('capacitor');
  const hasTransistor = nodes.includes('transistor');

  const teacherEvents: TeacherEvent[] = [
    {
      id: 'teacher-observed-change',
      title: 'Teacher noticed a new intent',
      detail:
        'A good teaching interface should react to the command by opening the smallest useful set of windows, not everything at once.',
    },
  ];

  const metrics: Array<{ label: string; value: string }> = [
    { label: 'Mode', value: 'Prototype sketch' },
    { label: 'Circuit nodes', value: nodes.length ? String(nodes.length) : '0' },
    { label: 'Teacher', value: 'Context-aware' },
  ];

  const insights: string[] = [];
  const nextActions: string[] = [];
  const panels: AdaptivePanel[] = [
    {
      id: 'scene-panel',
      kind: 'scene',
      title: 'Workbench',
      description: 'The main canvas where the circuit exists physically and visually.',
      accent: 'cyan',
    },
    {
      id: 'teacher-panel',
      kind: 'teacher',
      title: 'Teacher',
      description: 'Explains what just happened and why it matters.',
      accent: 'emerald',
    },
    {
      id: 'inspector-panel',
      kind: 'inspector',
      title: 'Inspector',
      description: 'Shows the current values, assumptions, and warnings for the active build.',
      accent: 'amber',
    },
  ];

  if (hasLed && hasBattery) {
    insights.push('The interface should automatically surface current limiting because the LED path implies a protection question.');
    teacherEvents.push({
      id: 'teacher-led-protection',
      title: 'Protection check',
      detail: hasResistor
        ? 'A resistor is present, so the teacher can focus on why that resistor value changes brightness and safety.'
        : 'No resistor was detected. The teacher should warn immediately before simulation or build continuation.',
    });
    metrics.push({ label: 'LED safety', value: hasResistor ? 'Protected' : 'Needs resistor' });
    nextActions.push('simulate');
    nextActions.push('explain why the led is dim');
    nextActions.push('focus graph');
  }

  if (hasCapacitor) {
    insights.push('Capacitors are perfect for adaptive teaching because they create visible time-based behaviour.');
    panels.push({
      id: 'graph-panel',
      kind: 'graph',
      title: 'Charge curve',
      description: 'A graph window opens because time-dependent behaviour is easier to understand visually than verbally.',
      accent: 'violet',
    });
    nextActions.push('explain the charge curve');
  }

  if (hasTransistor) {
    insights.push('A transistor often triggers pinout, biasing, and current-path questions, so the teacher should open those lenses proactively.');
    teacherEvents.push({
      id: 'teacher-transistor',
      title: 'Switching concept introduced',
      detail: 'This is where Clitronic can distinguish itself: show the control path and the load path as separate but linked stories.',
    });
    nextActions.push('show current flow');
  }

  if (insights.length === 0) {
    insights.push('The first version should bias toward explanation windows that increase understanding, not UI theatre.');
    insights.push('Commands are still the source of intent; windows are responses to intent.');
    nextActions.push('build a simple led circuit with a 9v battery');
  }

  const summary = normalized
    ? `Command-first sketch for: ${normalized}. The workspace should react by exposing the right teaching lenses around this build.`
    : previous?.circuitSummary ?? DEFAULT_WORKSPACE.circuitSummary;

  return {
    mode: 'preview',
    circuitTitle: normalized ? titleCase(normalized) : previous?.circuitTitle ?? DEFAULT_WORKSPACE.circuitTitle,
    circuitSummary: summary,
    nodes: nodes.length ? nodes : previous?.nodes ?? DEFAULT_WORKSPACE.nodes,
    insights,
    metrics,
    teacherEvents,
    panels,
    nextActions: unique(nextActions).slice(0, 5),
  };
}

function activateSimulation(previous: WorkspaceState): WorkspaceState {
  const baseInsights = previous.insights.filter(Boolean);
  const insights = unique([
    ...baseInsights,
    'Simulation mode should favour signal, causality, and failure explanation over static description.',
  ]);

  const graphPanel: AdaptivePanel = {
    id: 'graph-panel',
    kind: 'graph',
    title: 'Live graph',
    description: 'Waveforms and time-based changes appear when the learner asks to simulate or when behaviour becomes dynamic.',
    accent: 'violet',
  };

  const nextPanel: AdaptivePanel = {
    id: 'next-step-panel',
    kind: 'next-step',
    title: 'What to try next',
    description: 'A compact teaching window that suggests the next command or experiment rather than a long lecture.',
    accent: 'emerald',
  };

  const panels = uniquePanels([...previous.panels, graphPanel, nextPanel]);

  return {
    ...previous,
    mode: 'simulating',
    circuitSummary:
      previous.circuitSummary + ' Simulation mode is active, so the workspace should now foreground behaviour, graphs, and live explanation.',
    metrics: [
      ...previous.metrics.filter((metric) => metric.label !== 'Mode'),
      { label: 'Mode', value: 'Simulating' },
    ],
    teacherEvents: [
      {
        id: 'teacher-simulation',
        title: 'Simulation window opened',
        detail:
          'This is the point where Clitronic stops being a static explainer and starts acting like a responsive bench companion.',
      },
      ...previous.teacherEvents,
    ].slice(0, 4),
    panels,
    nextActions: unique([
      ...previous.nextActions,
      'explain what changed',
      'focus inspector',
      'focus graph',
    ]).slice(0, 5),
    insights,
  };
}

function uniquePanels(panels: AdaptivePanel[]): AdaptivePanel[] {
  const seen = new Set<string>();
  return panels.filter((panel) => {
    if (seen.has(panel.id)) return false;
    seen.add(panel.id);
    return true;
  });
}

function emphasisePanel(panelName: string, previous: WorkspaceState): WorkspaceState {
  const normalized = panelName.trim().toLowerCase();
  if (!normalized) return previous;

  const matched = previous.panels.find(
    (panel) => panel.kind === normalized || panel.title.toLowerCase() === normalized
  );

  const label = matched?.title ?? titleCase(normalized);

  return {
    ...previous,
    teacherEvents: [
      {
        id: `teacher-focus-${normalized}`,
        title: `${label} brought forward`,
        detail: `The interface should now prioritise the ${label.toLowerCase()} view and compress less relevant windows without fully losing context.`,
      },
      ...previous.teacherEvents,
    ].slice(0, 4),
    metrics: [
      ...previous.metrics.filter((metric) => metric.label !== 'Focus'),
      { label: 'Focus', value: label },
    ],
  };
}

function buildTeacherPrompt(userInput: string, workspace: WorkspaceState): string {
  const nodes = workspace.nodes.length ? workspace.nodes.join(', ') : 'none yet';
  const panels = workspace.panels.map((panel) => panel.title).join(', ');

  return `You are helping design Clitronic as a command-first adaptive electronics studio.

The current workspace state is:
- circuit title: ${workspace.circuitTitle}
- mode: ${workspace.mode}
- nodes: ${nodes}
- open panels: ${panels}
- circuit summary: ${workspace.circuitSummary}

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
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceState>(DEFAULT_WORKSPACE);

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
    if (shouldScrollRef.current && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
      shouldScrollRef.current = false;
    }
  }, [lines, streamingContent]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const panelSummary = useMemo(
    () => workspace.panels.map((panel) => panel.title).join(' • '),
    [workspace.panels]
  );

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
    async (userInput: string, state: WorkspaceState) => {
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
        const nextWorkspace = createWorkspaceFromPrompt(args || 'new circuit idea', workspace);
        setWorkspace(nextWorkspace);
        addLine({
          type: 'system',
          content: `✓ Opened adaptive windows for ${nextWorkspace.circuitTitle}`,
        });
        addLine({
          type: 'system',
          content: `→ Panels: ${nextWorkspace.panels.map((panel) => panel.title).join(', ')}`,
        });
        return;
      }

      if (command === 'simulate') {
        const nextWorkspace = activateSimulation(workspace);
        setWorkspace(nextWorkspace);
        addLine({ type: 'system', content: '✓ Simulation mode active — graph and next-step windows opened' });
        return;
      }

      if (command === 'focus') {
        if (!args) {
          addLine({ type: 'error', content: 'Usage: focus <teacher|graph|inspector|workbench>' });
          return;
        }
        const nextWorkspace = emphasisePanel(args, workspace);
        setWorkspace(nextWorkspace);
        addLine({ type: 'system', content: `✓ Focus shifted to ${titleCase(args)}` });
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

        const draftWorkspace = createWorkspaceFromPrompt(trimmedCmd, workspace);
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
    [
      addLine,
      askTeacher,
      authSource,
      canMakeApiCalls,
      showAuthRequiredError,
      workspace,
    ]
  );

  const submitCurrentInput = useCallback(() => {
    if (isProcessing || !input.trim()) return;
    const currentInput = input;
    setInput('');
    void handleCommand(currentInput);
  }, [handleCommand, input, isProcessing]);

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
      className={`relative min-h-[100dvh] overflow-hidden bg-[#070b11] font-mono text-[13px] leading-relaxed text-gray-200 select-text sm:text-[14px] ${
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

      <div className="relative z-10 grid min-h-[100dvh] grid-cols-1 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="flex min-h-[100dvh] flex-col border-r border-cyan-900/20">
          <header className="border-b border-cyan-900/30 bg-[#070b11]/80 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs tracking-[0.24em] text-cyan-400 uppercase">⚡ Clitronic Studio</div>
                <div className="mt-1 text-sm text-gray-300">Command-first electronics workspace with adaptive teaching windows.</div>
              </div>
              <button
                onClick={() => setShowAuthPanel(true)}
                className="rounded border border-emerald-800/50 bg-emerald-900/15 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30"
              >
                auth
              </button>
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
              <span className="rounded-full border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-cyan-300">
                {workspace.mode === 'simulating' ? 'Simulation live' : workspace.mode === 'preview' ? 'Preview mode' : 'Concept mode'}
              </span>
              <span className="rounded-full border border-violet-500/30 bg-violet-950/30 px-2 py-0.5 text-violet-300">
                Open windows: {workspace.panels.length}
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
            </div>
          </header>

          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto px-4 py-3"
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

          <footer
            className="border-t border-cyan-900/30 bg-[#070b11]/90 px-3 pt-3 backdrop-blur"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
          >
            <div className="mb-2 text-[11px] text-gray-500">
              Panels now open: <span className="text-cyan-400">{panelSummary}</span>
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
                placeholder={
                  isProcessing
                    ? 'Processing...'
                    : 'Try: build a simple led circuit with a 9v battery'
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
              <span>{voiceSupported && voiceAvailable && canMakeApiCalls ? 'Hold space for voice input' : ''}</span>
              <span>build • simulate • explain • focus • identify • auth • ↑↓ history</span>
            </div>
          </footer>
        </div>

        <AdaptiveStudio workspace={workspace} onQuickCommand={(command) => {
          setInput(command);
          inputRef.current?.focus();
        }} />
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
  workspace: WorkspaceState;
  onQuickCommand: (command: string) => void;
}) {
  return (
    <aside className="relative flex min-h-[100dvh] flex-col overflow-y-auto bg-[#0b1118]/92 px-4 py-4 backdrop-blur-sm">
      <div className="mb-4 rounded-2xl border border-cyan-900/30 bg-[#0c141d] p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.04)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-[0.24em] text-cyan-400 uppercase">Workbench state</div>
            <h2 className="mt-2 text-xl font-semibold text-white">{workspace.circuitTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">{workspace.circuitSummary}</p>
          </div>
          <div className="rounded-xl border border-cyan-700/30 bg-cyan-950/20 px-3 py-2 text-right text-xs text-cyan-200">
            <div>{workspace.mode === 'simulating' ? 'Simulation running' : workspace.mode === 'preview' ? 'Adaptive preview' : 'Concept sketch'}</div>
            <div className="mt-1 text-cyan-400/80">{workspace.nodes.length} nodes • {workspace.panels.length} windows</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {workspace.metrics.map((metric) => (
            <div key={`${metric.label}-${metric.value}`} className="rounded-xl border border-gray-800 bg-[#0a0f15] p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">{metric.label}</div>
              <div className="mt-1 text-sm font-medium text-gray-100">{metric.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <WindowCard panel={workspace.panels.find((panel) => panel.kind === 'scene') ?? workspace.panels[0]}>
          <WorkbenchPreview nodes={workspace.nodes} mode={workspace.mode} />
        </WindowCard>

        <WindowCard panel={workspace.panels.find((panel) => panel.kind === 'teacher') ?? workspace.panels[1]}>
          <div className="space-y-3 text-sm text-gray-300">
            {workspace.teacherEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3">
                <div className="font-semibold text-emerald-200">{event.title}</div>
                <div className="mt-1 leading-relaxed text-emerald-100/80">{event.detail}</div>
              </div>
            ))}
          </div>
        </WindowCard>

        <WindowCard panel={workspace.panels.find((panel) => panel.kind === 'inspector') ?? workspace.panels[2]}>
          <div className="space-y-3 text-sm text-gray-300">
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">Detected circuit nodes</div>
              <div className="flex flex-wrap gap-2">
                {workspace.nodes.map((node) => (
                  <span key={node} className="rounded-full border border-amber-700/30 bg-amber-950/20 px-2.5 py-1 text-xs text-amber-200">
                    {node}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">Why these windows are open</div>
              <ul className="space-y-2 text-gray-300">
                {workspace.insights.map((insight, index) => (
                  <li key={`${index}-${insight}`} className="rounded-lg border border-gray-800 bg-[#0a0f15] px-3 py-2 leading-relaxed">
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </WindowCard>

        <WindowCard
          panel={
            workspace.panels.find((panel) => panel.kind === 'graph') ?? {
              id: 'graph-panel-fallback',
              kind: 'graph',
              title: 'Graph window',
              description: 'This window appears when the circuit needs a time or signal view.',
              accent: 'violet',
            }
          }
        >
          <GraphPreview mode={workspace.mode} />
        </WindowCard>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-800 bg-[#0a0f15] p-4">
        <div className="text-[11px] tracking-[0.16em] text-gray-500 uppercase">Suggested next commands</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {workspace.nextActions.map((action) => (
            <button
              key={action}
              onClick={() => onQuickCommand(action)}
              className="rounded-full border border-cyan-700/30 bg-cyan-950/20 px-3 py-1.5 text-xs text-cyan-200 transition hover:border-cyan-500/50 hover:bg-cyan-900/30"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function WindowCard({ panel, children }: { panel?: AdaptivePanel; children: React.ReactNode }) {
  if (!panel) return null;

  const accentClasses: Record<AdaptivePanel['accent'], string> = {
    cyan: 'border-cyan-900/30 bg-cyan-950/10 text-cyan-200',
    emerald: 'border-emerald-900/30 bg-emerald-950/10 text-emerald-200',
    amber: 'border-amber-900/30 bg-amber-950/10 text-amber-200',
    violet: 'border-violet-900/30 bg-violet-950/10 text-violet-200',
  };

  return (
    <section className="rounded-2xl border border-gray-800 bg-[#0f1721] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] ${accentClasses[panel.accent]}`}>
            {panel.kind}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">{panel.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">{panel.description}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0a0f15] px-2 py-1 text-[11px] text-gray-500">adaptive</div>
      </div>
      {children}
    </section>
  );
}

function WorkbenchPreview({ nodes, mode }: { nodes: string[]; mode: SimulationMode }) {
  const displayNodes = nodes.length ? nodes : ['battery', 'resistor', 'led'];

  return (
    <div className="rounded-2xl border border-cyan-900/30 bg-[linear-gradient(180deg,#0a1017,#081019)] p-4">
      <div className="mb-4 flex items-center justify-between text-xs text-gray-400">
        <span>Spatial circuit sketch</span>
        <span>{mode === 'simulating' ? 'signal overlays on' : 'layout preview'}</span>
      </div>

      <div className="grid gap-3">
        {displayNodes.map((node, index) => (
          <div key={`${node}-${index}`} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-700/30 bg-cyan-950/20 text-xs text-cyan-200">
              {node.slice(0, 3).toUpperCase()}
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-cyan-500/50 to-transparent" />
            <div className="rounded-lg border border-gray-800 bg-[#0a0f15] px-2 py-1 text-xs text-gray-300">
              {node}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-cyan-900/25 bg-cyan-950/10 p-3 text-xs leading-relaxed text-cyan-100/80">
        In a fuller version this becomes the 3D bench. For now it proves the product idea: commands create physical state, and the UI opens the right teaching windows around it.
      </div>
    </div>
  );
}

function GraphPreview({ mode }: { mode: SimulationMode }) {
  const bars = mode === 'simulating' ? [32, 55, 68, 44, 79, 58, 72] : [20, 28, 36, 30, 42, 34, 40];

  return (
    <div className="rounded-2xl border border-violet-900/30 bg-[linear-gradient(180deg,#100d18,#0b0b14)] p-4">
      <div className="mb-4 flex items-center justify-between text-xs text-gray-400">
        <span>{mode === 'simulating' ? 'Live behaviour' : 'Potential signal view'}</span>
        <span>{mode === 'simulating' ? 'watching change over time' : 'waiting for simulation'}</span>
      </div>

      <div className="flex h-40 items-end gap-2">
        {bars.map((bar, index) => (
          <div key={`${index}-${bar}`} className="flex flex-1 flex-col justify-end">
            <div
              className="rounded-t-md bg-gradient-to-t from-violet-500 to-cyan-400"
              style={{ height: `${bar}%` }}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs leading-relaxed text-violet-100/80">
        Dynamic graphs should open only when they help explain behaviour — RC charge, PWM duty cycle, signal timing, or instability.
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
            <button onClick={onDisconnect} className="text-red-400 hover:text-red-300 hover:underline">
              disconnect
            </button>
          )}
        </div>
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
        pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded bg-gray-900">{children}</pre>,
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
