import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClientIp } from '@/app/api/chat/client-ip';

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

test('prefers x-vercel-forwarded-for over x-forwarded-for (spoof-resistant)', () => {
  const headers = makeHeaders({
    'x-vercel-forwarded-for': '198.51.100.7',
    'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    'x-real-ip': '198.51.100.99',
  });
  assert.equal(extractClientIp(headers), '198.51.100.7');
});

test('falls back to x-real-ip when x-vercel-forwarded-for is absent', () => {
  const headers = makeHeaders({
    'x-real-ip': '198.51.100.99',
    'x-forwarded-for': '1.2.3.4, 5.6.7.8',
  });
  assert.equal(extractClientIp(headers), '198.51.100.99');
});

test('uses left-most x-forwarded-for entry as a last-resort source', () => {
  const headers = makeHeaders({
    'x-forwarded-for': '203.0.113.5, 5.6.7.8',
  });
  assert.equal(extractClientIp(headers), '203.0.113.5');
});

test('returns "unknown" when no IP header is present', () => {
  const headers = makeHeaders({});
  assert.equal(extractClientIp(headers), 'unknown');
});

test('ignores empty / whitespace-only header values', () => {
  const headers = makeHeaders({
    'x-vercel-forwarded-for': '   ',
    'x-real-ip': '',
    'x-forwarded-for': '   , 5.6.7.8',
  });
  // Left-most x-forwarded-for entry is whitespace, so we fall through and use
  // the second entry? No -- we only inspect the left-most. Expect 'unknown'.
  assert.equal(extractClientIp(headers), 'unknown');
});

test('trims surrounding whitespace in returned IP', () => {
  const headers = makeHeaders({
    'x-forwarded-for': '  203.0.113.5  , 5.6.7.8',
  });
  assert.equal(extractClientIp(headers), '203.0.113.5');
});
