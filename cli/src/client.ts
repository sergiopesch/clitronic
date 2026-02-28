import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { SYSTEM_PROMPT } from './system-prompt.js';

let _client: Anthropic | null = null;

// Lazy initialization - only create client when needed
function getClient(): Anthropic {
  if (_client) return _client;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('\nError: ANTHROPIC_API_KEY environment variable is not set.'));
    console.error(chalk.gray('\nTo fix this:'));
    console.error(chalk.gray('  1. Get an API key from https://console.anthropic.com/'));
    console.error(chalk.gray('  2. Set it in your environment:'));
    console.error(chalk.cyan('     export ANTHROPIC_API_KEY=your_key_here\n'));
    process.exit(1);
  }

  _client = new Anthropic();
  return _client;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.MessageCreateParams['messages'][0]['content'];
}

export async function streamChat(
  messages: ChatMessage[],
  onText: (text: string) => void
): Promise<string> {
  const client = getClient();
  let fullText = '';

  try {
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
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error(chalk.red('\nAuthentication failed. Check your ANTHROPIC_API_KEY.'));
      process.exit(1);
    }
    throw error;
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

  if (!fs.existsSync(absPath)) {
    console.error(chalk.red(`\nError: File not found: ${absPath}`));
    process.exit(1);
  }

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
