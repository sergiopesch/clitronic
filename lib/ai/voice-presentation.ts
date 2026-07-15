import type { ComparisonCardData, StructuredResponse, UIBlock } from '@/lib/ai/response-schema';

export const CANONICAL_SPEECH_MAX_CHARS = 600;

function normalizeWhitespace(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function asSentence(value: string | null | undefined): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function joinSentences(values: Array<string | null | undefined>): string {
  return values.map(asSentence).filter(Boolean).join(' ');
}

function joinList(values: Array<string | null | undefined>): string {
  return values.map(normalizeWhitespace).filter(Boolean).join('; ');
}

function formatComparisonAttributes(data: ComparisonCardData): string {
  return data.attributes
    .map((attribute) => {
      const values = attribute.values.map((value, index) => {
        const item = normalizeWhitespace(data.items[index]);
        const normalizedValue = normalizeWhitespace(value);
        return item ? `${item}: ${normalizedValue}` : normalizedValue;
      });
      return `${normalizeWhitespace(attribute.name)}: ${values.join(', ')}`;
    })
    .join('; ');
}

function deriveCardSpeech(ui: UIBlock): string {
  switch (ui.component) {
    case 'specCard': {
      const { title, subtitle, keySpecs, optionalDetails } = ui.data;
      return joinSentences([
        title,
        subtitle,
        `Key specifications: ${joinList(
          keySpecs.map(
            (spec) => `${normalizeWhitespace(spec.label)}: ${normalizeWhitespace(spec.value)}`
          )
        )}`,
        optionalDetails?.length
          ? `Additional details: ${joinList(
              optionalDetails.map(
                (detail) =>
                  `${normalizeWhitespace(detail.label)}: ${normalizeWhitespace(detail.value)}`
              )
            )}`
          : '',
      ]);
    }

    case 'comparisonCard': {
      const { items, keyDifferences, useCases } = ui.data;
      return joinSentences([
        `Comparison: ${joinList(items)}`,
        formatComparisonAttributes(ui.data),
        keyDifferences.length ? `Key differences: ${joinList(keyDifferences)}` : '',
        useCases?.length
          ? `Use cases: ${joinList(
              useCases.map(
                (useCase) =>
                  `${normalizeWhitespace(useCase.item)}: ${normalizeWhitespace(useCase.useCase)}`
              )
            )}`
          : '',
      ]);
    }

    case 'explanationCard': {
      const { title, summary, keyPoints } = ui.data;
      return joinSentences([title, summary, `Key points: ${joinList(keyPoints)}`]);
    }

    case 'recommendationCard': {
      const { items } = ui.data;
      return joinSentences([
        `Recommendations: ${joinList(
          items.map(
            (item) => `${normalizeWhitespace(item.name)}: ${normalizeWhitespace(item.reason)}`
          )
        )}`,
      ]);
    }

    case 'troubleshootingCard': {
      const { issue, steps, tips } = ui.data;
      return joinSentences([
        `Issue: ${issue}`,
        `Checks: ${joinList(
          steps.map(
            (step, index) =>
              `${index + 1}, ${normalizeWhitespace(step.label)}: ${normalizeWhitespace(step.detail)}`
          )
        )}`,
        tips.length ? `Tips: ${joinList(tips)}` : '',
      ]);
    }

    case 'calculationCard': {
      const { title, formula, inputs, result } = ui.data;
      return joinSentences([
        title,
        `Formula: ${formula}`,
        inputs.length
          ? `Inputs: ${joinList(
              inputs.map(
                (input) =>
                  `${normalizeWhitespace(input.label)}: ${normalizeWhitespace(input.value)}`
              )
            )}`
          : '',
        `Result: ${normalizeWhitespace(result.label)}: ${normalizeWhitespace(result.value)}`,
        result.note,
      ]);
    }

    case 'pinoutCard': {
      const { component, description, pins } = ui.data;
      return joinSentences([
        `Pinout for ${component}`,
        description,
        `Pins: ${joinList(
          pins.map(
            (pin) =>
              `${pin.number}, ${normalizeWhitespace(pin.label)}, ${normalizeWhitespace(pin.type)}`
          )
        )}`,
      ]);
    }

    case 'chartCard': {
      const { title, subtitle, bars } = ui.data;
      return joinSentences([
        title,
        subtitle,
        `Values: ${joinList(
          bars.map(
            (bar) =>
              `${normalizeWhitespace(bar.label)}: ${bar.value}${bar.unit ? ` ${normalizeWhitespace(bar.unit)}` : ''}`
          )
        )}`,
      ]);
    }

    case 'wiringCard': {
      const { title, description, steps } = ui.data;
      return joinSentences([
        title,
        description,
        `Connections: ${joinList(
          steps.map((step, index) =>
            joinList([
              `${index + 1}, ${normalizeWhitespace(step.from)} to ${normalizeWhitespace(step.to)}`,
              step.wire ? `wire: ${step.wire}` : '',
              step.note ? `note: ${step.note}` : '',
            ])
          )
        )}`,
      ]);
    }

    case 'imageBlock': {
      const { imageMode, diagramType, labels, caption, description, notes } = ui.data;
      const labelEntries = labels
        ? Object.entries(labels).map(
            ([label, value]) => `${normalizeWhitespace(label)}: ${normalizeWhitespace(value)}`
          )
        : [];
      return joinSentences([
        caption,
        description,
        imageMode === 'diagram' && diagramType
          ? `Diagram type: ${normalizeWhitespace(diagramType)}`
          : `Visual type: ${imageMode}`,
        labelEntries.length ? `Labels: ${joinList(labelEntries)}` : '',
        notes?.length ? `Notes: ${joinList(notes)}` : '',
      ]);
    }
  }
}

function getPriorityCardDetails(response: StructuredResponse): string[] {
  if (response.mode !== 'ui') return [];

  const isDeterministicSafetyGuidance = (value: string) =>
    /^(?:safety|battery safety|power safety|workshop safety|environment):/i.test(
      normalizeWhitespace(value)
    );

  switch (response.ui.component) {
    case 'wiringCard':
      return response.ui.data.warnings ?? [];
    case 'recommendationCard':
      return response.ui.data.highlights;
    case 'troubleshootingCard':
      return response.ui.data.tips.filter(isDeterministicSafetyGuidance);
    case 'explanationCard':
      return response.ui.data.keyPoints.filter(isDeterministicSafetyGuidance);
    case 'comparisonCard':
      return response.ui.data.keyDifferences.filter(isDeterministicSafetyGuidance);
    case 'imageBlock':
      return (response.ui.data.notes ?? []).filter(isDeterministicSafetyGuidance);
    case 'specCard':
      return (response.ui.data.optionalDetails ?? [])
        .filter(
          (detail) =>
            normalizeWhitespace(detail.label).toLowerCase() === 'safety' ||
            isDeterministicSafetyGuidance(detail.value)
        )
        .map((detail) => detail.value);
    default:
      return [];
  }
}

type MeasurementFact = { number: string; unit: string };

function extractMeasurementFacts(value: string): MeasurementFact[] {
  const pattern =
    /\b(\d+(?:[.,]\d+)?)\s*((?:[pnumkµ]?(?:a|v|w|f))|(?:[kmg]?hz)|(?:[kmg]?ohms?)|ω|%|°?c)?(?=$|[^a-z0-9])/gi;
  return [...value.toLowerCase().matchAll(pattern)].map((match) => ({
    number: String(Number((match[1] ?? '').replace(',', '.'))),
    unit: (match[2] ?? '')
      .replace('µ', 'u')
      .replace('ω', 'ohm')
      .replace(/ohms?$/, 'ohm'),
  }));
}

function factsMatch(candidate: MeasurementFact, reference: MeasurementFact): boolean {
  return (
    candidate.number === reference.number && (!candidate.unit || candidate.unit === reference.unit)
  );
}

function isSpokenSummaryConsistent(
  spokenSummary: string,
  derivedCardSpeech: string,
  ui: UIBlock
): boolean {
  const summaryFacts = extractMeasurementFacts(spokenSummary);
  const cardFacts = extractMeasurementFacts(derivedCardSpeech);

  if (!summaryFacts.every((fact) => cardFacts.some((cardFact) => factsMatch(fact, cardFact)))) {
    return false;
  }

  if (ui.component === 'calculationCard') {
    const resultFacts = extractMeasurementFacts(
      `${ui.data.result.value} ${ui.data.result.note ?? ''}`
    );
    if (
      resultFacts.length > 0 &&
      !resultFacts.some((fact) => summaryFacts.some((summaryFact) => factsMatch(summaryFact, fact)))
    ) {
      return false;
    }
  }

  return true;
}

function truncateAtWordBoundary(value: string, limit: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= limit) return normalized;
  if (limit <= 1) return '';

  const boundary = normalized.lastIndexOf(' ', limit - 1);
  if (boundary <= 0) return '';

  return `${normalized.slice(0, boundary).replace(/[,:;\-]+$/u, '')}…`;
}

