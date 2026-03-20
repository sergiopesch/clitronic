import { NextResponse } from 'next/server';
import {
  getLocalModelStatus,
  type LocalChatMessage,
  streamLocalChatReply,
} from '@/lib/local-llm/runtime';
import { runLocalTools } from '@/lib/local-llm/tooling';
import { createGuidedToolReply } from '@/lib/local-llm/guided-tools';
import { buildTeacherState } from '@/lib/teacher-state';

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

function chunkText(value: string) {
  const chunks = value.match(/.{1,48}(\s|$)/g);
  return chunks && chunks.length > 0 ? chunks : [value];
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
    const userMessage = messages[messages.length - 1]?.content ?? '';
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        let assistantMessage = '';

        try {
          send({ type: 'status', status });
          send({ type: 'tool-invocations', toolInvocations: toolPass.invocations });
          send({
            type: 'teacher-state',
            teacherState: buildTeacherState({
              mode: status.runtimeMode,
              userMessage,
              toolInvocations: toolPass.invocations,
            }),
          });

          if (status.runtimeMode === 'guided-tools') {
            assistantMessage = createGuidedToolReply(userMessage, toolPass.invocations);

            for (const chunk of chunkText(assistantMessage)) {
              send({ type: 'text-delta', delta: chunk });
            }
          } else {
            assistantMessage = await streamLocalChatReply(messages, {
              promptContext: toolPass.promptContext,
              onTextChunk: (chunk) => send({ type: 'text-delta', delta: chunk }),
            });
          }

          send({
            type: 'teacher-state',
            teacherState: buildTeacherState({
              mode: status.runtimeMode,
              userMessage,
              assistantMessage,
              toolInvocations: toolPass.invocations,
            }),
          });
          send({ type: 'done' });
          controller.close();
        } catch (error) {
          send({
            type: 'error',
            error: errorMessage(error),
            status: await getLocalModelStatus(),
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
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
