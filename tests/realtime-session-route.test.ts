import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/realtime/session/route';
import {
  OPENAI_REALTIME_CLIENT_SECRET_CONFIG,
  OPENAI_REALTIME_CLIENT_SECRETS_URL,
} from '@/lib/ai/openai-config';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
let requestId = 0;

function makeRequest(headers?: HeadersInit): Request {
  requestId += 1;
  return new Request('http://localhost/api/realtime/session', {
    method: 'POST',
    headers: {
      'x-real-ip': `198.51.100.${requestId}`,
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function restoreGlobals() {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
}

test.after(restoreGlobals);

test('realtime session rejects a missing key without calling OpenAI', async () => {
  delete process.env.OPENAI_API_KEY;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response();
  };

  const response = await POST(makeRequest());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(fetchCalled, false);
  assert.deepEqual(await response.json(), { error: 'OPENAI_API_KEY is not configured.' });
});

test('realtime session rejects cross-site browser requests before calling OpenAI', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return Response.json({ value: 'ek_test' });
  };

  const originResponse = await POST(makeRequest({ Origin: 'https://evil.example' }));
  const fetchSiteResponse = await POST(makeRequest({ 'Sec-Fetch-Site': 'cross-site' }));

  assert.equal(originResponse.status, 403);
  assert.equal(fetchSiteResponse.status, 403);
  assert.equal(fetchCalled, false);
});

test('realtime session sends the latest config and never caches the client secret', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  let capturedUrl = '';
  let capturedAuthorization = '';
  let capturedSafetyIdentifier = '';
  let capturedBody: unknown;
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = new Headers(init?.headers).get('authorization') ?? '';
    capturedSafetyIdentifier = new Headers(init?.headers).get('openai-safety-identifier') ?? '';
    capturedBody = JSON.parse(String(init?.body));
    return Response.json({ value: 'ek_test' });
  };

  const response = await POST(makeRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(capturedUrl, OPENAI_REALTIME_CLIENT_SECRETS_URL);
  assert.equal(capturedAuthorization, 'Bearer test-key-one');
  assert.match(capturedSafetyIdentifier, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(capturedSafetyIdentifier, /198\.51\.100/);
  assert.deepEqual(capturedBody, OPENAI_REALTIME_CLIENT_SECRET_CONFIG);
  assert.deepEqual(await response.json(), { value: 'ek_test' });
});

test('realtime session reads a rotated key on the next request', async () => {
  const authorizations: string[] = [];
  globalThis.fetch = async (_input, init) => {
    authorizations.push(new Headers(init?.headers).get('authorization') ?? '');
    return Response.json({ value: 'ek_test' });
  };

  process.env.OPENAI_API_KEY = 'test-key-one';
  assert.equal((await POST(makeRequest())).status, 200);
  process.env.OPENAI_API_KEY = 'test-key-two';
  assert.equal((await POST(makeRequest())).status, 200);

  assert.deepEqual(authorizations, ['Bearer test-key-one', 'Bearer test-key-two']);
});

test('realtime session does not reflect upstream authentication details', async () => {
  process.env.OPENAI_API_KEY = 'rejected-test-key';
  globalThis.fetch = async () => new Response('sensitive upstream project detail', { status: 401 });

  const response = await POST(makeRequest());
  const body = JSON.stringify(await response.json());
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(body, /configured server credential/);
  assert.doesNotMatch(body, /sensitive upstream project detail/);
});

test('realtime session rejects malformed successful upstream payloads', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  globalThis.fetch = async () => Response.json({ session: { type: 'transcription' } });

  const response = await POST(makeRequest());
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    error: 'OpenAI returned an invalid realtime session.',
  });
});

test('realtime session maps upstream timeouts to a gateway timeout', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  globalThis.fetch = async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  const response = await POST(makeRequest());
  assert.equal(response.status, 504);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'Realtime session request timed out.' });
});

test('realtime session recognizes the runtime TimeoutError', async () => {
  process.env.OPENAI_API_KEY = 'test-key-one';
  globalThis.fetch = async () => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';
    throw error;
  };

  const response = await POST(makeRequest());
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: 'Realtime session request timed out.' });
});

test('cancelling the browser request aborts client-secret creation', async () => {
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

  const responsePromise = POST(
    new Request('http://localhost/api/realtime/session', {
      method: 'POST',
      headers: { 'x-real-ip': '198.51.100.220' },
      signal: controller.signal,
    })
  );
  await started;
  controller.abort();
  const response = await responsePromise;

  assert.equal(upstreamSignal?.aborted, true);
  assert.equal(response.status, 499);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
