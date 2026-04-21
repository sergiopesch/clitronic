import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryRateLimitStore,
  UpstashRateLimitStore,
  createRateLimitStore,
} from '@/app/api/chat/rate-limit';

test('in-memory store blocks after the threshold (daily fires first at defaults)', async () => {
  const store = new InMemoryRateLimitStore();
  // Default daily limit is 20; the 21st call should flip to limited.
  // Note: at defaults daily == minute, so daily fires first by precedence.
  for (let i = 0; i < 20; i++) {
    const res = await store.check('1.1.1.1');
    assert.equal(res.limited, false, `call ${i + 1} should pass`);
  }
  const overflow = await store.check('1.1.1.1');
  assert.equal(overflow.limited, true);
  assert.equal(overflow.reason, 'daily');
});

test('in-memory store isolates counters per IP', async () => {
  const store = new InMemoryRateLimitStore();
  for (let i = 0; i < 20; i++) await store.check('2.2.2.2');
  const limited = await store.check('2.2.2.2');
  assert.equal(limited.limited, true);

  const otherIp = await store.check('3.3.3.3');
  assert.equal(otherIp.limited, false, 'different IP should be unaffected');
});

test('upstash store trips daily limit based on pipeline response', async () => {
  // Simulate Upstash returning a day counter of 21 (over DAILY_LIMIT=20).
  const store = new UpstashRateLimitStore({
    url: 'https://fake.upstash.io',
    token: 'test-token',
    minuteLimit: 20,
    dailyLimit: 20,
    fetchImpl: async () =>
      new Response(JSON.stringify([{ result: 1 }, { result: 1 }, { result: 21 }, { result: 0 }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
  const res = await store.check('4.4.4.4');
  assert.equal(res.limited, true);
  assert.equal(res.reason, 'daily');
});

test('upstash store fails open when the backend errors', async () => {
  const store = new UpstashRateLimitStore({
    url: 'https://fake.upstash.io',
    token: 'test-token',
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });
  const res = await store.check('5.5.5.5');
  assert.equal(res.limited, false, 'should not block users on backend outage');
});

test('factory selects Upstash when both env vars are present', () => {
  const store = createRateLimitStore({
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'tok',
  } as unknown as NodeJS.ProcessEnv);
  assert.ok(store instanceof UpstashRateLimitStore);
});

test('factory falls back to in-memory when Upstash is not configured', () => {
  const store = createRateLimitStore({} as unknown as NodeJS.ProcessEnv);
  assert.ok(store instanceof InMemoryRateLimitStore);
});
