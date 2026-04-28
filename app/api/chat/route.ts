import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { OPENAI_CHAT_MAX_TOKENS, OPENAI_CHAT_MODEL } from '@/lib/ai/openai-config';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import type { StructuredResponse } from '@/lib/ai/response-schema';
import { cleanTranscriptLight } from '@/lib/ai/transcript-utils';
import { writeAutoresearchTrace } from '@/lib/autoresearch/trace';
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
import { validateStructuredResponseWithDiagnostics } from './response-validator';
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

type FallbackKind =
  | 'none'
  | 'forced_photo'
  | 'parse_fallback'
  | 'render_fallback'
  | 'recovered_text'
  | 'error';

interface ChatAutoresearchDiagnostics {
  raw_model_output_present: boolean;
  model_json_parse_success: boolean | null;
  normalized_component: string | null;
  normalized_mode: string | null;
  model_validation_success: boolean | null;
  validator_issues: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  fallback_kind: FallbackKind;
  final_component: string | null;
  final_mode: string | null;
}

function createAutoresearchDiagnostics(): ChatAutoresearchDiagnostics {
  return {
    raw_model_output_present: false,
    model_json_parse_success: null,
    normalized_component: null,
    normalized_mode: null,
    model_validation_success: null,
    validator_issues: [],
    fallback_kind: 'none',
    final_component: null,
    final_mode: null,
  };
}

function getModeAndComponent(payload: unknown): { mode: string | null; component: string | null } {
  if (!payload || typeof payload !== 'object') return { mode: null, component: null };
  const obj = payload as Record<string, unknown>;
  const mode = typeof obj.mode === 'string' ? obj.mode : null;
  const ui = obj.ui && typeof obj.ui === 'object' ? (obj.ui as Record<string, unknown>) : null;
  const component = typeof ui?.component === 'string' ? ui.component : null;
  return { mode, component };
}

