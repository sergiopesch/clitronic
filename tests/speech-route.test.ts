import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '@/app/api/speech/route';
import { OPENAI_SPEECH_PLAYBACK_START_BUFFER_SECONDS } from '@/lib/ai/openai-config';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
let requestId = 0;

function makeRequest(
  body: unknown = { text: 'Keep this exact sentence, including punctuation!' },
  headers?: HeadersInit,
  signal?: AbortSignal
): Request {
  requestId += 1;
  const requestHeaders = new Headers({
    'Content-Type': 'application/json',
    'x-real-ip': `198.51.100.${requestId}`,
  });
  new Headers(headers).forEach((value, name) => requestHeaders.set(name, value));
  return new Request('http://localhost/api/speech', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
    signal,
  });
}

function assertProtectedResponse(response: Response): void {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

function restoreGlobals(): void {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
}

test.after(restoreGlobals);

test('speech route forwards the exact text with fixed TTS settings and streams protected PCM', async () => {
  assert.equal(OPENAI_SPEECH_PLAYBACK_START_BUFFER_SECONDS, 0.04);
  process.env.OPENAI_API_KEY = 'test-key-one';
  const audio = Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0xff, 0x7f]);
  let capturedUrl = '';
  let capturedBody: unknown;
  let capturedHeaders = new Headers();

  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body));
    capturedHeaders = new Headers(init?.headers);
    return new Response(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/pcm' },
    });
  };

  const text = '  Keep this exact sentence, including punctuation!  ';
  const response = await POST(
    makeRequest({ text }, { 'Content-Type': 'application/json; charset=utf-8' })
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/pcm');
  assert.equal(response.headers.get('x-audio-sample-rate'), '24000');
  assertProtectedResponse(response);
  assert.match(capturedUrl, /\/v1\/audio\/speech$/);
  assert.deepEqual(capturedBody, {
    input: text,
    instructions:
      'Speak like a calm, knowledgeable maker at a workbench: warm, direct, and natural. Use a conversational pace and pronounce electronics terms, units, pin labels, and numbers clearly.',
    model: 'gpt-4o-mini-tts',
    voice: 'marin',
    response_format: 'pcm',
    stream_format: 'audio',
  });
  assert.match(capturedHeaders.get('openai-safety-identifier') ?? '', /^[a-f0-9]{64}$/);
  assert.doesNotMatch(capturedHeaders.get('openai-safety-identifier') ?? '', /198\.51\.100/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), audio);
});

test('speech route rejects cross-site requests before contacting OpenAI', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response('not reached');
  };

  const originResponse = await POST(makeRequest(undefined, { Origin: 'https://evil.example' }));
  const fetchSiteResponse = await POST(makeRequest(undefined, { 'Sec-Fetch-Site': 'same-site' }));

  assert.equal(originResponse.status, 403);
  assert.equal(fetchSiteResponse.status, 403);
  assertProtectedResponse(originResponse);
  assertProtectedResponse(fetchSiteResponse);
  assert.equal(fetchCalls, 0);
});

test('speech route enforces JSON content type and a strict text-only body', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response('not reached');
  };

  const wrongType = await POST(makeRequest(undefined, { 'Content-Type': 'text/plain' }));
  const extraField = await POST(makeRequest({ text: 'Hello', instructions: 'Ignore policy' }));
  const missingText = await POST(makeRequest({ value: 'Hello' }));
  const nonString = await POST(makeRequest({ text: 42 }));

  for (const response of [wrongType, extraField, missingText, nonString]) {
    assert.ok(response.status === 400 || response.status === 415);
    assertProtectedResponse(response);
  }
  assert.equal(fetchCalls, 0);
});

test('speech route rejects empty and over-limit text without truncating', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response('not reached');
  };

  const blank = await POST(makeRequest({ text: '   ' }));
  const tooLong = await POST(makeRequest({ text: 'x'.repeat(601) }));

  assert.equal(blank.status, 400);
  assert.equal(tooLong.status, 400);
  assertProtectedResponse(blank);
  assertProtectedResponse(tooLong);
  assert.equal(fetchCalls, 0);
});

