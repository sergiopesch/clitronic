import { analyzeCircuit } from './analysis';
import { findCatalogMatches } from './catalog';
import type {
  CircuitConnection,
  CircuitDiagramState,
  CircuitDocument,
  CircuitEvent,
  CircuitFocusTarget,
  CircuitMetric,
  CircuitMode,
  CircuitNode,
  CircuitNodeParameter,
  CircuitPanel,
  CircuitWindowState,
  CircuitWindowTarget,
} from './types';

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

function uniqueWindowTargets(values: CircuitWindowTarget[]): CircuitWindowTarget[] {
  return Array.from(new Set(values));
}

function createNodeId(key: string, index: number): string {
  return `${key}-${index + 1}`;
}

function extractParameter(prompt: string, pattern: RegExp): string | undefined {
  const match = prompt.match(pattern);
  return match?.[1]?.trim();
}

function inferParameters(key: string, prompt: string): CircuitNodeParameter[] {
  const source = prompt.toLowerCase();
  const params: CircuitNodeParameter[] = [];

  if (key === 'battery') {
    const voltage = extractParameter(source, /(\d+(?:\.\d+)?)\s*v/);
    params.push({ key: 'voltage', label: 'Voltage', value: voltage ? `${voltage}V` : '5V' });
  }

  if (key === 'resistor') {
    const resistance = extractParameter(
      source,
      /(\d+(?:\.\d+)?)\s*(k?\s?ohm|k?\s?ω|k?\s?ohms|k?\s?Ω|k)/i
    );
    params.push({
      key: 'resistance',
      label: 'Resistance',
      value: resistance
        ? resistance.replace(/\s+/g, '').replace('ohms', 'Ω').replace('ohm', 'Ω')
        : '220Ω',
    });
  }

  if (key === 'led') {
    const colour = source.includes('blue')
      ? 'Blue'
      : source.includes('green')
        ? 'Green'
        : source.includes('yellow')
          ? 'Yellow'
          : 'Red';
    params.push({ key: 'colour', label: 'Colour', value: colour });
    params.push({
      key: 'forward-voltage',
      label: 'Forward voltage',
      value: colour === 'Red' ? '2.0V' : '3.2V',
    });
  }

  if (key === 'capacitor') {
    const capacitance = extractParameter(source, /(\d+(?:\.\d+)?)\s*(uf|μf|nf|pf)/i);
    params.push({
      key: 'capacitance',
      label: 'Capacitance',
      value: capacitance ? capacitance.replace(/\s+/g, '') : '100μF',
    });
  }

  return params;
}

function buildNodes(prompt: string): CircuitNode[] {
  const matches = findCatalogMatches(prompt);

  if (matches.length === 0) {
    return [
      {
        id: 'concept-1',
        key: 'concept',
        label: 'Concept',
        type: 'unknown',
        quantity: 1,
        notes: ['No concrete component was detected yet.'],
      },
    ];
  }

  return matches.map((match, index) => ({
    id: createNodeId(match.key, index),
    key: match.key,
    label: match.label,
    type: match.nodeType,
    quantity: 1,
    parameters: inferParameters(match.key, prompt),
  }));
}

function buildConnections(nodes: CircuitNode[]): CircuitConnection[] {
  if (nodes.length < 2) return [];

  const connections: CircuitConnection[] = [];

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const current = nodes[index];
    const next = nodes[index + 1];
    if (!current || !next) continue;

    connections.push({
      id: `connection-${index + 1}`,
      from: current.id,
      to: next.id,
      kind: 'inferred',
      label: 'command-inferred relationship',
      rationale: 'Detected from adjacent components in the prompt.',
    });
  }

  return connections;
}

function hasNode(nodes: CircuitNode[], key: string): boolean {
  return nodes.some((node) => node.key === key);
}

