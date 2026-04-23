'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
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
import type { StructuredResponse, UIBlock } from '@/lib/ai/response-schema';

const IS_DEV = process.env.NODE_ENV === 'development';

interface UIRendererProps {
  response: StructuredResponse;
}

function renderUIBlock(ui: UIBlock): ReactNode {
  switch (ui.component) {
    case 'specCard':
      return <SpecCard data={ui.data} />;
    case 'comparisonCard':
      return <ComparisonCard data={ui.data} />;
    case 'explanationCard':
      return <ExplanationCard data={ui.data} />;
    case 'recommendationCard':
      return <RecommendationCard data={ui.data} />;
    case 'troubleshootingCard':
      return <TroubleshootingCard data={ui.data} />;
    case 'calculationCard':
      return <CalculationCard data={ui.data} />;
    case 'pinoutCard':
      return <PinoutCard data={ui.data} />;
    case 'chartCard':
      return <ChartCard data={ui.data} />;
    case 'wiringCard':
      return <WiringCard data={ui.data} />;
    case 'imageBlock':
      return <ImageBlock data={ui.data} />;
  }
}

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
  const rendered = renderUIBlock(response.ui);

  // If switch didn't match, keep visual area empty.
  if (!rendered) return null;

  return (
    <CardErrorBoundary fallback={null}>
      <AnimateIn animation={animation}>{rendered}</AnimateIn>
    </CardErrorBoundary>
  );
}
