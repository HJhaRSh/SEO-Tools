/**
 * Production-ready distributed rate limiter and global AI usage budget tracker.
 *
 * ARCHITECTURAL DESIGN:
 * 1. Multi-Instance Distributed Shared Mechanism (Upstash Redis REST / Lua):
 *    - All admissions use atomic Lua scripts via Upstash REST `EVAL`.
 *    - Strict check-and-reserve: counters are ONLY incremented if the request is accepted.
 *      Rejected requests consume 0 quota units.
 *    - In production (NODE_ENV === 'production' or PAGE_FOCUS_FAIL_CLOSED === 'true'), the system
 *      fails closed if Redis is unconfigured or unreachable. Process-local fallback is disabled in production.
 * 2. Separate Reasoning and Embedding Budgets:
 *    - Generative reasoning calls are tracked under `ai:quota:global:reasoning:${todayKey}`.
 *    - Embedding calls are tracked under `ai:quota:global:embedding:${todayKey}`.
 * 3. Actual Model Usage Tracking:
 *    - Provider-level calls, retries, and fallbacks are accounted for via `recordActualModelCall`.
 * 4. Distinct Timezone Reset Periods:
 *    - Application daily budgets reset at 00:00:00 UTC.
 *    - Google AI Studio free-tier quotas reset at midnight US Pacific (08:00:00 UTC).
 */

export interface RateLimitResult {
  allowed: boolean;
  remainingMinute: number;
  remainingDay: number;
  retryAfterMs: number | null;
  reason: string | null;
  globalBudgetRemaining?: number;
  storage?: 'distributed-redis' | 'local-instance';
}

const DEFAULT_PER_MINUTE = 5;
const DEFAULT_PER_DAY = 15;
// Aligned with the project's confirmed free-tier limit (20 reasoning requests/day on Gemini Free Tier)
const DEFAULT_GLOBAL_DAILY_BUDGET = 20;
// Embedding free-tier budget limit
const DEFAULT_GLOBAL_EMBEDDING_BUDGET = 500;

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_IPS = 5000;

// Local fallback store (development / test environments only)
const ipRecords = new Map<string, number[]>();
let globalDailyReasoningRequests: number[] = [];
let globalDailyEmbeddingRequests: number[] = [];

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
export function getRateLimitConfig(): {
  perMinute: number;
  perDay: number;
  globalDailyBudget: number;
  globalEmbeddingBudget: number;
} {
  const envMinute = process.env.PAGE_FOCUS_RATE_LIMIT_PER_MINUTE;
  const envDay = process.env.PAGE_FOCUS_RATE_LIMIT_PER_DAY;
  const envGlobalBudget = process.env.PAGE_FOCUS_GLOBAL_DAILY_BUDGET;
  const envEmbeddingBudget = process.env.PAGE_FOCUS_GLOBAL_EMBEDDING_BUDGET;

  const parsedMinute = envMinute ? parseInt(envMinute, 10) : NaN;
  const parsedDay = envDay ? parseInt(envDay, 10) : NaN;
  const parsedGlobal = envGlobalBudget ? parseInt(envGlobalBudget, 10) : NaN;
  const parsedEmbedding = envEmbeddingBudget ? parseInt(envEmbeddingBudget, 10) : NaN;

  return {
    perMinute: !isNaN(parsedMinute) && parsedMinute > 0 ? parsedMinute : DEFAULT_PER_MINUTE,
    perDay: !isNaN(parsedDay) && parsedDay > 0 ? parsedDay : DEFAULT_PER_DAY,
    globalDailyBudget: !isNaN(parsedGlobal) && parsedGlobal > 0 ? parsedGlobal : DEFAULT_GLOBAL_DAILY_BUDGET,
    globalEmbeddingBudget: !isNaN(parsedEmbedding) && parsedEmbedding > 0 ? parsedEmbedding : DEFAULT_GLOBAL_EMBEDDING_BUDGET,
  };
}

