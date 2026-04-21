import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { cleanTranscriptLight } from '@/lib/ai/transcript-utils';
import {
  DAILY_LIMIT_RESPONSE,
  FALLBACK_TEXT_RESPONSE,
  MAX_CONTENT_LENGTH,
  MAX_MESSAGES,
  OFF_TOPIC_RESPONSE,
  RENDER_FALLBACK_TEXT_RESPONSE,
} from './constants';
import { logger } from './logger';
import { checkRateLimit } from './rate-limit';
import { extractClientIp } from './client-ip';
import { parseAndNormalizeResponse } from './response-normalizer';
import { validateStructuredResponse } from './response-validator';
import { detectInjection, isValidMessage, sanitizeInput } from './security';
import type { ChatRequestBody } from './types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let _openai: OpenAI | null = null;
function getClient() {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function toSafeTextResponse(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const text = typeof obj.text === 'string' && obj.text.trim() ? obj.text : null;
  if (!text) return null;
  return {
    intent: typeof obj.intent === 'string' && obj.intent.trim() ? obj.intent : 'quick_answer',
    mode: 'text' as const,
    ui: null,
    text,
    behavior: null,
    voice: null,
  };
}

const META_SENTENCE_PATTERNS = [
  /^(?:here(?:'s| is) (?:my )?(?:thinking|reasoning)|my (?:thinking|reasoning)|reasoning:|thinking:|analysis:|internal (?:thinking|reasoning))/i,
  /^(?:step\s*[123][\s:.-]*)?(?:what is the user asking for|could a visual make this better|pick the most visual component(?: that fits)?)/i,
  /^(?:the user is asking(?: for)?|the user wants|this request is asking for|this is asking for)/i,
  /^(?:a visual would make this better|this should be shown as|this is best shown as|best rendered as|best shown in)/i,
  /^(?:i should use|i(?:'| a)m going to use|i(?:'| a)m choosing|i chose|the best component here is|the most visual component is)/i,
  /^(?:intent(?: detection)?|component selection|schema|json schema|ui mode|text mode|mode:|intent:|component:|behind the scenes)/i,
];

function sanitizeVisibleString(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return value.trim();

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const filtered = sentences.filter(
    (sentence) => !META_SENTENCE_PATTERNS.some((pattern) => pattern.test(sentence))
  );

  if (filtered.length > 0) {
    return filtered.join(' ').trim();
  }

  if (META_SENTENCE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return '';
  }

  return normalized;
}

function sanitizeVisibleValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeVisibleString(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeVisibleValue(item))
      .filter((item) => !(typeof item === 'string' && item.trim().length === 0));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        sanitizeVisibleValue(nestedValue),
      ])
    );
  }
  return value;
}

export function sanitizeVisibleResponse<T>(payload: T): T {
  return sanitizeVisibleValue(payload) as T;
}

const VOICE_PROMPT_RULES = `

# Voice-first additions
- Input may come from speech-to-text and can include filler words, repetitions, and false starts.
- When inputMode is voice, interpret transcript generously and preserve electronics values exactly.
- Keep text concise and practical.
- For UI responses, include voice.spokenSummary: a short spoken-friendly summary.
- voice.spokenSummary rules: 1-2 sentences, plain text, ideally <= 180 characters, prioritize warnings and next action.
- Never narrate full tables or full card contents in voice.spokenSummary.
`;

const PHOTO_REQUEST_HINTS =
  /\b(show|picture|photo|image|see|looks?\s+like|look\s+like|what\s+does\s+.+\s+look\s+like)\b/i;
const NOT_PHOTO_HINTS = /\b(pinout|pins|wiring|wire|connect|schematic|diagram|circuit)\b/i;
const MULTI_IMAGE_HINTS = /\b(few|several|multiple|more|many|options|variants)\b/i;
const PHOTO_QUERY_PHRASES =
  /\b(?:can you|could you|please|show me|show|a picture of|picture of|photo of|image of|i want to see|i wanna see|let me see|what does|look like|looks like)\b/g;
