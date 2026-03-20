import { createCircuitDocument } from './document';
import type { CircuitDocument, CircuitNode, CircuitNodeParameter } from './types';

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface ParsedCircuitCommand {
  kind:
    | 'build'
    | 'add'
    | 'connect'
    | 'remove'
    | 'simulate'
    | 'focus'
    | 'explain'
    | 'set'
    | 'unknown';
  raw: string;
  args: string;
}

export function parseCircuitCommand(input: string): ParsedCircuitCommand {
  const trimmed = input.trim();
  const [head, ...rest] = trimmed.split(/\s+/);
  const command = head?.toLowerCase() ?? '';
  const args = rest.join(' ').trim();

  if (
    ['build', 'add', 'connect', 'remove', 'simulate', 'focus', 'explain', 'set'].includes(command)
  ) {
    return { kind: command as ParsedCircuitCommand['kind'], raw: trimmed, args };
  }

  return { kind: 'unknown', raw: trimmed, args: trimmed };
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function createNodeKey(label: string): string {
  return (
    normalizeLabel(label)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'node'
  );
}

function nextNodeId(document: CircuitDocument, key: string): string {
  const existing = document.nodes.filter((node) => node.key === key).length;
  return `${key}-${existing + 1}`;
}

function humanLabel(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ensureNode(document: CircuitDocument, label: string) {
  const normalized = normalizeLabel(label);
  const existing = document.nodes.find(
    (node) => normalizeLabel(node.label) === normalized || normalizeLabel(node.key) === normalized
  );

  if (existing) return existing;

  const key = createNodeKey(label);
  const node: CircuitNode = {
    id: nextNodeId(document, key),
    key,
    label: humanLabel(label),
    type: 'unknown',
    quantity: 1,
    notes: ['Added via structured command parser.'],
    parameters: [],
  };

  document.nodes = [...document.nodes, node];
  return node;
}

function refreshDocument(document: CircuitDocument): CircuitDocument {
  const prompt = document.nodes.map((node) => node.label).join(' connected to ');
  const rebuilt = createCircuitDocument(prompt || document.prompt, document.mode);

  return {
    ...rebuilt,
    nodes: document.nodes,
    connections: document.connections,
    simulation: document.simulation,
    summary:
      rebuilt.summary +
      ' This version includes explicit command edits layered onto the circuit document.',
  };
}

function upsertParameter(node: CircuitNode, parameter: CircuitNodeParameter) {
  const nextParameters = [...(node.parameters ?? [])];
  const existingIndex = nextParameters.findIndex((item) => item.key === parameter.key);

  if (existingIndex >= 0) {
    nextParameters[existingIndex] = parameter;
  } else {
    nextParameters.push(parameter);
  }

  node.parameters = nextParameters;
}

export async function applyStructuredCommand(
  document: CircuitDocument,
  parsed: ParsedCircuitCommand
): Promise<CircuitDocument> {
  if (parsed.kind === 'build') {
    return createCircuitDocument(parsed.args || 'new circuit idea', 'preview');
  }

  if (parsed.kind === 'add') {
    const draft: CircuitDocument = {
      ...document,
      nodes: [...document.nodes],
      connections: [...document.connections],
    };
    ensureNode(draft, parsed.args || 'component');
    return refreshDocument(draft);
  }

  if (parsed.kind === 'remove') {
    const target = normalizeLabel(parsed.args);
    const remainingNodes = document.nodes.filter(
      (node) => normalizeLabel(node.label) !== target && normalizeLabel(node.key) !== target
    );
    const remainingIds = new Set(remainingNodes.map((node) => node.id));

    return refreshDocument({
      ...document,
      nodes: remainingNodes,
      connections: document.connections.filter(
        (connection) => remainingIds.has(connection.from) && remainingIds.has(connection.to)
      ),
    });
  }

  if (parsed.kind === 'connect') {
    const match = parsed.args.match(/(.+?)\s+(?:to|->)\s+(.+)/i);
    if (!match) return document;

    const [, leftRaw, rightRaw] = match;
    const draft: CircuitDocument = {
      ...document,
      nodes: [...document.nodes],
      connections: [...document.connections],
    };
    const left = ensureNode(draft, leftRaw ?? 'from');
    const right = ensureNode(draft, rightRaw ?? 'to');

    const exists = draft.connections.some(
      (connection) => connection.from === left.id && connection.to === right.id
    );

    if (!exists) {
      draft.connections = [
        ...draft.connections,
        {
          id: `connection-${draft.connections.length + 1}`,
          from: left.id,
          to: right.id,
          label: 'explicit command connection',
        },
      ];
    }

    return refreshDocument(draft);
  }

  if (parsed.kind === 'set') {
    const match = parsed.args.match(/(.+?)\s+(?:to|=)\s+(.+)/i);
    if (!match) return document;

    const [, leftRaw, valueRaw] = match;
    const left = leftRaw?.trim() ?? '';
    const value = valueRaw?.trim() ?? '';
    if (!left || !value) return document;

    const parts = left.split(/\s+/);
    const parameterKey = parts.pop()?.toLowerCase() ?? 'value';
    const nodeLabel = parts.join(' ') || left;

    const draft: CircuitDocument = {
      ...document,
      nodes: [...document.nodes],
      connections: [...document.connections],
    };

    const node = ensureNode(draft, nodeLabel);
    upsertParameter(node, {
      key: parameterKey.replace(/[^a-z0-9]+/g, '-'),
      label: humanLabel(parameterKey),
      value,
    });

    return refreshDocument(draft);
  }

  if (parsed.kind === 'simulate') {
    const nextDocument: CircuitDocument = {
      ...document,
      mode: 'simulating',
      simulation: undefined,
      metrics: document.metrics,
      events: document.events,
      panels: document.panels,
      insights: document.insights,
      nextActions: document.nextActions,
    };

    const { simulateLedSeries } = await import('@/lib/sim/led-series');
    const simulation = simulateLedSeries(nextDocument);
    const warningEvents = simulation.warnings.map((warning, index) => ({
      id: `simulation-warning-${index + 1}`,
      kind: 'warning' as const,
      title: index === 0 ? 'Simulation warnings' : 'Simulation warning',
      detail: warning,
    }));

    const resultEvent = simulation.ok
      ? {
          id: 'simulation-ok',
          kind: 'simulation' as const,
          title: 'Simulation completed',
          detail:
            `LED series solver ran. ${simulation.brightnessBand ? `Brightness: ${simulation.brightnessBand}.` : ''}`.trim(),
        }
      : {
          id: 'simulation-failed',
          kind: 'warning' as const,
          title: 'Simulation could not run',
          detail: simulation.reason ?? 'Missing required circuit information.',
        };

    return refreshDocument({
      ...nextDocument,
      simulation,
      events: [resultEvent, ...warningEvents, ...document.events].slice(0, 8),
      title: titleCase(document.prompt),
    });
  }

  return document;
}
