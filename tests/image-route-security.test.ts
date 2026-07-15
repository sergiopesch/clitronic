import assert from 'node:assert/strict';
import test from 'node:test';
import { GET as proxyImage } from '@/app/api/image-proxy/route';
import { GET as searchImages } from '@/app/api/image-search/route';

test('image helper routes reject cross-site browser traffic before doing work', async () => {
  const headers = {
    Origin: 'https://evil.example',
    'Sec-Fetch-Site': 'cross-site',
    'x-forwarded-for': '198.51.100.131',
  };
  const proxyResponse = await proxyImage(
    new Request('http://localhost/api/image-proxy?url=https://upload.wikimedia.org/example.png', {
      headers,
    })
  );
  const searchResponse = await searchImages(
    new Request('http://localhost/api/image-search?q=ESP32', { headers })
  );

  assert.equal(proxyResponse.status, 403);
  assert.equal(searchResponse.status, 403);
  assert.equal(proxyResponse.headers.get('cache-control'), 'no-store');
  assert.equal(searchResponse.headers.get('cache-control'), 'no-store');

  const sameSiteHeaders = {
    'Sec-Fetch-Site': 'same-site',
    'x-forwarded-for': '198.51.100.133',
  };
  assert.equal(
    (
      await proxyImage(
        new Request(
          'http://localhost/api/image-proxy?url=https://upload.wikimedia.org/example.png',
          { headers: sameSiteHeaders }
        )
      )
    ).status,
    403
  );
});

