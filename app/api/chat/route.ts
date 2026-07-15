import { OPENAI_CHAT_MAX_TOKENS, OPENAI_CHAT_MODEL } from '@/lib/ai/openai-config';
import { validateStructuredResponseWithDiagnostics } from '@/lib/ai/response-contract';
import {
  createOpenAIClient,
  createOpenAISafetyIdentifier,
  getOpenAIServiceFailure,
  isOpenAICredentialError,
  OpenAIConfigurationError,
} from '@/lib/ai/openai-server';
import { COMPONENT_NAMES } from '@/lib/ai/component-registry';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import type { StructuredResponse } from '@/lib/ai/response-schema';
import { writeAutoresearchTrace } from '@/lib/autoresearch/trace';
import { isTrustedBrowserRequest } from '@/app/api/request-security';
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
import {
  buildUntrustedConversationRequest,
  detectInjection,
  isValidConversation,
  sanitizeInput,
} from './security';
import type { ChatRequestBody } from './types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BODY_BYTES = 128 * 1024;

const CHAT_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'clitronic_response',
    strict: false,
    schema: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        mode: { enum: ['ui', 'text'] },
        ui: {
          anyOf: [
            {
              type: 'object',
              properties: {
                type: { enum: ['card', 'chart', 'image'] },
                component: { enum: COMPONENT_NAMES },
                data: { type: 'object' },
              },
              required: ['type', 'component', 'data'],
            },
            { type: 'null' },
          ],
        },
        text: { type: ['string', 'null'] },
        behavior: {
          anyOf: [
            {
              type: 'object',
              properties: {
                animation: { enum: ['fadeIn', 'slideUp', 'expand'] },
                state: { enum: ['open', 'collapsed'] },
              },
              required: ['animation', 'state'],
            },
            { type: 'null' },
          ],
        },
        voice: {
          anyOf: [
            {
              type: 'object',
              properties: {
                spokenSummary: { type: ['string', 'null'] },
              },
            },
            { type: 'null' },
          ],
        },
      },
      required: ['intent', 'mode', 'ui', 'text', 'behavior'],
    },
  },
} as const;

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

async function readChatRequestBody(
  req: Request
): Promise<{ body: ChatRequestBody; error?: never } | { body?: never; error: Response }> {
  const mediaType = req.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return {
      error: jsonResponse({ error: 'Content-Type must be application/json.' }, { status: 415 }),
    };
  }

  const declaredLength = req.headers.get('content-length');
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_REQUEST_BODY_BYTES) {
      return {
        error: jsonResponse({ error: 'Request body is too large.' }, { status: 413 }),
      };
    }
  }

  if (!req.body) {
    return { error: jsonResponse({ error: 'Invalid JSON request.' }, { status: 400 }) };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel('request body too large');
        } catch {
          // The size boundary is already enforced even if the source cannot be cancelled.
        }
        return {
          error: jsonResponse({ error: 'Request body is too large.' }, { status: 413 }),
        };
      }
      chunks.push(value);
    }
  } catch (error) {
    const aborted = req.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    return {
      error: jsonResponse(
        { error: aborted ? 'Request cancelled.' : 'Unable to read request body.' },
        { status: aborted ? 499 : 400 }
      ),
    };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('request body must be an object');
    }
    return { body: parsed as ChatRequestBody };
  } catch {
    return { error: jsonResponse({ error: 'Invalid JSON request.' }, { status: 400 }) };
  }
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
const REAL_TECHNICAL_SCENE_HINTS =
  /\b(low-voltage wiring panels?|structured media panels?|network closets?|patch panels?|electronics workbenches?|electronics benches?|prototyping stations?)\b/i;
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

const LOW_SIGNAL_LABEL_WORDS = new Set([
  'answer',
  'basics',
  'card',
  'circuit',
  'circuits',
  'component',
  'components',
  'details',
  'device',
  'devices',
  'electronics',
  'electronic',
  'guide',
  'hardware',
  'image',
  'information',
  'item',
  'module',
  'modules',
  'option',
  'overview',
  'photo',
  'response',
  'setup',
  'system',
  'thing',
  'visual',
  'wiring',
]);

