import { DAILY_LIMIT_DEFAULT } from '@/lib/ai/rate-limit';

interface RateEntry {
  minuteCount: number;
  minuteResetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

/**
 * Map iteration order is insertion order. We rely on this for LRU eviction:
 * every time we access an entry we re-insert it so it moves to the *end* of
 * the iteration order, which means `keys().next().value` is always the
 * least-recently-used IP.
 */
const rateMap = new Map<string, RateEntry>();

export const MINUTE_WINDOW_MS = 60_000;
export const MINUTE_LIMIT = 20;
export const DAILY_WINDOW_MS = 86_400_000;
export const MAX_TRACKED_IPS = 5_000;
export const DAILY_LIMIT = Number(process.env.DAILY_RATE_LIMIT) || DAILY_LIMIT_DEFAULT;

const globalForRateLimit = globalThis as typeof globalThis & {
  __clitronicRateLimitCleanup?: ReturnType<typeof setInterval>;
};

export function checkRateLimit(ip: string): { limited: boolean; reason?: 'minute' | 'daily' } {
  const now = Date.now();
  let entry = rateMap.get(ip);

  if (entry) {
    // Touch: move to the end of insertion order so LRU eviction picks the
    // least-recently-seen IP rather than the one we happened to see first.
    rateMap.delete(ip);
    rateMap.set(ip, entry);
  } else {
    if (rateMap.size >= MAX_TRACKED_IPS) {
      // LRU: evict the oldest (least-recently-touched) entry.
      const oldestIp = rateMap.keys().next().value;
      if (oldestIp) rateMap.delete(oldestIp);
    }
    entry = {
      minuteCount: 0,
      minuteResetAt: now + MINUTE_WINDOW_MS,
      dailyCount: 0,
      dailyResetAt: now + DAILY_WINDOW_MS,
    };
    rateMap.set(ip, entry);
  }

  if (now > entry.minuteResetAt) {
    entry.minuteCount = 0;
    entry.minuteResetAt = now + MINUTE_WINDOW_MS;
  }

  if (now > entry.dailyResetAt) {
    entry.dailyCount = 0;
    entry.dailyResetAt = now + DAILY_WINDOW_MS;
  }

  // Check BEFORE incrementing. Previously we incremented unconditionally,
  // so a client hammering while already limited would keep inflating their
  // own counter and effectively extend the cool-off beyond the window.
  if (entry.dailyCount >= DAILY_LIMIT) return { limited: true, reason: 'daily' };
  if (entry.minuteCount >= MINUTE_LIMIT) return { limited: true, reason: 'minute' };

  entry.minuteCount++;
  entry.dailyCount++;
  return { limited: false };
}

/** Exposed for tests so they can start each test from a clean slate. */
export function __resetRateLimitMapForTests(): void {
  rateMap.clear();
}

if (typeof setInterval !== 'undefined' && !globalForRateLimit.__clitronicRateLimitCleanup) {
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateMap) {
      if (now > entry.dailyResetAt) rateMap.delete(ip);
    }
  }, 5 * 60_000);

  cleanup.unref?.();
  globalForRateLimit.__clitronicRateLimitCleanup = cleanup;
}
