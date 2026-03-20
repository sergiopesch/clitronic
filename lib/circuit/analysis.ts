import type {
  CircuitChecklistItem,
  CircuitConnection,
  CircuitDocument,
  CircuitEvent,
  CircuitMetric,
  CircuitNode,
  CircuitTopologyLink,
} from './types';

function formatOhms(value: number): string {
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}kΩ`;
  return `${Math.round(value)}Ω`;
}

function getNode(nodes: CircuitNode[], key: string): CircuitNode | undefined {
  return nodes.find((node) => node.key === key);
}

function getParameter(node: CircuitNode | undefined, key: string): string | undefined {
  return node?.parameters?.find((param) => param.key === key)?.value;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}

function parseVoltage(value: string | undefined): number | undefined {
  return parseNumber(value);
}

function parseResistance(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  const base = parseNumber(normalized);
  if (base === undefined) return undefined;
  return normalized.includes('k') ? base * 1000 : base;
}

function findConnection(
  connections: CircuitConnection[],
  leftId: string,
  rightId: string
): CircuitConnection | undefined {
  return connections.find(
    (connection) =>
      (connection.from === leftId && connection.to === rightId) ||
      (connection.from === rightId && connection.to === leftId)
  );
}

interface RequiredLinkDefinition {
  id: string;
  fromKey: string;
  toKey: string;
  command: string;
  detail: string;
}

const REQUIRED_LED_SERIES_LINKS: RequiredLinkDefinition[] = [
  {
    id: 'battery-resistor',
    fromKey: 'battery',
    toKey: 'resistor',
    command: 'connect battery to resistor',
    detail: 'Source current must leave the battery and enter the current-limiting resistor first.',
  },
  {
    id: 'resistor-led',
    fromKey: 'resistor',
    toKey: 'led',
    command: 'connect resistor to led',
    detail: 'The resistor must sit in series with the LED to limit current before the diode.',
  },
  {
    id: 'led-ground',
    fromKey: 'led',
    toKey: 'ground',
    command: 'connect led to ground',
    detail: 'The return path must close back to ground so the loop is complete.',
  },
];

function buildTopologyLinks(document: CircuitDocument): CircuitTopologyLink[] {
  const links: CircuitTopologyLink[] = [];

  for (const required of REQUIRED_LED_SERIES_LINKS) {
    const from = getNode(document.nodes, required.fromKey);
    const to = getNode(document.nodes, required.toKey);

    if (!from || !to) {
      links.push({
        id: required.id,
        fromId: from?.id ?? required.fromKey,
        toId: to?.id ?? required.toKey,
        fromLabel: from?.label ?? required.fromKey,
        toLabel: to?.label ?? required.toKey,
        status: 'missing',
        detail: `${required.detail} Add the missing part first if needed, then wire it explicitly.`,
        command: required.command,
      });
      continue;
    }

    const connection = findConnection(document.connections, from.id, to.id);
    if (!connection) {
      links.push({
        id: required.id,
        fromId: from.id,
        toId: to.id,
        fromLabel: from.label,
        toLabel: to.label,
        status: 'missing',
        detail: `${required.detail} This link is still absent from the topology.`,
        command: required.command,
      });
      continue;
    }

    links.push({
      id: required.id,
      fromId: from.id,
      toId: to.id,
      fromLabel: from.label,
      toLabel: to.label,
      status: connection.kind,
      detail:
        connection.kind === 'explicit'
          ? `Confirmed by command: ${connection.label ?? 'explicit wire'}.`
          : `Only inferred so far: ${connection.label ?? 'adjacent relationship'}. Confirm it with an explicit connect command before trusting simulation.`,
      command: required.command,
    });
  }

  return links;
}

function buildChecklist(document: CircuitDocument, topologyLinks: CircuitTopologyLink[]) {
  const battery = getNode(document.nodes, 'battery');
  const resistor = getNode(document.nodes, 'resistor');
  const led = getNode(document.nodes, 'led');
  const ground = getNode(document.nodes, 'ground');

  const checklist: CircuitChecklistItem[] = [
    {
      id: 'battery-present',
      label: 'Battery present',
      status: battery ? 'ready' : 'missing',
      detail: battery
        ? 'Power source detected.'
        : 'Add a battery so the circuit has a voltage source.',
      command: battery ? undefined : 'add battery',
    },
    {
      id: 'resistor-present',
      label: 'Resistor present',
      status: resistor ? 'ready' : 'missing',
      detail: resistor
        ? 'Current limiter detected.'
        : 'Add a resistor before driving an LED from a battery.',
      command: resistor ? undefined : 'add resistor',
    },
    {
      id: 'led-present',
      label: 'LED present',
      status: led ? 'ready' : 'missing',
      detail: led ? 'Output device detected.' : 'Add an LED to build the series example.',
      command: led ? undefined : 'add led',
    },
    {
      id: 'ground-present',
      label: 'Ground present',
      status: ground ? 'ready' : 'missing',
      detail: ground ? 'Return node detected.' : 'Add ground to close the return path.',
      command: ground ? undefined : 'add ground',
    },
    ...topologyLinks.map((link) => ({
      id: `link-${link.id}`,
      label: `${link.fromLabel} → ${link.toLabel}`,
      status: (link.status === 'explicit'
        ? 'ready'
        : link.status === 'inferred'
          ? 'inferred'
          : 'missing') as CircuitChecklistItem['status'],
      detail: link.detail,
      command: link.status === 'explicit' ? undefined : link.command,
    })),
  ];

  return checklist;
}

export interface CircuitAnalysis {
  derivedMetrics: CircuitMetric[];
  derivedEvents: CircuitEvent[];
  derivedInsights: string[];
  suggestedFixes: string[];
  blockers: string[];
  topologyLinks: CircuitTopologyLink[];
  checklist: CircuitChecklistItem[];
}

export function analyzeCircuit(document: CircuitDocument): CircuitAnalysis {
  const derivedMetrics: CircuitMetric[] = [];
  const derivedEvents: CircuitEvent[] = [];
  const derivedInsights: string[] = [];
  const suggestedFixes: string[] = [];
  const blockers: string[] = [];

  const topologyLinks = buildTopologyLinks(document);
  const checklist = buildChecklist(document, topologyLinks);

  const battery = getNode(document.nodes, 'battery');
  const resistor = getNode(document.nodes, 'resistor');
  const led = getNode(document.nodes, 'led');

  const supplyVoltage = parseVoltage(getParameter(battery, 'voltage'));
  const resistance = parseResistance(getParameter(resistor, 'resistance'));
  const ledForward = parseVoltage(getParameter(led, 'forward-voltage'));

  if (document.simulation?.kind === 'led-series' && document.simulation.values) {
    const { currentMa, resistorPowerMw, resistorOhms, supplyVoltageV, ledForwardVoltageV } =
      document.simulation.values;
    const recommendedResistance =
      Math.round((supplyVoltageV - ledForwardVoltageV) / 0.012 / 10) * 10;
    const band = document.simulation.brightnessBand ?? 'Comfortable';

    derivedMetrics.push({ label: 'LED current', value: `${currentMa.toFixed(1)}mA` });
    derivedMetrics.push({
      label: 'Resistor dissipation',
      value: `${resistorPowerMw.toFixed(1)}mW`,
    });
    derivedMetrics.push({ label: 'Brightness band', value: band });

    derivedEvents.push({
      id: 'derived-led-sim',
      kind: document.mode === 'simulating' ? 'simulation' : 'info',
      title: 'LED series simulation',
      detail: `Battery ${supplyVoltageV}V → Resistor ${formatOhms(resistorOhms)} → LED Vf ${ledForwardVoltageV}V. Estimated current ${currentMa.toFixed(1)}mA (${band}).`,
    });

    if (currentMa < 5) {
      derivedEvents.push({
        id: 'derived-led-dim',
        kind: 'teaching',
        title: 'LED will likely appear dim',
        detail:
          'The current estimate is quite low. Lower the resistor value if you want a brighter LED while staying within a safe current range.',
      });
      suggestedFixes.push(
        `set resistor resistance = ${formatOhms(Math.max(100, recommendedResistance))}`
      );
    }

    if (currentMa > 20) {
      derivedEvents.push({
        id: 'derived-led-overcurrent',
        kind: 'warning',
        title: 'LED current likely too high',
        detail:
          'The estimated current exceeds a safe everyday target. Increase the resistor value before treating this as a healthy circuit.',
      });
      suggestedFixes.push(
        `set resistor resistance = ${formatOhms(Math.max(recommendedResistance, 330))}`
      );
      blockers.push('LED current is above a typical safe 20mA target.');
    }

    derivedInsights.push(
      'When simulation is valid, the graph can explain this exact loop instead of speaking in generic circuit theory.'
    );
  } else if (battery && resistor && led && supplyVoltage && resistance && ledForward) {
    const currentMa = ((supplyVoltage - ledForward) / resistance) * 1000;
    const resistorDrop = supplyVoltage - ledForward;
    const resistorPowerMw = (currentMa / 1000) ** 2 * resistance * 1000;

    derivedMetrics.push({ label: 'Estimated LED current', value: `${currentMa.toFixed(1)}mA` });
    derivedMetrics.push({
      label: 'Resistor dissipation',
      value: `${resistorPowerMw.toFixed(1)}mW`,
    });

    derivedEvents.push({
      id: 'derived-led-analysis',
      kind: 'info',
      title: 'Pre-simulation estimate ready',
      detail: `If the loop is wired explicitly, the LED should see about ${currentMa.toFixed(1)}mA with ${resistorDrop.toFixed(1)}V across the resistor.`,
    });
  }

  for (const item of checklist) {
    if (item.status === 'missing') {
      blockers.push(item.detail);
      if (item.command) suggestedFixes.push(item.command);
    }

    if (item.status === 'inferred' && item.command) {
      blockers.push(`Confirm the inferred path: ${item.label}.`);
      suggestedFixes.push(item.command);
    }
  }

  const explicitLinks = topologyLinks.filter((link) => link.status === 'explicit').length;
  const inferredLinks = topologyLinks.filter((link) => link.status === 'inferred').length;
  const missingLinks = topologyLinks.filter((link) => link.status === 'missing').length;

  derivedMetrics.push({ label: 'Explicit links', value: String(explicitLinks) });
  derivedMetrics.push({ label: 'Inferred links', value: String(inferredLinks) });
  derivedMetrics.push({ label: 'Missing links', value: String(missingLinks) });

  if (missingLinks === 0 && inferredLinks === 0 && topologyLinks.length > 0) {
    derivedEvents.push({
      id: 'derived-complete-led-path',
      kind: 'info',
      title: 'Explicit LED path is complete',
      detail:
        'Every required series link has been confirmed by command, so topology and simulation now agree on the same loop.',
    });
  } else if (missingLinks > 0 || inferredLinks > 0) {
    derivedEvents.push({
      id: 'derived-incomplete-led-path',
      kind: 'validation',
      title: 'Topology still needs confirmation',
      detail:
        missingLinks > 0
          ? `${missingLinks} required link${missingLinks === 1 ? '' : 's'} are still missing from the circuit.`
          : `${inferredLinks} required link${inferredLinks === 1 ? '' : 's'} are only inferred and still need explicit wiring commands.`,
    });
  }

  if (!resistor && led && battery) {
    derivedEvents.push({
      id: 'warning-led-resistor',
      kind: 'warning',
      title: 'LED protection missing',
      detail: 'A resistor still needs to be added before this LED path is safe to trust.',
    });
  }

  derivedInsights.push(
    'Topology should show three states: explicitly wired, inferred from intent, and still missing.'
  );

  return {
    derivedMetrics,
    derivedEvents,
    derivedInsights,
    suggestedFixes: Array.from(new Set(suggestedFixes.filter(Boolean))).slice(0, 8),
    blockers: Array.from(new Set(blockers.filter(Boolean))).slice(0, 8),
    topologyLinks,
    checklist,
  };
}
