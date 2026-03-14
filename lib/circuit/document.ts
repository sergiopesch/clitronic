import { findCatalogMatches } from './catalog';
import type {
  CircuitConnection,
  CircuitDocument,
  CircuitEvent,
  CircuitMetric,
  CircuitMode,
  CircuitNode,
  CircuitNodeParameter,
  CircuitPanel,
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
    const resistance = extractParameter(source, /(\d+(?:\.\d+)?)\s*(k?\s?ohm|k?\s?ω|k?\s?ohms|k?\s?Ω|k)/i);
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
    params.push({ key: 'forward-voltage', label: 'Forward voltage', value: colour === 'Red' ? '2.0V' : '3.2V' });
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
      label: index === 0 ? 'command-inferred path' : 'adjacent relationship',
    });
  }

  return connections;
}

function hasNode(nodes: CircuitNode[], key: string): boolean {
  return nodes.some((node) => node.key === key);
}

function getNode(nodes: CircuitNode[], key: string): CircuitNode | undefined {
  return nodes.find((node) => node.key === key);
}

function getParameter(node: CircuitNode | undefined, key: string): string | undefined {
  return node?.parameters?.find((param) => param.key === key)?.value;
}

function parseVoltage(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}

function parseResistance(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const base = Number(match[1]);
  return normalized.includes('k') ? base * 1000 : base;
}

function buildValidationEvents(nodes: CircuitNode[], connections: CircuitConnection[]): CircuitEvent[] {
  const validations: CircuitEvent[] = [];
  const battery = getNode(nodes, 'battery');
  const led = getNode(nodes, 'led');
  const resistor = getNode(nodes, 'resistor');
  const ground = getNode(nodes, 'ground');

  if (led && battery && !resistor) {
    validations.push({
      id: 'validation-led-needs-resistor',
      kind: 'validation',
      title: 'LED path needs current limiting',
      detail:
        'The active document contains a battery and LED but no resistor. Clitronic should warn before simulation and suggest a resistor value.',
    });
  }

  if (led && !ground) {
    validations.push({
      id: 'validation-missing-ground',
      kind: 'validation',
      title: 'No ground reference detected',
      detail:
        'The circuit document has no explicit ground node yet. The topology view should flag the path as incomplete.',
    });
  }

  if (battery && resistor && led) {
    const voltage = parseVoltage(getParameter(battery, 'voltage')) ?? 5;
    const resistance = parseResistance(getParameter(resistor, 'resistance')) ?? 220;
    const ledForward = parseVoltage(getParameter(led, 'forward-voltage')) ?? 2;
    const currentMa = ((voltage - ledForward) / resistance) * 1000;

    validations.push({
      id: 'validation-led-current-estimate',
      kind: 'validation',
      title: 'Estimated LED current available',
      detail: `With ${voltage}V supply, ${resistance}Ω resistor, and ~${ledForward}V LED drop, the current is about ${currentMa.toFixed(1)}mA.`,
    });

    if (currentMa > 20) {
      validations.push({
        id: 'validation-led-current-high',
        kind: 'warning',
        title: 'Estimated LED current is high',
        detail:
          'The current estimate exceeds the comfortable 20mA region. The teacher should suggest increasing the resistor value.',
      });
    }
  }

  const connectedIds = new Set<string>();
  for (const connection of connections) {
    connectedIds.add(connection.from);
    connectedIds.add(connection.to);
  }

  const disconnected = nodes.filter(
    (node) => node.key !== 'concept' && !connectedIds.has(node.id) && nodes.length > 1
  );

  for (const node of disconnected) {
    validations.push({
      id: `validation-disconnected-${node.id}`,
      kind: 'validation',
      title: `${node.label} is not connected`,
      detail:
        'This node exists in the document but is not part of an explicit connection. The topology view should make that obvious.',
    });
  }

  return validations;
}

function buildEvents(nodes: CircuitNode[], connections: CircuitConnection[], mode: CircuitMode): CircuitEvent[] {
  const events: CircuitEvent[] = [
    {
      id: 'teacher-observed-intent',
      kind: 'teaching',
      title: 'Teacher noticed a concrete build intent',
      detail:
        'Windows should respond to actual detected components and relationships, not just broad conversation context.',
    },
  ];

  if (hasNode(nodes, 'battery') && hasNode(nodes, 'led') && !hasNode(nodes, 'resistor')) {
    events.push({
      id: 'warning-led-resistor',
      kind: 'warning',
      title: 'LED protection missing',
      detail:
        'A battery and LED are present but no resistor was detected. The teacher should warn before simulation and suggest adding current limiting.',
    });
  }

  if (hasNode(nodes, 'battery') && hasNode(nodes, 'led') && hasNode(nodes, 'resistor')) {
    events.push({
      id: 'teaching-led-path',
      kind: 'teaching',
      title: 'Current-limited LED path detected',
      detail:
        'This is a good moment to explain brightness, voltage drop, and why resistor values change current rather than simply saying the circuit is correct.',
    });
  }

  if (hasNode(nodes, 'capacitor')) {
    events.push({
      id: 'window-capacitor-graph',
      kind: 'window-opened',
      title: 'Time-based graph should open',
      detail:
        'A capacitor implies charge and discharge behaviour, so a graph window becomes materially useful.',
    });
  }

  if (hasNode(nodes, 'transistor')) {
    events.push({
      id: 'teaching-transistor',
      kind: 'teaching',
      title: 'Switching layer introduced',
      detail:
        'The interface should separate the control path from the load path so the learner can see cause and effect clearly.',
    });
  }

  events.push(...buildValidationEvents(nodes, connections));

  if (mode === 'simulating') {
    events.unshift({
      id: 'simulation-active',
      kind: 'simulation',
      title: 'Simulation mode active',
      detail:
        'Signal, timing, and failure surfaces should now come forward while explanatory windows compress to what matters right now.',
    });
  }

  return events;
}

