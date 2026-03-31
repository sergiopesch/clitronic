import { DAILY_LIMIT_DEFAULT } from '@/lib/ai/rate-limit';

interface RateEntry {
  minuteCount: number;
  minuteResetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

const rateMap = new Map<string, RateEntry>();

const MINUTE_WINDOW_MS = 60_000;
const MINUTE_LIMIT = 20;
const DAILY_WINDOW_MS = 86_400_000;
const MAX_TRACKED_IPS = 5_000;
const DAILY_LIMIT = Number(process.env.DAILY_RATE_LIMIT) || DAILY_LIMIT_DEFAULT;

const globalForRateLimit = globalThis as typeof globalThis & {
  __clitronicRateLimitCleanup?: ReturnType<typeof setInterval>;
};

export function checkRateLimit(ip: string): { limited: boolean; reason?: 'minute' | 'daily' } {
  const now = Date.now();
  let entry = rateMap.get(ip);

  if (!entry) {
    // Bound memory growth by evicting the oldest tracked IP entry.
    if (rateMap.size >= MAX_TRACKED_IPS) {
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

  entry.minuteCount++;
  entry.dailyCount++;

  if (entry.dailyCount > DAILY_LIMIT) return { limited: true, reason: 'daily' };
  if (entry.minuteCount > MINUTE_LIMIT) return { limited: true, reason: 'minute' };
  return { limited: false };
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