test('cancelling image search aborts its upstream provider request', async () => {
  const originalFetch = globalThis.fetch;
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

  try {
    const responsePromise = searchImages(
      new Request('http://localhost/api/image-search?q=cancel-propagation-esp32', {
        headers: { 'x-forwarded-for': '198.51.100.134' },
        signal: controller.signal,
      })
    );
    await started;
    controller.abort();
    const response = await responsePromise;

    assert.equal(upstreamSignal?.aborted, true);
    assert.equal(response.status, 499);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('distinguishes provider outage from a valid no-match and never caches either', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    const unavailableResponse = await searchImages(
      new Request('http://localhost/api/image-search?q=provider-outage-contract', {
        headers: { 'x-forwarded-for': '198.51.100.135' },
      })
    );

    assert.equal(unavailableResponse.status, 502);
    assert.equal(unavailableResponse.headers.get('cache-control'), 'no-store');

    globalThis.fetch = async () =>
      Response.json({
        query: { pages: {} },
      });
    const emptyResponse = await searchImages(
      new Request('http://localhost/api/image-search?q=valid-empty-provider-result', {
        headers: { 'x-forwarded-for': '198.51.100.136' },
      })
    );

    assert.equal(emptyResponse.status, 200);
    assert.equal(emptyResponse.headers.get('cache-control'), 'no-store');
    const emptyPayload = (await emptyResponse.json()) as {
      url?: string | null;
      confident?: boolean;
      queryUsed?: string;
    };
    assert.equal(emptyPayload.url, null);
    assert.equal(emptyPayload.confident, false);
    assert.ok(emptyPayload.queryUsed);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('allows browser caching only for confident image results', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      query: {
        pages: {
          1: {
            title: 'File:ESP32 DevKit development board electronics hardware',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/esp32-devkit.jpg',
                thumburl: 'https://upload.wikimedia.org/esp32-devkit-thumb.jpg',
                width: 1200,
              },
            ],
          },
        },
      },
    });

  try {
    const response = await searchImages(
      new Request('http://localhost/api/image-search?q=ESP32+DevKit+development+board', {
        headers: { 'x-forwarded-for': '198.51.100.137' },
      })
    );
    const payload = (await response.json()) as { confident?: boolean };

    assert.equal(response.status, 200);
    assert.equal(payload.confident, true);
    assert.match(response.headers.get('cache-control') ?? '', /^public,/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects provider image hosts that the image proxy cannot serve', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      query: {
        pages: {
          1: {
            title: 'Untrustedhostprobe development board electronics hardware',
            imageinfo: [
              {
                url: 'https://evil.example/esp32.jpg',
                thumburl: 'https://evil.example/esp32-thumb.jpg',
                width: 1200,
              },
            ],
          },
        },
      },
    });

  try {
    const response = await searchImages(
      new Request('http://localhost/api/image-search?q=untrustedhostprobe+development+board', {
        headers: { 'x-forwarded-for': '198.51.100.138' },
      })
    );
    const payload = (await response.json()) as { url?: string | null; confident?: boolean };

    assert.equal(response.status, 200);
    assert.equal(payload.url, null);
    assert.equal(payload.confident, false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('includes ranking context in the confident-result cache key', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json({
      query: {
        pages: {
          1: {
            title: 'ESP32 DevKit alpha beta development board electronics hardware',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/context-cache-esp32.jpg',
                thumburl: 'https://upload.wikimedia.org/context-cache-esp32-thumb.jpg',
                width: 1200,
              },
            ],
          },
        },
      },
    });
  };

  try {
    const first = await searchImages(
      new Request('http://localhost/api/image-search?q=context-cache-esp32&caption=alpha', {
        headers: { 'x-forwarded-for': '198.51.100.139' },
      })
    );
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as { confident?: boolean }).confident, true);
    const callsAfterFirst = providerCalls;

    const second = await searchImages(
      new Request('http://localhost/api/image-search?q=context-cache-esp32&caption=beta', {
        headers: { 'x-forwarded-for': '198.51.100.140' },
      })
    );
    assert.equal(second.status, 200);
    assert.equal(((await second.json()) as { confident?: boolean }).confident, true);
    assert.ok(providerCalls > callsAfterFirst);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('treats HTTP-200 provider error envelopes as unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { code: 'upstream_failure' } });

  try {
    const response = await searchImages(
      new Request('http://localhost/api/image-search?q=provider-error-envelope-probe', {
        headers: { 'x-forwarded-for': '198.51.100.141' },
      })
    );

    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps a valid provider candidate when a sibling record is malformed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      query: {
        pages: {
          malformed: null,
          valid: {
            title: 'Siblingprobe development board electronics hardware',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/siblingprobe.jpg',
                thumburl: 'https://upload.wikimedia.org/siblingprobe-thumb.jpg',
                width: 1200,
                height: 800,
              },
            ],
          },
        },
      },
    });

  try {
    const response = await searchImages(
      new Request('http://localhost/api/image-search?q=siblingprobe+development+board', {
        headers: { 'x-forwarded-for': '198.51.100.142' },
      })
    );
    const payload = (await response.json()) as { url?: string | null; confident?: boolean };

    assert.equal(response.status, 200);
    assert.equal(payload.confident, true);
    assert.equal(payload.url, 'https://upload.wikimedia.org/siblingprobe.jpg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('routes multi-object scenes through the scene-level provider query', async () => {
  const originalFetch = globalThis.fetch;
  const originalBraveKey = process.env.BRAVE_API_KEY;
  const providerQueries: string[] = [];
  delete process.env.BRAVE_API_KEY;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    providerQueries.push(url.searchParams.get('gsrsearch') ?? '');
    return Response.json({
      query: {
        pages: {
          1: {
            title: 'File:Electronics workbench oscilloscope soldering bench',
            imageinfo: [
              {
                url: 'https://upload.wikimedia.org/scene-service-probe.jpg',
                thumburl: 'https://upload.wikimedia.org/scene-service-probe-thumb.jpg',
                width: 1200,
                height: 800,
              },
            ],
          },
        },
      },
    });
  };

  try {
    const response = await searchImages(
      new Request(
        'http://localhost/api/image-search?q=pegboard+oscilloscope+soldering+station+component+drawers&count=3',
        { headers: { 'x-forwarded-for': '198.51.100.143' } }
      )
    );
    const payload = (await response.json()) as {
      confident?: boolean;
      queryUsed?: string;
      images?: Array<{ url?: string }>;
    };

    assert.equal(response.status, 200);
    assert.deepEqual(providerQueries, ['electronics workbench']);
    assert.equal(payload.queryUsed, 'electronics workbench');
    assert.equal(payload.confident, true);
    assert.equal(payload.images?.[0]?.url, 'https://upload.wikimedia.org/scene-service-probe.jpg');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBraveKey === undefined) delete process.env.BRAVE_API_KEY;
    else process.env.BRAVE_API_KEY = originalBraveKey;
  }
});
