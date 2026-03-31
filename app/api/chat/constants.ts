import { DAILY_LIMIT_MESSAGE } from '@/lib/ai/rate-limit';

export const MAX_MESSAGES = 10;
export const MAX_CONTENT_LENGTH = 2000;

export const OFF_TOPIC_RESPONSE = {
  intent: 'off_topic',
  mode: 'text',
  ui: null,
  text: 'I only help with electronics and hardware topics. Try asking me about circuits, components, microcontrollers, or anything maker-related!',
  behavior: null,
} as const;

export const FALLBACK_TEXT_RESPONSE = {
  intent: 'quick_answer',
  mode: 'text',
  ui: null,
  text: 'Sorry, I had trouble processing that. Could you rephrase?',
  behavior: null,
} as const;

export const RENDER_FALLBACK_TEXT_RESPONSE = {
  intent: 'quick_answer',
  mode: 'text',
  ui: null,
  text: 'Sorry, I had trouble rendering that. Could you rephrase?',
  behavior: null,
} as const;

export const DAILY_LIMIT_RESPONSE = {
  intent: 'rate_limit',
  mode: 'text',
  ui: null,
  text: DAILY_LIMIT_MESSAGE,
  behavior: null,
} as const;