function fitSpeechWithPriority(base: string, priorityDetails: string[]): string {
  const normalizedBase = normalizeWhitespace(base);
  const normalizedPriority = priorityDetails.map(normalizeWhitespace).filter(Boolean);

  if (normalizedPriority.length === 0) {
    return truncateAtWordBoundary(normalizedBase, CANONICAL_SPEECH_MAX_CHARS);
  }

  const baseFits = normalizedBase.length <= CANONICAL_SPEECH_MAX_CHARS;
  const missingPriority = normalizedPriority.filter(
    (detail) => !baseFits || !normalizedBase.toLowerCase().includes(detail.toLowerCase())
  );
  if (missingPriority.length === 0) return normalizedBase;

  const priority = joinSentences(missingPriority);
  if (!normalizedBase) {
    return truncateAtWordBoundary(priority, CANONICAL_SPEECH_MAX_CHARS);
  }

  const separator = ' ';
  if (normalizedBase.length + separator.length + priority.length <= CANONICAL_SPEECH_MAX_CHARS) {
    return `${normalizedBase}${separator}${priority}`;
  }

  if (priority.length >= CANONICAL_SPEECH_MAX_CHARS) {
    return truncateAtWordBoundary(priority, CANONICAL_SPEECH_MAX_CHARS);
  }

  const baseLimit = CANONICAL_SPEECH_MAX_CHARS - priority.length - separator.length;
  const fittedBase = truncateAtWordBoundary(normalizedBase, baseLimit);
  return fittedBase ? `${fittedBase}${separator}${priority}` : priority;
}

/**
 * Returns the one exact string the presentation layer may send to speech synthesis.
 * Text responses may use explicit response copy. UI narration uses the validated
 * card as its factual source and accepts a concise model summary only when its
 * measurement facts are consistent with that card.
 */
export function getCanonicalSpeechText(response: StructuredResponse): string | null {
  const spokenSummary = normalizeWhitespace(response.voice?.spokenSummary);
  const responseText = normalizeWhitespace(response.text);
  const derived = response.mode === 'ui' ? deriveCardSpeech(response.ui) : '';
  const base =
    response.mode === 'ui'
      ? spokenSummary && isSpokenSummaryConsistent(spokenSummary, derived, response.ui)
        ? spokenSummary
        : derived
      : spokenSummary || responseText;
  const priorityDetails = getPriorityCardDetails(response);

  if (!base && priorityDetails.length === 0) return null;
  return fitSpeechWithPriority(base, priorityDetails) || null;
}
