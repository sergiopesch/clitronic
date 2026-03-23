'use client';

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

  if (response.mode === 'text' || !response.ui) {
    return fallback;
  }

  const animation = response.behavior?.animation;
  const component = response.ui.component;
  const data = response.ui.data;

  // Guard against missing data
  if (!data || typeof data !== 'object') {
    return fallback;
  }

  const renderComponent = () => {
    switch (component) {
      case 'specCard':
        return <SpecCard data={data as SpecCardData} />;
      case 'comparisonCard':
        return <ComparisonCard data={data as ComparisonCardData} />;
      case 'explanationCard':
        return <ExplanationCard data={data as ExplanationCardData} />;
      case 'recommendationCard':
        return <RecommendationCard data={data as RecommendationCardData} />;
      case 'troubleshootingCard':
        return <TroubleshootingCard data={data as TroubleshootingCardData} />;
      case 'calculationCard':
        return <CalculationCard data={data as CalculationCardData} />;
      case 'pinoutCard':
        return <PinoutCard data={data as PinoutCardData} />;
      case 'chartCard':
        return <ChartCard data={data as ChartCardData} />;
      case 'wiringCard':
        return <WiringCard data={data as WiringCardData} />;
      case 'imageBlock':
        return <ImageBlock data={data as ImageBlockData} />;
      default:
        return fallback;
    }
  };

  return (
    <CardErrorBoundary fallback={fallback}>
      <AnimateIn animation={animation}>{renderComponent()}</AnimateIn>
    </CardErrorBoundary>
  );
}
