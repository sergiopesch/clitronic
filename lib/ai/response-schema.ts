export type UIMode = 'ui' | 'text';

export type AnimationType = 'fadeIn' | 'slideUp' | 'expand';
export type BehaviorState = 'open' | 'collapsed';

export type ComponentName =
  | 'specCard'
  | 'comparisonCard'
  | 'explanationCard'
  | 'recommendationCard'
  | 'troubleshootingCard'
  | 'calculationCard'
  | 'pinoutCard'
  | 'chartCard'
  | 'wiringCard';

export type UIType = 'card' | 'chart' | 'text';

export interface SpecCardData {
  title: string;
  subtitle?: string;
  keySpecs: { label: string; value: string }[];
  optionalDetails?: { label: string; value: string }[];
}

export interface ComparisonCardData {
  items: string[];
  attributes: { name: string; values: string[] }[];
  keyDifferences: string[];
}

export interface ExplanationCardData {
  title: string;
  summary: string;
  keyPoints: string[];
}

export interface RecommendationCardData {
  items: { name: string; reason: string }[];
  highlights: string[];
}

export interface TroubleshootingCardData {
  issue: string;
  steps: { label: string; detail: string }[];
  tips: string[];
}

export interface CalculationCardData {
  title: string;
  formula: string;
  inputs: { label: string; value: string }[];
  result: { label: string; value: string; note?: string };
}

export interface PinoutCardData {
  component: string;
  description?: string;
  pins: { number: number; label: string; type: 'power' | 'ground' | 'digital' | 'analog' | 'other' }[];
}

export interface ChartCardData {
  title: string;
  subtitle?: string;
  bars: { label: string; value: number; unit?: string; color?: 'accent' | 'success' | 'warning' | 'error' }[];
}

export interface WiringCardData {
  title: string;
  description?: string;
  steps: { from: string; to: string; wire?: string; note?: string }[];
  warnings?: string[];
}

export type CardData =
  | SpecCardData
  | ComparisonCardData
  | ExplanationCardData
  | RecommendationCardData
  | TroubleshootingCardData
  | CalculationCardData
  | PinoutCardData
  | ChartCardData
  | WiringCardData;

export interface UIBlock {
  type: UIType;
  component: ComponentName;
  data: CardData;
}

export interface ResponseBehavior {
  animation: AnimationType;
  state: BehaviorState;
}

export interface StructuredResponse {
  intent: string;
  mode: UIMode;
  ui: UIBlock | null;
  text: string | null;
  behavior: ResponseBehavior | null;
}
