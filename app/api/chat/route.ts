import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
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
import { parseAndNormalizeResponse } from './response-normalizer';
import { validateStructuredResponse } from './response-validator';
import { detectInjection, isValidMessage, sanitizeInput } from './security';

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

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
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

  const trimmed = messages.slice(-MAX_MESSAGES).map((msg) => ({
    ...msg,
    content: sanitizeInput(msg.content.slice(0, MAX_CONTENT_LENGTH)),
  }));

  const lastUserMsg = trimmed.filter((m) => m.role === 'user').pop();
  if (lastUserMsg && detectInjection(lastUserMsg.content)) {
    return jsonResponse(OFF_TOPIC_RESPONSE);
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

    if (choice.finish_reason === 'length') {
      logger.warn('[clitronic] Response truncated (finish_reason=length)');
    }
    logger.debug('[clitronic] Raw model output:', content.substring(0, 500));

    const normalized = parseAndNormalizeResponse(content);
    if (!normalized) return jsonResponse(FALLBACK_TEXT_RESPONSE);

    const validated = validateStructuredResponse(normalized);
    if (!validated) return jsonResponse(RENDER_FALLBACK_TEXT_RESPONSE);

    logger.debug('[clitronic] Validated output:', JSON.stringify(validated).substring(0, 500));
    return jsonResponse(validated);
  } catch (error) {
    logger.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response. Please try again.' },
      { status: 500 }
    );
  }
}