function buildPanels(nodes: CircuitNode[], mode: CircuitMode): CircuitPanel[] {
  const panels: CircuitPanel[] = [
    {
      id: 'scene-panel',
      kind: 'scene',
      title: 'Workbench',
      description: 'The main spatial canvas for the current circuit document.',
      accent: 'cyan',
    },
    {
      id: 'teacher-panel',
      kind: 'teacher',
      title: 'Teacher',
      description: 'Explains why the interface opened these windows and what the learner should notice.',
      accent: 'emerald',
    },
    {
      id: 'inspector-panel',
      kind: 'inspector',
      title: 'Inspector',
      description: 'Shows the active nodes, inferred path, warnings, and parameter values.',
      accent: 'amber',
    },
  ];

  if (hasNode(nodes, 'capacitor') || mode === 'simulating' || hasNode(nodes, 'led')) {
    panels.push({
      id: 'graph-panel',
      kind: 'graph',
      title: 'Signal graph',
      description: 'Appears when behaviour over time or intensity should be visible.',
      accent: 'violet',
    });
  }

  if (mode === 'simulating') {
    panels.push({
      id: 'next-step-panel',
      kind: 'next-step',
      title: 'Next move',
      description: 'Suggests the next experiment or command instead of dumping theory.',
      accent: 'emerald',
    });
  }

  return panels;
}

function buildInsights(nodes: CircuitNode[], mode: CircuitMode): string[] {
  const insights: string[] = [
    'The command layer should create a circuit document that windows can respond to deterministically.',
    'Adaptive panels should open because of circuit state and events, not because the UI feels chatty.',
  ];

  if (hasNode(nodes, 'led')) {
    insights.push('An LED is a strong teaching trigger because current limiting, polarity, brightness, and safe current all become teachable immediately.');
  }

  if (hasNode(nodes, 'capacitor')) {
    insights.push('Capacitors justify graph windows because time is part of the concept, not an optional flourish.');
  }

  if (mode === 'simulating') {
    insights.push('When simulation is active, the graph and inspector should outrank generic explanation panels.');
  }

  return unique(insights);
}

function buildMetrics(nodes: CircuitNode[], connections: CircuitConnection[], events: CircuitEvent[], mode: CircuitMode): CircuitMetric[] {
  const validations = events.filter((event) => event.kind === 'validation' || event.kind === 'warning');

  return [
    { label: 'Mode', value: titleCase(mode) },
    { label: 'Components', value: String(nodes.length) },
    { label: 'Connections', value: String(connections.length) },
    { label: 'Validation rules', value: String(validations.length) },
    {
      label: 'Teaching windows',
      value: mode === 'simulating' ? 'Event-driven + live' : 'Event-driven',
    },
  ];
}

function buildNextActions(nodes: CircuitNode[], mode: CircuitMode): string[] {
  const next = ['simulate', 'focus inspector', 'explain what changed'];

  if (hasNode(nodes, 'battery') && hasNode(nodes, 'led') && !hasNode(nodes, 'resistor')) {
    next.unshift('add resistor');
  }

  if (!hasNode(nodes, 'ground')) {
    next.push('add ground');
  }

  if (hasNode(nodes, 'capacitor')) {
    next.push('explain the charge curve');
  }

  if (mode === 'simulating') {
    next.push('focus graph');
  }

  return unique(next).slice(0, 5);
}

export function createCircuitDocument(prompt: string, mode: CircuitMode = 'preview'): CircuitDocument {
  const cleanPrompt = prompt.trim() || 'new circuit idea';
  const nodes = buildNodes(cleanPrompt);
  const connections = buildConnections(nodes);
  const events = buildEvents(nodes, connections, mode);
  const panels = buildPanels(nodes, mode);
  const insights = buildInsights(nodes, mode);

  return {
    id: `circuit-${cleanPrompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'draft'}`,
    prompt: cleanPrompt,
    title: titleCase(cleanPrompt),
    mode,
    summary: `Structured circuit document derived from the command: ${cleanPrompt}. This gives Clitronic a foundation for event-driven teaching windows, validation, and later true simulation state.`,
    nodes,
    connections,
    metrics: buildMetrics(nodes, connections, events, mode),
    events,
    panels,
    insights,
    nextActions: buildNextActions(nodes, mode),
  };
}

export function activateCircuitSimulation(document: CircuitDocument): CircuitDocument {
  return createCircuitDocument(document.prompt, 'simulating');
}

export function focusCircuitPanel(document: CircuitDocument, panelName: string): CircuitDocument {
  const label = titleCase(panelName.trim() || 'inspector');
  const focusEvent: CircuitEvent = {
    id: `focus-${panelName.toLowerCase().replace(/\s+/g, '-') || 'inspector'}`,
    kind: 'focus',
    title: `${label} brought forward`,
    detail: `The interface should emphasise the ${label.toLowerCase()} window while keeping enough context to avoid disorienting the learner.`,
  };

  const events = [focusEvent, ...document.events].slice(0, 6);

  return {
    ...document,
    metrics: [
      ...document.metrics.filter((metric) => metric.label !== 'Focus'),
      { label: 'Focus', value: label },
    ],
    events,
  };
}
