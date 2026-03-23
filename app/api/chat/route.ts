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

const VALID_MODES = new Set(['ui', 'text']);

/**
 * Validate and sanitize the model's JSON response.
 * Ensures it matches our schema and doesn't leak system info.
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

  // Ensure mode is valid
  if (!VALID_MODES.has(parsed.mode as string)) {
    parsed.mode = parsed.ui ? 'ui' : 'text';
  }

  // Validate UI block if present
  if (parsed.ui && typeof parsed.ui === 'object') {
    const ui = parsed.ui as Record<string, unknown>;

    if (!VALID_COMPONENTS.has(ui.component as string)) {
      // Unknown component — fall back to text
      parsed.mode = 'text';
      parsed.ui = null;
      if (!parsed.text) {
        parsed.text = 'Sorry, I had trouble rendering that. Could you rephrase?';
      }
    } else if (!ui.data || typeof ui.data !== 'object') {
      // LLM likely flattened the structure — rescue data fields from ui level
      const reserved = new Set(['type', 'component', 'data']);
      const extracted: Record<string, unknown> = {};
      let hasFields = false;
      for (const [key, value] of Object.entries(ui)) {
        if (!reserved.has(key)) {
          extracted[key] = value;
          hasFields = true;
        }
      }
      if (hasFields) {
        // Reconstruct the correct shape
        ui.data = extracted;
        // Clean up flattened fields from ui level
        for (const key of Object.keys(extracted)) {
          delete ui[key];
        }
        console.log(
          '[clitronic] Rescued flattened ui.data:',
          JSON.stringify(extracted).substring(0, 300)
        );
      } else {
        // Truly empty — fall back to text
        parsed.mode = 'text';
        parsed.ui = null;
        if (!parsed.text) {
          parsed.text = 'Sorry, I had trouble rendering that. Could you rephrase?';
        }
      }
    }
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
    const message =
      rateCheck.reason === 'daily'
        ? "You've reached the daily limit. Come back tomorrow to keep exploring!"
        : 'Too many requests. Please wait a moment.';
    return NextResponse.json({ error: message }, { status: 429 });
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