function normalizeWindowTarget(value?: string): CircuitWindowTarget | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;

  if (
    normalized === 'workbench' ||
    normalized === 'bench' ||
    normalized === 'scene' ||
    normalized === 'canvas'
  ) {
    return 'workbench';
  }

  if (normalized === 'teacher' || normalized === 'teach') return 'teacher';
  if (normalized === 'inspector' || normalized === 'inspect') return 'inspector';
  if (normalized === 'graph' || normalized === 'signal' || normalized === 'scope') return 'graph';
  if (normalized === 'topology' || normalized === 'map' || normalized === 'connections') {
    return 'topology';
  }
  if (normalized === 'diagram' || normalized === 'schematic' || normalized === 'card') {
    return 'diagram';
  }

  return undefined;
}

function normalizeFocusTarget(value?: string): CircuitFocusTarget {
  return normalizeWindowTarget(value) ?? 'workbench';
}

function normalizeWindowState(
  value: CircuitDocument['windowState'] | undefined,
  focusedPanel?: CircuitFocusTarget
): CircuitWindowState {
  const focusedWindow = value?.focusedWindow ?? focusedPanel ?? 'workbench';
  const requestedOpen = value?.openWindows ?? ['workbench'];
  const openWindows = unique([...requestedOpen, focusedWindow]).filter(
    (target): target is CircuitWindowTarget => Boolean(normalizeWindowTarget(target))
  ) as CircuitWindowTarget[];

  return {
    openWindows: openWindows.length ? openWindows : ['workbench'],
    focusedWindow,
    diagram: value?.diagram,
  };
}

function buildPanels(
  nodes: CircuitNode[],
  mode: CircuitMode,
  windowState: CircuitWindowState
): CircuitPanel[] {
  const isOpen = (target: CircuitWindowTarget) => windowState.openWindows.includes(target);

  const panels: CircuitPanel[] = [
    {
      id: 'scene-panel',
      kind: 'workbench',
      title: 'Workbench',
      description: 'Spatial circuit sketch and component staging area.',
      accent: 'cyan',
      state: { isOpen: isOpen('workbench'), isPinned: true, order: 1 },
    },
    {
      id: 'teacher-panel',
      kind: 'teacher',
      title: 'Teacher',
      description: 'Short teaching notes tied to the current topology and simulation state.',
      accent: 'emerald',
      state: { isOpen: isOpen('teacher'), isPinned: false, order: 2 },
    },
    {
      id: 'inspector-panel',
      kind: 'inspector',
      title: 'Inspector',
      description: 'Checklist, blockers, parameters, and exact connection status.',
      accent: 'amber',
      state: { isOpen: isOpen('inspector'), isPinned: false, order: 3 },
    },
    {
      id: 'topology-panel',
      kind: 'topology',
      title: 'Topology',
      description: 'Explicit wires, inferred relationships, and missing required links.',
      accent: 'cyan',
      state: { isOpen: isOpen('topology'), isPinned: false, order: 4 },
    },
    {
      id: 'graph-panel',
      kind: 'graph',
      title: 'Signal graph',
      description:
        mode === 'simulating'
          ? 'Live behaviour view for the active simulation.'
          : 'Previews what the graph can explain once the circuit is simulatable.',
      accent: 'violet',
      state: { isOpen: isOpen('graph'), isPinned: false, order: 5 },
    },
  ];

  if (windowState.diagram?.isOpen) {
    panels.push({
      id: 'diagram-panel',
      kind: 'diagram',
      title: windowState.diagram.title,
      description: 'Educational component diagram with orientation and usage notes.',
      accent: 'emerald',
      state: { isOpen: true, isPinned: false, order: 6 },
    });
  }

  if (mode === 'simulating' || hasNode(nodes, 'capacitor') || hasNode(nodes, 'led')) {
    panels.push({
      id: 'next-step-panel',
      kind: 'next-step',
      title: 'Simulation guide',
      description: 'Checklist and next commands to move the learner forward.',
      accent: 'emerald',
      state: { isOpen: true, isPinned: false, order: 7 },
    });
  }

  return panels;
}

