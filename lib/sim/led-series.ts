import { analyzeCircuit } from '@/lib/circuit/analysis';
import type {
  CircuitChecklistItem,
  CircuitDocument,
  LedSeriesSimulation,
} from '@/lib/circuit/types';

function isExplicitlyConnected(
  document: CircuitDocument,
  leftKey: string,
  rightKey: string
): boolean {
  const left = document.nodes.find((node) => node.key === leftKey);
  const right = document.nodes.find((node) => node.key === rightKey);
  if (!left || !right) return false;

  return document.connections.some(
    (connection) =>
      connection.kind === 'explicit' &&
      ((connection.from === left.id && connection.to === right.id) ||
        (connection.from === right.id && connection.to === left.id))
  );
}

function connectionsForNode(document: CircuitDocument, nodeId: string): number {
  return document.connections.filter(
    (connection) => connection.from === nodeId || connection.to === nodeId
  ).length;
}

function findNode(document: CircuitDocument, key: string) {
  return document.nodes.find((node) => node.key === key);
}

function getParam(
  node: { parameters?: { key: string; value: string }[] } | undefined,
  key: string
) {
  const value = node?.parameters?.find((param) => param.key === key)?.value;
  return value?.trim();
}

function parseVoltage(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

function parseOhms(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.toLowerCase().replace(/\s+/g, '');
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)(k)?(ohm|ohms|ω|Ω)?/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const multiplier = match[2] ? 1000 : 1;
  return base * multiplier;
}

function brightnessBand(currentMa: number): LedSeriesSimulation['brightnessBand'] {
  if (currentMa < 5) return 'Very dim';
  if (currentMa < 12) return 'Comfortable';
  if (currentMa < 20) return 'Bright';
  return 'Aggressive';
}

function markChecklist(
  checklist: CircuitChecklistItem[],
  targetIds: string[],
  detailPrefix: string
): CircuitChecklistItem[] {
  return checklist.map((item) =>
    targetIds.includes(item.id) && item.status === 'inferred'
      ? {
          ...item,
          detail: `${detailPrefix} ${item.detail}`,
        }
      : item
  );
}

export function simulateLedSeries(document: CircuitDocument): LedSeriesSimulation {
  const analysis = analyzeCircuit(document);
  const warnings: string[] = [];
  const blockers = [...analysis.blockers];
  let checklist = [...analysis.checklist];
  let suggestedCommands = [...analysis.suggestedFixes];

  const battery = findNode(document, 'battery');
  const resistor = findNode(document, 'resistor');
  const led = findNode(document, 'led');
  const ground = findNode(document, 'ground');

  if (!battery || !resistor || !led || !ground) {
    const reason = 'Missing required component(s).';
    return {
      kind: 'led-series',
      ok: false,
      reason,
      explanation: 'Simulation needs a complete battery → resistor → LED → ground path.',
      checklist,
      blockers,
      suggestedCommands,
      warnings,
    };
  }

  const hasBatteryToResistor = isExplicitlyConnected(document, 'battery', 'resistor');
  const hasResistorToLed = isExplicitlyConnected(document, 'resistor', 'led');
  const hasLedToGround = isExplicitlyConnected(document, 'led', 'ground');

  if (!hasBatteryToResistor || !hasResistorToLed || !hasLedToGround) {
    const requiredCommands = [
      !hasBatteryToResistor ? 'connect battery to resistor' : null,
      !hasResistorToLed ? 'connect resistor to led' : null,
      !hasLedToGround ? 'connect led to ground' : null,
    ].filter(Boolean) as string[];

    checklist = markChecklist(
      checklist,
      requiredCommands.map(
        (command) => `link-${command.split('connect ')[1]?.replace(/\s+to\s+/g, '-')}`
      ),
      'Simulation requires an explicit wire.'
    );
    blockers.push('Simulation only trusts explicit wiring commands, not inferred adjacency.');
    suggestedCommands = Array.from(new Set([...requiredCommands, ...suggestedCommands]));

    return {
      kind: 'led-series',
      ok: false,
      reason: 'Topology incomplete for LED-series simulation.',
      explanation:
        'The parts exist, but at least one required link is only inferred or still missing. Confirm each wire explicitly before running the solver.',
      checklist,
      blockers: Array.from(new Set(blockers)),
      suggestedCommands,
      warnings,
    };
  }

  const degrees = {
    battery: connectionsForNode(document, battery.id),
    resistor: connectionsForNode(document, resistor.id),
    led: connectionsForNode(document, led.id),
    ground: connectionsForNode(document, ground.id),
  };

  if (degrees.battery > 2 || degrees.resistor > 2 || degrees.led > 2 || degrees.ground > 1) {
    warnings.push(
      'Topology looks ambiguous (extra connections). The current solver assumes one battery → resistor → led → ground loop.'
    );
  }

  const supplyVoltageV = parseVoltage(getParam(battery, 'voltage')) ?? 5;
  const resistorOhms = parseOhms(getParam(resistor, 'resistance')) ?? 220;
  const ledForwardVoltageV = parseVoltage(getParam(led, 'forward-voltage')) ?? 2.0;

  if (resistorOhms <= 0) {
    blockers.push('Resistor value must be greater than zero.');
    suggestedCommands = Array.from(
      new Set(['set resistor resistance = 220Ω', ...suggestedCommands])
    );

    return {
      kind: 'led-series',
      ok: false,
      reason: 'Resistor value must be > 0Ω.',
      explanation: 'The solver cannot divide by zero resistance. Set a real resistor value first.',
      checklist,
      blockers: Array.from(new Set(blockers)),
      suggestedCommands,
      warnings,
    };
  }

  const resistorVoltageV = supplyVoltageV - ledForwardVoltageV;
  if (resistorVoltageV <= 0) {
    blockers.push('Battery voltage is below the LED forward voltage.');
    suggestedCommands = Array.from(new Set(['set battery voltage = 9V', ...suggestedCommands]));

    return {
      kind: 'led-series',
      ok: false,
      reason: 'Supply voltage is not enough to forward-bias the LED.',
      explanation:
        'The battery does not provide enough voltage headroom across the resistor and LED, so current cannot flow in the intended direction.',
      checklist,
      blockers: Array.from(new Set(blockers)),
      suggestedCommands,
      warnings,
    };
  }

  const currentMa = (resistorVoltageV / resistorOhms) * 1000;
  const resistorPowerMw = (currentMa / 1000) ** 2 * resistorOhms * 1000;

  if (currentMa > 20) {
    warnings.push('LED current looks high (> 20mA). Increase resistor value to protect the LED.');
  }
  if (resistorPowerMw > 250) {
    warnings.push('Resistor power looks high (> 250mW). Use a higher wattage resistor.');
  }

  return {
    kind: 'led-series',
    ok: true,
    explanation:
      'The solver found a complete explicit series loop, so the graph can now explain current, voltage drop, and resistor power for this exact path.',
    values: {
      supplyVoltageV,
      resistorOhms,
      ledForwardVoltageV,
      currentMa,
      resistorVoltageV,
      resistorPowerMw,
    },
    brightnessBand: brightnessBand(currentMa),
    checklist,
    blockers: [],
    suggestedCommands: Array.from(
      new Set(['focus graph', 'show topology', 'show inspector', ...suggestedCommands])
    ),
    warnings,
  };
}
