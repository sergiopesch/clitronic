import { DAILY_LIMIT_DEFAULT } from '@/lib/ai/rate-limit';

/**
 * Rate limiter for /api/chat.
 *
 * In production (Vercel serverless / edge), process-local `Map`-based
 * counters reset on every cold start and are not shared between concurrent
 * instances, so the effective per-IP limit can be N × configured. To fix
 * that we support an Upstash Redis REST backend when the following env
 * vars are configured:
 *
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * When either is missing, we transparently fall back to the in-memory
 * store (matches prior behavior and keeps local dev/tests trivial).
 */

export interface RateLimitResult {
  limited: boolean;
  reason?: 'minute' | 'daily';
}

export interface RateLimitStore {
  check(ip: string): Promise<RateLimitResult>;
}

const MINUTE_WINDOW_MS = 60_000;
const MINUTE_LIMIT = 20;
const DAILY_WINDOW_MS = 86_400_000;
const MAX_TRACKED_IPS = 5_000;
const DAILY_LIMIT = Number(process.env.DAILY_RATE_LIMIT) || DAILY_LIMIT_DEFAULT;

interface RateEntry {
  minuteCount: number;
  minuteResetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

/* ───────────────────────── In-memory store ───────────────────────── */

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly rateMap = new Map<string, RateEntry>();

  async check(ip: string): Promise<RateLimitResult> {
    const now = Date.now();
    let entry = this.rateMap.get(ip);

    if (!entry) {
      if (this.rateMap.size >= MAX_TRACKED_IPS) {
        const oldestIp = this.rateMap.keys().next().value;
        if (oldestIp) this.rateMap.delete(oldestIp);
      }
      entry = {
        minuteCount: 0,
        minuteResetAt: now + MINUTE_WINDOW_MS,
        dailyCount: 0,
        dailyResetAt: now + DAILY_WINDOW_MS,
      };
      this.rateMap.set(ip, entry);
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

  // Test/debug helper.
  reset(): void {
    this.rateMap.clear();
  }
}

/* ───────────────────────── Upstash store ───────────────────────── */

interface UpstashConfig {
  url: string;
  token: string;
  minuteLimit?: number;
  dailyLimit?: number;
  minuteWindowSeconds?: number;
  dailyWindowSeconds?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Fixed-window counters backed by Upstash Redis REST.
 *
 * Uses the pipeline endpoint to do INCR + EXPIRE atomically per window.
 * One round-trip per check; if Upstash is unavailable we fail *open*
 * (never block a legitimate request because of a telemetry outage).
 */
export class UpstashRateLimitStore implements RateLimitStore {
  private readonly url: string;
  private readonly token: string;
  private readonly minuteLimit: number;
  private readonly dailyLimit: number;
  private readonly minuteWindowSeconds: number;
  private readonly dailyWindowSeconds: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: UpstashConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.token = config.token;
    this.minuteLimit = config.minuteLimit ?? MINUTE_LIMIT;
    this.dailyLimit = config.dailyLimit ?? DAILY_LIMIT;
    this.minuteWindowSeconds = config.minuteWindowSeconds ?? MINUTE_WINDOW_MS / 1000;
    this.dailyWindowSeconds = config.dailyWindowSeconds ?? DAILY_WINDOW_MS / 1000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async check(ip: string): Promise<RateLimitResult> {
    const safeIp = ip.replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 64) || 'unknown';
    const minuteKey = `clitronic:rl:m:${safeIp}`;
    const dailyKey = `clitronic:rl:d:${safeIp}`;

    // Pipeline body: each inner array is a Redis command.
    const body = [
      ['INCR', minuteKey],
      ['EXPIRE', minuteKey, String(this.minuteWindowSeconds), 'NX'],
      ['INCR', dailyKey],
      ['EXPIRE', dailyKey, String(this.dailyWindowSeconds), 'NX'],
    ];

    let minuteCount = 0;
    let dailyCount = 0;

    try {
      const res = await this.fetchImpl(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        // Upstash REST is cheap; a hard ceiling keeps a bad region from
        // stalling the chat endpoint.
        signal: AbortSignal.timeout(750),
      });

      if (!res.ok) return { limited: false };

      const payload = (await res.json()) as Array<{ result?: number | string; error?: string }>;
      // Shape: [{result: <new count>}, {result: 0|1}, {result: <new count>}, {result: 0|1}]
      const minuteResult = payload[0]?.result;
      const dailyResult = payload[2]?.result;
      minuteCount = typeof minuteResult === 'number' ? minuteResult : Number(minuteResult) || 0;
      dailyCount = typeof dailyResult === 'number' ? dailyResult : Number(dailyResult) || 0;
    } catch {
      // Fail open: prefer availability over perfect enforcement.
      return { limited: false };
    }

    if (dailyCount > this.dailyLimit) return { limited: true, reason: 'daily' };
    if (minuteCount > this.minuteLimit) return { limited: true, reason: 'minute' };
    return { limited: false };
  }
}

/* ───────────────────────── Factory & singleton ───────────────────────── */

let warnedAboutFallback = false;

export function createRateLimitStore(env: NodeJS.ProcessEnv = process.env): RateLimitStore {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    return new UpstashRateLimitStore({ url, token });
  }

  if (!warnedAboutFallback && env.NODE_ENV === 'production') {
    warnedAboutFallback = true;
    console.warn(
      '[clitronic] Rate limiter: UPSTASH_REDIS_REST_URL/TOKEN not configured; ' +
        'falling back to per-instance in-memory store (limits are not shared across serverless instances).'
    );
  }

  return new InMemoryRateLimitStore();
}

// Module-level default store. Test code can swap it via `__setRateLimitStore`.
const globalForRateLimit = globalThis as typeof globalThis & {
  __clitronicRateLimitCleanup?: ReturnType<typeof setInterval>;
  __clitronicRateLimitStore?: RateLimitStore;
};

function getDefaultStore(): RateLimitStore {
  if (!globalForRateLimit.__clitronicRateLimitStore) {
    globalForRateLimit.__clitronicRateLimitStore = createRateLimitStore();
  }
  return globalForRateLimit.__clitronicRateLimitStore;
}

export function __setRateLimitStore(store: RateLimitStore | null): void {
  if (store === null) {
    delete globalForRateLimit.__clitronicRateLimitStore;
  } else {
    globalForRateLimit.__clitronicRateLimitStore = store;
  }
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  return getDefaultStore().check(ip);
}

/* ───────────────── Legacy in-memory cleanup (local dev only) ───────────────── */

// When running with the in-memory store for extended periods (dev server,
// long-lived node process) we still want to bound memory.
if (typeof setInterval !== 'undefined' && !globalForRateLimit.__clitronicRateLimitCleanup) {
  const cleanup = setInterval(() => {
    const store = globalForRateLimit.__clitronicRateLimitStore;
    if (store instanceof InMemoryRateLimitStore) {
      // Trigger eviction lazily by resetting entries older than the daily window.
      // The store trims itself via MAX_TRACKED_IPS on insert; this is a no-op
      // today but left here to stay behavior-compatible with the previous
      // cleanup interval hook for observability.
    }
  }, 5 * 60_000);

  cleanup.unref?.();
  globalForRateLimit.__clitronicRateLimitCleanup = cleanup;
}
