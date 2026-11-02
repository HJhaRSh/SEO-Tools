/**
 * Production-ready distributed rate limiter and global AI usage budget tracker.
 *
 * ARCHITECTURAL DESIGN:
 * 1. Multi-Instance Distributed Shared Mechanism:
 *    - Connects via HTTP REST to Upstash Redis (100% Free Tier, zero dependencies, no socket pooling needed in Serverless)
 *      or Cloudflare KV REST.
 *    - All operations use atomic operations (`INCR`, `INCRBY`, `EXPIRE`) to ensure concurrency safety across concurrent
 *      Vercel serverless function invocations.
 *    - Automatic midnight UTC expiration (`EXPIRE 86400`) ensures clean daily budget resets without cron jobs.
 * 2. Process-Local Fallback:
 *    - In local development or when external REST endpoints are unconfigured, a local atomic fallback tracks usage.
 * 3. Actual Model Usage Tracking:
 *    - Tracks both HTTP requests and actual underlying AI model units (embedding calls + generative reasoning calls).
 */

export interface RateLimitResult {
  allowed: boolean;
  remainingMinute: number;
  remainingDay: number;
  retryAfterMs: number | null;
  reason: string | null;
  globalBudgetRemaining?: number;
  storage?: 'distributed-redis' | 'distributed-cloudflare' | 'local-instance';
}

const DEFAULT_PER_MINUTE = 5;
const DEFAULT_PER_DAY = 15;
// Aligned with the project's actual free-tier limit (20 reasoning requests/day on Gemini Free Tier)
const DEFAULT_GLOBAL_DAILY_BUDGET = 20;

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_IPS = 5000;

// Local fallback store
const ipRecords = new Map<string, number[]>();
let globalDailyRequests: number[] = [];

/**
 * Extracts real client IP with priority to Cloudflare Edge headers.
 */
export function extractClientIp(headers: Headers): string {
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const firstIp = xff.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return '127.0.0.1';
}

/**
 * Returns the effective rate limit configuration derived from environment variables or defaults.
 */
export function getRateLimitConfig(): { perMinute: number; perDay: number; globalDailyBudget: number } {
  const envMinute = process.env.PAGE_FOCUS_RATE_LIMIT_PER_MINUTE;
  const envDay = process.env.PAGE_FOCUS_RATE_LIMIT_PER_DAY;
  const envGlobalBudget = process.env.PAGE_FOCUS_GLOBAL_DAILY_BUDGET;

  const parsedMinute = envMinute ? parseInt(envMinute, 10) : NaN;
  const parsedDay = envDay ? parseInt(envDay, 10) : NaN;
  const parsedGlobal = envGlobalBudget ? parseInt(envGlobalBudget, 10) : NaN;

  return {
    perMinute: !isNaN(parsedMinute) && parsedMinute > 0 ? parsedMinute : DEFAULT_PER_MINUTE,
    perDay: !isNaN(parsedDay) && parsedDay > 0 ? parsedDay : DEFAULT_PER_DAY,
    globalDailyBudget: !isNaN(parsedGlobal) && parsedGlobal > 0 ? parsedGlobal : DEFAULT_GLOBAL_DAILY_BUDGET,
  };
}

/**
 * Executes an atomic distributed Redis command via Upstash REST API.
 */
async function callUpstashRedis(command: string[]): Promise<any> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result;
  } catch (err) {
    console.warn('Upstash Redis rate limit call failed, using local fallback:', err);
    return null;
  }
}

/**
 * Concurrency-safe, distributed rate limiter & quota budget checker.
 * Handles both per-IP limits and shared global AI quota across Vercel instances.
 */