/**
 * Lua script for atomic check-and-reserve.
 * Checks limits BEFORE incrementing counters. If rejected, NO keys are incremented.
 *
 * KEYS[1]: globalKey (ai:quota:global:reasoning:YYYY-MM-DD)
 * KEYS[2]: ipMinKey  (ai:rate:ip:X:min:W)
 * KEYS[3]: ipDayKey  (ai:rate:ip:X:day:YYYY-MM-DD)
 *
 * ARGV[1]: cost (modelUnitsCost, e.g. 1 or 2)
 * ARGV[2]: globalLimit
 * ARGV[3]: ipMinLimit
 * ARGV[4]: ipDayLimit
 * ARGV[5]: globalTtlSeconds
 * ARGV[6]: minTtlSeconds (120)
 * ARGV[7]: dayTtlSeconds
 *
 * Returns: [allowed (0 or 1), globalCount, ipMinCount, ipDayCount, reasonCode]
 */
const CHECK_AND_RESERVE_LUA = `
local globalKey = KEYS[1]
local ipMinKey  = KEYS[2]
local ipDayKey  = KEYS[3]

local cost        = tonumber(ARGV[1])
local globalLimit = tonumber(ARGV[2])
local minLimit    = tonumber(ARGV[3])
local dayLimit    = tonumber(ARGV[4])
local globalTtl   = tonumber(ARGV[5])
local minTtl      = tonumber(ARGV[6])
local dayTtl      = tonumber(ARGV[7])

local currentGlobal = tonumber(redis.call('GET', globalKey) or '0')
local currentMin    = tonumber(redis.call('GET', ipMinKey) or '0')
local currentDay    = tonumber(redis.call('GET', ipDayKey) or '0')

if (currentGlobal + cost) > globalLimit then
  return {0, currentGlobal, currentMin, currentDay, 'GLOBAL_LIMIT_EXCEEDED'}
end

if (currentMin + 1) > minLimit then
  return {0, currentGlobal, currentMin, currentDay, 'IP_MIN_LIMIT_EXCEEDED'}
end

if (currentDay + 1) > dayLimit then
  return {0, currentGlobal, currentMin, currentDay, 'IP_DAY_LIMIT_EXCEEDED'}
end

local newGlobal = redis.call('INCRBY', globalKey, cost)
if currentGlobal == 0 then
  redis.call('EXPIRE', globalKey, globalTtl)
end

local newMin = redis.call('INCRBY', ipMinKey, 1)
if currentMin == 0 then
  redis.call('EXPIRE', ipMinKey, minTtl)
end

local newDay = redis.call('INCRBY', ipDayKey, 1)
if currentDay == 0 then
  redis.call('EXPIRE', ipDayKey, dayTtl)
end

return {1, newGlobal, newMin, newDay, 'OK'}
`;

/**
 * Lua script for recording an actual individual model call (retry, fallback, or embedding batch).
 * Checks budget before incrementing.
 *
 * KEYS[1]: quotaKey (ai:quota:global:reasoning:YYYY-MM-DD or embedding)
 * ARGV[1]: units (number of calls/units, e.g. 1)
 * ARGV[2]: limit (daily budget)
 * ARGV[3]: ttlSeconds
 *
 * Returns: [allowed (0 or 1), newCount, remaining]
 */
const RECORD_MODEL_CALL_LUA = `
local quotaKey = KEYS[1]
local units    = tonumber(ARGV[1])
local limit    = tonumber(ARGV[2])
local ttl      = tonumber(ARGV[3])

local current = tonumber(redis.call('GET', quotaKey) or '0')
if (current + units) > limit then
  return {0, current, 0}
end

local newCount = redis.call('INCRBY', quotaKey, units)
if current == 0 then
  redis.call('EXPIRE', quotaKey, ttl)
end

local remaining = math.max(0, limit - newCount)
return {1, newCount, remaining}
`;

