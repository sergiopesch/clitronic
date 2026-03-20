import { NextResponse } from 'next/server';
import {
  generateLocalChatReply,
  getLocalModelStatus,
  type LocalChatMessage,
} from '@/lib/local-llm/runtime';
import { runLocalTools } from '@/lib/local-llm/tooling';
import { createVercelFallbackReply } from '@/lib/local-llm/vercel-fallback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isValidMessage(value: unknown): value is LocalChatMessage {
  if (!value || typeof value !== 'object') return false;

  const maybeMessage = value as Record<string, unknown>;
  return (
    (maybeMessage.role === 'user' || maybeMessage.role === 'assistant') &&
    typeof maybeMessage.content === 'string'
  );
}

export async function GET() {
  const status = await getLocalModelStatus();
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  let body: { messages?: unknown };

  try {
    body = (await req.json()) as { messages?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'No chat messages were provided.' }, { status: 400 });
  }

  const messages = body.messages.filter(isValidMessage);
  if (messages.length !== body.messages.length) {
    return NextResponse.json({ error: 'One or more messages were malformed.' }, { status: 400 });
  }

  try {
    const toolPass = runLocalTools(messages[messages.length - 1]?.content ?? '');
    const status = await getLocalModelStatus();

    const message =
      status.runtimeMode === 'vercel-fallback'
        ? createVercelFallbackReply(
            messages[messages.length - 1]?.content ?? '',
            toolPass.invocations
          )
        : await generateLocalChatReply(messages, {
            promptContext: toolPass.promptContext,
          });

    return NextResponse.json({
      message,
      status,
      toolInvocations: toolPass.invocations,
    });
  } catch (error) {
    const status = await getLocalModelStatus();

    return NextResponse.json(
      {
        error: errorMessage(error),
        status,
      },
      { status: 500 }
    );
  }
}