const SUBJECT_PATTERNS: Array<[RegExp, string]> = [
  [/\bled\b.*\bresistor\b|\bresistor\b.*\bled\b/i, 'LED resistor'],
  [/\besp32-cam\b/i, 'ESP32-CAM'],
  [/\besp32\b/i, 'ESP32'],
  [/\besp8266\b/i, 'ESP8266'],
  [/\barduino\s+uno\b/i, 'Arduino Uno'],
  [/\braspberry\s+pi\s+pico\s+w\b/i, 'Raspberry Pi Pico W'],
  [/\braspberry\s+pi\s+pico\b|\bpico\b/i, 'Raspberry Pi Pico'],
  [/\batmega328p\b/i, 'ATmega328P'],
  [/\bne555\b|\b555\s+timer\b/i, '555 timer'],
  [/\bbreadboard\b/i, 'Breadboard'],
  [/\bmultimeter\b/i, 'Multimeter'],
  [/\boscilloscope\b/i, 'Oscilloscope'],
  [/\bbench\s+power\s+supply\b/i, 'Bench power supply'],
  [/\bsoldering\s+(?:iron|station)\b/i, 'Soldering station'],
  [/\bvoltage\s+divider\b/i, 'Voltage divider'],
  [/\bpwm\b/i, 'PWM'],
  [/\bmosfet\b/i, 'MOSFET'],
  [/\brelay\b/i, 'Relay'],
  [/\breed\s+switch\b/i, 'Reed switch'],
  [/\btilt\s+sensor\b/i, 'Tilt sensor'],
  [/\baccelerometer\b/i, 'Accelerometer'],
  [/\boptical\s+sensor\b/i, 'Optical sensor'],
  [/\bhc[-\s]?sr04\b|\bultrasonic\s+sensor\b/i, 'HC-SR04 ultrasonic sensor'],
  [/\bmpu[-\s]?6050\b|\bimu\b/i, 'MPU-6050 IMU'],
  [/\bnema\s*17\b|\bstepper\s+motor\b/i, 'NEMA 17 stepper motor'],
  [/\bsg90\b|\bmicro\s+servo\b|\bservo\s+motor\b/i, 'SG90 micro servo'],
  [/\bl298n\b|\bmotor\s+driver\b/i, 'L298N motor driver'],
  [/\bpca9685\b|\bservo\s+driver\b/i, 'PCA9685 servo driver'],
  [/\bvl53l0x\b|\btime[-\s]?of[-\s]?flight\b|\btof\s+sensor\b/i, 'VL53L0X ToF sensor'],
];

function titleCaseSubject(value: string): string {
  const acronyms = new Set([
    'adc',
    'api',
    'awg',
    'bms',
    'dc',
    'gpio',
    'i2c',
    'ic',
    'iot',
    'led',
    'mosfet',
    'pcb',
    'pwm',
    'spi',
    'uart',
    'usb',
  ]);
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      const normalized = word.toLowerCase();
      if (acronyms.has(normalized)) return normalized.toUpperCase();
      if (/^[A-Z0-9-]{3,}$/.test(word)) return word;
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join(' ');
}