function withAutoresearchDiagnostics<T>(
  payload: T,
  diagnostics: ChatAutoresearchDiagnostics,
  fallbackKind: FallbackKind
): T {
  if (process.env.CLITRONIC_AUTORESEARCH !== '1') return payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

  const final = getModeAndComponent(payload);
  return {
    ...(payload as Record<string, unknown>),
    _autoresearch: {
      ...diagnostics,
      fallback_kind: fallbackKind,
      final_component: final.component,
      final_mode: final.mode,
    },
  } as T;
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

function safetyGuidanceFor(input: string | undefined): string[] {
  const value = (input || '').toLowerCase();
  const guidance: string[] = [];

  if (
    /\b(mains|outlets?|wall power|in-wall|smart switches?|smart relay|metal electrical box|electrician|opening the walls|media closet)\b/.test(
      value
    )
  ) {
    guidance.push(
      'Safety: use a licensed electrician for mains work, follow local code, keep mains separated from low-voltage wiring, and use rated cable, enclosures, strain relief, and fire-safe routing.'
    );
  }

  if (/\b(battery|batteries|li-ion|lithium|18650|lipo|lifepo4|solar|ups|charger)\b/.test(value)) {
    guidance.push(
      'Battery safety: lithium, 18650, LiPo, and LiFePO4 systems need BMS or protection, a correctly sized fuse, polarity checks, ventilation, heat clearance, and fire-safe charging.'
    );
  }

  if (
    /\b(led strip|poe|bench power supply|bench supply|buck converter|motor|power supply|12 v|24 v|5 v|current|garage|shed|workshop)\b/.test(
      value
    )
  ) {
    guidance.push(
      'Power safety: set a current limit, size the fuse and wire gauge/AWG for the load, verify polarity, manage heat and voltage drop, and keep a common ground where low-voltage modules share signals.'
    );
  }

  if (
    /\b(soldering|soldering station|hot air|crimpers?|test leads?|tweezers?|xt60|thick wires?)\b/.test(
      value
    )
  ) {
    guidance.push(
      'Workshop safety: soldering, hot tools, crimpers, tweezers, XT60 connectors, and thick wires need a fume extractor, ventilation, heat-resistant silicone mat, eye protection, fire safety, and safe storage.'
    );
  }

  if (/\b(outdoor|shed|garage|weather|leak|detached)\b/.test(value)) {
    guidance.push(
      'Environment: use weatherproof rated boxes, strain relief, drip loops, ventilation, and physical separation from mains or high-current wiring.'
    );
  }

  return [...new Set(guidance)];
}

function appendStringList(target: Record<string, unknown>, key: string, values: string[]) {
  const existing = Array.isArray(target[key]) ? target[key] : [];
  target[key] = [...existing, ...values];
}

function augmentSafetyGuidance<T>(payload: T, source: string | undefined): T {
  const guidance = safetyGuidanceFor(source);
  if (guidance.length === 0 || !payload || typeof payload !== 'object') return payload;

  const response = payload as Record<string, unknown>;
  const ui =
    response.ui && typeof response.ui === 'object'
      ? (response.ui as Record<string, unknown>)
      : null;
  const data =
    ui?.data && typeof ui.data === 'object' ? (ui.data as Record<string, unknown>) : null;
  if (!ui || !data) return payload;

  switch (ui.component) {
    case 'recommendationCard':
      appendStringList(data, 'highlights', guidance);
      break;
    case 'troubleshootingCard':
      appendStringList(data, 'tips', guidance);
      break;
    case 'wiringCard':
      appendStringList(data, 'warnings', guidance);
      break;
    case 'explanationCard':
      appendStringList(data, 'keyPoints', guidance);
      break;
    case 'comparisonCard':
      appendStringList(data, 'keyDifferences', guidance);
      break;
    case 'imageBlock':
      appendStringList(data, 'notes', guidance);
      break;
    case 'specCard': {
      const existing = Array.isArray(data.optionalDetails) ? data.optionalDetails : [];
      data.optionalDetails = [
        ...existing,
        ...guidance.map((value) => ({ label: 'Safety', value })),
      ];
      break;
    }
  }

  return payload;
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
  /\b(show|pictures?|photos?|images?|see|looks?\s+like|look\s+like|what\s+does\s+.+\s+look\s+like)\b/i;
const EXPLICIT_PHOTO_REQUEST_HINTS = /\b(pictures?|photos?|images?)\b/i;
const NOT_PHOTO_HINTS = /\b(pinout|pins|wiring|wire|connect|schematic|diagram|circuit)\b/i;
const MULTI_IMAGE_HINTS =
  /\b(few|several|multiple|more|many|options|variants|images|photos|pictures)\b/i;
const PHOTO_QUERY_PHRASES =
  /\b(?:can you|could you|please|show me|show|a picture of|picture of|photo of|image of|images of|photos of|pictures of|i want images of|i want photos of|i want pictures of|i want to see|i wanna see|let me see|what does|look like|looks like)\b/g;
const PHOTO_QUERY_FILLERS =
  /\b(?:photo|photos|picture|pictures|image|images|pic|pics|a|an|the|me|please|i|want|real|relevant)\b/g;
const LOW_SIGNAL_PHOTO_QUERY =
  /^(?:it|this|that|one|ones|them|other|another|more|same|thing|things|stuff)$/i;

const PHOTO_SUBJECT_QUERIES: Array<[RegExp, string]> = [
  [
    /\b(esp32 and sensor prototyping station|esp32 sensor prototyping station|sensor prototyping station|prototyping station)\b/i,
    'esp32 breadboard jumper wires oscilloscope',
  ],
  [
    /\b(structured media panels?|network closets?|low-voltage wiring panels?|patch panels?)\b/i,
    'patch panel poe switch cable labels service loops',
  ],
  [
    /\b(electronics workbench|electronics bench|soldering station|bench power supply|oscilloscope|component drawers)\b/i,
    'pegboard oscilloscope soldering station component drawers',
  ],
];

function normalizePhotoQueryCandidate(input: string): string {
  return input
    .toLowerCase()
    .replace(/\b(?:not|no)\s+generic\b.*$/i, ' ')
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
  for (const [pattern, query] of PHOTO_SUBJECT_QUERIES) {
    if (pattern.test(input)) return query;
  }

  const candidate = normalizePhotoQueryCandidate(input).split(' ').slice(0, 4).join(' ').trim();

  if (!candidate || LOW_SIGNAL_PHOTO_QUERY.test(candidate)) {
    return null;
  }

  return candidate;
}

function tokenCount(value: string | undefined): number {
  return (value || '').split(/\s+/).filter(Boolean).length;
}

function shouldRefinePhotoQuery(candidate: string, current: string | undefined): boolean {
  if (!current) return true;
  if (candidate.toLowerCase() === current.toLowerCase()) return false;

  const currentLooksGeneric =
    /\b(diy|real|generic|modern|office|setup|setups|inspiration)\b/i.test(current) ||
    tokenCount(current) < 4;
  return currentLooksGeneric && tokenCount(candidate) >= tokenCount(current);
}

function isNamedChoiceRequest(source: string | undefined): boolean {
  const value = source || '';
  if (
    /\b(choose between|compare|vs\.?|versus|which (?:one|option|sensor|strip|is better))\b/i.test(
      value
    )
  ) {
    return true;
  }

  return /\bshould i use\b/i.test(value) && /\bor\b/i.test(value);
}

function isDesignPlanRequest(source: string | undefined): boolean {
  return /\b(help me design|design an?|layout|power plan|plan should|charging station|small rack)\b/i.test(
    source || ''
  );
}

export function refineStructuredResponseForRequest<T extends StructuredResponse>(
  payload: T,
  source: string | undefined
): StructuredResponse {
  if (payload.mode !== 'ui' || !payload.ui) return payload;

  if (payload.ui.component === 'imageBlock' && payload.ui.data.imageMode === 'photo') {
    const refined = derivePhotoQuery(source || '');
    if (refined && shouldRefinePhotoQuery(refined, payload.ui.data.searchQuery)) {
      return {
        ...payload,
        ui: {
          ...payload.ui,
          data: {
            ...payload.ui.data,
            searchQuery: refined,
          },
        },
      };
    }
  }

  if (payload.ui.component === 'recommendationCard' && isNamedChoiceRequest(source)) {
    const items = payload.ui.data.items.filter((item) => item.name.trim() && item.reason.trim());
    if (items.length >= 2) {
      return {
        ...payload,
        ui: {
          type: 'card',
          component: 'comparisonCard',
          data: {
            items: items.map((item) => item.name),
            attributes: [
              {
                name: 'Best fit',
                values: items.map((item) => item.reason),
              },
            ],
            keyDifferences: payload.ui.data.highlights.length
              ? payload.ui.data.highlights
              : items.map((item) => `${item.name}: ${item.reason}`),
            useCases: items.map((item) => ({
              item: item.name,
              useCase: item.reason,
            })),
          },
        },
        behavior: payload.behavior ?? { animation: 'slideUp', state: 'open' },
      };
    }
  }

  if (payload.ui.component === 'specCard' && isDesignPlanRequest(source)) {
    return {
      ...payload,
      ui: {
        type: 'card',
        component: 'recommendationCard',
        data: {
          items: payload.ui.data.keySpecs.map((spec) => ({
            name: spec.label,
            reason: spec.value,
          })),
          highlights: payload.ui.data.optionalDetails?.map(
            (detail) => `${detail.label}: ${detail.value}`
          ) ?? [payload.ui.data.subtitle ?? payload.ui.data.title],
        },
      },
      behavior: payload.behavior ?? { animation: 'slideUp', state: 'collapsed' },
    };
  }

  return payload;
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
  if (!PHOTO_REQUEST_HINTS.test(source)) return null;
  if (NOT_PHOTO_HINTS.test(source) && !EXPLICIT_PHOTO_REQUEST_HINTS.test(source)) return null;

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

function buildRecommendationFallbackFromRequest(
  source: string | undefined,
  inputMode: 'text' | 'voice'
): StructuredResponse | null {
  const value = source || '';
  if (
    !/\b(tool wall|tool storage|charging station|electronics bench|workbench|setup|parts|architecture|power plan|layout)\b/i.test(
      value
    )
  ) {
    return null;
  }

  const isToolWall =
    /\b(tool wall|soldering tools|crimpers?|test leads?|tweezers?|component bins?)\b/i.test(value);
  const items = isToolWall
    ? [
        {
          name: 'Soldering and hot-tool zone',
          reason:
            'Mount the iron stand, solder, flux, brass wool, and fume extractor together on a heat-resistant section.',
        },
        {
          name: 'Crimping and wire-prep zone',
          reason:
            'Keep crimpers, strippers, cutters, ferrules, terminals, heat shrink, and common wire gauges in labeled bins.',
        },
        {
          name: 'Test and handling zone',
          reason:
            'Hang test leads, tweezers, probes, clips, and adapters where they can be grabbed without tangling.',
        },
        {
          name: 'Component bins',
          reason:
            'Use shallow labeled drawers for resistors, LEDs, connectors, headers, sensors, and small modules.',
        },
      ]
    : [
        {
          name: 'Functional zones',
          reason:
            'Separate power, storage, tools, wiring, and test equipment so each workflow has a clear place.',
        },
        {
          name: 'Labeled routing',
          reason:
            'Use labels, cable ties, service loops, and strain relief so wiring remains traceable and maintainable.',
        },
        {
          name: 'Power and safety checks',
          reason:
            'Plan fusing, wire gauge, ventilation, heat clearance, and accessible disconnects before installation.',
        },
      ];

  return {
    intent: 'recommendation',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'recommendationCard',
      data: {
        items,
        highlights: [
          'Keep high-heat, high-current, storage, and test areas physically separated.',
          'Prefer labels, bins, and service loops over hidden or bundled wiring that is hard to inspect.',
        ],
      },
    },
    text: null,
    behavior: {
      animation: 'slideUp',
      state: 'collapsed',
    },
    voice:
      inputMode === 'voice'
        ? {
            spokenSummary:
              'Use separate zones for power, tools, storage, and safety-critical gear.',
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
  writeAutoresearchTrace('chat_request_received', {
    messageCount: trimmed.length,
    inputMode,
    hasVoiceTranscript: Boolean(cleanedTranscriptMeta?.cleaned),
  });

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

  const diagnostics = createAutoresearchDiagnostics();

  // Fast path: explicit "show me/photo/image" requests can skip LLM generation
  // and return a renderable image card immediately.
  if (forcedPhotoResponse) {
    logger.debug('[clitronic] Fast-path photo response');
    writeAutoresearchTrace('photo_fast_path_triggered', {
      component: forcedPhotoResponse.ui.component,
      imageCount: forcedPhotoResponse.ui.data.imageCount,
      searchQueryLength: forcedPhotoResponse.ui.data.searchQuery.length,
    });
    writeAutoresearchTrace('ui_component_selected', {
      component: forcedPhotoResponse.ui.component,
      mode: forcedPhotoResponse.mode,
    });
    const augmented = augmentSafetyGuidance(forcedPhotoResponse, requestSource);
    return jsonResponse(withAutoresearchDiagnostics(augmented, diagnostics, 'forced_photo'));
  }

  try {
    const completion = await getClient().chat.completions.create({
      model: OPENAI_CHAT_MODEL,
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
      max_tokens: OPENAI_CHAT_MAX_TOKENS,
    });

    const choice = completion.choices[0];
    const content = choice?.message?.content;
    diagnostics.raw_model_output_present = Boolean(content);
    if (!content) {
      return NextResponse.json(
        withAutoresearchDiagnostics({ error: 'No response from model.' }, diagnostics, 'error'),
        { status: 502 }
      );
    }
    try {
      JSON.parse(content);
      diagnostics.model_json_parse_success = true;
    } catch {
      diagnostics.model_json_parse_success = false;
    }

    if (choice.finish_reason === 'length') {
      logger.warn('[clitronic] Response truncated (finish_reason=length)');
    }
    writeAutoresearchTrace('model_response_received', {
      model: OPENAI_CHAT_MODEL,
      finishReason: choice.finish_reason,
      contentLength: content.length,
    });
    logger.debug('[clitronic] Raw model output:', content.substring(0, 500));

    const normalized = parseAndNormalizeResponse(content);
    const normalizedShape = getModeAndComponent(normalized);
    diagnostics.normalized_mode = normalizedShape.mode;
    diagnostics.normalized_component = normalizedShape.component;
    writeAutoresearchTrace('response_normalized', {
      success: Boolean(normalized),
      mode: typeof normalized?.mode === 'string' ? normalized.mode : undefined,
      component:
        normalized?.ui && typeof normalized.ui === 'object'
          ? String((normalized.ui as { component?: unknown }).component ?? '')
          : undefined,
    });
    if (!normalized) {
      return jsonResponse(
        withAutoresearchDiagnostics(FALLBACK_TEXT_RESPONSE, diagnostics, 'parse_fallback')
      );
    }

    const validation = validateStructuredResponseWithDiagnostics(normalized);
    const validated = validation.data;
    diagnostics.model_validation_success = validation.success;
    diagnostics.validator_issues = validation.issues;
    writeAutoresearchTrace('response_validated', {
      success: Boolean(validated),
      mode: validated?.mode,
      component: validated?.ui?.component,
    });
    if (!validated) {
      if (forcedPhotoResponse) {
        logger.warn('[clitronic] Forcing photo fallback for visual request');
        const augmented = augmentSafetyGuidance(forcedPhotoResponse, requestSource);
        return jsonResponse(withAutoresearchDiagnostics(augmented, diagnostics, 'forced_photo'));
      }
      if (normalizedShape.component === 'imageBlock') {
        const recoveredPhoto = maybeBuildPhotoFallback(
          requestSource,
          undefined,
          inputMode,
          requestedImageCount,
          trimmed.slice(0, -1)
        );
        if (recoveredPhoto) {
          logger.warn('[clitronic] Recovering invalid image response with photo fallback');
          const augmented = augmentSafetyGuidance(recoveredPhoto, requestSource);
          return jsonResponse(withAutoresearchDiagnostics(augmented, diagnostics, 'forced_photo'));
        }
      }
      if (normalizedShape.component === 'specCard') {
        const recoveredRecommendation = buildRecommendationFallbackFromRequest(
          requestSource,
          inputMode
        );
        if (recoveredRecommendation) {
          logger.warn('[clitronic] Recovering invalid spec response with recommendation fallback');
          const augmented = augmentSafetyGuidance(recoveredRecommendation, requestSource);
          return jsonResponse(
            withAutoresearchDiagnostics(augmented, diagnostics, 'render_fallback')
          );
        }
      }
      const recoveredText = toSafeTextResponse(normalized);
      if (recoveredText) {
        logger.warn('[clitronic] Falling back to recovered text response');
        return jsonResponse(
          withAutoresearchDiagnostics(recoveredText, diagnostics, 'recovered_text')
        );
      }
      return jsonResponse(
        withAutoresearchDiagnostics(RENDER_FALLBACK_TEXT_RESPONSE, diagnostics, 'render_fallback')
      );
    }

    if (
      forcedPhotoResponse &&
      (validated.mode !== 'ui' || validated.ui?.component !== 'imageBlock')
    ) {
      logger.warn('[clitronic] Overriding non-visual response with photo fallback');
      const augmented = augmentSafetyGuidance(forcedPhotoResponse, requestSource);
      return jsonResponse(withAutoresearchDiagnostics(augmented, diagnostics, 'forced_photo'));
    }

    const refined = refineStructuredResponseForRequest(validated, requestSource);

    if (
      requestedImageCount > 1 &&
      refined.mode === 'ui' &&
      refined.ui?.component === 'imageBlock' &&
      refined.ui.data &&
      typeof refined.ui.data === 'object'
    ) {
      (refined.ui.data as unknown as { imageCount?: number }).imageCount = requestedImageCount;
    }

    const safetyAugmented = augmentSafetyGuidance(refined, requestSource);
    const sanitized = sanitizeVisibleResponse(safetyAugmented);
    writeAutoresearchTrace('ui_component_selected', {
      component: sanitized.ui?.component ?? null,
      mode: sanitized.mode,
      intent: sanitized.intent,
    });
    logger.debug('[clitronic] Validated output:', JSON.stringify(sanitized).substring(0, 500));
    return jsonResponse(withAutoresearchDiagnostics(sanitized, diagnostics, 'none'));
  } catch (error) {
    logger.error('Chat API error:', error);
    return NextResponse.json(
      withAutoresearchDiagnostics(
        { error: 'Failed to generate response. Please try again.' },
        diagnostics,
        'error'
      ),
      { status: 500 }
    );
  }
}
