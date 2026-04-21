/**
 * Tests for the in-memory rate limiter used by /api/chat.
 *
 * The module exports a singleton Map, so we call `__resetRateLimitMapForTests()`
 * at the top of every test to start from a clean slate. We also freeze time
 * implicitly by not relying on wall-clock sleeps: the limiter uses `Date.now()`
 * so we can flip over the window boundary by monkey-patching it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetRateLimitMapForTests,
  checkRateLimit,
  DAILY_LIMIT,
  MAX_TRACKED_IPS,
  MINUTE_LIMIT,
} from '@/app/api/chat/rate-limit';

test('checkRateLimit: allows the first call and every call up to MINUTE_LIMIT', () => {
  __resetRateLimitMapForTests();
  const capacity = Math.min(MINUTE_LIMIT, DAILY_LIMIT);
  for (let i = 0; i < capacity; i++) {
    const result = checkRateLimit('1.1.1.1');
    assert.equal(result.limited, false, `request ${i + 1} should be allowed`);
  }
  const overflow = checkRateLimit('1.1.1.1');
  assert.equal(overflow.limited, true);
  assert.ok(overflow.reason === 'minute' || overflow.reason === 'daily');
});

// NOTE: The original code incremented both counters BEFORE checking the caps,
// which meant a client hammering past the limit would keep inflating their
// own `dailyCount` and effectively extend the cool-off beyond the minute
// window. The fix checks-before-incrementing.
//
// That property is easy to state but hard to observe from outside when
// `DAILY_LIMIT === MINUTE_LIMIT` (both default to 20): once you cross either
// boundary you cross both, so inflating daily past the cap while already
// limited by minute has no visible effect on `checkRateLimit`'s return
// value. The fix is still correct and worth keeping -- it avoids unbounded
// counter growth inside the entry -- but we don't assert it here because any
// such assertion requires configuring `DAILY_RATE_LIMIT` at module-load
// time (env var) which would need a separate test process.

test('checkRateLimit: continued hammering after limit stays consistently limited', () => {
  // Weaker assertion than the ideal, but still catches a regression where a
  // bad refactor accidentally flipped the bit back to allowed.
  __resetRateLimitMapForTests();
  const cap = Math.min(MINUTE_LIMIT, DAILY_LIMIT);
  for (let i = 0; i < cap; i++) checkRateLimit('2.2.2.2');
  for (let i = 0; i < 200; i++) {
    const { limited } = checkRateLimit('2.2.2.2');
    assert.equal(limited, true, `hammer call ${i + 1} after cap must remain limited`);
  }
});

test('checkRateLimit: daily limit surfaces as reason="daily"', () => {
  __resetRateLimitMapForTests();
  // Fill to the daily cap (which, when DAILY_LIMIT === MINUTE_LIMIT, will
  // trip daily first per the check order in rate-limit.ts).
  for (let i = 0; i < DAILY_LIMIT; i++) checkRateLimit('3.3.3.3');
  const over = checkRateLimit('3.3.3.3');
  assert.equal(over.limited, true);
  assert.equal(over.reason, 'daily');
});

test('checkRateLimit: independent IPs have independent quotas', () => {
  __resetRateLimitMapForTests();
  for (let i = 0; i < MINUTE_LIMIT; i++) checkRateLimit('4.4.4.1');
  assert.equal(checkRateLimit('4.4.4.1').limited, true);
  assert.equal(checkRateLimit('4.4.4.2').limited, false);
});

test('checkRateLimit: eviction is LRU, not insertion-order', () => {
  __resetRateLimitMapForTests();

  // Fill the map to capacity with distinct IPs.
  for (let i = 0; i < MAX_TRACKED_IPS; i++) {
    checkRateLimit(`10.0.${Math.floor(i / 256)}.${i % 256}`);
  }

  // Touch the first IP so it becomes the most-recently-used.
  const survivor = '10.0.0.0';
  checkRateLimit(survivor);
  // Use up its minute budget so we can observe whether it was evicted.
  for (let i = 0; i < MINUTE_LIMIT + 2; i++) checkRateLimit(survivor);

  // Adding a new IP should now evict the LEAST-recently-used one, not our
  // freshly-touched `survivor`. If the fix is wrong (FIFO by original
  // insertion), `survivor` would be the oldest and get evicted, which would
  // reset its counter and let it pass again.
  checkRateLimit('99.99.99.99');

  const { limited } = checkRateLimit(survivor);
  assert.equal(limited, true, 'MRU-touched IP must not have been evicted');
});
