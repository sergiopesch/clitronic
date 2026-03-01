import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { electronicsTools } from '@/lib/ai/tools';

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

function formatError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Log the full error for debugging
  console.error('API Error:', error);

  if (msg.includes('401') || msg.includes('authentication_error')) {
    return 'Invalid API key. Please check your key.';
  }
  if (msg.includes('invalid_api_key') || msg.includes('invalid x-api-key')) {
    return 'Invalid API key format.';
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

  // Return a user-friendly message for unknown errors
  return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
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
        // Direct base64 image data
        content.push({
          type: 'image',
          image: part.image,
          mimeType: (part.mimeType || 'image/jpeg') as ImageMimeType,
        });
      } else if (part.type === 'file' && part.url) {
        // Data URL format
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
  // Check for API key in header or environment
  const userApiKey = req.headers.get('x-api-key');
  const apiKey = userApiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'API key required. Set ANTHROPIC_API_KEY or provide one.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

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

  const anthropic = createAnthropic({ apiKey });
  const messages = convertMessages(body.messages);

  // Log what we're sending (without the actual image data)
  console.log('Sending messages:', messages.map(m => ({
    role: m.role,
    content: m.content.map(c => c.type === 'image' ? { type: 'image', size: c.image.length } : c)
  })));

  try {
    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      tools: electronicsTools,
      maxRetries: 1,
    });

    const iterator = result.textStream[Symbol.asyncIterator]();

    // Try to get first chunk
    let firstChunk: string;
    try {
      const first = await iterator.next();
      if (first.done) {
        // Empty response - could be various reasons
        console.error('Empty stream response');
        return new Response('Error: No response from API. The image might be unsupported or too large.', {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      firstChunk = first.value;
    } catch (error) {
      console.error('Stream error:', error);
      const errorMsg = formatError(error);
      // Return 401 for auth errors so client can prompt for key
      const status = errorMsg.includes('API key') ? 401 : 500;
      return new Response(`Error: ${errorMsg}`, {
        status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Stream the response
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
          console.error('Stream pull error:', error);
          controller.enqueue(encoder.encode(`\n\nError: ${formatError(error)}`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error('API call error:', error);
    return new Response(`Error: ${formatError(error)}`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
