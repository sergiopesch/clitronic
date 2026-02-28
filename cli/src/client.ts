import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './system-prompt.js';

const client = new Anthropic();

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.MessageCreateParams['messages'][0]['content'];
}

export async function streamChat(
  messages: ChatMessage[],
  onText: (text: string) => void
): Promise<string> {
  let fullText = '';

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: messages as Anthropic.MessageCreateParams['messages'],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onText(event.delta.text);
      fullText += event.delta.text;
    }
  }

  return fullText;
}

export async function identifyImage(
  imagePath: string,
  onText: (text: string) => void
): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const absPath = path.resolve(imagePath);
  const imageBuffer = fs.readFileSync(absPath);
  const base64 = imageBuffer.toString('base64');

  const ext = path.extname(absPath).toLowerCase();
  const mediaType =
    ext === '.png'
      ? 'image/png'
      : ext === '.gif'
        ? 'image/gif'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';

  return streamChat(
    [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'Identify this electronic component. Tell me what it is, its key specifications, how to use it, and any tips. If you can read any markings or color codes, decode them.',
          },
        ],
      },
    ],
    onText
  );
}
