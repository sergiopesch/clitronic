import type { ChatMessage } from './types';

export function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  return (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string';
}

export function sanitizeInput(text: string): string {
  return text
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/ {4,}/g, '   ')
    .trim();
}

export function detectInjection(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    /ignore\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions|prompts|rules)/i,
    /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts)/i,
    /forget\s+(all\s+)?(your|the|previous)\s+(instructions|rules|prompts)/i,
    /override\s+(system|your)\s+(prompt|instructions|rules)/i,
    /you\s+are\s+now\s+(a|an|the)\s+/i,
    /act\s+as\s+(a|an|if)\s+/i,
    /pretend\s+(to\s+be|you\s+are)/i,
    /new\s+system\s+prompt/i,
    /enter\s+(developer|debug|admin|god)\s+mode/i,
    /reveal\s+(your|the|system)\s+(prompt|instructions)/i,
    /show\s+me\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
    /what\s+are\s+your\s+(system\s+)?(instructions|rules|prompt)/i,
    /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
    /print\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
    /\[system\]/i,
    /\[assistant\]/i,
    /<<\s*sys/i,
    /<\|im_start\|>/i,
    /```system/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(lower)) return true;
  }

  const instructionWords = [
    'instruction',
    'prompt',
    'system',
    'override',
    'ignore',
    'disregard',
    'bypass',
    'jailbreak',
    'dan',
    'developer mode',
  ];
  const hits = instructionWords.filter((word) => lower.includes(word)).length;
  return hits >= 3;
}