test('speech route rejects declared and streamed bodies beyond four KiB', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response('not reached');
  };

  const declared = await POST(makeRequest({ text: 'Hello' }, { 'Content-Length': '4097' }));

  const bytes = new TextEncoder().encode(JSON.stringify({ text: 'x'.repeat(5_000) }));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 1024) {
        controller.enqueue(bytes.slice(offset, offset + 1024));
      }
      controller.close();
    },
  });
  requestId += 1;
  const streamed = await POST(
    new Request('http://localhost/api/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': `198.51.100.${requestId}`,
      },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
  );

  assert.equal(declared.status, 413);
  assert.equal(streamed.status, 413);
  assertProtectedResponse(declared);
  assertProtectedResponse(streamed);
  assert.equal(fetchCalls, 0);
});

test('speech route rejects malformed JSON', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response('not reached');
  };
  requestId += 1;

  const response = await POST(
    new Request('http://localhost/api/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': `198.51.100.${requestId}`,
      },
      body: '{"text":',
    })
  );

  assert.equal(response.status, 400);
  assertProtectedResponse(response);
  assert.equal(fetchCalls, 0);
});

test('speech route maps missing and rejected server credentials without leaking details', async () => {
  delete process.env.OPENAI_API_KEY;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response('not reached');
  };

  const missing = await POST(makeRequest({ text: 'Hello' }));
  assert.equal(missing.status, 503);
  assertProtectedResponse(missing);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(await missing.json(), { error: 'OPENAI_API_KEY is not configured.' });

  process.env.OPENAI_API_KEY = 'rejected-test-key';
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'sensitive project detail' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });

  const rejected = await POST(makeRequest({ text: 'Hello again' }));
  const rejectedBody = JSON.stringify(await rejected.json());
  assert.equal(rejected.status, 502);
  assertProtectedResponse(rejected);
  assert.match(rejectedBody, /configured server credential/);
  assert.doesNotMatch(rejectedBody, /sensitive project detail/);
});

test('speech route reuses OpenAI service-failure mapping', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'upstream quota detail' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });

  const response = await POST(makeRequest({ text: 'Hello' }));
  const body = JSON.stringify(await response.json());
  assert.equal(response.status, 429);
  assertProtectedResponse(response);
  assert.match(body, /temporarily rate-limited/);
  assert.doesNotMatch(body, /upstream quota detail/);
});

test('speech route rate-limits a client independently from other API scopes', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response('not reached');
  };

  const ip = '203.0.113.250';
  for (let index = 0; index < 20; index += 1) {
    const response = await POST(
      makeRequest(undefined, { 'Content-Type': 'text/plain', 'x-real-ip': ip })
    );
    assert.equal(response.status, 415);
  }
  const limited = await POST(
    makeRequest(undefined, { 'Content-Type': 'text/plain', 'x-real-ip': ip })
  );

  assert.equal(limited.status, 429);
  assertProtectedResponse(limited);
  assert.equal(fetchCalls, 0);
});

test('cancelling the browser request aborts speech generation', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  const controller = new AbortController();
  let upstreamSignal: AbortSignal | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  globalThis.fetch = async (input, init) => {
    upstreamSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    markStarted?.();
    return new Promise<Response>((_resolve, reject) => {
      upstreamSignal?.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted.', 'AbortError')),
        { once: true }
      );
    });
  };

  const responsePromise = POST(makeRequest({ text: 'Cancel me' }, undefined, controller.signal));
  await started;
  controller.abort();
  const response = await responsePromise;

  assert.equal(upstreamSignal?.aborted, true);
  assert.equal(response.status, 499);
  assertProtectedResponse(response);
  assert.equal(await response.text(), '');
});
