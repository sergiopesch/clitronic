'use client';

import { useEffect, useRef } from 'react';
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

const FALLBACK_TEXT = 'Sorry, I had trouble displaying that. Try rephrasing your question.';

export function UIRenderer({ response }: UIRendererProps) {
  const fallback = <TextResponse text={response.text || FALLBACK_TEXT} />;

  // Debug: log once per unique response
  const lastLogRef = useRef<string>('');
  useEffect(() => {
    const key = JSON.stringify(response);
    if (key !== lastLogRef.current) {
      lastLogRef.current = key;
      console.log('[clitronic:ui] Response:', JSON.stringify(response, null, 2));
    }
  }, [response]);

  // If there's a text response and no UI block, show text
  if (response.text && !response.ui) {
    return <TextResponse text={response.text} />;
  }

  // If no UI block at all, show fallback
  if (!response.ui) {
    console.warn('[clitronic:ui] No ui block in response');
    return fallback;
  }

  const animation = response.behavior?.animation;
  const component = response.ui.component;

  // Try ui.data first; if missing, extract non-reserved fields from ui as fallback
  let resolvedData: unknown = response.ui.data;
  if (!resolvedData || typeof resolvedData !== 'object') {
    const ui = response.ui as unknown as Record<string, unknown>;
    const reserved = new Set(['type', 'component', 'data']);
    const extracted: Record<string, unknown> = {};
    let hasFields = false;
    for (const [key, value] of Object.entries(ui)) {
      if (!reserved.has(key)) {
        extracted[key] = value;
        hasFields = true;
      }
    }
    resolvedData = hasFields ? extracted : null;
    if (hasFields) {
      console.log('[clitronic:ui] Rescued flattened data from ui level');
    }
  }

  if (!resolvedData || typeof resolvedData !== 'object') {
    console.warn('[clitronic:ui] No data for component:', component, response.ui);
    return fallback;
  }

  const renderComponent = () => {
    switch (component) {
      case 'specCard':
        return <SpecCard data={resolvedData as SpecCardData} />;
      case 'comparisonCard':
        return <ComparisonCard data={resolvedData as ComparisonCardData} />;
      case 'explanationCard':
        return <ExplanationCard data={resolvedData as ExplanationCardData} />;
      case 'recommendationCard':
        return <RecommendationCard data={resolvedData as RecommendationCardData} />;
      case 'troubleshootingCard':
        return <TroubleshootingCard data={resolvedData as TroubleshootingCardData} />;
      case 'calculationCard':
        return <CalculationCard data={resolvedData as CalculationCardData} />;
      case 'pinoutCard':
        return <PinoutCard data={resolvedData as PinoutCardData} />;
      case 'chartCard':
        return <ChartCard data={resolvedData as ChartCardData} />;
      case 'wiringCard':
        return <WiringCard data={resolvedData as WiringCardData} />;
      case 'imageBlock':
        return <ImageBlock data={resolvedData as ImageBlockData} />;
      default:
        return null;
    }
  };

  const rendered = renderComponent();

  // If switch didn't match, fall back to text
  if (!rendered) return fallback;

  return (
    <CardErrorBoundary fallback={fallback}>
      <AnimateIn animation={animation}>{rendered}</AnimateIn>
    </CardErrorBoundary>
  );
}