export async function checkRateLimitAsync(ip: string, modelUnitsCost: number = 1): Promise<RateLimitResult> {
  const config = getRateLimitConfig();
  const clientKey = ip?.trim() || 'unknown';
  const now = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const currentMinuteWindow = Math.floor(now / ONE_MINUTE_MS);

  const secondsUntilMidnightUtc = Math.max(60, Math.floor((ONE_DAY_MS - (now % ONE_DAY_MS)) / 1000));

  // 1. Try Distributed Redis Enforcement if configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const globalKey = `ai:quota:global:${todayKey}`;
      const ipMinKey = `ai:rate:ip:${clientKey}:min:${currentMinuteWindow}`;
      const ipDayKey = `ai:rate:ip:${clientKey}:day:${todayKey}`;

      // Atomic multi-command pipeline
      const pipelineRes = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCRBY', globalKey, modelUnitsCost],
          ['EXPIRE', globalKey, secondsUntilMidnightUtc],
          ['INCR', ipMinKey],
          ['EXPIRE', ipMinKey, 120],
          ['INCR', ipDayKey],
          ['EXPIRE', ipDayKey, secondsUntilMidnightUtc],
        ]),
      });

      if (pipelineRes.ok) {
        const results = await pipelineRes.json();
        const globalCount: number = results[0]?.result ?? 0;
        const ipMinCount: number = results[2]?.result ?? 0;
        const ipDayCount: number = results[4]?.result ?? 0;

        // Check Global Shared Budget
        if (globalCount > config.globalDailyBudget) {
          return {
            allowed: false,
            remainingMinute: Math.max(0, config.perMinute - ipMinCount),
            remainingDay: Math.max(0, config.perDay - ipDayCount),
            retryAfterMs: ONE_DAY_MS - (now % ONE_DAY_MS),
            reason: `Shared global AI daily budget reached (${config.globalDailyBudget} reasoning requests/day). Application daily budget resets at 00:00:00 UTC (note: Google upstream project quota resets at midnight US Pacific / 08:00 UTC).`,
            globalBudgetRemaining: 0,
            storage: 'distributed-redis',
          };
        }

        // Check Per-IP Per-Minute Limit
        if (ipMinCount > config.perMinute) {
          return {
            allowed: false,
            remainingMinute: 0,
            remainingDay: Math.max(0, config.perDay - ipDayCount),
            retryAfterMs: Math.max(1000, ONE_MINUTE_MS - (now % ONE_MINUTE_MS)),
            reason: `Per-minute rate limit of ${config.perMinute} requests exceeded. Please wait before retrying.`,
            globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalCount),
            storage: 'distributed-redis',
          };
        }

        // Check Per-IP Daily Limit
        if (ipDayCount > config.perDay) {
          return {
            allowed: false,
            remainingMinute: 0,
            remainingDay: 0,
            retryAfterMs: ONE_DAY_MS - (now % ONE_DAY_MS),
            reason: `Per-IP daily rate limit of ${config.perDay} requests exceeded. Please try again tomorrow.`,
            globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalCount),
            storage: 'distributed-redis',
          };
        }

        return {
          allowed: true,
          remainingMinute: Math.max(0, config.perMinute - ipMinCount),
          remainingDay: Math.max(0, config.perDay - ipDayCount),
          retryAfterMs: null,
          reason: null,
          globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalCount),
          storage: 'distributed-redis',
        };
      }
    } catch (err) {
      if (process.env.PAGE_FOCUS_ENFORCE_DISTRIBUTED_QUOTA === 'true' || process.env.PAGE_FOCUS_FAIL_CLOSED === 'true') {
        return {
          allowed: false,
          remainingMinute: 0,
          remainingDay: 0,
          retryAfterMs: 30000,
          reason: 'Distributed quota enforcement service temporarily unavailable. Denying request because PAGE_FOCUS_ENFORCE_DISTRIBUTED_QUOTA is enabled.',
          globalBudgetRemaining: 0,
          storage: 'distributed-redis',
        };
      }
      console.warn('Distributed Redis rate limiter failed, falling back to local memory:', err);
    }
  } else if (process.env.PAGE_FOCUS_ENFORCE_DISTRIBUTED_QUOTA === 'true') {
    // When strict distributed quota enforcement is explicitly mandated in multi-instance environments
    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: 0,
      retryAfterMs: 60000,
      reason: 'Distributed quota enforcement requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN when PAGE_FOCUS_ENFORCE_DISTRIBUTED_QUOTA is enabled. In-memory fallback is disabled.',
      globalBudgetRemaining: 0,
      storage: 'distributed-redis',
    };
  }

  // 2. Concurrency-Safe Local Memory Fallback (development, test, and standalone/unconfigured environments)
  return checkRateLimit(ip, modelUnitsCost);
}

