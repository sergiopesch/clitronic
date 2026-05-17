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

interface RateLimitOptions {
  scope?: string;
  minuteLimit?: number;
  dailyLimit?: number;
}

const globalForRateLimit = globalThis as typeof globalThis & {
  __clitronicRateLimitCleanup?: ReturnType<typeof setInterval>;
};

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const RATE_LIMIT_PRESETS = {
  chat: {
    scope: 'chat',
    minuteLimit: MINUTE_LIMIT,
    dailyLimit: DAILY_LIMIT,
  },
  realtimeSession: {
    scope: 'realtime-session',
    minuteLimit: envNumber('REALTIME_SESSION_MINUTE_LIMIT', 12),
    dailyLimit: envNumber('REALTIME_SESSION_DAILY_LIMIT', 120),
  },
  imageSearch: {
    scope: 'image-search',
    minuteLimit: envNumber('IMAGE_SEARCH_MINUTE_LIMIT', 30),
    dailyLimit: envNumber('IMAGE_SEARCH_DAILY_LIMIT', 300),
  },
} as const;

export function checkRateLimit(
  ip: string,
  options: RateLimitOptions = RATE_LIMIT_PRESETS.chat
): { limited: boolean; reason?: 'minute' | 'daily' } {
  const now = Date.now();
  const scope = options.scope || 'chat';
  const key = `${scope}:${ip}`;
  const minuteLimit = options.minuteLimit ?? MINUTE_LIMIT;
  const dailyLimit = options.dailyLimit ?? DAILY_LIMIT;
  let entry = rateMap.get(key);

  if (!entry) {
    // Bound memory growth by evicting the oldest tracked IP entry.
    if (rateMap.size >= MAX_TRACKED_IPS) {
      const oldestKey = rateMap.keys().next().value;
      if (oldestKey) rateMap.delete(oldestKey);
    }
    entry = {
      minuteCount: 0,
      minuteResetAt: now + MINUTE_WINDOW_MS,
      dailyCount: 0,
      dailyResetAt: now + DAILY_WINDOW_MS,
    };
    rateMap.set(key, entry);
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

  if (entry.dailyCount > dailyLimit) return { limited: true, reason: 'daily' };
  if (entry.minuteCount > minuteLimit) return { limited: true, reason: 'minute' };
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
