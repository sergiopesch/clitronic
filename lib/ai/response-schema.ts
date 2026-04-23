export type UIMode = 'ui' | 'text';

export type AnimationType = 'fadeIn' | 'slideUp' | 'expand';
export type BehaviorState = 'open' | 'collapsed';
export type UIType = 'card' | 'chart' | 'text' | 'image';

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
  useCases?: { item: string; useCase: string }[];
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
  pins: {
    number: number;
    label: string;
    type: 'power' | 'ground' | 'digital' | 'analog' | 'other';
  }[];
}

export interface ChartCardData {
  title: string;
  subtitle?: string;
  bars: {
    label: string;
    value: number;
    unit?: string;
    color?: 'accent' | 'success' | 'warning' | 'error';
  }[];
}

export interface WiringCardData {
  title: string;
  description?: string;
  steps: { from: string; to: string; wire?: string; note?: string }[];
  warnings?: string[];
}

export interface ImageBlockData {
  imageMode: 'diagram' | 'photo';
  diagramType?: string;
  labels?: Record<string, string>;
  searchQuery?: string;
  imageCount?: number;
  caption: string;
  description?: string;
  notes?: string[];
}

export interface ComponentDataMap {
  specCard: SpecCardData;
  comparisonCard: ComparisonCardData;
  explanationCard: ExplanationCardData;
  recommendationCard: RecommendationCardData;
  troubleshootingCard: TroubleshootingCardData;
  calculationCard: CalculationCardData;
  pinoutCard: PinoutCardData;
  chartCard: ChartCardData;
  wiringCard: WiringCardData;
  imageBlock: ImageBlockData;
}

export interface ComponentUITypeMap {
  specCard: 'card';
  comparisonCard: 'card';
  explanationCard: 'card';
  recommendationCard: 'card';
  troubleshootingCard: 'card';
  calculationCard: 'card';
  pinoutCard: 'card';
  chartCard: 'chart';
  wiringCard: 'card';
  imageBlock: 'image';
}

export type ComponentName = keyof ComponentDataMap;
export type CardData = ComponentDataMap[ComponentName];

export type UIBlockFor<TComponent extends ComponentName> = {
  type: ComponentUITypeMap[TComponent];
  component: TComponent;
  data: ComponentDataMap[TComponent];
};

export type UIBlock = {
  [TComponent in ComponentName]: UIBlockFor<TComponent>;
}[ComponentName];

export interface ResponseBehavior {
  animation: AnimationType;
  state: BehaviorState;
}

export interface VoicePayload {
  transcript?: {
    raw?: string;
    cleaned?: string;
  };
  spokenSummary?: string | null;
  listeningState?: 'idle' | 'listening' | 'processing' | 'speaking';
  canInterrupt?: boolean;
}

interface StructuredResponseBase {
  intent: string;
  behavior: ResponseBehavior | null;
  voice?: VoicePayload | null;
}

export interface TextStructuredResponse extends StructuredResponseBase {
  mode: 'text';
  ui: null;
  text: string;
}

export type UIStructuredResponse = {
  [TComponent in ComponentName]: StructuredResponseBase & {
    mode: 'ui';
    ui: UIBlockFor<TComponent>;
    text: string | null;
  };
}[ComponentName];

export type StructuredResponse = TextStructuredResponse | UIStructuredResponse;
