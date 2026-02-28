import { anthropic } from '@ai-sdk/anthropic';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { electronicsTools } from '@/lib/ai/tools';

export const maxDuration = 60;

export async function POST(req: Request) {
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
