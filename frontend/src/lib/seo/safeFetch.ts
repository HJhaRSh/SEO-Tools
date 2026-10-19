import dns from 'dns';
import { promisify } from 'util';
import http from 'http';
import https from 'https';
import { isBlockedHostname, isPrivateOrReservedIP } from './ssrf';

const dnsLookup = promisify(dns.lookup);

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number; // 500 KiB limit default
  headers?: Record<string, string>;
  userAgent?: string;
  beforeRedirect?: (nextUrl: string, currentUrl: string) => Promise<{ allow: boolean; reason?: string; blockType?: 'BLOCKED' | 'UNKNOWN' | 'ERROR' }>;
  allowLocalhostForTesting?: boolean;
}

export interface SafeFetchResult {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  redirectHistory: { from: string; to: string; statusCode: number }[];
  durationMs: number;
  contentType: string;
  timestamp: string;
  isTruncated: boolean;
  downloadedBytes?: number;
  blockedByRedirectHook?: boolean;
  redirectBlockedReason?: string;
  redirectBlockType?: 'BLOCKED' | 'UNKNOWN' | 'ERROR';
}

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 512 * 1024; // 512 KiB (500 KiB spec)
const ALLOWED_PORTS = new Set(['80', '443', '']);

// ==========================================
// OUTBOUND REQUEST CONCURRENCY LIMITER
// (GLOBAL_LIMIT = 5, PER_DOMAIN_LIMIT = 2)
// Applied at network connection level to cover:
// - Direct URL fetches
// - robots.txt fetches
// - Cross-domain & same-domain redirect hops
// ==========================================
const HTTP_GLOBAL_CONCURRENCY = 5;
const HTTP_PER_DOMAIN_CONCURRENCY = 2;

let activeGlobalRequests = 0;
const activeDomainRequests = new Map<string, number>();
const requestQueue: { origin: string; resolve: () => void }[] = [];

export function acquireOutboundSlot(origin: string, maxWaitMs?: number): Promise<() => void> {
  return new Promise<() => void>((resolveSlot, rejectSlot) => {
    let timer: NodeJS.Timeout | null = null;
    let isSettled = false;
    let queueEntry: { origin: string; resolve: () => void } | null = null;

    function cleanup() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (queueEntry) {
        const idx = requestQueue.indexOf(queueEntry);
        if (idx !== -1) {
          requestQueue.splice(idx, 1);
        }
        queueEntry = null;
      }
    }

    function tryAcquire() {
      if (isSettled) return;
      const domainActive = activeDomainRequests.get(origin) || 0;
      if (activeGlobalRequests < HTTP_GLOBAL_CONCURRENCY && domainActive < HTTP_PER_DOMAIN_CONCURRENCY) {
        isSettled = true;
        cleanup();
        activeGlobalRequests++;
        activeDomainRequests.set(origin, domainActive + 1);

        let released = false;
        const releaseSlot = () => {
          if (released) return;
          released = true;
          activeGlobalRequests--;
          const count = (activeDomainRequests.get(origin) || 1) - 1;
          if (count <= 0) {
            activeDomainRequests.delete(origin);
          } else {
            activeDomainRequests.set(origin, count);
          }
          dispatchNextQueued();
        };

        return resolveSlot(releaseSlot);
      } else {
        if (!queueEntry) {
          queueEntry = { origin, resolve: tryAcquire };
          requestQueue.push(queueEntry);
        }
      }
    }

    if (typeof maxWaitMs === 'number') {
      if (maxWaitMs <= 0) {
        isSettled = true;
        return rejectSlot(new Error(`Request timed out waiting for outbound connection slot`));
      }
      timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          rejectSlot(new Error(`Request timed out waiting in concurrency queue for outbound connection slot (${maxWaitMs}ms)`));
        }
      }, maxWaitMs);
    }

    tryAcquire();
  });
}

function dispatchNextQueued() {
  for (let i = 0; i < requestQueue.length; i++) {
    const item = requestQueue[i];
    const domainActive = activeDomainRequests.get(item.origin) || 0;
    if (activeGlobalRequests < HTTP_GLOBAL_CONCURRENCY && domainActive < HTTP_PER_DOMAIN_CONCURRENCY) {
      requestQueue.splice(i, 1);
      item.resolve();
      break;
    }
  }
}

/**
 * Resolves a hostname safely and ensures resolved IP is not private/reserved.
 * Enforces timeoutMs if specified and supports allowLocalhostForTesting in test environments.
 */
