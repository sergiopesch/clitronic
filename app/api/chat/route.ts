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

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  return (
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string'
  );
}

export async function POST(req: Request) {
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

  // Keep only recent context — less tokens = faster response
  const MAX_MESSAGES = 10;
  const MAX_CONTENT_LENGTH = 2000;
  const trimmed = messages.slice(-MAX_MESSAGES).map((msg) => ({
    ...msg,
    content: msg.content.slice(0, MAX_CONTENT_LENGTH),
  }));

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
      max_tokens: 800,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'No response from model.' }, { status: 502 });
    }

    // Validate parseable JSON
    try {
      JSON.parse(content);
    } catch {
      const fallback = JSON.stringify({
        intent: 'quick_answer',
        mode: 'text',
        ui: null,
        text: content,
        behavior: null,
      });
      return new Response(fallback, {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(content, {
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
