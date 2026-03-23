import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let _openai: OpenAI | null = null;
function getClient() {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/* ── Input validation ── */

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  return (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string';
}

/**
 * Sanitize user input:
 * - Strip control characters (except newline/tab)
 * - Collapse excessive whitespace
 * - Remove null bytes
 */
function sanitizeInput(text: string): string {
  return text
    .replace(/\0/g, '') // null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars (keep \n \t \r)
    .replace(/\n{4,}/g, '\n\n\n') // collapse excessive newlines
    .replace(/ {4,}/g, '   ') // collapse excessive spaces
    .trim();
}

/**
 * Detect common prompt injection patterns.
 * Returns true if the input looks suspicious.
 */
function detectInjection(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    // Direct instruction override attempts
    /ignore\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions|prompts|rules)/i,
    /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts)/i,
    /forget\s+(all\s+)?(your|the|previous)\s+(instructions|rules|prompts)/i,
    /override\s+(system|your)\s+(prompt|instructions|rules)/i,
    // Role hijacking
    /you\s+are\s+now\s+(a|an|the)\s+/i,
    /act\s+as\s+(a|an|if)\s+/i,
    /pretend\s+(to\s+be|you\s+are)/i,
    /new\s+system\s+prompt/i,
    /enter\s+(developer|debug|admin|god)\s+mode/i,
    // Prompt extraction
    /reveal\s+(your|the|system)\s+(prompt|instructions)/i,
    /show\s+me\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
    /what\s+are\s+your\s+(system\s+)?(instructions|rules|prompt)/i,
    /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
    /print\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
    // Delimiter injection
    /\[system\]/i,
    /\[assistant\]/i,
    /<<\s*sys/i,
    /<\|im_start\|>/i,
    /```system/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(lower)) return true;
  }

  // Heuristic: message has an unusually high ratio of instruction-like language
  const instructionWords = [
    'instruction',
    'prompt',
    'system',
    'override',
    'ignore',
    'disregard',
    'bypass',
    'jailbreak',
    'DAN',
    'developer mode',
  ];
  const hits = instructionWords.filter((w) => lower.includes(w)).length;
  if (hits >= 3) return true;

  return false;
}

/* ── Output validation ── */

const VALID_COMPONENTS = new Set([
  'specCard',
  'comparisonCard',
  'explanationCard',
  'imageBlock',
  'recommendationCard',
  'troubleshootingCard',
  'calculationCard',
  'pinoutCard',
  'chartCard',
  'wiringCard',
]);

/** Map common LLM mistakes in component names to the correct name */
const COMPONENT_ALIASES: Record<string, string> = {
  // imageBlock confusions — LLM uses imageMode value as component
  photo: 'imageBlock',
  diagram: 'imageBlock',
  image: 'imageBlock',
  image_block: 'imageBlock',
  imageblock: 'imageBlock',
  // specCard variants
  spec: 'specCard',
  spec_card: 'specCard',
  speccard: 'specCard',
  specs: 'specCard',
  // comparisonCard variants
  comparison: 'comparisonCard',
  comparison_card: 'comparisonCard',
  comparisoncard: 'comparisonCard',
  compare: 'comparisonCard',
  // explanationCard variants
  explanation: 'explanationCard',
  explanation_card: 'explanationCard',
  explanationcard: 'explanationCard',
  explain: 'explanationCard',
  // recommendationCard variants
  recommendation: 'recommendationCard',
  recommendation_card: 'recommendationCard',
  recommendationcard: 'recommendationCard',
  // troubleshootingCard variants
  troubleshooting: 'troubleshootingCard',
  troubleshooting_card: 'troubleshootingCard',
  troubleshootingcard: 'troubleshootingCard',
  // calculationCard variants
  calculation: 'calculationCard',
  calculation_card: 'calculationCard',
  calculationcard: 'calculationCard',
  // pinoutCard variants
  pinout: 'pinoutCard',
  pinout_card: 'pinoutCard',
  pinoutcard: 'pinoutCard',
  // chartCard variants
  chart: 'chartCard',
  chart_card: 'chartCard',
  chartcard: 'chartCard',
  // wiringCard variants
  wiring: 'wiringCard',
  wiring_card: 'wiringCard',
  wiringcard: 'wiringCard',
};

const VALID_MODES = new Set(['ui', 'text']);

/**
 * Resolve a component name from raw string (exact match, alias, or null).
 */
function resolveComponent(name: unknown): string | null {
  if (typeof name !== 'string' || !name) return null;
  if (VALID_COMPONENTS.has(name)) return name;
  return COMPONENT_ALIASES[name] ?? COMPONENT_ALIASES[name.toLowerCase()] ?? null;
}

/**
 * Last-resort: detect the component from the data shape when name resolution fails.
 * Checks for signature fields unique to each component.
 */
function detectComponentFromData(data: Record<string, unknown>): string | null {
  if ('imageMode' in data || 'searchQuery' in data || 'diagramType' in data) return 'imageBlock';
  if ('keySpecs' in data) return 'specCard';
  if ('attributes' in data && 'items' in data) return 'comparisonCard';
  if ('keyPoints' in data) return 'explanationCard';
  if ('bars' in data) return 'chartCard';
  if ('pins' in data) return 'pinoutCard';
  if ('issue' in data && 'steps' in data) return 'troubleshootingCard';
  if ('formula' in data && 'result' in data) return 'calculationCard';
  if ('steps' in data && Array.isArray(data.steps) && data.steps.length > 0) {
    const first = data.steps[0] as Record<string, unknown> | undefined;
    if (first && ('from' in first || 'wire' in first)) return 'wiringCard';
  }
  if ('highlights' in data) return 'recommendationCard';
  return null;
}

/**
 * Extract card data fields from an object, ignoring structural keys.
 */
function extractDataFields(
  obj: Record<string, unknown>,
  ignore: Set<string>
): Record<string, unknown> | null {
  const extracted: Record<string, unknown> = {};
  let hasFields = false;
  for (const [key, value] of Object.entries(obj)) {
    if (!ignore.has(key)) {
      extracted[key] = value;
      hasFields = true;
    }
  }
  return hasFields ? extracted : null;
}

/**
 * Validate and sanitize the model's JSON response.
 *
 * Handles 3 LLM response shapes:
 *   1. Correct:  { ui: { component, data: {...} } }
 *   2. Flat-ui:  { ui: { component, title, keySpecs, ... } }  (data at ui level)
 *   3. Flat-root: { intent: "specCard", title, keySpecs, ... } (no ui wrapper at all)
 */
function validateResponse(raw: string): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return JSON.stringify({
      intent: 'quick_answer',
      mode: 'text',
      ui: null,
      text: 'Sorry, I had trouble processing that. Could you rephrase?',
      behavior: null,
    });
  }

  // ── Shape 3: Completely flat — no ui wrapper at all ──
  if (!parsed.ui || typeof parsed.ui !== 'object') {
    const ignore = new Set(['intent', 'mode', 'text', 'behavior', 'component', 'type', 'ui']);
    const data = extractDataFields(parsed, ignore);

    // Try resolving component name first, then detect from data shape
    const componentFromName = resolveComponent(parsed.intent) ?? resolveComponent(parsed.component);
    const component = componentFromName ?? (data ? detectComponentFromData(data) : null);

    if (component && data) {
      console.log(`[clitronic] Reconstructed flat response → component "${component}"`);
      parsed.ui = { type: 'card', component, data };
      parsed.mode = 'ui';
      for (const key of Object.keys(data)) {
        delete parsed[key];
      }
    }
  }

  // ── Shape 1 & 2: ui block exists ──
  if (parsed.ui && typeof parsed.ui === 'object') {
    const ui = parsed.ui as Record<string, unknown>;

    // Normalize component name
    const resolved = resolveComponent(ui.component);
    if (resolved) {
      if (resolved !== ui.component) {
        console.log(`[clitronic] Normalized component "${String(ui.component)}" → "${resolved}"`);
      }
      ui.component = resolved;
    }

    if (!resolved) {
      // Try detecting component from data shape
      const dataObj = (ui.data && typeof ui.data === 'object' ? ui.data : ui) as Record<
        string,
        unknown
      >;
      const detected = detectComponentFromData(dataObj);
      if (detected) {
        console.log(
          `[clitronic] Detected component from data shape: "${String(ui.component)}" → "${detected}"`
        );
        ui.component = detected;
        // If data was at ui level, rescue it
        if (!ui.data || typeof ui.data !== 'object') {
          const ignore = new Set(['type', 'component', 'data']);
          const data = extractDataFields(ui, ignore);
          if (data) {
            ui.data = data;
            for (const key of Object.keys(data)) delete ui[key];
          }
        }
      } else {
        console.warn(`[clitronic] Unknown component: "${String(ui.component)}"`);
        parsed.mode = 'text';
        parsed.ui = null;
        if (!parsed.text) {
          parsed.text = 'Sorry, I had trouble rendering that. Could you rephrase?';
        }
      }
    } else if (!ui.data || typeof ui.data !== 'object') {
      // Shape 2: data fields at ui level — rescue them
      const ignore = new Set(['type', 'component', 'data']);
      const data = extractDataFields(ui, ignore);

      if (data) {
        ui.data = data;
        for (const key of Object.keys(data)) {
          delete ui[key];
        }
        console.log('[clitronic] Rescued flattened ui.data');
      } else {
        parsed.mode = 'text';
        parsed.ui = null;
        if (!parsed.text) {
          parsed.text = 'Sorry, I had trouble rendering that. Could you rephrase?';
        }
      }
    }
  }

  // Ensure mode is valid
  if (!VALID_MODES.has(parsed.mode as string)) {
    parsed.mode = parsed.ui ? 'ui' : 'text';
  }

  // Strip any system prompt leakage from text fields
  const textContent = typeof parsed.text === 'string' ? parsed.text : '';
  if (textContent.toLowerCase().includes('system prompt') || textContent.includes('SECURITY')) {
    parsed.text = 'I can only help with electronics questions. What would you like to know?';
  }

  return JSON.stringify(parsed);
}

/* ── Rate limiting (in-memory, per-IP, dual window) ── */

interface RateEntry {
  minuteCount: number;
  minuteResetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

const rateMap = new Map<string, RateEntry>();

const MINUTE_WINDOW_MS = 60_000;
const MINUTE_LIMIT = 20;
const DAILY_WINDOW_MS = 86_400_000; // 24 hours
const DAILY_LIMIT = Number(process.env.DAILY_RATE_LIMIT) || 20;

function checkRateLimit(ip: string): { limited: boolean; reason?: string } {
  const now = Date.now();
  let entry = rateMap.get(ip);

  if (!entry) {
    entry = {
      minuteCount: 0,
      minuteResetAt: now + MINUTE_WINDOW_MS,
      dailyCount: 0,
      dailyResetAt: now + DAILY_WINDOW_MS,
    };
    rateMap.set(ip, entry);
  }

  // Reset minute window if expired
  if (now > entry.minuteResetAt) {
    entry.minuteCount = 0;
    entry.minuteResetAt = now + MINUTE_WINDOW_MS;
  }

  // Reset daily window if expired
  if (now > entry.dailyResetAt) {
    entry.dailyCount = 0;
    entry.dailyResetAt = now + DAILY_WINDOW_MS;
  }

  entry.minuteCount++;
  entry.dailyCount++;

  if (entry.dailyCount > DAILY_LIMIT) {
    return { limited: true, reason: 'daily' };
  }
  if (entry.minuteCount > MINUTE_LIMIT) {
    return { limited: true, reason: 'minute' };
  }

  return { limited: false };
}

// Clean up stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateMap) {
      if (now > entry.dailyResetAt) rateMap.delete(ip);
    }
  }, 5 * 60_000);
}

/* ── Off-topic response ── */

const OFF_TOPIC_RESPONSE = JSON.stringify({
  intent: 'off_topic',
  mode: 'text',
  ui: null,
  text: 'I only help with electronics and hardware topics. Try asking me about circuits, components, microcontrollers, or anything maker-related!',
  behavior: null,
});

/* ── Main handler ── */

export async function POST(req: Request) {
  // Rate limiting (per-minute + daily)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateCheck = checkRateLimit(ip);
  if (rateCheck.limited) {
    if (rateCheck.reason === 'daily') {
      // Return a structured response so the UI renders it nicely
      const dailyLimitResponse = JSON.stringify({
        intent: 'rate_limit',
        mode: 'text',
        ui: null,
        text: "Thanks for testing Clitronic! You've hit the daily limit, but you can come back tomorrow for more. If you're interested in collaborating, reach out on X @sergiopesch — would love to hear from you. Cheers!",
        behavior: null,
      });
      return new Response(dailyLimitResponse, {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  let body: { messages?: unknown };

  try {
    body = (await req.json()) as { messages?: unknown };
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

  // Sanitize and check latest user message for injection
  const MAX_MESSAGES = 10;
  const MAX_CONTENT_LENGTH = 2000;
  const trimmed = messages.slice(-MAX_MESSAGES).map((msg) => ({
    ...msg,
    content: sanitizeInput(msg.content.slice(0, MAX_CONTENT_LENGTH)),
  }));

  // Check the latest user message for injection patterns
  const lastUserMsg = trimmed.filter((m) => m.role === 'user').pop();
  if (lastUserMsg && detectInjection(lastUserMsg.content)) {
    return new Response(OFF_TOPIC_RESPONSE, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...trimmed.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      ],
      temperature: 0.4,
      max_tokens: 1200,
    });

    const choice = completion.choices[0];
    const content = choice?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'No response from model.' }, { status: 502 });
    }

    // Log model output for debugging
    if (choice.finish_reason === 'length') {
      console.warn('[clitronic] Response truncated (finish_reason=length)');
    }
    console.log('[clitronic] Raw model output:', content.substring(0, 500));

    // Validate and sanitize the response
    const validated = validateResponse(content);
    console.log('[clitronic] Validated output:', validated.substring(0, 500));

    return new Response(validated, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response. Please try again.' },
      { status: 500 }
    );
  }
}
