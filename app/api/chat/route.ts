import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { electronicsTools } from '@/lib/ai/tools';

export const maxDuration = 60;

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

  return result.toUIMessageStreamResponse();
}