/**
 * Checks whether production environment mandates fail-closed behavior.
 */
function shouldFailClosed(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.PAGE_FOCUS_FAIL_CLOSED === 'true' ||
    process.env.PAGE_FOCUS_ENFORCE_DISTRIBUTED_QUOTA === 'true'
  );
}

/**
 * Executes an atomic Lua script via Upstash Redis REST API.
 */
async function evalUpstashLua(script: string, keys: string[], args: (string | number)[]): Promise<any> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['EVAL', script, keys.length, ...keys, ...args.map(String)]),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upstash Redis EVAL failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.result;
}

/**
 * Concurrency-safe, distributed rate limiter & quota budget checker.
 * Uses atomic Lua check-and-reserve. Rejected requests consume zero quota.
 */
export async function checkRateLimitAsync(
  ip: string,
  modelUnitsCost: number = 1
): Promise<RateLimitResult> {
  const config = getRateLimitConfig();
  const clientKey = ip?.trim() || 'unknown';
  const now = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const currentMinuteWindow = Math.floor(now / ONE_MINUTE_MS);
  const secondsUntilMidnightUtc = Math.max(60, Math.floor((ONE_DAY_MS - (now % ONE_DAY_MS)) / 1000));

  const hasRedisConfig = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

  // In production, require distributed Redis; fail closed if not configured
  if (!hasRedisConfig && shouldFailClosed()) {
    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: 0,
      retryAfterMs: 60000,
      reason:
        'Distributed quota enforcement requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production. In-memory fallback is disabled.',
      globalBudgetRemaining: 0,
      storage: 'distributed-redis',
    };
  }

  if (hasRedisConfig) {
    try {
      const globalKey = `ai:quota:global:reasoning:${todayKey}`;
      const ipMinKey = `ai:rate:ip:${clientKey}:min:${currentMinuteWindow}`;
      const ipDayKey = `ai:rate:ip:${clientKey}:day:${todayKey}`;

      const evalResult = await evalUpstashLua(
        CHECK_AND_RESERVE_LUA,
        [globalKey, ipMinKey, ipDayKey],
        [
          modelUnitsCost,
          config.globalDailyBudget,
          config.perMinute,
          config.perDay,
          secondsUntilMidnightUtc,
          120,
          secondsUntilMidnightUtc,
        ]
      );

      if (Array.isArray(evalResult)) {
        const allowed = Number(evalResult[0]) === 1;
        const globalCount = Number(evalResult[1]);
        const ipMinCount = Number(evalResult[2]);
        const ipDayCount = Number(evalResult[3]);
        const reasonCode = String(evalResult[4]);

        if (!allowed) {
          if (reasonCode === 'GLOBAL_LIMIT_EXCEEDED') {
            return {
              allowed: false,
              remainingMinute: Math.max(0, config.perMinute - ipMinCount),
              remainingDay: Math.max(0, config.perDay - ipDayCount),
              retryAfterMs: ONE_DAY_MS - (now % ONE_DAY_MS),
              reason: `Shared global AI daily budget reached (${config.globalDailyBudget} reasoning requests/day). Application daily budget resets at 00:00:00 UTC (note: Google upstream project quota resets at midnight US Pacific / 08:00:00 UTC).`,
              globalBudgetRemaining: 0,
              storage: 'distributed-redis',
            };
          }

          if (reasonCode === 'IP_MIN_LIMIT_EXCEEDED') {
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
      if (shouldFailClosed()) {
        return {
          allowed: false,
          remainingMinute: 0,
          remainingDay: 0,
          retryAfterMs: 30000,
          reason:
            'Distributed quota enforcement service temporarily unavailable. Denying request because fail-closed behavior is active in production.',
          globalBudgetRemaining: 0,
          storage: 'distributed-redis',
        };
      }
      console.warn('Distributed Redis rate limiter failed, falling back to local memory:', err);
    }
  }

  // Local Memory Fallback (development, test, and standalone/unconfigured non-production environments)
  return checkRateLimit(ip, modelUnitsCost);
}

/**
 * Records an actual provider model call (retry, fallback model invocation, or embedding chunk).
 * Ensures retry logic cannot exceed configured limits.
 */
export async function recordActualModelCall(
  type: 'reasoning' | 'embedding',
  units: number = 1
): Promise<{ allowed: boolean; remaining: number }> {
  const config = getRateLimitConfig();
  const limit = type === 'reasoning' ? config.globalDailyBudget : config.globalEmbeddingBudget;
  const now = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const secondsUntilMidnightUtc = Math.max(60, Math.floor((ONE_DAY_MS - (now % ONE_DAY_MS)) / 1000));

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const quotaKey = `ai:quota:global:${type}:${todayKey}`;
      const evalResult = await evalUpstashLua(
        RECORD_MODEL_CALL_LUA,
        [quotaKey],
        [units, limit, secondsUntilMidnightUtc]
      );
      if (Array.isArray(evalResult)) {
        return {
          allowed: Number(evalResult[0]) === 1,
          remaining: Math.max(0, Number(evalResult[2])),
        };
      }
    } catch (err) {
      if (shouldFailClosed()) {
        return { allowed: false, remaining: 0 };
      }
    }
  }

  // Local fallback recording
  const store = type === 'reasoning' ? globalDailyReasoningRequests : globalDailyEmbeddingRequests;
  if (store.length + units > limit) {
    return { allowed: false, remaining: Math.max(0, limit - store.length) };
  }
  for (let u = 0; u < units; u++) {
    store.push(now);
  }
  return { allowed: true, remaining: Math.max(0, limit - store.length) };
}