function buildEvents(document: {
  nodes: CircuitNode[];
  connections: CircuitConnection[];
  mode: CircuitMode;
  simulation?: CircuitDocument['simulation'];
  windowState: CircuitWindowState;
}): CircuitEvent[] {
  const analysis = analyzeCircuit({
    id: 'analysis',
    prompt: 'analysis',
    title: 'analysis',
    mode: document.mode,
    focusedPanel: document.windowState.focusedWindow,
    windowState: document.windowState,
    summary: '',
    nodes: document.nodes,
    connections: document.connections,
    simulation: document.simulation,
    metrics: [],
    events: [],
    panels: [],
    insights: [],
    nextActions: [],
  });

  const events: CircuitEvent[] = [
    {
      id: 'console-first-model',
      kind: 'info',
      title: 'Console is the control surface',
      detail:
        'Windows are supporting instruments. They should open because the learner asks for them or because simulation needs them.',
    },
  ];

  if (analysis.blockers.length > 0) {
    events.push({
      id: 'topology-blockers',
      kind: 'validation',
      title: 'Circuit still has blockers',
      detail: analysis.blockers[0] ?? 'The topology still needs more work.',
    });
  }

  if (document.windowState.diagram?.isOpen) {
    events.push({
      id: `diagram-${document.windowState.diagram.componentKey}`,
      kind: 'window-opened',
      title: `${document.windowState.diagram.title} opened`,
      detail:
        'The learner asked for a component diagram, so the supporting reference window is now available.',
    });
  }

  if (document.mode === 'simulating') {
    events.push({
      id: 'simulation-active',
      kind: 'simulation',
      title: 'Simulation mode active',
      detail:
        'The graph and inspector should now explain the exact path, the current estimate, and any remaining blockers.',
    });
  }

  events.push(...analysis.derivedEvents);

  return events;
}

function buildInsights(
  nodes: CircuitNode[],
  mode: CircuitMode,
  connections: CircuitConnection[],
  windowState: CircuitWindowState,
  simulation?: CircuitDocument['simulation']
): string[] {
  const analysis = analyzeCircuit({
    id: 'analysis',
    prompt: 'analysis',
    title: 'analysis',
    mode,
    focusedPanel: windowState.focusedWindow,
    windowState,
    summary: '',
    nodes,
    connections,
    simulation,
    metrics: [],
    events: [],
    panels: [],
    insights: [],
    nextActions: [],
  });

  const insights = [
    'Clitronic should separate inferred intent from explicit wiring so learners know what is real and what is still assumed.',
    'Console commands should be able to open, close, and focus supporting windows deterministically.',
    ...analysis.derivedInsights,
  ];

  if (mode === 'simulating') {
    insights.push(
      'A valid simulation should shift the explanation from theory to this exact path.'
    );
  }

  return unique(insights);
}

function buildMetrics(
  document: Pick<CircuitDocument, 'nodes' | 'connections' | 'mode' | 'windowState' | 'simulation'>,
  events: CircuitEvent[]
): CircuitMetric[] {
  const validations = events.filter(
    (event) => event.kind === 'validation' || event.kind === 'warning'
  );

  const analysis = analyzeCircuit({
    id: 'analysis',
    prompt: 'analysis',
    title: 'analysis',
    mode: document.mode,
    focusedPanel: document.windowState.focusedWindow,
    windowState: document.windowState,
    summary: '',
    nodes: document.nodes,
    connections: document.connections,
    simulation: document.simulation,
    metrics: [],
    events: [],
    panels: [],
    insights: [],
    nextActions: [],
  });

  return [
    { label: 'Mode', value: titleCase(document.mode) },
    { label: 'Components', value: String(document.nodes.length) },
    { label: 'Connections', value: String(document.connections.length) },
    { label: 'Open windows', value: String(document.windowState.openWindows.length) },
    { label: 'Validation rules', value: String(validations.length) },
    ...analysis.derivedMetrics,
  ];
}