const PHOTO_QUERY_FILLERS =
  /\b(?:photo|photos|picture|pictures|image|images|pic|pics|a|an|the|me|please)\b/g;
const LOW_SIGNAL_PHOTO_QUERY =
  /^(?:it|this|that|one|ones|them|other|another|more|same|thing|things|stuff)$/i;

function normalizePhotoQueryCandidate(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(PHOTO_QUERY_PHRASES, ' ')
    .replace(PHOTO_QUERY_FILLERS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHistoryArtifacts(input: string): string {
  return input
    .replace(/^\[showed [^\]]+\]\s*/i, ' ')
    .replace(/\(searched:[^)]+\)/gi, ' ')
    .replace(/\bitems:\b/gi, ' ')
    .replace(/[—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHistorySearchQuery(input: string): string | null {
  const match = input.match(/\(searched:\s*([^)]+)\)/i);
  if (!match?.[1]) return null;
  return derivePhotoQuery(match[1]);
}

export function derivePhotoQuery(input: string): string | null {
  const candidate = normalizePhotoQueryCandidate(input).split(' ').slice(0, 4).join(' ').trim();

  if (!candidate || LOW_SIGNAL_PHOTO_QUERY.test(candidate)) {
    return null;
  }

  return candidate;
}

export function derivePhotoQueryFromContext(
  input: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): string | null {
  const direct = derivePhotoQuery(input);
  if (direct) return direct;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const searchedCandidate = extractHistorySearchQuery(history[index]?.content ?? '');
    if (searchedCandidate) return searchedCandidate;

    const candidate = derivePhotoQuery(stripHistoryArtifacts(history[index]?.content ?? ''));
    if (candidate) return candidate;
  }

  return null;
}

function maybeBuildPhotoFallback(
  userText: string | undefined,
  preferredTranscript: string | undefined,
  inputMode: 'text' | 'voice',
  requestedImageCount: number,
  historyMessages: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  const source = (preferredTranscript || userText || '').trim();
  if (!source) return null;
  if (!PHOTO_REQUEST_HINTS.test(source) || NOT_PHOTO_HINTS.test(source)) return null;

  const searchQuery = derivePhotoQueryFromContext(source, historyMessages);
  if (!searchQuery) return null;
  const caption = `Photo of ${searchQuery}`;

  return {
    intent: 'show_image',
    mode: 'ui' as const,
    ui: {
      type: 'image' as const,
      component: 'imageBlock' as const,
      data: {
        imageMode: 'photo' as const,
        searchQuery,
        imageCount: requestedImageCount,
        caption,
        description: 'Requested visual reference.',
      },
    },
    text: null,
    behavior: {
      animation: 'fadeIn' as const,
      state: 'open' as const,
    },
    voice:
      inputMode === 'voice'
        ? {
            spokenSummary:
              requestedImageCount > 1
                ? `Showing ${requestedImageCount} images for ${searchQuery}.`
                : `Showing an image for ${searchQuery}.`,
          }
        : null,
  };
}

function deriveRequestedImageCount(input: string | undefined): number {
  const value = (input || '').toLowerCase();
  if (!value) return 1;

  const explicit = value.match(/\b([2-6])\s+(?:images?|pictures?|photos?)\b/);
  if (explicit?.[1]) return Number(explicit[1]);

  if (/\b(a few|few more|show more|more photos|more pictures|more images)\b/.test(value)) return 3;
  if (MULTI_IMAGE_HINTS.test(value)) return 3;
  return 1;
}

export async function POST(req: Request) {
  const ip = extractClientIp(req.headers);
  const rateCheck = checkRateLimit(ip);
  if (rateCheck.limited) {
    if (rateCheck.reason === 'daily') {
      return jsonResponse(DAILY_LIMIT_RESPONSE);
    }
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  let body: ChatRequestBody;

  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided.' }, { status: 400 });
  }

  const messages = body.messages.filter(isValidMessage);
  if (messages.length === 0) {
    return NextResponse.json({ error: 'No valid messages.' }, { status: 400 });
  }

  const inputMode = body.inputMode === 'voice' ? 'voice' : 'text';
  const cleanedTranscriptMeta =
    inputMode === 'voice'
      ? {
          raw:
            typeof body.transcriptMeta?.raw === 'string'
              ? sanitizeInput(body.transcriptMeta.raw.slice(0, MAX_CONTENT_LENGTH))
              : undefined,
          cleaned:
            typeof body.transcriptMeta?.cleaned === 'string'
              ? cleanTranscriptLight(body.transcriptMeta.cleaned.slice(0, MAX_CONTENT_LENGTH))
              : undefined,
        }
      : undefined;

  const trimmed = messages.slice(-MAX_MESSAGES).map((msg) => ({
    ...msg,
    content: sanitizeInput(msg.content.slice(0, MAX_CONTENT_LENGTH)),
  }));

  const lastUserMsg = trimmed.filter((m) => m.role === 'user').pop();
  const requestSource = cleanedTranscriptMeta?.cleaned || lastUserMsg?.content;
  const requestedImageCount = deriveRequestedImageCount(requestSource);
  const forcedPhotoResponse = maybeBuildPhotoFallback(
    lastUserMsg?.content,
    cleanedTranscriptMeta?.cleaned,
    inputMode,
    requestedImageCount,
    trimmed.slice(0, -1)
  );
  if (lastUserMsg && detectInjection(lastUserMsg.content)) {
    return jsonResponse(OFF_TOPIC_RESPONSE);
  }

  // Fast path: explicit "show me/photo/image" requests can skip LLM generation
  // and return a renderable image card immediately.
  if (forcedPhotoResponse) {
    logger.debug('[clitronic] Fast-path photo response');
    return jsonResponse(forcedPhotoResponse);
  }

  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: inputMode === 'voice' ? `${SYSTEM_PROMPT}${VOICE_PROMPT_RULES}` : SYSTEM_PROMPT,
        },
        ...trimmed.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        ...(cleanedTranscriptMeta?.cleaned
          ? [
              {
                role: 'system' as const,
                content: `Voice transcript meta (for interpretation only): ${JSON.stringify(cleanedTranscriptMeta)}`,
              },
            ]
          : []),
      ],
      temperature: 0.4,
      max_tokens: 1200,
    });

    const choice = completion.choices[0];
    const content = choice?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'No response from model.' }, { status: 502 });
    }

    if (choice.finish_reason === 'length') {
      logger.warn('[clitronic] Response truncated (finish_reason=length)');
    }
    logger.debug('[clitronic] Raw model output:', content.substring(0, 500));

    const normalized = parseAndNormalizeResponse(content);
    if (!normalized) return jsonResponse(forcedPhotoResponse ?? FALLBACK_TEXT_RESPONSE);

    const validated = validateStructuredResponse(normalized);
    if (!validated) {
      if (forcedPhotoResponse) {
        logger.warn('[clitronic] Forcing photo fallback for visual request');
        return jsonResponse(forcedPhotoResponse);
      }
      const recoveredText = toSafeTextResponse(normalized);
      if (recoveredText) {
        logger.warn('[clitronic] Falling back to recovered text response');
        return jsonResponse(recoveredText);
      }
      return jsonResponse(RENDER_FALLBACK_TEXT_RESPONSE);
    }

    if (
      forcedPhotoResponse &&
      (validated.mode !== 'ui' || validated.ui?.component !== 'imageBlock')
    ) {
      logger.warn('[clitronic] Overriding non-visual response with photo fallback');
      return jsonResponse(forcedPhotoResponse);
    }

    if (
      requestedImageCount > 1 &&
      validated.mode === 'ui' &&
      validated.ui?.component === 'imageBlock' &&
      validated.ui.data &&
      typeof validated.ui.data === 'object'
    ) {
      (validated.ui.data as unknown as { imageCount?: number }).imageCount = requestedImageCount;
    }

    const sanitized = sanitizeVisibleResponse(validated);
    logger.debug('[clitronic] Validated output:', JSON.stringify(sanitized).substring(0, 500));
    return jsonResponse(sanitized);
  } catch (error) {
    logger.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response. Please try again.' },
      { status: 500 }
    );
  }
}
