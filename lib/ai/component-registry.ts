export const COMPONENT_NAMES = [
  'specCard',
  'comparisonCard',
  'explanationCard',
  'recommendationCard',
  'troubleshootingCard',
  'calculationCard',
  'pinoutCard',
  'chartCard',
  'wiringCard',
  'imageBlock',
] as const;

export type RegisteredComponentName = (typeof COMPONENT_NAMES)[number];

export const COMPONENT_TYPES: Record<RegisteredComponentName, 'card' | 'chart' | 'image'> = {
  specCard: 'card',
  comparisonCard: 'card',
  explanationCard: 'card',
  recommendationCard: 'card',
  troubleshootingCard: 'card',
  calculationCard: 'card',
  pinoutCard: 'card',
  chartCard: 'chart',
  wiringCard: 'card',
  imageBlock: 'image',
};

export const COMPONENT_ALIASES: Record<string, RegisteredComponentName> = {
  photo: 'imageBlock',
  diagram: 'imageBlock',
  image: 'imageBlock',
  image_block: 'imageBlock',
  imageblock: 'imageBlock',
  spec: 'specCard',
  spec_card: 'specCard',
  speccard: 'specCard',
  specs: 'specCard',
  comparison: 'comparisonCard',
  comparison_card: 'comparisonCard',
  comparisoncard: 'comparisonCard',
  compare: 'comparisonCard',
  explanation: 'explanationCard',
  explanation_card: 'explanationCard',
  explanationcard: 'explanationCard',
  explain: 'explanationCard',
  recommendation: 'recommendationCard',
  recommendation_card: 'recommendationCard',
  recommendationcard: 'recommendationCard',
  troubleshooting: 'troubleshootingCard',
  troubleshooting_card: 'troubleshootingCard',
  troubleshootingcard: 'troubleshootingCard',
  calculation: 'calculationCard',
  calculation_card: 'calculationCard',
  calculationcard: 'calculationCard',
  pinout: 'pinoutCard',
  pinout_card: 'pinoutCard',
  pinoutcard: 'pinoutCard',
  chart: 'chartCard',
  chart_card: 'chartCard',
  chartcard: 'chartCard',
  wiring: 'wiringCard',
  wiring_card: 'wiringCard',
  wiringcard: 'wiringCard',
};

const VALID_COMPONENTS = new Set<string>(COMPONENT_NAMES);

export function resolveComponentName(name: unknown): RegisteredComponentName | null {
  if (typeof name !== 'string' || !name) return null;
  if (VALID_COMPONENTS.has(name)) return name as RegisteredComponentName;
  return COMPONENT_ALIASES[name] ?? COMPONENT_ALIASES[name.toLowerCase()] ?? null;
}

export function detectComponentFromData(
  data: Record<string, unknown>
): RegisteredComponentName | null {
  if ('imageMode' in data || 'searchQuery' in data || 'diagramType' in data) return 'imageBlock';
  if ('keySpecs' in data) return 'specCard';
  if ('attributes' in data && 'items' in data) return 'comparisonCard';
  if ('keyPoints' in data) return 'explanationCard';
  if ('bars' in data) return 'chartCard';
  if ('pins' in data) return 'pinoutCard';
  if ('issue' in data && 'steps' in data) return 'troubleshootingCard';
  if ('formula' in data && 'result' in data) return 'calculationCard';
  if ('steps' in data && Array.isArray(data.steps) && data.steps.length > 0) {
    const first = data.steps[0] as Record<string, unknown> | undefined;
    if (first && ('from' in first || 'wire' in first)) return 'wiringCard';
  }
  if ('highlights' in data) return 'recommendationCard';
  return null;
}