export async function validateAndResolveHost(
  hostname: string,
  timeoutMs?: number,
  allowLocalhostForTesting = false
): Promise<string> {
  const isLocalhostTest =
    allowLocalhostForTesting &&
    process.env.NODE_ENV !== 'production' &&
    (hostname === 'localhost' || hostname === '127.0.0.1');

  if (isLocalhostTest) {
    return '127.0.0.1';
  }

  if (isBlockedHostname(hostname)) {
    throw new Error(`Access to blocked or internal hostname is forbidden: ${hostname}`);
  }

  if (typeof timeoutMs === 'number' && timeoutMs <= 0) {
    throw new Error(`DNS resolution timed out before lookup started for hostname: ${hostname}`);
  }

  try {
    const dnsPromise = dnsLookup(hostname, { all: true });
    let lookupResult: dns.LookupAddress[];

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      let timer: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`DNS resolution timed out after ${timeoutMs}ms for hostname: ${hostname}`));
        }, timeoutMs);
      });

      try {
        lookupResult = await Promise.race([dnsPromise, timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } else {
      lookupResult = await dnsPromise;
    }

    if (!lookupResult || lookupResult.length === 0) {
      throw new Error(`DNS resolution failed for hostname: ${hostname}`);
    }

    for (const record of lookupResult) {
      if (isPrivateOrReservedIP(record.address)) {
        throw new Error(`Hostname ${hostname} resolves to blocked/private IP: ${record.address}`);
      }
    }

    return lookupResult[0].address;
  } catch (err: any) {
    if (err.message && (err.message.includes('resolves to blocked') || err.message.includes('timed out'))) {
      throw err;
    }
    throw new Error(`DNS lookup error for ${hostname}: ${err.message || err}`);
  }
}

/**
 * Validates a target URL against SSRF rules.
 */
