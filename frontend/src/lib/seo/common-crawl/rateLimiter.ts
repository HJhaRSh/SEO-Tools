/**
 * Rate Limiter for Tool #19: Common Crawl Visibility Checker
 *
 * Dedicated rate limiting and concurrency protection.
 * Completely isolated namespace from Tool #18 (Page Focus / Gemini).
 * Redis Namespace: `cc:ratelimit:ip:${ip}`
 */

export interface CcRateLimitResult {
  allowed: boolean;
  remainingMinute: number;
  remainingDay: number;
  retryAfterSeconds?: number;
  reason?: string;
}

const CC_LIMIT_PER_MINUTE = 6;
const CC_LIMIT_PER_DAY = 30;

// Local sliding window tracker (for development / serverless instances)
const localIpMinuteMap = new Map<string, number[]>();
const localIpDayMap = new Map<string, number[]>();

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

export async function checkCommonCrawlRateLimit(ip: string): Promise<CcRateLimitResult> {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  // 1. Try Upstash Redis if configured
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const minuteKey = `cc:ratelimit:min:${ip}:${Math.floor(now / 60000)}`;
      const dayKey = `cc:ratelimit:day:${ip}:${today}`;

      // Pipeline INCR & EXPIRE
      const res = await fetch(`${redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([
          ['INCR', minuteKey],
          ['EXPIRE', minuteKey, 65],
          ['INCR', dayKey],
          ['EXPIRE', dayKey, 86400 * 2]
        ]),
        signal: AbortSignal.timeout(3000)
      });

      if (res.ok) {
        const results = await res.json();
        const minCount = results[0]?.result || 1;
        const dayCount = results[2]?.result || 1;

        if (minCount > CC_LIMIT_PER_MINUTE) {
          return {
            allowed: false,
            remainingMinute: 0,
            remainingDay: Math.max(0, CC_LIMIT_PER_DAY - dayCount),
            retryAfterSeconds: 60,
            reason: `Rate limit exceeded: maximum ${CC_LIMIT_PER_MINUTE} Common Crawl audits per minute.`
          };
        }

        if (dayCount > CC_LIMIT_PER_DAY) {
          return {
            allowed: false,
            remainingMinute: 0,
            remainingDay: 0,
            retryAfterSeconds: 3600,
            reason: `Daily quota exceeded: maximum ${CC_LIMIT_PER_DAY} Common Crawl audits per day.`
          };
        }

        return {
          allowed: true,
          remainingMinute: Math.max(0, CC_LIMIT_PER_MINUTE - minCount),
          remainingDay: Math.max(0, CC_LIMIT_PER_DAY - dayCount)
        };
      }
    } catch {
      // Fallback to local memory limiter
    }
  }

  // 2. In-memory sliding window fallback
  let minuteTimestamps = (localIpMinuteMap.get(ip) || []).filter(t => t > oneMinuteAgo);
  let dayTimestamps = (localIpDayMap.get(ip) || []).filter(t => t > oneDayAgo);

  if (minuteTimestamps.length >= CC_LIMIT_PER_MINUTE) {
    const oldest = minuteTimestamps[0];
    const retryAfter = Math.ceil((oldest + 60 * 1000 - now) / 1000);
    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: Math.max(0, CC_LIMIT_PER_DAY - dayTimestamps.length),
      retryAfterSeconds: Math.max(1, retryAfter),
      reason: `Rate limit exceeded: maximum ${CC_LIMIT_PER_MINUTE} audits per minute.`
    };
  }

  if (dayTimestamps.length >= CC_LIMIT_PER_DAY) {
    return {
      allowed: false,
      remainingMinute: 0,
      remainingDay: 0,
      retryAfterSeconds: 3600,
      reason: `Daily limit exceeded: maximum ${CC_LIMIT_PER_DAY} audits per day.`
    };
  }

  minuteTimestamps.push(now);
  dayTimestamps.push(now);
  localIpMinuteMap.set(ip, minuteTimestamps);
  localIpDayMap.set(ip, dayTimestamps);

  // Evict stale entries if map grows
  if (localIpMinuteMap.size > 1000) {
    for (const [key, times] of localIpMinuteMap.entries()) {
      if (times.every(t => t <= oneMinuteAgo)) localIpMinuteMap.delete(key);
    }
  }

  return {
    allowed: true,
    remainingMinute: CC_LIMIT_PER_MINUTE - minuteTimestamps.length,
    remainingDay: CC_LIMIT_PER_DAY - dayTimestamps.length
  };
}

