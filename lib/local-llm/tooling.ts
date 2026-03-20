import { electronicsComponents } from '@/lib/data/components';
import { lookupComponent, searchComponents } from '@/lib/data/search';
import type { ElectronicsComponent } from '@/lib/data/types';

export type LocalToolName =
  | 'lookup_component'
  | 'search_components'
  | 'calculate_resistor'
  | 'ohms_law';

export interface LocalToolInvocation {
  toolName: LocalToolName;
  summary: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface LocalToolPass {
  invocations: LocalToolInvocation[];
  promptContext?: string;
}

const RESISTOR_SERIES = [
  10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82, 100, 120, 150, 180, 220, 270, 330, 390, 470, 560,
  680, 820, 1000, 1200, 1500, 1800, 2200, 2700, 3300, 3900, 4700, 5600, 6800, 8200, 10000, 12000,
  15000, 18000, 22000, 47000, 100000,
];

const FORWARD_VOLTAGES: Record<string, number> = {
  red: 2,
  yellow: 2.1,
  orange: 2,
  green: 3.2,
  blue: 3.2,
  white: 3.2,
  infrared: 1.2,
  ir: 1.2,
};

function parseFirstNumber(pattern: RegExp, text: string) {
  const match = text.match(pattern);
  if (!match) return undefined;

  return Number.parseFloat(match[1] ?? '');
}

function findSupplyVoltage(text: string) {
  return parseFirstNumber(/(\d+(?:\.\d+)?)\s*v\b/i, text);
}

function findDesiredCurrentMa(text: string) {
  return parseFirstNumber(/(\d+(?:\.\d+)?)\s*m(?:illi)?a\b/i, text);
}

function findResistance(text: string) {
  return parseFirstNumber(/(\d+(?:\.\d+)?)\s*(?:ohm|ohms|Ω|kΩ|kohm|k ohm)\b/i, text);
}

function inferForwardVoltage(text: string) {
  const lowered = text.toLowerCase();

  for (const [colour, voltage] of Object.entries(FORWARD_VOLTAGES)) {
    if (lowered.includes(colour)) {
      return voltage;
    }
  }

  return undefined;
}

function roundResistorUp(value: number) {
  const exact = Math.max(value, RESISTOR_SERIES[0] ?? value);
  return RESISTOR_SERIES.find((candidate) => candidate >= exact) ?? exact;
}

function formatToolValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatToolValue(item)).join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function formatComponentContext(component: ElectronicsComponent) {
  const specs = component.specs.map((spec) => `- ${spec.label}: ${spec.value}`).join('\n');
  const maxRatings = component.datasheetInfo?.maxRatings
    .map((rating) => `- ${rating.parameter}: ${rating.value}`)
    .join('\n');

  return [
    `Component: ${component.name}`,
    `Category: ${component.category}`,
    `Description: ${component.description}`,
    specs ? `Key specs:\n${specs}` : '',
    component.circuitExample ? `Circuit example: ${component.circuitExample}` : '',
    component.datasheetInfo?.pinout ? `Pinout: ${component.datasheetInfo.pinout}` : '',
    maxRatings ? `Maximum ratings:\n${maxRatings}` : '',
    component.datasheetInfo?.tips ? `Practical tips: ${component.datasheetInfo.tips}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildPromptContext(invocations: LocalToolInvocation[]) {
  if (invocations.length === 0) return undefined;

  return [
    'Tool results are available for this turn. Use them as authoritative local context when answering.',
    ...invocations.map((invocation, index) => {
      const renderedResult = Object.entries(invocation.result)
        .map(([key, value]) => `- ${key}: ${formatToolValue(value)}`)
        .join('\n');

      return [
        `Tool ${index + 1}: ${invocation.toolName}`,
        `Summary: ${invocation.summary}`,
        `Input: ${JSON.stringify(invocation.input)}`,
        `Result:\n${renderedResult}`,
      ].join('\n');
    }),
  ].join('\n\n');
}

function maybeCalculateLedResistor(message: string): LocalToolInvocation | null {
  const lowered = message.toLowerCase();
  if (!lowered.includes('resistor') || !lowered.includes('led')) {
    return null;
  }

  const supplyVoltage = findSupplyVoltage(message);
  if (!supplyVoltage) {
    return null;
  }

  const forwardVoltage = inferForwardVoltage(message) ?? 2;
  const desiredCurrentMa = findDesiredCurrentMa(message) ?? 15;
  const desiredCurrentA = desiredCurrentMa / 1000;
  const exactResistance = (supplyVoltage - forwardVoltage) / desiredCurrentA;
  const recommendedResistance = roundResistorUp(exactResistance);
  const actualCurrentMa = ((supplyVoltage - forwardVoltage) / recommendedResistance) * 1000;
  const resistorPowerMw = (actualCurrentMa / 1000) ** 2 * recommendedResistance * 1000;

  return {
    toolName: 'calculate_resistor',
    summary: `Calculated a ${recommendedResistance} Ω LED resistor recommendation for ${supplyVoltage} V supply.`,
    input: {
      scenario: 'led',
      supply_voltage: supplyVoltage,
      forward_voltage: forwardVoltage,
      desired_current_ma: desiredCurrentMa,
    },
    result: {
      scenario: 'LED current limiting',
      formula: 'R = (Vsupply - Vforward) / I',
      exact_value_ohms: Number(exactResistance.toFixed(1)),
      recommended_standard_ohms: recommendedResistance,
      estimated_current_ma_with_recommended: Number(actualCurrentMa.toFixed(1)),
      estimated_resistor_power_mw: Number(resistorPowerMw.toFixed(1)),
      safety_note:
        'Round up rather than down for LED resistors when you want a safer, cooler-running first pass.',
    },
  };
}

function maybeApplyOhmsLaw(message: string): LocalToolInvocation | null {
  const lowered = message.toLowerCase();
  const explicitlyAsks = lowered.includes("ohm's law") || lowered.includes('ohms law');
  const voltage = findSupplyVoltage(message);
  const currentMa = findDesiredCurrentMa(message);
  const resistance = findResistance(message);

  const providedCount = [voltage, currentMa, resistance].filter(
    (value) => value !== undefined
  ).length;
  if (!explicitlyAsks && providedCount < 2) {
    return null;
  }

  if (voltage !== undefined && currentMa !== undefined) {
    const currentA = currentMa / 1000;
    const calculatedResistance = voltage / currentA;
    const powerW = voltage * currentA;

    return {
      toolName: 'ohms_law',
      summary: `Calculated resistance and power from ${voltage} V and ${currentMa} mA.`,
      input: {
        voltage,
        current_ma: currentMa,
      },
      result: {
        formula_used: 'R = V / I',
        resistance_ohms: Number(calculatedResistance.toFixed(1)),
        power_mw: Number((powerW * 1000).toFixed(1)),
      },
    };
  }

  if (voltage !== undefined && resistance !== undefined) {
    const currentA = voltage / resistance;
    const powerW = voltage * currentA;

    return {
      toolName: 'ohms_law',
      summary: `Calculated current and power from ${voltage} V across ${resistance} Ω.`,
      input: {
        voltage,
        resistance,
      },
      result: {
        formula_used: 'I = V / R',
        current_ma: Number((currentA * 1000).toFixed(2)),
        power_mw: Number((powerW * 1000).toFixed(1)),
      },
    };
  }

  if (currentMa !== undefined && resistance !== undefined) {
    const currentA = currentMa / 1000;
    const calculatedVoltage = currentA * resistance;
    const powerW = calculatedVoltage * currentA;

    return {
      toolName: 'ohms_law',
      summary: `Calculated voltage and power from ${currentMa} mA through ${resistance} Ω.`,
      input: {
        current_ma: currentMa,
        resistance,
      },
      result: {
        formula_used: 'V = I × R',
        voltage: Number(calculatedVoltage.toFixed(2)),
        power_mw: Number((powerW * 1000).toFixed(1)),
      },
    };
  }

  return null;
}

function findMentionedComponent(message: string) {
  const lowered = message.toLowerCase();

  const sortedComponents = [...electronicsComponents].sort(
    (a, b) => b.name.length - a.name.length || b.id.length - a.id.length
  );

  return sortedComponents.find((component) => {
    const name = component.name.toLowerCase();
    const pluralName = `${name}s`;
    const id = component.id.toLowerCase();

    return (
      lowered.includes(name) ||
      lowered.includes(pluralName) ||
      lowered.includes(id) ||
      lowered.includes(id.replace('-', ' '))
    );
  });
}

function maybeLookupComponent(message: string): LocalToolInvocation | null {
  const lowered = message.toLowerCase();
  const component = findMentionedComponent(message);

  if (!component) {
    return null;
  }

  const intentSignals = [
    'what is',
    'tell me about',
    'explain',
    'how does',
    'pinout',
    'datasheet',
    'spec',
    'specs',
    'rating',
    'ratings',
    'how do i use',
    'use a',
    'use an',
  ];

  const isLikelyLookup = intentSignals.some((signal) => lowered.includes(signal));
  if (
    !isLikelyLookup &&
    !lowered.includes(component.id) &&
    !lowered.includes(component.name.toLowerCase())
  ) {
    return null;
  }

  const resolved = lookupComponent(component.id);
  if (!resolved) {
    return null;
  }

  return {
    toolName: 'lookup_component',
    summary: `Loaded built-in component notes for ${resolved.name}.`,
    input: {
      query: resolved.id,
    },
    result: {
      name: resolved.name,
      category: resolved.category,
      description: resolved.description,
      key_specs: resolved.specs.map((spec) => `${spec.label}: ${spec.value}`),
      circuit_example: resolved.circuitExample,
      pinout: resolved.datasheetInfo?.pinout,
      tips: resolved.datasheetInfo?.tips,
      component_context: formatComponentContext(resolved),
    },
  };
}

function maybeSearchComponents(message: string): LocalToolInvocation | null {
  const lowered = message.toLowerCase();
  const asksForList =
    (lowered.includes('list') || lowered.includes('show') || lowered.includes('which')) &&
    (lowered.includes('components') || lowered.includes('parts'));

  const requestedCategory = ['passive', 'active', 'input', 'output'].find((category) =>
    lowered.includes(category)
  );

  if (!asksForList && !requestedCategory) {
    return null;
  }

  const results = searchComponents({
    category: requestedCategory,
    keyword: requestedCategory ? undefined : undefined,
  });

  if (results.length === 0) {
    return null;
  }

  return {
    toolName: 'search_components',
    summary: `Found ${results.length} built-in components${requestedCategory ? ` in ${requestedCategory}` : ''}.`,
    input: {
      category: requestedCategory,
    },
    result: {
      count: results.length,
      components: results.map((component) => ({
        id: component.id,
        name: component.name,
        category: component.category,
      })),
    },
  };
}

export function runLocalTools(message: string): LocalToolPass {
  const invocations: LocalToolInvocation[] = [];

  const resistorTool = maybeCalculateLedResistor(message);
  if (resistorTool) {
    invocations.push(resistorTool);
  }

  const ohmsLawTool = maybeApplyOhmsLaw(message);
  if (ohmsLawTool && invocations.length === 0) {
    invocations.push(ohmsLawTool);
  }

  const searchTool = maybeSearchComponents(message);
  if (searchTool && invocations.length === 0) {
    invocations.push(searchTool);
  }

  const componentTool = maybeLookupComponent(message);
  if (
    componentTool &&
    invocations.every((invocation) => invocation.toolName !== 'lookup_component')
  ) {
    invocations.push(componentTool);
  }

  return {
    invocations,
    promptContext: buildPromptContext(invocations),
  };
}
