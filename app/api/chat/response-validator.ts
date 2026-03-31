import { z } from 'zod';
import { COMPONENT_NAMES, COMPONENT_TYPES } from '@/lib/ai/component-registry';
import type { StructuredResponse } from '@/lib/ai/response-schema';

const behaviorSchema = z.object({
  animation: z.enum(['fadeIn', 'slideUp', 'expand']),
  state: z.enum(['open', 'collapsed']),
});

const labelValueSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const specCardSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  keySpecs: z.array(labelValueSchema).min(1),
  optionalDetails: z.array(labelValueSchema).optional(),
});

const comparisonCardSchema = z.object({
  items: z.array(z.string().min(1)).min(2),
  attributes: z
    .array(
      z.object({
        name: z.string().min(1),
        values: z.array(z.string().min(1)).min(2),
      })
    )
    .min(1),
  keyDifferences: z.array(z.string().min(1)).min(1),
  useCases: z
    .array(
      z.object({
        item: z.string().min(1),
        useCase: z.string().min(1),
      })
    )
    .optional(),
});

const explanationCardSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
});

const recommendationCardSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        reason: z.string().min(1),
      })
    )
    .min(1),
  highlights: z.array(z.string().min(1)).min(1),
});

const troubleshootingCardSchema = z.object({
  issue: z.string().min(1),
  steps: z
    .array(
      z.object({
        label: z.string().min(1),
        detail: z.string().min(1),
      })
    )
    .min(1),
  tips: z.array(z.string().min(1)).min(1),
});

const calculationCardSchema = z.object({
  title: z.string().min(1),
  formula: z.string().min(1),
  inputs: z.array(labelValueSchema).min(1),
  result: z.object({
    label: z.string().min(1),
    value: z.string().min(1),
    note: z.string().optional(),
  }),
});

const pinoutCardSchema = z.object({
  component: z.string().min(1),
  description: z.string().optional(),
  pins: z
    .array(
      z.object({
        number: z.coerce.number().int().positive(),
        label: z.string().min(1),
        type: z.enum(['power', 'ground', 'digital', 'analog', 'other']),
      })
    )
    .min(1),
});

const chartCardSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  bars: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.coerce.number(),
        unit: z.string().optional(),
        color: z.enum(['accent', 'success', 'warning', 'error']).optional(),
      })
    )
    .min(1),
});

const wiringCardSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  steps: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        wire: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .min(1),
  warnings: z.array(z.string().min(1)).optional(),
});

const imageBlockSchema = z.object({
  imageMode: z.enum(['diagram', 'photo']),
  diagramType: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  searchQuery: z.string().optional(),
  caption: z.string().min(1),
  description: z.string().optional(),
  notes: z.array(z.string().min(1)).optional(),
});

const componentDataSchemas = {
  specCard: specCardSchema,
  comparisonCard: comparisonCardSchema,
  explanationCard: explanationCardSchema,
  recommendationCard: recommendationCardSchema,
  troubleshootingCard: troubleshootingCardSchema,
  calculationCard: calculationCardSchema,
  pinoutCard: pinoutCardSchema,
  chartCard: chartCardSchema,
  wiringCard: wiringCardSchema,
  imageBlock: imageBlockSchema,
} as const;

const uiSchema = z
  .object({
    type: z.enum(['card', 'chart', 'text', 'image']),
    component: z.enum(COMPONENT_NAMES),
    data: z.unknown(),
  })
  .superRefine((value, ctx) => {
    const expectedType = COMPONENT_TYPES[value.component];
    if (value.type !== expectedType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `component=${value.component} requires type=${expectedType}`,
        path: ['type'],
      });
      return;
    }

    const schema = componentDataSchemas[value.component];
    const result = schema.safeParse(value.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: ['data', ...issue.path.map(String)],
        });
      }
    }
  });

const structuredResponseSchema = z
  .object({
    intent: z.string().min(1),
    mode: z.enum(['ui', 'text']),
    ui: uiSchema.nullable(),
    text: z.string().nullable(),
    behavior: behaviorSchema.nullable(),
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