export function validateUrl(rawUrl: string, allowLocalhostForTesting = false): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL format: "${rawUrl}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  const isLocalhostTest =
    allowLocalhostForTesting &&
    process.env.NODE_ENV !== 'production' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (!isLocalhostTest && !ALLOWED_PORTS.has(parsed.port)) {
    throw new Error(`Port "${parsed.port}" is not allowed for security reasons.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('User credentials in URLs are not permitted.');
  }

  return parsed;
}

/**
 * Executes a secure HTTP GET request with SSRF validation, redirects tracking, and bounded response limits.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const customUserAgent = options.userAgent || 'Mozilla/5.0 (compatible; IndianMarketersBot/1.0; +https://indianmarketers.in/seo-tools)';
  const allowLocalhostForTesting = Boolean(options.allowLocalhostForTesting && process.env.NODE_ENV !== 'production');

  const redirectHistory: { from: string; to: string; statusCode: number }[] = [];
  let currentUrl = rawUrl;
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const remainingTimeMs = deadline - Date.now();
    if (remainingTimeMs <= 0) {
      throw new Error(`Request timed out: overall operation exceeded deadline of ${timeoutMs}ms for ${rawUrl}`);
    }

    const parsedUrl = validateUrl(currentUrl, allowLocalhostForTesting);

    // SSRF DNS re-check on every hop, respecting remaining deadline budget
    const dnsRemaining = deadline - Date.now();
    if (dnsRemaining <= 0) {
      throw new Error(`Request timed out: overall operation exceeded deadline of ${timeoutMs}ms for ${rawUrl}`);
    }
    const resolvedIp = await validateAndResolveHost(parsedUrl.hostname, dnsRemaining, allowLocalhostForTesting);

    // Concurrency queue wait, respecting remaining deadline budget
    const slotRemaining = deadline - Date.now();
    if (slotRemaining <= 0) {
      throw new Error(`Request timed out: overall operation exceeded deadline of ${timeoutMs}ms for ${rawUrl}`);
    }
    const releaseSlot = await acquireOutboundSlot(parsedUrl.origin, slotRemaining);

    let res: {
      statusCode: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      redirectLocation?: string;
      isTruncated: boolean;
      downloadedBytes: number;
    };

    try {
      const hopRemainingMs = deadline - Date.now();
      if (hopRemainingMs <= 0) {
        throw new Error(`Request timed out: overall operation exceeded deadline of ${timeoutMs}ms for ${rawUrl}`);
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const hopTimeoutMs = hopRemainingMs;

      const requestOptions: https.RequestOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        // Pin connection to validated IP to prevent DNS rebinding (TOCTOU attacks)
        lookup: (_hostname: string, optionsOrCallback: any, maybeCallback?: any) => {
          const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          const opts = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};
          const family = resolvedIp.includes(':') ? 6 : 4;
          if (opts && opts.all) {
            cb(null, [{ address: resolvedIp, family }]);
          } else {
            cb(null, resolvedIp, family);
          }
        },
        headers: {
          'Host': parsedUrl.hostname + (parsedUrl.port ? `:${parsedUrl.port}` : ''),
          'User-Agent': customUserAgent,
          'Accept': 'text/plain, text/html, application/xml, text/xml, */*;q=0.8',
          'Accept-Encoding': 'identity', // avoid compressed streams that could bypass byte counting or cause zip bombs
          'Connection': 'close',
          ...(options.headers || {})
        },
        timeout: hopTimeoutMs
      };

      res = await new Promise<{
        statusCode: number;
        statusText: string;
        headers: Record<string, string>;
        body: string;
        redirectLocation?: string;
        isTruncated: boolean;
        downloadedBytes: number;
      }>((resolve, reject) => {
        let isSettled = false;
        let isTimedOut = false;
        let activeResponse: http.IncomingMessage | null = null;

        // Hard deadline timer covering connection, TLS, headers, and entire body streaming
        const overallTimer = setTimeout(() => {
          if (!isSettled) {
            isTimedOut = true;
            isSettled = true;
            if (activeResponse) {
              activeResponse.destroy();
            }
            req.destroy();
            reject(new Error(`Request timed out after ${timeoutMs}ms for ${currentUrl}`));
          }
        }, hopTimeoutMs);

        const safeResolve = (val: any) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(overallTimer);
            resolve(val);
          }
        };

        const safeReject = (err: any) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(overallTimer);
            reject(err);
          }
        };

        const req = client.request(requestOptions, (response) => {
          activeResponse = response;
          const statusCode = response.statusCode || 0;
          const statusText = response.statusMessage || '';
          const headers: Record<string, string> = {};
          for (const [key, val] of Object.entries(response.headers)) {
            if (val) {
              headers[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : val;
            }
          }

          // Check for redirects (301, 302, 303, 307, 308)
          if ([301, 302, 303, 307, 308].includes(statusCode) && headers['location']) {
            response.resume(); // discard body
            return safeResolve({
              statusCode,
              statusText,
              headers,
              body: '',
              redirectLocation: headers['location'],
              isTruncated: false,
              downloadedBytes: 0
            });
          }

          const chunks: Buffer[] = [];
          let totalBytes = 0;
          let truncated = false;

          response.on('data', (chunk: Buffer) => {
            if (totalBytes + chunk.length > maxBytes) {
              const allowedLength = Math.max(0, maxBytes - totalBytes);
              if (allowedLength > 0) {
                chunks.push(chunk.subarray(0, allowedLength));
                totalBytes += allowedLength;
              }
              truncated = true;
              response.destroy(); // Stop receiving
            } else {
              chunks.push(chunk);
              totalBytes += chunk.length;
            }
          });

          response.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            safeResolve({
              statusCode,
              statusText,
              headers,
              body,
              isTruncated: truncated,
              downloadedBytes: totalBytes
            });
          });

          response.on('close', () => {
            if (truncated) {
              const body = Buffer.concat(chunks).toString('utf-8');
              safeResolve({
                statusCode,
                statusText,
                headers,
                body,
                isTruncated: true,
                downloadedBytes: totalBytes
              });
            }
          });

          response.on('error', (err) => {
            safeReject(err);
          });
        });

        req.on('timeout', () => {
          if (!isSettled) {
            isTimedOut = true;
            if (activeResponse) {
              activeResponse.destroy();
            }
            req.destroy();
            safeReject(new Error(`Request timed out after ${timeoutMs}ms for ${currentUrl}`));
          }
        });

        req.on('error', (err) => {
          if (!isTimedOut) {
            safeReject(err);
          }
        });

        req.end();
      });
    } finally {
      releaseSlot();
    }

    if (res.redirectLocation) {
      if (hop === maxRedirects) {
        throw new Error(`Exceeded maximum redirect limit of ${maxRedirects} hops.`);
      }

      // Resolve relative or absolute redirect
      const nextUrl = new URL(res.redirectLocation, currentUrl).toString();
      redirectHistory.push({
        from: currentUrl,
        to: nextUrl,
        statusCode: res.statusCode
      });

      // Redirect-aware security and robots check
      if (options.beforeRedirect) {
        const redirectRemaining = deadline - Date.now();
        if (redirectRemaining <= 0) {
          throw new Error(`Request timed out: overall operation exceeded deadline of ${timeoutMs}ms for ${rawUrl}`);
        }
        const check = await options.beforeRedirect(nextUrl, currentUrl);
        if (!check.allow) {
          const durationMs = Date.now() - startTime;
          return {
            requestedUrl: rawUrl,
            finalUrl: nextUrl,
            statusCode: res.statusCode,
            statusText: `Redirect stopped: ${check.reason || 'Blocked'}`,
            headers: res.headers,
            body: '',
            redirectHistory,
            durationMs,
            contentType: 'text/plain',
            timestamp: new Date().toISOString(),
            isTruncated: false,
            blockedByRedirectHook: true,
            redirectBlockedReason: check.reason || 'Blocked by redirect policy',
            redirectBlockType: check.blockType || 'BLOCKED'
          };
        }
      }

      currentUrl = nextUrl;
      continue;
    }

    const durationMs = Date.now() - startTime;
    return {
      requestedUrl: rawUrl,
      finalUrl: currentUrl,
      statusCode: res.statusCode,
      statusText: res.statusText,
      headers: res.headers,
      body: res.body,
      redirectHistory,
      durationMs,
      contentType: res.headers['content-type'] || 'text/plain',
      timestamp: new Date().toISOString(),
      isTruncated: res.isTruncated,
      downloadedBytes: res.downloadedBytes
    };
  }

  throw new Error(`Failed to fetch ${rawUrl}: Redirect loop or exceeded limit.`);
}
