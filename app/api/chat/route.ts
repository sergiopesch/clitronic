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

  // AI SDK returns this when there's an underlying stream error
  if (errorMessage.includes('No output generated') || errorMessage.includes('Check the stream')) {
    return 'API request failed. Please check your API key and try again.';
  }

  return errorMessage;
}

export async function POST(req: Request) {
  // Get API key from header (user-provided) or environment variable (fallback)
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

  try {
    // Create Anthropic provider with the API key
    const anthropic = createAnthropic({ apiKey });

    const { messages } = await req.json();

    // Convert UIMessage format (with parts) to model messages format (with content)
    const modelMessages = await convertToModelMessages(messages as UIMessage[]);

    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools: electronicsTools,
      maxRetries: 2,
    });

    // Await the full response text
    const text = await result.text;

    // Check if the response indicates an error (no output means API error occurred)
    if (!text || text.includes('No output generated') || text.includes('Check the stream')) {
      // Try to get more error details
      return new Response('Error: Invalid API key. Please check your Anthropic API key.', {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    return new Response(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    // Return error as plain text so client can display it
    return new Response(`Error: ${formatError(error)}`, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
