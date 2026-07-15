import type { StructuredResponse, UIBlock } from '@/lib/ai/response-schema';
import { getCanonicalSpeechText } from '@/lib/ai/voice-presentation';

export const CONVERSATION_CONTEXT_MAX_CHARS = 1800;

function normalize(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function join(values: Array<string | null | undefined>): string {
  return values.map(normalize).filter(Boolean).join('; ');
}

function serializeCardFacts(ui: UIBlock): string {
  switch (ui.component) {
    case 'specCard':
      return join([
        ui.data.title,
        ui.data.subtitle,
        ...ui.data.keySpecs.map((item) => `${item.label}=${item.value}`),
        ...(ui.data.optionalDetails ?? []).map((item) => `${item.label}=${item.value}`),
      ]);
    case 'comparisonCard':
      return join([
        `Items: ${ui.data.items.join(', ')}`,
        ...ui.data.attributes.map(
          (attribute) => `${attribute.name}: ${attribute.values.join(' vs ')}`
        ),
        ...ui.data.keyDifferences,
        ...(ui.data.useCases ?? []).map((item) => `${item.item}: ${item.useCase}`),
      ]);
    case 'explanationCard':
      return join([ui.data.title, ui.data.summary, ...ui.data.keyPoints]);
    case 'recommendationCard':
      return join([
        ...ui.data.items.map((item) => `${item.name}: ${item.reason}`),
        ...ui.data.highlights,
      ]);
    case 'troubleshootingCard':
      return join([
        `Issue: ${ui.data.issue}`,
        ...ui.data.steps.map((step) => `${step.label}: ${step.detail}`),
        ...ui.data.tips,
      ]);
    case 'calculationCard':
      return join([
        ui.data.title,
        `Formula: ${ui.data.formula}`,
        ...ui.data.inputs.map((input) => `${input.label}=${input.value}`),
        `Result: ${ui.data.result.label}=${ui.data.result.value}`,
        ui.data.result.note,
      ]);
    case 'pinoutCard':
      return join([
        ui.data.component,
        ui.data.description,
        ...ui.data.pins.map((pin) => `Pin ${pin.number}: ${pin.label} (${pin.type})`),
      ]);
    case 'chartCard':
      return join([
        ui.data.title,
        ui.data.subtitle,
        ...ui.data.bars.map((bar) => `${bar.label}=${bar.value}${bar.unit ? ` ${bar.unit}` : ''}`),
      ]);
    case 'wiringCard':
      return join([
        ui.data.title,
        ui.data.description,
        ...ui.data.steps.map(
          (step, index) =>
            `${index + 1}. ${step.from} -> ${step.to}${step.wire ? ` (${step.wire})` : ''}${step.note ? ` — ${step.note}` : ''}`
        ),
        ...(ui.data.warnings ?? []).map((warning) => `Warning: ${warning}`),
      ]);
    case 'imageBlock':
      return join([
        ui.data.caption,
        ui.data.description,
        ui.data.diagramType ? `Diagram: ${ui.data.diagramType}` : undefined,
        ui.data.searchQuery ? `Image query: ${ui.data.searchQuery}` : undefined,
        ...Object.entries(ui.data.labels ?? {}).map(([label, value]) => `${label}=${value}`),
        ...(ui.data.notes ?? []),
      ]);
  }
}

function boundContext(value: string): string {
  if (value.length <= CONVERSATION_CONTEXT_MAX_CHARS) return value;
  const boundary = value.lastIndexOf(' ', CONVERSATION_CONTEXT_MAX_CHARS - 1);
  const end = boundary > 0 ? boundary : CONVERSATION_CONTEXT_MAX_CHARS - 1;
  return `${value.slice(0, end).replace(/[,:;\-]+$/u, '')}…`;
}

/**
 * Creates the canonical assistant-history entry used for follow-up turns.
 * Speech is placed first so the exact answer a voice user heard survives bounding.
 */
export function serializeStructuredResponseContext(response: StructuredResponse): string {
  if (response.mode === 'text') return boundContext(normalize(response.text));

  const spoken = getCanonicalSpeechText(response);
  const parts = [
    `[Rendered ${response.ui.component}]`,
    spoken ? `Spoken answer: ${spoken}` : '',
    `Card facts: ${serializeCardFacts(response.ui)}`,
    response.text ? `Visible answer: ${normalize(response.text)}` : '',
  ].filter(Boolean);

  return boundContext(parts.join(' — '));
}
