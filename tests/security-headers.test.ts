import assert from 'node:assert/strict';
import test from 'node:test';
import nextConfig from '@/next.config';

test('global browser security headers preserve microphone access only for this origin', async () => {
  assert.equal(typeof nextConfig.headers, 'function');
  const routes = await nextConfig.headers!();
  const globalRoute = routes.find((route) => route.source === '/(.*)');
  assert.ok(globalRoute);

  const headers = new Map(
    globalRoute.headers.map((header) => [header.key.toLowerCase(), header.value])
  );
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(headers.get('permissions-policy'), 'camera=(), geolocation=(), microphone=(self)');
  assert.equal(headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.match(headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.match(headers.get('content-security-policy') ?? '', /object-src 'none'/);
});