function cleanSubjectCandidate(value: string): string {
  return value
    .replace(/[?!.,;:]+$/g, '')
    .replace(/\b(?:please|thanks|thank you)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLowSignalLabel(value: string | undefined | null): boolean {
  if (!value || !value.trim()) return true;
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return true;
  if (/^option\s*\d+$/.test(normalized) || /^item\s*\d+$/.test(normalized)) return true;

  const words = normalized.split(/\s+/);
  return words.length <= 4 && words.every((word) => LOW_SIGNAL_LABEL_WORDS.has(word));
}

function normalizeOptionLabel(value: string): string | null {
  const cleaned = cleanSubjectCandidate(
    value
      .replace(/^(?:compare|between|use|choose|pick|recommend|one of)\s+/i, '')
      .replace(/^(?:a|an|the|and|or)\s+/i, '')
      .replace(/\b(?:which|should|i|we|use|is|better|best|option)\b/gi, ' ')
      .replace(/\s+/g, ' ')
  );
  if (!cleaned || cleaned.length < 2 || cleaned.length > 48) return null;
  if (/^(?:and|or|vs|versus)$/i.test(cleaned)) return null;
  return titleCaseSubject(cleaned);
}

export function extractNamedOptions(source: string | undefined): string[] {
  const value = (source || '').trim();
  if (!value) return [];

  let candidate = value;
  const compareMatch = value.match(/\bcompare\s+(.+)/i);
  if (compareMatch?.[1]) candidate = compareMatch[1];

  const betweenMatch = value.match(/\bbetween\s+(.+)/i);
  if (betweenMatch?.[1]) candidate = betweenMatch[1];

  const shouldUseMatch = value.match(/\bshould\s+i\s+use\s+(.+)/i);
  if (shouldUseMatch?.[1]) candidate = shouldUseMatch[1];

  const parts = candidate
    .replace(/\bversus\b/gi, ' vs ')
    .split(/\s+vs\.?\s+|,\s*|\s+or\s+|\s+and\s+/i)
    .map(normalizeOptionLabel)
    .filter((item): item is string => Boolean(item));

  return [...new Set(parts)].slice(0, 5);
}

export function deriveDisplaySubject(source: string | undefined): string | null {
  const value = (source || '').trim();
  if (!value) return null;

  const options = extractNamedOptions(value);
  if (options.length >= 2) return options.join(' vs ');

  for (const [pattern, subject] of SUBJECT_PATTERNS) {
    if (pattern.test(value)) return subject;
  }

  const photoQuery = derivePhotoQuery(value);
  if (photoQuery) return titleCaseSubject(photoQuery);

  const cleaned = cleanSubjectCandidate(
    value
      .replace(
        /\b(?:what|which|how|why|when|where|can|could|would|should|do|does|is|are|the|a|an|me|about|for|with|to|of|show|tell|explain|compare|wire|connect|calculate|recommend|help|design|make|build|use|need|want)\b/gi,
        ' '
      )
      .replace(/\s+/g, ' ')
  );

  if (!cleaned || isLowSignalLabel(cleaned)) return null;
  return titleCaseSubject(cleaned.split(/\s+/).slice(0, 6).join(' '));
}

function withAlignedComparisonValues(
  attributes: Array<{ name: string; values: string[] }>,
  itemCount: number
) {
  return attributes.map((attribute) => {
    const values = attribute.values.slice(0, itemCount);
    while (values.length < itemCount) values.push('-');
    return { ...attribute, values };
  });
}

export function stabilizeStructuredResponseForRequest<T extends StructuredResponse>(
  payload: T,
  source: string | undefined
): StructuredResponse {
  if (payload.mode !== 'ui' || !payload.ui) return payload;

  const subject = deriveDisplaySubject(source);
  const options = extractNamedOptions(source);

  switch (payload.ui.component) {
    case 'specCard':
      if (subject && isLowSignalLabel(payload.ui.data.title)) {
        return {
          ...payload,
          ui: { ...payload.ui, data: { ...payload.ui.data, title: subject } },
        };
      }
      break;
    case 'explanationCard':
      if (subject && isLowSignalLabel(payload.ui.data.title)) {
        return {
          ...payload,
          ui: { ...payload.ui, data: { ...payload.ui.data, title: subject } },
        };
      }
      break;
    case 'calculationCard':
      if (subject && isLowSignalLabel(payload.ui.data.title)) {
        return {
          ...payload,
          ui: { ...payload.ui, data: { ...payload.ui.data, title: subject } },
        };
      }
      break;
    case 'pinoutCard':
      if (subject && isLowSignalLabel(payload.ui.data.component)) {
        return {
          ...payload,
          ui: { ...payload.ui, data: { ...payload.ui.data, component: subject } },
        };
      }
      break;
    case 'troubleshootingCard':
      if (subject && isLowSignalLabel(payload.ui.data.issue)) {
        return {
          ...payload,
          ui: {
            ...payload.ui,
            data: { ...payload.ui.data, issue: `${subject} troubleshooting` },
          },
        };
      }
      break;
    case 'wiringCard':
      if (subject && isLowSignalLabel(payload.ui.data.title)) {
        return {
          ...payload,
          ui: { ...payload.ui, data: { ...payload.ui.data, title: `${subject} wiring` } },
        };
      }
      break;
    case 'imageBlock': {
      if (!subject) break;
      const nextData = { ...payload.ui.data };
      if (isLowSignalLabel(nextData.caption)) nextData.caption = subject;
      if (nextData.imageMode === 'photo' && isLowSignalLabel(nextData.searchQuery)) {
        nextData.searchQuery = subject.toLowerCase();
      }
      return { ...payload, ui: { ...payload.ui, data: nextData } };
    }
    case 'comparisonCard': {
      const items =
        options.length >= 2 &&
        (payload.ui.data.items.some((item) => isLowSignalLabel(item)) ||
          isNamedChoiceRequest(source) ||
          /\bcompare\b/i.test(source || ''))
          ? options
          : payload.ui.data.items;
      return {
        ...payload,
        ui: {
          ...payload.ui,
          data: {
            ...payload.ui.data,
            items,
            attributes: withAlignedComparisonValues(payload.ui.data.attributes, items.length),
            useCases: payload.ui.data.useCases?.map((useCase, index) => ({
              ...useCase,
              item: isLowSignalLabel(useCase.item) ? (items[index] ?? useCase.item) : useCase.item,
            })),
          },
        },
      };
    }
  }

  return payload;
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
  if (!isPhotoRequest(source)) return null;

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

export function isPhotoRequest(source: string): boolean {
  if (!PHOTO_REQUEST_HINTS.test(source)) return false;

  const explicitlyRequestsMedia = EXPLICIT_PHOTO_REQUEST_HINTS.test(source);
  const sceneRemainder = source.replace(REAL_TECHNICAL_SCENE_HINTS, ' ');
  const requestsInstructionsOutsideScene =
    NOT_PHOTO_HINTS.test(sceneRemainder) ||
    /\b(how to|steps?|instructions?)\b/i.test(sceneRemainder);
  const requestsRealTechnicalScene =
    /\bshow\b/i.test(source) &&
    /\breal\b/i.test(source) &&
    REAL_TECHNICAL_SCENE_HINTS.test(source) &&
    !requestsInstructionsOutsideScene;

  return !NOT_PHOTO_HINTS.test(source) || explicitlyRequestsMedia || requestsRealTechnicalScene;
}

const LED_FORWARD_VOLTAGE_BY_COLOR: Array<[RegExp, { label: string; voltage: number }]> = [
  [/\bred\b/i, { label: 'Red LED', voltage: 2 }],
  [/\b(?:green|yellow|amber|orange)\b/i, { label: 'Green/yellow LED', voltage: 2.2 }],
  [/\b(?:blue|white|cool white|warm white)\b/i, { label: 'Blue/white LED', voltage: 3.2 }],
  [/\bir\b|\binfrared\b/i, { label: 'IR LED', voltage: 1.3 }],
];

const STANDARD_RESISTORS = [
  10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82, 100, 120, 150, 180, 220, 270, 330, 390, 470, 560,
  680, 820, 1000, 1200, 1500, 1800, 2200, 2700, 3300, 3900, 4700, 5600, 6800, 8200, 10000,
];

function formatOhms(value: number): string {
  if (value >= 1000) return `${Number((value / 1000).toFixed(1))} kΩ`;
  return `${Math.round(value)} Ω`;
}

function parseSupplyVoltage(source: string): number | null {
  const match = source.match(/\b(\d+(?:\.\d+)?)\s*v(?:olts?)?\b/i);
  if (!match?.[1]) return null;
  const voltage = Number(match[1]);
  return Number.isFinite(voltage) && voltage > 0 ? voltage : null;
}

function parseLedCurrentMa(source: string): number {
  const match = source.match(/\b(\d+(?:\.\d+)?)\s*mA\b/i);
  if (!match?.[1]) return 20;
  const current = Number(match[1]);
  return Number.isFinite(current) && current > 0 ? current : 20;
}

function deriveLedForwardVoltage(source: string): { label: string; voltage: number } {
  for (const [pattern, value] of LED_FORWARD_VOLTAGE_BY_COLOR) {
    if (pattern.test(source)) return value;
  }
  return { label: 'Typical indicator LED', voltage: 2 };
}

function nearestHigherStandardResistor(ohms: number): number {
  return STANDARD_RESISTORS.find((value) => value >= ohms) ?? Math.ceil(ohms);
}

export function maybeBuildLedResistorFallback(
  source: string | undefined,
  inputMode: 'text' | 'voice'
): StructuredResponse | null {
  const value = source || '';
  if (!/\bled\b/i.test(value) || !/\b(resistors?|ohms?|current limit)\b/i.test(value)) {
    return null;
  }

  const supplyVoltage = parseSupplyVoltage(value);
  if (!supplyVoltage) return null;

  const led = deriveLedForwardVoltage(value);
  if (supplyVoltage <= led.voltage) return null;

  const currentMa = parseLedCurrentMa(value);
  const currentA = currentMa / 1000;
  const idealOhms = (supplyVoltage - led.voltage) / currentA;
  const standardOhms = nearestHigherStandardResistor(idealOhms);
  const powerWatts = (supplyVoltage - led.voltage) * currentA;

  return {
    intent: 'led_resistor_calculation',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'calculationCard',
      data: {
        title: 'LED resistor',
        formula: 'R = (Vsupply - Vf) / I',
        inputs: [
          { label: 'Supply', value: `${supplyVoltage} V` },
          { label: 'LED forward voltage', value: `${led.voltage} V (${led.label})` },
          { label: 'Target current', value: `${currentMa} mA` },
          { label: 'Calculated resistance', value: formatOhms(idealOhms) },
        ],
        result: {
          label: 'Recommended resistor',
          value: formatOhms(standardOhms),
          note: `Use at least a 1/4 W resistor; estimated resistor power is ${powerWatts.toFixed(2)} W. Pick the next higher value if you want it dimmer or safer.`,
        },
      },
    },
    text: null,
    behavior: {
      animation: 'slideUp',
      state: 'open',
    },
    voice:
      inputMode === 'voice'
        ? {
            spokenSummary: `Use about ${formatOhms(standardOhms)} in series with the LED.`,
          }
        : null,
  };
}

export function maybeBuildMainsSafetyFallback(
  source: string | undefined,
  inputMode: 'text' | 'voice'
): StructuredResponse | null {
  const value = source || '';
  const mentionsMains =
    /\b(mains|outlets?|wall power|in-wall|line voltage|120\s*v|240\s*v|smart switches?|smart relay|breaker|electrical box)\b/i.test(
      value
    );
  const asksForWork =
    /\b(wire|wiring|install|replace|connect|hook up|myself|diy|electrician|safe|code)\b/i.test(
      value
    );
  if (!mentionsMains || !asksForWork) return null;

  return {
    intent: 'mains_safety_planning',
    mode: 'ui',
    ui: {
      type: 'card',
      component: 'recommendationCard',
      data: {
        items: [
          {
            name: 'Use a licensed electrician',
            reason:
              'Mains and in-wall wiring must follow local electrical code and can create shock, fire, or insurance risk if done incorrectly.',
          },
          {
            name: 'Verify compatibility before buying parts',
            reason:
              'Check neutral availability, box depth/fill, load type, switch rating, grounding, and whether the device is listed for your region.',
          },
          {
            name: 'Keep low-voltage controls isolated',
            reason:
              'Use rated enclosures, strain relief, physical separation, and listed relay or smart-switch hardware instead of mixing bare mains and low-voltage wiring.',
          },
        ],
        highlights: [
          'Do not work live; use lockout/isolation and a rated tester.',
          'Do not follow step-by-step mains wiring advice from a chat tool.',
          'For planning, take photos of the existing box and labels, then have a licensed professional confirm line, load, neutral, ground, ratings, and local code requirements.',
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
              'Use a licensed electrician for mains wiring. I can help plan questions and parts, but not step-by-step live wiring.',
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
  if (!isTrustedBrowserRequest(req)) {
    return jsonResponse({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  }

  const ip = extractClientIp(req.headers);
  const rateCheck = checkRateLimit(ip);
  if (rateCheck.limited) {
    if (rateCheck.reason === 'daily') {
      return jsonResponse(DAILY_LIMIT_RESPONSE);
    }
    return jsonResponse({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  const parsedRequest = await readChatRequestBody(req);
  if (parsedRequest.error) return parsedRequest.error;
  const body = parsedRequest.body;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: 'No messages provided.' }, { status: 400 });
  }

  if (!isValidConversation(body.messages)) {
    return jsonResponse(
      { error: 'Messages must alternate user and assistant roles and end with a user message.' },
      { status: 400 }
    );
  }
  const messages = body.messages;

  const inputMode = body.inputMode === 'voice' ? 'voice' : 'text';
  const trimmed = messages.slice(-MAX_MESSAGES).map((msg) => ({
    ...msg,
    content: sanitizeInput(msg.content.slice(0, MAX_CONTENT_LENGTH)),
  }));
  writeAutoresearchTrace('chat_request_received', {
    messageCount: trimmed.length,
    inputMode,
    hasVoiceTranscript:
      inputMode === 'voice' &&
      typeof body.transcriptMeta?.cleaned === 'string' &&
      body.transcriptMeta.cleaned.trim().length > 0,
  });

  if (trimmed.some((message) => detectInjection(message.content))) {
    return jsonResponse(OFF_TOPIC_RESPONSE);
  }

  const lastUserMsg = trimmed.at(-1);
  const priorUserContext = trimmed.slice(0, -1).filter((message) => message.role === 'user');
  // The client already sends the cleaned transcript as the final user message.
  // transcriptMeta is untrusted diagnostic context and must never gain system-role authority.
  const requestSource = lastUserMsg?.content;
  const requestedImageCount = deriveRequestedImageCount(requestSource);
  const forcedPhotoResponse = maybeBuildPhotoFallback(
    lastUserMsg?.content,
    undefined,
    inputMode,
    requestedImageCount,
    priorUserContext
  );

  const diagnostics = createAutoresearchDiagnostics();
  const ledResistorResponse = maybeBuildLedResistorFallback(requestSource, inputMode);
  if (ledResistorResponse) {
    const augmented = augmentSafetyGuidance(ledResistorResponse, requestSource);
    return jsonResponse(withAutoresearchDiagnostics(augmented, diagnostics, 'none'));
  }

  const mainsSafetyResponse = maybeBuildMainsSafetyFallback(requestSource, inputMode);
  if (mainsSafetyResponse) {
    const augmented = augmentSafetyGuidance(mainsSafetyResponse, requestSource);
    return jsonResponse(withAutoresearchDiagnostics(augmented, diagnostics, 'none'));
  }

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
    const completion = await createOpenAIClient().chat.completions.create(
      {
        model: OPENAI_CHAT_MODEL,
        response_format: CHAT_RESPONSE_FORMAT,
        messages: [
          {
            role: 'system',
            content:
              inputMode === 'voice' ? `${SYSTEM_PROMPT}${VOICE_PROMPT_RULES}` : SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: buildUntrustedConversationRequest(trimmed),
          },
        ],
        temperature: 0.2,
        max_tokens: OPENAI_CHAT_MAX_TOKENS,
        safety_identifier: createOpenAISafetyIdentifier(ip),
      },
      { signal: req.signal }
    );

    const choice = completion.choices[0];
    const content = choice?.message?.content;
    diagnostics.raw_model_output_present = Boolean(content);
    if (!content) {
      return jsonResponse(
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
          priorUserContext
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

    const refined = stabilizeStructuredResponseForRequest(
      refineStructuredResponseForRequest(validated, requestSource),
      requestSource
    );

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
    const finalValidation = validateStructuredResponseWithDiagnostics(sanitized);
    if (!finalValidation.data) {
      logger.warn('[clitronic] Final transformed response failed validation');
      writeAutoresearchTrace('response_final_validation_failed', {
        issues: finalValidation.issues,
      });
      return jsonResponse(
        withAutoresearchDiagnostics(RENDER_FALLBACK_TEXT_RESPONSE, diagnostics, 'render_fallback')
      );
    }
    const finalPayload = finalValidation.data;
    writeAutoresearchTrace('ui_component_selected', {
      component: finalPayload.ui?.component ?? null,
      mode: finalPayload.mode,
      intent: finalPayload.intent,
    });
    logger.debug('[clitronic] Validated output:', JSON.stringify(finalPayload).substring(0, 500));
    return jsonResponse(withAutoresearchDiagnostics(finalPayload, diagnostics, 'none'));
  } catch (error) {
    if (
      req.signal.aborted ||
      (error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'APIUserAbortError'))
    ) {
      return new Response(null, {
        status: 499,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (error instanceof OpenAIConfigurationError) {
      return jsonResponse(
        withAutoresearchDiagnostics(
          { error: 'OPENAI_API_KEY is not configured.' },
          diagnostics,
          'error'
        ),
        { status: 503 }
      );
    }
    if (isOpenAICredentialError(error)) {
      return jsonResponse(
        withAutoresearchDiagnostics(
          { error: 'OpenAI rejected the configured server credential.' },
          diagnostics,
          'error'
        ),
        { status: 502 }
      );
    }
    const serviceFailure = getOpenAIServiceFailure(error);
    if (serviceFailure) {
      return jsonResponse(
        withAutoresearchDiagnostics({ error: serviceFailure.message }, diagnostics, 'error'),
        { status: serviceFailure.status }
      );
    }
    logger.error('Chat API error:', error);
    return jsonResponse(
      withAutoresearchDiagnostics(
        { error: 'Failed to generate response. Please try again.' },
        diagnostics,
        'error'
      ),
      { status: 500 }
    );
  }
}
