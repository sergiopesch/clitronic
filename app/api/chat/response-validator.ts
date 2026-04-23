import { z } from 'zod';
import { COMPONENT_TYPES } from '@/lib/ai/component-registry';
import type { StructuredResponse } from '@/lib/ai/response-schema';

const behaviorSchema = z.object({
  animation: z.enum(['fadeIn', 'slideUp', 'expand']),
  state: z.enum(['open', 'collapsed']),
});

const voiceSchema = z
  .object({
    transcript: z
      .object({
        raw: z.string().optional(),
        cleaned: z.string().optional(),
      })
      .optional(),
    spokenSummary: z.string().nullable().optional(),
    listeningState: z.enum(['idle', 'listening', 'processing', 'speaking']).optional(),
    canInterrupt: z.boolean().optional(),
  })
  .nullable();

const nonEmptyString = z.string().trim().min(1);

const labelValueSchema = z.object({
  label: nonEmptyString,
  value: nonEmptyString,
});

const specCardDataSchema = z.object({
  title: nonEmptyString,
  subtitle: nonEmptyString.optional(),
  keySpecs: z.array(labelValueSchema).min(1),
  optionalDetails: z.array(labelValueSchema).optional(),
});

const comparisonCardDataSchema = z.object({
  items: z.array(nonEmptyString).min(2),
  attributes: z
    .array(
      z.object({
        name: nonEmptyString,
        values: z.array(nonEmptyString).min(2),
      })
    )
    .min(1),
  keyDifferences: z.array(nonEmptyString),
  useCases: z
    .array(
      z.object({
        item: nonEmptyString,
        useCase: nonEmptyString,
      })
    )
    .optional(),
});

const explanationCardDataSchema = z.object({
  title: nonEmptyString,
  summary: nonEmptyString,
  keyPoints: z.array(nonEmptyString).min(1),
});

const recommendationCardDataSchema = z.object({
  items: z
    .array(
      z.object({
        name: nonEmptyString,
        reason: nonEmptyString,
      })
    )
    .min(1),
  highlights: z.array(nonEmptyString),
});

const troubleshootingCardDataSchema = z.object({
  issue: nonEmptyString,
  steps: z
    .array(
      z.object({
        label: nonEmptyString,
        detail: nonEmptyString,
      })
    )
    .min(1),
  tips: z.array(nonEmptyString),
});

const calculationCardDataSchema = z.object({
  title: nonEmptyString,
  formula: nonEmptyString,
  inputs: z.array(labelValueSchema),
  result: z.object({
    label: nonEmptyString,
    value: nonEmptyString,
    note: nonEmptyString.optional(),
  }),
});

const pinoutCardDataSchema = z.object({
  component: nonEmptyString,
  description: nonEmptyString.optional(),
  pins: z.array(
    z.object({
      number: z.number().int(),
      label: nonEmptyString,
      type: z.enum(['power', 'ground', 'digital', 'analog', 'other']),
    })
  ),
});

const chartCardDataSchema = z.object({
  title: nonEmptyString,
  subtitle: nonEmptyString.optional(),
  bars: z
    .array(
      z.object({
        label: nonEmptyString,
        value: z.number().finite(),
        unit: nonEmptyString.optional(),
        color: z.enum(['accent', 'success', 'warning', 'error']).optional(),
      })
    )
    .min(1),
});

const wiringCardDataSchema = z.object({
  title: nonEmptyString,
  description: nonEmptyString.optional(),
  steps: z
    .array(
      z.object({
        from: nonEmptyString,
        to: nonEmptyString,
        wire: nonEmptyString.optional(),
        note: nonEmptyString.optional(),
      })
    )
    .min(1),
  warnings: z.array(nonEmptyString).optional(),
});

const imageBlockDataSchema = z.object({
  imageMode: z.enum(['diagram', 'photo']),
  diagramType: nonEmptyString.optional(),
  labels: z.record(z.string(), nonEmptyString).optional(),
  searchQuery: nonEmptyString.optional(),
  imageCount: z.number().int().min(1).max(6).optional(),
  caption: nonEmptyString,
  description: nonEmptyString.optional(),
  notes: z.array(nonEmptyString).optional(),
});

const uiSchema = z.discriminatedUnion('component', [
  z.object({
    type: z.literal(COMPONENT_TYPES.specCard),
    component: z.literal('specCard'),
    data: specCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.comparisonCard),
    component: z.literal('comparisonCard'),
    data: comparisonCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.explanationCard),
    component: z.literal('explanationCard'),
    data: explanationCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.recommendationCard),
    component: z.literal('recommendationCard'),
    data: recommendationCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.troubleshootingCard),
    component: z.literal('troubleshootingCard'),
    data: troubleshootingCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.calculationCard),
    component: z.literal('calculationCard'),
    data: calculationCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.pinoutCard),
    component: z.literal('pinoutCard'),
    data: pinoutCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.chartCard),
    component: z.literal('chartCard'),
    data: chartCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.wiringCard),
    component: z.literal('wiringCard'),
    data: wiringCardDataSchema,
  }),
  z.object({
    type: z.literal(COMPONENT_TYPES.imageBlock),
    component: z.literal('imageBlock'),
    data: imageBlockDataSchema,
  }),
]);

const structuredResponseSchema = z
  .object({
    intent: z.string().min(1),
    mode: z.enum(['ui', 'text']),
    ui: uiSchema.nullable(),
    text: z.string().nullable(),
    behavior: behaviorSchema.nullable(),
    voice: voiceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'ui' && value.ui === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mode=ui requires a ui payload',
        path: ['ui'],
      });
    }
    if (value.mode === 'text' && !value.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mode=text requires text content',
        path: ['text'],
      });
    }
  });

export function validateStructuredResponse(payload: unknown): StructuredResponse | null {
  const parsed = structuredResponseSchema.safeParse(payload);
  return parsed.success ? (parsed.data as StructuredResponse) : null;
}