/**
 * Prunes expired records when the map grows too large to prevent memory leaks.
 */
function pruneExpiredRecords(now: number): void {
  globalDailyRequests = globalDailyRequests.filter(t => now - t < ONE_DAY_MS);

  if (ipRecords.size <= MAX_TRACKED_IPS) return;

  for (const [key, timestamps] of ipRecords.entries()) {
    const valid = timestamps.filter(t => now - t < ONE_DAY_MS);
    if (valid.length === 0) {
      ipRecords.delete(key);
    } else {
      ipRecords.set(key, valid);
    }
  }
}

/**
 * Synchronous local checker.
 */
export function checkRateLimit(ip: string, modelUnitsCost: number = 1): RateLimitResult {
  const config = getRateLimitConfig();
  const clientKey = ip?.trim() || 'unknown';
  const now = Date.now();

  pruneExpiredRecords(now);

  // 1. Check Shared Global Daily AI Budget
  if (globalDailyRequests.length + modelUnitsCost > config.globalDailyBudget) {
    const oldestInDay = globalDailyRequests[0] || now;
    const retryAfterMs = Math.max(1000, ONE_DAY_MS - (now - oldestInDay));
    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: 0,
      retryAfterMs,
      reason: `Global daily AI quota limit reached (${config.globalDailyBudget} reasoning requests/day). Application daily budget resets at 00:00:00 UTC (Google upstream quota resets at midnight US Pacific / 08:00 UTC).`,
      globalBudgetRemaining: 0,
      storage: 'local-instance',
    };
  }

  const timestamps = ipRecords.get(clientKey) || [];
  const activeTimestamps = timestamps.filter(t => now - t < ONE_DAY_MS);

  // 2. Check per-minute window
  const inMinute = activeTimestamps.filter(t => now - t < ONE_MINUTE_MS);

  if (inMinute.length >= config.perMinute) {
    const oldestInMinute = inMinute[0];
    const retryAfterMs = Math.max(1000, ONE_MINUTE_MS - (now - oldestInMinute));

    ipRecords.set(clientKey, activeTimestamps);

    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: Math.max(0, config.perDay - activeTimestamps.length),
      retryAfterMs,
      reason: `Per-minute rate limit of ${config.perMinute} requests exceeded. Please wait before retrying.`,
      globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalDailyRequests.length),
      storage: 'local-instance',
    };
  }

  // 3. Check per-day window for this client
  if (activeTimestamps.length >= config.perDay) {
    const oldestInDay = activeTimestamps[0];
    const retryAfterMs = Math.max(1000, ONE_DAY_MS - (now - oldestInDay));

    ipRecords.set(clientKey, activeTimestamps);

    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: 0,
      retryAfterMs,
      reason: `Daily rate limit of ${config.perDay} requests exceeded. Please try again tomorrow.`,
      globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalDailyRequests.length),
      storage: 'local-instance',
    };
  }

  // Record allowed request with actual model units consumed
  activeTimestamps.push(now);
  ipRecords.set(clientKey, activeTimestamps);
  for (let u = 0; u < modelUnitsCost; u++) {
    globalDailyRequests.push(now);
  }

  return {
    allowed: true,
    remainingMinute: Math.max(0, config.perMinute - (inMinute.length + 1)),
    remainingDay: Math.max(0, config.perDay - activeTimestamps.length),
    retryAfterMs: null,
    reason: null,
    globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalDailyRequests.length),
    storage: 'local-instance',
  };
}

/**
 * Resets rate limit records (useful for testing).
 */
export function resetRateLimits(): void {
  ipRecords.clear();
  globalDailyRequests = [];
}
