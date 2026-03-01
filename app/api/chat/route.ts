import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { electronicsTools } from '@/lib/ai/tools';

export const maxDuration = 60;

function formatError(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  if (
    errorMessage.includes('401') ||
    errorMessage.includes('invalid_api_key') ||
    errorMessage.includes('invalid x-api-key') ||
    errorMessage.includes('Unauthorized')
  ) {
    return 'Invalid API key. Please check your Anthropic API key.';
  }

  if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
    return 'Rate limit exceeded. Please wait and try again.';
  }

  if (errorMessage.includes('500') || errorMessage.includes('overloaded')) {
    return 'Anthropic API is currently unavailable. Please try again.';
  }

  if (errorMessage.includes('No output generated') || errorMessage.includes('Check the stream')) {
    return 'API request failed. Please check your API key and try again.';
  }

  return errorMessage;
}

export async function POST(req: Request) {
  const userApiKey = req.headers.get('x-api-key');
  const apiKey = userApiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'API key required. Please configure your Anthropic API key.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const anthropic = createAnthropic({ apiKey });

  let messages;
  try {
    messages = (await req.json()).messages;
  } catch {
    return new Response('Error: Invalid request format', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: electronicsTools,
    maxRetries: 0,
  });

  // Get iterator from text stream
  const iterator = result.textStream[Symbol.asyncIterator]();

  // Try to get first chunk to detect errors early
  let firstChunk: string;
  try {
    const first = await iterator.next();
    if (first.done) {
      // Empty response usually means auth error - the SDK doesn't throw, just ends
      return new Response('Error: Invalid API key. Please check your Anthropic API key.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    firstChunk = first.value;
  } catch (error) {
    return new Response(`Error: ${formatError(error)}`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Stream the rest of the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Enqueue first chunk immediately
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
