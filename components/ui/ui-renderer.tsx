'use client';

import type { StructuredResponse } from '@/lib/ai/response-schema';
import { AnimateIn } from './animations';
import { SpecCard } from './spec-card';
import { ComparisonCard } from './comparison-card';
import { ExplanationCard } from './explanation-card';
import { RecommendationCard } from './recommendation-card';
import { TroubleshootingCard } from './troubleshooting-card';
import { CalculationCard } from './calculation-card';
import { PinoutCard } from './pinout-card';
import { ChartCard } from './chart-card';
import { WiringCard } from './wiring-card';
import { TextResponse } from './text-response';
import type {
  SpecCardData,
  ComparisonCardData,
  ExplanationCardData,
  RecommendationCardData,
  TroubleshootingCardData,
  CalculationCardData,
  PinoutCardData,
  ChartCardData,
  WiringCardData,
} from '@/lib/ai/response-schema';

interface UIRendererProps {
  response: StructuredResponse;
}

export function UIRenderer({ response }: UIRendererProps) {
  if (response.mode === 'text' && response.text) {
    return <TextResponse text={response.text} />;
  }

  if (!response.ui) {
    if (response.text) return <TextResponse text={response.text} />;
    return null;
  }

  const animation = response.behavior?.animation;
  const component = response.ui.component;
  const data = response.ui.data;

  return (
    <AnimateIn animation={animation}>
      {component === 'specCard' && <SpecCard data={data as SpecCardData} />}
      {component === 'comparisonCard' && <ComparisonCard data={data as ComparisonCardData} />}
      {component === 'explanationCard' && <ExplanationCard data={data as ExplanationCardData} />}
      {component === 'recommendationCard' && <RecommendationCard data={data as RecommendationCardData} />}
      {component === 'troubleshootingCard' && <TroubleshootingCard data={data as TroubleshootingCardData} />}
      {component === 'calculationCard' && <CalculationCard data={data as CalculationCardData} />}
      {component === 'pinoutCard' && <PinoutCard data={data as PinoutCardData} />}
      {component === 'chartCard' && <ChartCard data={data as ChartCardData} />}
      {component === 'wiringCard' && <WiringCard data={data as WiringCardData} />}
    </AnimateIn>
  );
}
