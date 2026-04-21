/**
 * Integration tests for POST /api/chat with a mocked OpenAI client.
 *
 * These exercise the full server-side pipeline that the pure-function tests
 * in chat-route.test.ts cannot reach: they run once the fast-path guards
 * (injection, forced photo fallback) have let the request through, and they
 * drive the normalize/validate/sanitize layers with real-looking LLM
 * outputs.
 *
 * We inject a fake client via `__setChatClientForTests` rather than mocking
 * at the module level, which keeps the tests fast and deterministic with no
 * real API key required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/chat/route';
import { __setChatClientForTests, type ChatCompletionClient } from '@/app/api/chat/openai-client';
import { __resetRateLimitMapForTests } from '@/app/api/chat/rate-limit';

type JsonRecord = Record<string, unknown>;

type CreateArgs = Parameters<ChatCompletionClient['chat']['completions']['create']>;

/**
 * Build a fake ChatCompletionClient that returns a pre-canned string content
 * and records every call made to it. Supports queuing different responses for
 * sequential calls and throwing on command.
 */
function makeFakeClient(responses: Array<string | (() => Promise<never> | never)>): {
  client: ChatCompletionClient;
  calls: CreateArgs[];
} {
  const calls: CreateArgs[] = [];
  let i = 0;
  const client: ChatCompletionClient = {
    chat: {
      completions: {
        // Signature matches OpenAI's but we only care about the first arg.
        create: (async (...args: CreateArgs) => {
          calls.push(args);
          const next = responses[Math.min(i, responses.length - 1)];
          i += 1;
          if (typeof next === 'function') return next();
          return {
            choices: [
              {
                message: { content: next, role: 'assistant' as const },
                finish_reason: 'stop' as const,
                index: 0,
                logprobs: null,
              },
            ],
            id: 'cmpl-test',
            created: 0,
            model: 'gpt-4o-mini',
            object: 'chat.completion' as const,
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        }) as ChatCompletionClient['chat']['completions']['create'],
      },
    },
  };
  return { client, calls };
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown): Promise<{ status: number; json: JsonRecord }> {
  const res = await POST(jsonRequest(body));
  const json = (await res.json()) as JsonRecord;
  return { status: res.status, json };
}

// Reset state between tests so they're independent regardless of run order.
function reset(): void {
  __setChatClientForTests(null);
  __resetRateLimitMapForTests();
}

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

test('POST /api/chat: returns a validated spec card from the LLM', async () => {
  reset();
  const { client, calls } = makeFakeClient([
    JSON.stringify({
      intent: 'spec',
      mode: 'ui',
      ui: {
        type: 'card',
        component: 'specCard',
        data: {
          title: 'ATmega328P',
          keySpecs: [
            { label: 'Clock', value: '16 MHz' },
            { label: 'Flash', value: '32 KB' },
          ],
        },
      },
      text: null,
      behavior: { animation: 'slideUp', state: 'collapsed' },
    }),
  ]);
  __setChatClientForTests(client);

  const { status, json } = await callPost({
    messages: [{ role: 'user', content: 'Tell me about the ATmega328P' }],
  });

  assert.equal(status, 200);
  assert.equal(json.mode, 'ui');
  assert.equal((json.ui as JsonRecord).component, 'specCard');

  // Verify the handler really called into the mock (not the real OpenAI).
  assert.equal(calls.length, 1);
  const body = calls[0]?.[0] as { model?: string; messages?: unknown[] };
  assert.equal(body.model, 'gpt-4o-mini');
  assert.ok(Array.isArray(body.messages));
});

test('POST /api/chat: voice mode adds a voice.spokenSummary to the response', async () => {
  reset();
  const { client } = makeFakeClient([
    JSON.stringify({
      intent: 'explain',
      mode: 'ui',
      ui: {
        type: 'card',
        component: 'explanationCard',
        data: {
          title: 'How PWM Works',
          summary: 'Pulse-width modulation simulates analog output.',
          keyPoints: ['Varies duty cycle.', 'Used for LED dimming.'],
        },
      },
      text: null,
      behavior: { animation: 'fadeIn', state: 'open' },
      voice: { spokenSummary: 'PWM varies duty cycle to control average power.' },
    }),
  ]);
  __setChatClientForTests(client);

  const { status, json } = await callPost({
    messages: [{ role: 'user', content: 'how does PWM work?' }],
    inputMode: 'voice',
  });

  assert.equal(status, 200);
  const voice = json.voice as JsonRecord | null;
  assert.ok(voice, 'voice block should be present');
  assert.equal(typeof voice!.spokenSummary, 'string');
});

// ---------------------------------------------------------------------------
// Fallbacks & error paths
// ---------------------------------------------------------------------------

test('POST /api/chat: returns FALLBACK_TEXT_RESPONSE when LLM returns unparseable JSON', async () => {
  reset();
  const { client } = makeFakeClient(['this is definitely not json, just prose']);
  __setChatClientForTests(client);

  const { status, json } = await callPost({
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.equal(status, 200);
  assert.equal(json.mode, 'text');
  assert.equal(typeof json.text, 'string');
});

test('POST /api/chat: rescues a partially-valid payload via toSafeTextResponse', async () => {
  reset();
  // Valid JSON but the structured validator will reject it (missing ui.data
  // fields). The handler should fall through to `toSafeTextResponse` and
  // return a text-mode response built from the `text` field.
  const { client } = makeFakeClient([
    JSON.stringify({
      intent: 'quick_answer',
      mode: 'ui',
      ui: { type: 'card', component: 'specCard' /* no data */ },
      text: 'A 220 ohm resistor works well for a red LED on 5V.',
    }),
  ]);
  __setChatClientForTests(client);

  const { status, json } = await callPost({
    messages: [{ role: 'user', content: 'what resistor for a red LED on 5V?' }],
  });

  assert.equal(status, 200);
  assert.equal(json.mode, 'text');
  assert.match(String(json.text), /220/);
});

test('POST /api/chat: returns fallback (not 500) when LLM call exceeds timeout', async () => {
  reset();
  // Simulate the abort: throw an error with name "AbortError", which is what
  // AbortSignal.timeout produces when the signal fires on the real client.
  const timeoutThrow = () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    throw err;
  };
  const { client } = makeFakeClient([timeoutThrow]);
  __setChatClientForTests(client);

  // Silence expected warn/error logs for a cleaner CI output.
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    const { status, json } = await callPost({
      messages: [{ role: 'user', content: 'tell me about capacitors' }],
    });
    assert.equal(status, 200);
    // Either FALLBACK_TEXT_RESPONSE (text mode) or the forced photo
    // fallback. For a non-photo request it must be text mode.
    assert.equal(json.mode, 'text');
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
});

test('POST /api/chat: returns 500 for non-timeout upstream errors', async () => {
  reset();
  const throwRandom = () => {
    throw new Error('boom');
  };
  const { client } = makeFakeClient([throwRandom]);
  __setChatClientForTests(client);

  const originalError = console.error;
  console.error = () => {};
  try {
    const { status, json } = await callPost({
      messages: [{ role: 'user', content: 'anything' }],
    });
    assert.equal(status, 500);
    assert.match(String(json.error), /failed to generate/i);
  } finally {
    console.error = originalError;
  }
});

test('POST /api/chat: reinforces imageCount > 1 after the LLM returned an imageBlock', async () => {
  reset();
  // The LLM returns an imageBlock but with imageCount=1 even though the
  // user asked for several. The handler should override to the requested
  // count (this is the branch at the bottom of route.ts).
  const { client } = makeFakeClient([
    JSON.stringify({
      intent: 'show_image',
      mode: 'ui',
      ui: {
        type: 'image',
        component: 'imageBlock',
        data: {
          imageMode: 'photo',
          searchQuery: 'breadboard',
          imageCount: 1,
          caption: 'A breadboard',
        },
      },
    }),
  ]);
  __setChatClientForTests(client);

  // The message must pass the fast-path gate (PHOTO_REQUEST_HINTS matches
  // but we want the LLM to take it, so we deliberately use a hint the
  // fast-path photo-query extractor can't resolve. Easiest: no matching
  // photo hint at all, so fast path bails and LLM runs.
  const { status, json } = await callPost({
    messages: [
      {
        role: 'user',
        content: 'I want to see several different breadboards for my project.',
      },
    ],
  });

  assert.equal(status, 200);
  const ui = json.ui as JsonRecord;
  const data = ui.data as JsonRecord;
  // "several" -> deriveRequestedImageCount === 3; override should have applied.
  assert.equal(data.imageCount, 3);
});
