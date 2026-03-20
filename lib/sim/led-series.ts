import type { CircuitDocument, LedSeriesSimulation } from '@/lib/circuit/types';

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

export function simulateLedSeries(document: CircuitDocument): LedSeriesSimulation {
  const warnings: string[] = [];

  const battery = findNode(document, 'battery');
  const resistor = findNode(document, 'resistor');
  const led = findNode(document, 'led');
  const ground = findNode(document, 'ground');

  if (!ground) warnings.push('Ground is required for simulation. Add it with: add ground');
  if (!battery) warnings.push('Battery missing. Add it with: add battery');
  if (!resistor) warnings.push('Resistor missing. Add it with: add resistor');
  if (!led) warnings.push('LED missing. Add it with: add led');

  if (!battery || !resistor || !led || !ground) {
    return {
      kind: 'led-series',
      ok: false,
      reason: 'Missing required component(s).',
      warnings,
    };
  }

  const supplyVoltageV = parseVoltage(getParam(battery, 'voltage')) ?? 5;
  const resistorOhms = parseOhms(getParam(resistor, 'resistance')) ?? 220;
  const ledForwardVoltageV = parseVoltage(getParam(led, 'forward-voltage')) ?? 2.0;

  if (resistorOhms <= 0) {
    return {
      kind: 'led-series',
      ok: false,
      reason: 'Resistor value must be > 0Ω.',
      warnings: [...warnings, 'Set a valid resistor value, e.g. set resistor resistance = 220Ω'],
    };
  }

  const resistorVoltageV = supplyVoltageV - ledForwardVoltageV;
  if (resistorVoltageV <= 0) {
    return {
      kind: 'led-series',
      ok: false,
      reason: 'Supply voltage is not enough to forward-bias the LED.',
      warnings: [
        ...warnings,
        'Increase battery voltage or reduce LED forward voltage (e.g. choose a red LED).',
      ],
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
    values: {
      supplyVoltageV,
      resistorOhms,
      ledForwardVoltageV,
      currentMa,
      resistorVoltageV,
      resistorPowerMw,
    },
    brightnessBand: brightnessBand(currentMa),
    warnings,
  };
}
