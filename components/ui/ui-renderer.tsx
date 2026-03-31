'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { StructuredResponse } from '@/lib/ai/response-schema';
import { AnimateIn } from './animations';
import { CardErrorBoundary } from './card-error-boundary';
import { SpecCard } from './spec-card';
import { ComparisonCard } from './comparison-card';
import { ExplanationCard } from './explanation-card';
import { RecommendationCard } from './recommendation-card';
import { TroubleshootingCard } from './troubleshooting-card';
import { CalculationCard } from './calculation-card';
import { PinoutCard } from './pinout-card';
import { ChartCard } from './chart-card';
import { WiringCard } from './wiring-card';
import { ImageBlock } from './image-block';
import { TextResponse } from './text-response';
import type {
  ComponentName,
  SpecCardData,
  ComparisonCardData,
  ExplanationCardData,
  RecommendationCardData,
  TroubleshootingCardData,
  CalculationCardData,
  PinoutCardData,
  ChartCardData,
  WiringCardData,
  ImageBlockData,
} from '@/lib/ai/response-schema';

interface UIRendererProps {
  response: StructuredResponse;
}

const IS_DEV = process.env.NODE_ENV === 'development';

const CARD_RENDERERS: Record<ComponentName, (data: unknown) => ReactNode> = {
  specCard: (data) => <SpecCard data={data as SpecCardData} />,
  comparisonCard: (data) => <ComparisonCard data={data as ComparisonCardData} />,
  explanationCard: (data) => <ExplanationCard data={data as ExplanationCardData} />,
  recommendationCard: (data) => <RecommendationCard data={data as RecommendationCardData} />,
  troubleshootingCard: (data) => <TroubleshootingCard data={data as TroubleshootingCardData} />,
  calculationCard: (data) => <CalculationCard data={data as CalculationCardData} />,
  pinoutCard: (data) => <PinoutCard data={data as PinoutCardData} />,
  chartCard: (data) => <ChartCard data={data as ChartCardData} />,
  wiringCard: (data) => <WiringCard data={data as WiringCardData} />,
  imageBlock: (data) => <ImageBlock data={data as ImageBlockData} />,
};

export function UIRenderer({ response }: UIRendererProps) {
  // Debug: log once per unique response
  const lastLogRef = useRef<string>('');
  useEffect(() => {
    const key = JSON.stringify(response);
    if (key !== lastLogRef.current) {
      lastLogRef.current = key;
      if (IS_DEV) {
        console.log('[clitronic:ui] Response:', JSON.stringify(response, null, 2));
      }
    }
  }, [response]);

  const fallbackText = response.voice?.spokenSummary ?? response.text;
  if (!response.ui) {
    if (!fallbackText?.trim()) {
      if (IS_DEV) console.warn('[clitronic:ui] No ui block in response');
      return null;
    }

    return (
      <CardErrorBoundary fallback={null}>
        <AnimateIn animation={response.behavior?.animation ?? 'fadeIn'}>
          <TextResponse key={fallbackText} text={fallbackText} />
        </AnimateIn>
      </CardErrorBoundary>
    );
  }

  const animation = response.behavior?.animation;
  const component = response.ui.component;
  const resolvedData = response.ui.data;

  if (!resolvedData || typeof resolvedData !== 'object') {
    if (IS_DEV) console.warn('[clitronic:ui] No data for component:', component, response.ui);
    return null;
  }

  const rendered = CARD_RENDERERS[component]?.(resolvedData);

  // If switch didn't match, keep visual area empty.
  if (!rendered) return null;

  return (
    <CardErrorBoundary fallback={null}>
      <AnimateIn animation={animation}>{rendered}</AnimateIn>
    </CardErrorBoundary>
  );
}
