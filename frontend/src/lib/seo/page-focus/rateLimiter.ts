/**
 * In-memory IP rate limiter for the Page Focus & Semantic Relevance Analyzer.
 *
 * NOTE ON SERVERLESS ENVIRONMENTS:
 * Rate limiting state is held in-memory and process-local. In serverless / edge
 * deployments, multiple concurrent function instances do not share state.
 * For production multi-container or edge clusters, an external Redis / Upstash
 * ratelimiter should be configured.
 */

export interface RateLimitResult {
  allowed: boolean;
  remainingMinute: number;
  remainingDay: number;
  retryAfterMs: number | null;
  reason: string | null;
}

const DEFAULT_PER_MINUTE = 5;
const DEFAULT_PER_DAY = 50;

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_IPS = 5000;

// Map storing an array of request timestamps per client IP
const ipRecords = new Map<string, number[]>();

/**
 * Returns the effective rate limit configuration derived from environment variables or defaults.
 */
export function getRateLimitConfig(): { perMinute: number; perDay: number } {
  const envMinute = process.env.PAGE_FOCUS_RATE_LIMIT_PER_MINUTE;
  const envDay = process.env.PAGE_FOCUS_RATE_LIMIT_PER_DAY;

  const parsedMinute = envMinute ? parseInt(envMinute, 10) : NaN;
  const parsedDay = envDay ? parseInt(envDay, 10) : NaN;

  return {
    perMinute: !isNaN(parsedMinute) && parsedMinute > 0 ? parsedMinute : DEFAULT_PER_MINUTE,
    perDay: !isNaN(parsedDay) && parsedDay > 0 ? parsedDay : DEFAULT_PER_DAY,
  };
}

/**
 * Prunes expired records when the map grows too large to prevent memory leaks.
 */
function pruneExpiredRecords(now: number): void {
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

  const timestamps = ipRecords.get(clientKey) || [];
  // Keep only timestamps within 24 hours
  const activeTimestamps = timestamps.filter(t => now - t < ONE_DAY_MS);

  // Check per-minute window
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
    };
  }

  // Check per-day window
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
    };
  }

  // Record allowed request
  activeTimestamps.push(now);
  ipRecords.set(clientKey, activeTimestamps);

  return {
    allowed: true,
    remainingMinute: Math.max(0, config.perMinute - (inMinute.length + 1)),
    remainingDay: Math.max(0, config.perDay - activeTimestamps.length),
    retryAfterMs: null,
    reason: null,
  };
}

/**
 * Resets rate limit records (useful for testing).
 */
export function resetRateLimits(): void {
  ipRecords.clear();
}
