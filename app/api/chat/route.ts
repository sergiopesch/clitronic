import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { electronicsTools } from '@/lib/ai/tools';
import {
  parseAuthProvider,
  resolveAnthropicAuth,
  resolveOpenAIAuth,
  type AuthProviderId,
} from '@/lib/auth/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 120; // Allow longer for image processing

type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

interface TextContent {
  type: 'text';
  text: string;
}

interface ImageContent {
  type: 'image';
  image: string;
  mimeType?: ImageMimeType;
}

type ContentPart = TextContent | ImageContent;

interface Message {
  role: 'user' | 'assistant';
  content: ContentPart[];
}

interface IncomingPart {
  type: string;
  text?: string;
  image?: string;
  mimeType?: string;
  url?: string;
}

interface IncomingMessage {
  role: 'user' | 'assistant';
  parts: IncomingPart[];
}

function formatError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  if (
    msg.includes('401') ||
    msg.includes('authentication_error') ||
    msg.includes('invalid_api_key')
  ) {
    return 'Authentication failed. Please reconnect your provider.';
  }
  if (msg.includes('429') || msg.includes('rate_limit')) {
    return 'Rate limited. Please wait a moment.';
  }
  if (msg.includes('overloaded') || msg.includes('529')) {
    return 'API is busy. Please try again.';
  }
  if (msg.includes('too large') || msg.includes('payload')) {
    return 'Image is too large. Please use a smaller image.';
  }
  if (msg.includes('invalid_request') || msg.includes('Could not process')) {
    return 'Could not process the image. Please try a different format.';
  }

  return msg.length > 120 ? msg.substring(0, 120) + '...' : msg;
}

function isImageMimeType(value: string | undefined): value is ImageMimeType {
  return (
    value === 'image/jpeg' ||
    value === 'image/png' ||
    value === 'image/gif' ||
    value === 'image/webp'
  );
}

function convertMessagesForAnthropic(incoming: IncomingMessage[]): Message[] {
  return incoming.map((msg) => {
    const content: ContentPart[] = [];

    for (const part of msg.parts) {
      if (part.type === 'text' && part.text) {
        content.push({ type: 'text', text: part.text });
        continue;
      }

      if (part.type === 'image' && part.image) {
        content.push({
          type: 'image',
          image: part.image,
          mimeType: isImageMimeType(part.mimeType) ? part.mimeType : 'image/jpeg',
        });
        continue;
      }

      if (part.type === 'file' && part.url) {
        const match = part.url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          content.push({
            type: 'image',
            image: match[2] ?? '',
            mimeType: isImageMimeType(match[1]) ? match[1] : 'image/jpeg',
          });
        }
      }
    }

    return { role: msg.role, content };
  });
}

function convertMessagesForOpenAI(incoming: IncomingMessage[]): Array<Record<string, unknown>> {
  return incoming.map((msg) => {
    const contentParts: Array<Record<string, unknown>> = [];

    for (const part of msg.parts) {
      if (part.type === 'text' && part.text) {
        contentParts.push({ type: 'text', text: part.text });
        continue;
      }

      if (part.type === 'image' && part.image) {
        const mimeType = isImageMimeType(part.mimeType) ? part.mimeType : 'image/jpeg';
        contentParts.push({
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${part.image}` },
        });
        continue;
      }

      if (part.type === 'file' && part.url?.startsWith('data:image/')) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: part.url },
        });
      }
    }

    if (contentParts.length === 0) {
      return { role: msg.role, content: '' };
    }

    if (contentParts.length === 1 && contentParts[0]?.type === 'text') {
      return {
        role: msg.role,
        content: String(contentParts[0].text ?? ''),
      };
    }

    return { role: msg.role, content: contentParts };
  });
}

function getRequestedProvider(req: Request): AuthProviderId {
  return parseAuthProvider(req.headers.get('x-auth-provider')) ?? 'claude-code';
}

function streamPlainTextResponse(
  iterator: AsyncIterable<string>,
  fallbackErrorPrefix: string
): Response {
  const encoder = new TextEncoder();
  let hasContent = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of iterator) {
          if (!chunk) continue;
          hasContent = true;
          controller.enqueue(encoder.encode(chunk));
        }

        if (!hasContent) {
          controller.enqueue(encoder.encode('Error: No response generated. Please try again.'));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`Error: ${fallbackErrorPrefix}: ${formatError(error)}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function createAnthropicIterator(messages: Message[]): Promise<AsyncIterable<string>> {
  const auth = await resolveAnthropicAuth();
  const anthropic =
    auth.method === 'apiKey'
      ? createAnthropic({ apiKey: auth.token })
      : createAnthropic({ authToken: auth.token });

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    tools: electronicsTools,
    maxRetries: 2,
  });

  return {
    async *[Symbol.asyncIterator]() {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          yield part.text;
          continue;
        }

        if (part.type === 'error') {
          yield `\n\nError: ${formatError(part.error)}`;
        }
      }
    },
  };
}

async function createOpenAIIterator(
  incomingMessages: IncomingMessage[]
): Promise<AsyncIterable<string>> {
  const auth = await resolveOpenAIAuth();
  const openai = new OpenAI({ apiKey: auth.token });

  const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...convertMessagesForOpenAI(incomingMessages),
  ];

  const stream = await openai.chat.completions.create({
    model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    stream: true,
  });

  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          yield delta;
        }
      }
    },
  };
}

export async function POST(req: Request) {
  let body: { messages: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Error: Invalid JSON request', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response('Error: No messages provided', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const provider = getRequestedProvider(req);

  try {
    if (provider === 'openai-codex') {
      const iterator = await createOpenAIIterator(body.messages);
      return streamPlainTextResponse(iterator, 'OpenAI error');
    }

    const anthropicMessages = convertMessagesForAnthropic(body.messages);
    const iterator = await createAnthropicIterator(anthropicMessages);
    return streamPlainTextResponse(iterator, 'Anthropic error');
  } catch (error) {
    const status =
      error instanceof Error &&
      (error.message.includes('not found') || error.message.includes('expired'))
        ? 401
        : 500;

    return new Response(`Error: ${formatError(error)}`, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
