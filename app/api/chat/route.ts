import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { electronicsTools } from '@/lib/ai/tools';

export const maxDuration = 60;

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

function formatError(error: unknown): string {
  const msg = error instanceof Error ? error.message : 'Unknown error';

  if (msg.includes('401') || msg.includes('invalid') || msg.includes('Unauthorized')) {
    return 'Invalid API key';
  }
  if (msg.includes('429') || msg.includes('rate')) {
    return 'Rate limit exceeded';
  }
  if (msg.includes('500') || msg.includes('overloaded')) {
    return 'API unavailable';
  }
  if (msg.includes('No output')) {
    return 'Request failed';
  }
  return msg;
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

function convertMessages(incoming: IncomingMessage[]): Message[] {
  return incoming.map((msg) => {
    const content: ContentPart[] = [];

    for (const part of msg.parts) {
      if (part.type === 'text' && part.text) {
        content.push({ type: 'text', text: part.text });
      } else if (part.type === 'image' && part.image) {
        content.push({
          type: 'image',
          image: part.image,
          mimeType: (part.mimeType || 'image/jpeg') as ImageMimeType,
        });
      } else if (part.type === 'file' && part.url) {
        const match = part.url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          content.push({
            type: 'image',
            image: match[2],
            mimeType: (match[1] || 'image/jpeg') as ImageMimeType,
          });
        }
      }
    }

    return { role: msg.role, content };
  });
}

export async function POST(req: Request) {
  const userApiKey = req.headers.get('x-api-key');
  const apiKey = userApiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { messages: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Error: Invalid request', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const anthropic = createAnthropic({ apiKey });
  const messages = convertMessages(body.messages);

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    tools: electronicsTools,
    maxRetries: 0,
  });

  const iterator = result.textStream[Symbol.asyncIterator]();

  // Get first chunk to detect errors early
  let firstChunk: string;
  try {
    const first = await iterator.next();
    if (first.done) {
      return new Response('Error: Invalid API key', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    firstChunk = first.value;
  } catch (error) {
    return new Response(`Error: ${formatError(error)}`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(firstChunk));
    },
    async pull(controller) {
      try {
        const { done, value } = await iterator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(encoder.encode(value));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`\nError: ${formatError(error)}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