function buildNextActions(document: {
  nodes: CircuitNode[];
  connections: CircuitConnection[];
  mode: CircuitMode;
  windowState: CircuitWindowState;
  simulation?: CircuitDocument['simulation'];
}): string[] {
  const analysis = analyzeCircuit({
    id: 'analysis',
    prompt: 'analysis',
    title: 'analysis',
    mode: document.mode,
    focusedPanel: document.windowState.focusedWindow,
    windowState: document.windowState,
    summary: '',
    nodes: document.nodes,
    connections: document.connections,
    simulation: document.simulation,
    metrics: [],
    events: [],
    panels: [],
    insights: [],
    nextActions: [],
  });

  const next = [...analysis.suggestedFixes];

  if (!document.windowState.openWindows.includes('inspector')) next.push('show inspector');
  if (!document.windowState.openWindows.includes('topology')) next.push('show topology');
  if (hasNode(document.nodes, 'led') && !document.windowState.diagram?.isOpen) {
    next.push('show diagram led');
  }
  if (document.mode !== 'simulating') next.push('simulate');
  if (document.mode === 'simulating') next.push('focus graph');
  next.push('explain what changed');

  return unique(next).slice(0, 8);
}

function documentSummary(prompt: string): string {
  return `Structured circuit document derived from the command: ${prompt}. The console is primary, and the supporting windows should explain exact components, links, and blockers.`;
}

export function syncCircuitDocument(
  document: Pick<
    CircuitDocument,
    | 'id'
    | 'prompt'
    | 'title'
    | 'mode'
    | 'nodes'
    | 'connections'
    | 'simulation'
    | 'focusedPanel'
    | 'windowState'
  > &
    Partial<Pick<CircuitDocument, 'summary' | 'events'>>
): CircuitDocument {
  const cleanPrompt = document.prompt.trim() || 'new circuit idea';
  const windowState = normalizeWindowState(document.windowState, document.focusedPanel);
  const events = buildEvents({
    nodes: document.nodes,
    connections: document.connections,
    mode: document.mode,
    simulation: document.simulation,
    windowState,
  });

  return {
    id:
      document.id ||
      `circuit-${
        cleanPrompt
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'draft'
      }`,
    prompt: cleanPrompt,
    title: document.title.trim() || titleCase(cleanPrompt),
    mode: document.mode,
    focusedPanel: windowState.focusedWindow,
    windowState,
    summary: document.summary?.trim() || documentSummary(cleanPrompt),
    nodes: document.nodes,
    connections: document.connections,
    simulation: document.simulation,
    metrics: buildMetrics(
      {
        nodes: document.nodes,
        connections: document.connections,
        mode: document.mode,
        windowState,
        simulation: document.simulation,
      },
      events
    ),
    events: [...(document.events ?? []), ...events]
      .filter(
        (event, index, arr) => arr.findIndex((candidate) => candidate.id === event.id) === index
      )
      .slice(0, 10),
    panels: buildPanels(document.nodes, document.mode, windowState),
    insights: buildInsights(
      document.nodes,
      document.mode,
      document.connections,
      windowState,
      document.simulation
    ),
    nextActions: buildNextActions({
      nodes: document.nodes,
      connections: document.connections,
      mode: document.mode,
      windowState,
      simulation: document.simulation,
    }),
  };
}

export function createCircuitDocument(
  prompt: string,
  mode: CircuitMode = 'preview'
): CircuitDocument {
  const cleanPrompt = prompt.trim() || 'new circuit idea';
  const nodes = buildNodes(cleanPrompt);
  const connections = buildConnections(nodes);

  return syncCircuitDocument({
    id: `circuit-${
      cleanPrompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'draft'
    }`,
    prompt: cleanPrompt,
    title: titleCase(cleanPrompt),
    mode,
    focusedPanel: 'workbench',
    windowState: {
      openWindows: ['workbench'],
      focusedWindow: 'workbench',
    },
    summary: documentSummary(cleanPrompt),
    nodes,
    connections,
    simulation: undefined,
  });
}

export function activateCircuitSimulation(document: CircuitDocument): CircuitDocument {
  return syncCircuitDocument({
    ...document,
    mode: 'simulating',
    windowState: {
      ...document.windowState,
      openWindows: uniqueWindowTargets([...document.windowState.openWindows, 'graph', 'inspector']),
      focusedWindow: 'graph',
    },
  });
}

