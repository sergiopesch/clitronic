import { z } from 'zod';
import { COMPONENT_NAMES, COMPONENT_TYPES } from '@/lib/ai/component-registry';
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

const uiSchema = z
  .object({
    type: z.enum(['card', 'chart', 'text', 'image']),
    component: z.enum(COMPONENT_NAMES),
    data: z.record(z.string(), z.unknown()),
  })
  .superRefine((value, ctx) => {
    const expectedType = COMPONENT_TYPES[value.component];
    if (value.type !== expectedType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `component=${value.component} requires type=${expectedType}`,
        path: ['type'],
      });
    }
  });

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
