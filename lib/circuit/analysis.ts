import type {
  CircuitConnection,
  CircuitDocument,
  CircuitEvent,
  CircuitMetric,
  CircuitNode,
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

function isConnected(connections: CircuitConnection[], leftId: string, rightId: string): boolean {
  return connections.some(
    (connection) =>
      (connection.from === leftId && connection.to === rightId) ||
      (connection.from === rightId && connection.to === leftId)
  );
}

export interface CircuitAnalysis {
  derivedMetrics: CircuitMetric[];
  derivedEvents: CircuitEvent[];
  derivedInsights: string[];
  suggestedFixes: string[];
}

export function analyzeCircuit(document: CircuitDocument): CircuitAnalysis {
  const derivedMetrics: CircuitMetric[] = [];
  const derivedEvents: CircuitEvent[] = [];
  const derivedInsights: string[] = [];
  const suggestedFixes: string[] = [];

  const battery = getNode(document.nodes, 'battery');
  const resistor = getNode(document.nodes, 'resistor');
  const led = getNode(document.nodes, 'led');
  const ground = getNode(document.nodes, 'ground');

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
          'The current estimate is quite low. Clitronic should explain that brightness is current-driven and invite a lower resistor value experiment.',
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
          'The estimated current exceeds a safe everyday target. The teacher should propose a safer resistor value before encouraging simulation confidence.',
      });
      suggestedFixes.push(
        `set resistor resistance = ${formatOhms(Math.max(recommendedResistance, 330))}`
      );
    }

    derivedInsights.push(
      'Once simulation outputs exist, the teacher can stop speaking in generalities and instead comment on this exact circuit state.'
    );
  } else if (battery && resistor && led && supplyVoltage && resistance && ledForward) {
    // Fallback (pre-simulation): keep the lightweight heuristic analysis.
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
      title: 'LED path analysed',
      detail: `Estimated current is ${currentMa.toFixed(1)}mA with about ${resistorDrop.toFixed(1)}V dropped across the resistor.`,
    });
  }

  if (battery && led && resistor) {
    const batteryToResistor = isConnected(document.connections, battery.id, resistor.id);
    const resistorToLed = isConnected(document.connections, resistor.id, led.id);
    const ledToGround = ground ? isConnected(document.connections, led.id, ground.id) : false;

    if (batteryToResistor && resistorToLed && ledToGround) {
      derivedEvents.push({
        id: 'derived-complete-led-path',
        kind: 'info',
        title: 'A complete LED path is present',
        detail:
          'The topology contains a plausible series path from battery through resistor to LED and then ground. This is enough to justify stronger simulation surfaces.',
      });
    } else {
      const missingLink = !batteryToResistor
        ? 'connect battery to resistor'
        : !resistorToLed
          ? 'connect resistor to led'
          : 'connect led to ground';

      derivedEvents.push({
        id: 'derived-incomplete-led-path',
        kind: 'validation',
        title: 'LED path is structurally incomplete',
        detail: `The required parts exist but the explicit topology is incomplete. The next missing link is: ${missingLink}.`,
      });
      suggestedFixes.push(missingLink);
    }
  }

  if (led && !ground) {
    suggestedFixes.push('add ground');
  }

  if (led && battery && !resistor) {
    suggestedFixes.push('add resistor');
  }

  return {
    derivedMetrics,
    derivedEvents,
    derivedInsights,
    suggestedFixes: Array.from(new Set(suggestedFixes.filter(Boolean))).slice(0, 5),
  };
}