/**
 * Prunes expired records when the map grows too large to prevent memory leaks.
 */
function pruneExpiredRecords(now: number): void {
  globalDailyReasoningRequests = globalDailyReasoningRequests.filter(t => now - t < ONE_DAY_MS);
  globalDailyEmbeddingRequests = globalDailyEmbeddingRequests.filter(t => now - t < ONE_DAY_MS);

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
 * Synchronous local checker (development & test suites).
 */
export function checkRateLimit(ip: string, modelUnitsCost: number = 1): RateLimitResult {
  const config = getRateLimitConfig();
  const clientKey = ip?.trim() || 'unknown';
  const now = Date.now();

  pruneExpiredRecords(now);

  // 1. Check Shared Global Daily AI Budget
  if (globalDailyReasoningRequests.length + modelUnitsCost > config.globalDailyBudget) {
    const oldestInDay = globalDailyReasoningRequests[0] || now;
    const retryAfterMs = Math.max(1000, ONE_DAY_MS - (now - oldestInDay));
    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: 0,
      retryAfterMs,
      reason: `Global daily AI quota limit reached (${config.globalDailyBudget} reasoning requests/day). Application daily budget resets at 00:00:00 UTC (Google upstream quota resets at midnight US Pacific / 08:00:00 UTC).`,
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
      globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalDailyReasoningRequests.length),
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
      globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalDailyReasoningRequests.length),
      storage: 'local-instance',
    };
  }

  // Record allowed request with actual model units consumed
  activeTimestamps.push(now);
  ipRecords.set(clientKey, activeTimestamps);
  for (let u = 0; u < modelUnitsCost; u++) {
    globalDailyReasoningRequests.push(now);
  }

  return {
    allowed: true,
    remainingMinute: Math.max(0, config.perMinute - (inMinute.length + 1)),
    remainingDay: Math.max(0, config.perDay - activeTimestamps.length),
    retryAfterMs: null,
    reason: null,
    globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalDailyReasoningRequests.length),
    storage: 'local-instance',
  };
}

/**
 * Resets rate limit records (useful for testing).
 */
export function resetRateLimits(): void {
  ipRecords.clear();
  globalDailyReasoningRequests = [];
  globalDailyEmbeddingRequests = [];
}
