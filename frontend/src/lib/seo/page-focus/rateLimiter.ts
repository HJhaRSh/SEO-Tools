/**
 * Production-ready rate limiter and shared daily AI usage budget tracker.
 *
 * Supports Cloudflare Edge IP resolution (`cf-connecting-ip`), reverse proxies
 * (`x-forwarded-for`, `x-real-ip`), per-client sliding windows, and a shared
 * global daily AI quota budget to prevent quota exhaustion on Google AI Studio / Gemini.
 */

export interface RateLimitResult {
  allowed: boolean;
  remainingMinute: number;
  remainingDay: number;
  retryAfterMs: number | null;
  reason: string | null;
  globalBudgetRemaining?: number;
}

const DEFAULT_PER_MINUTE = 5;
const DEFAULT_PER_DAY = 50;
const DEFAULT_GLOBAL_DAILY_BUDGET = 250; // Daily budget across all users to preserve Gemini quota

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_IPS = 5000;

// Map storing an array of request timestamps per client IP
const ipRecords = new Map<string, number[]>();

// Global daily usage timestamps
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
 * Prunes expired records when the map grows too large to prevent memory leaks.
 */
function pruneExpiredRecords(now: number): void {
  // Prune global timestamps
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
 * Evaluates whether an incoming request from the given IP address is permitted.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const config = getRateLimitConfig();
  const clientKey = ip?.trim() || 'unknown';
  const now = Date.now();

  pruneExpiredRecords(now);

  // 1. Check Shared Global Daily AI Budget
  if (globalDailyRequests.length >= config.globalDailyBudget) {
    const oldestInDay = globalDailyRequests[0];
    const retryAfterMs = Math.max(1000, ONE_DAY_MS - (now - oldestInDay));
    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: 0,
      retryAfterMs,
      reason: `Global daily AI quota limit reached (${config.globalDailyBudget} requests/day). The quota resets automatically.`,
      globalBudgetRemaining: 0,
    };
  }

  const timestamps = ipRecords.get(clientKey) || [];
  // Keep only timestamps within 24 hours
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
    };
  }

  // Record allowed request
  activeTimestamps.push(now);
  ipRecords.set(clientKey, activeTimestamps);
  globalDailyRequests.push(now);

  return {
    allowed: true,
    remainingMinute: Math.max(0, config.perMinute - (inMinute.length + 1)),
    remainingDay: Math.max(0, config.perDay - activeTimestamps.length),
    retryAfterMs: null,
    reason: null,
    globalBudgetRemaining: Math.max(0, config.globalDailyBudget - globalDailyRequests.length),
  };
}

/**
 * Resets rate limit records (useful for testing).
 */
export function resetRateLimits(): void {
  ipRecords.clear();
  globalDailyRequests = [];
}