export function focusCircuitPanel(document: CircuitDocument, panelName: string): CircuitDocument {
  const focus = normalizeFocusTarget(panelName);
  const label = titleCase(focus);
  const focusEvent: CircuitEvent = {
    id: `focus-${focus}`,
    kind: 'focus',
    title: `${label} focused`,
    detail: `The ${focus} window is now in front of the learner.`,
  };

  return syncCircuitDocument({
    ...document,
    focusedPanel: focus,
    windowState: {
      ...document.windowState,
      openWindows: uniqueWindowTargets([...document.windowState.openWindows, focus]),
      focusedWindow: focus,
    },
    events: [focusEvent, ...document.events],
  });
}

export function setCircuitWindow(
  document: CircuitDocument,
  panelName: string,
  action: 'show' | 'hide' | 'focus'
): CircuitDocument {
  const target = normalizeWindowTarget(panelName);
  if (!target) return document;

  const openSet = new Set(document.windowState.openWindows);

  if (action === 'show' || action === 'focus') {
    openSet.add(target);
  }

  if (action === 'hide') {
    openSet.delete(target);
    if (target === 'workbench' && openSet.size === 0) {
      openSet.add('teacher');
    }
  }

  const nextFocused =
    action === 'hide' && document.windowState.focusedWindow === target
      ? ((Array.from(openSet)[0] as CircuitWindowTarget | undefined) ?? 'workbench')
      : action === 'focus'
        ? target
        : document.windowState.focusedWindow;

  const event: CircuitEvent = {
    id: `${action}-${target}`,
    kind: action === 'focus' ? 'focus' : 'window-opened',
    title: `${titleCase(target)} ${action === 'hide' ? 'hidden' : action === 'show' ? 'opened' : 'focused'}`,
    detail:
      action === 'hide'
        ? `The ${target} window was closed by command.`
        : action === 'show'
          ? `The ${target} window is now available as a supporting instrument.`
          : `The ${target} window is now the active supporting instrument.`,
  };

  return syncCircuitDocument({
    ...document,
    focusedPanel: nextFocused,
    windowState: {
      ...document.windowState,
      openWindows: Array.from(openSet) as CircuitWindowTarget[],
      focusedWindow: nextFocused,
      diagram: target === 'diagram' && action === 'hide' ? undefined : document.windowState.diagram,
    },
    events: [event, ...document.events],
  });
}

export function setCircuitDiagram(
  document: CircuitDocument,
  componentKey: string,
  action: 'show' | 'hide' | 'focus' = 'show'
): CircuitDocument {
  const normalized = componentKey.trim().toLowerCase();

  if (action === 'hide') {
    const remainingWindows = document.windowState.openWindows.filter(
      (window) => window !== 'diagram'
    );
    const nextFocused =
      document.windowState.focusedWindow === 'diagram'
        ? (remainingWindows[0] ?? 'workbench')
        : document.windowState.focusedWindow;

    return syncCircuitDocument({
      ...document,
      focusedPanel: nextFocused,
      windowState: {
        ...document.windowState,
        openWindows: remainingWindows,
        focusedWindow: nextFocused,
        diagram: undefined,
      },
      events: [
        {
          id: 'hide-diagram',
          kind: 'window-opened',
          title: 'Diagram hidden',
          detail: 'The diagram reference window was closed by command.',
        },
        ...document.events,
      ],
    });
  }

  const diagram: CircuitDiagramState = {
    componentKey: normalized,
    title: `${titleCase(normalized)} diagram`,
    isOpen: true,
  };

  return syncCircuitDocument({
    ...document,
    focusedPanel: 'diagram',
    windowState: {
      ...document.windowState,
      openWindows: uniqueWindowTargets([...document.windowState.openWindows, 'diagram']),
      focusedWindow: action === 'focus' ? 'diagram' : document.windowState.focusedWindow,
      diagram,
    },
    events: [
      {
        id: `show-diagram-${normalized}`,
        kind: action === 'focus' ? 'focus' : 'window-opened',
        title: `${diagram.title} ready`,
        detail: 'The learner asked for a component diagram reference.',
      },
      ...document.events,
    ],
  });
}
