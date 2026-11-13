/**
 * 499 Timeout Risk Checker — Timed Fetcher
 *
 * An isolated timing-capable HTTP transport for the timeout-risk checker.
 * Records TTFB (time to final response headers), body download time, and total duration
 * separately using monotonic performance.now().
 *
 * Reuses the existing SSRF validation (ssrf.ts) and DNS resolver (safeFetch.ts)
 * WITHOUT modifying their behaviour. Does NOT use safeFetch itself — we need
 * separated timing measurements that safeFetch's durationMs cannot provide.
 *
 * Implementation notes on TTFB:
 * - "TTFB" here means time from initiating the request to receiving the final
 *   response headers, including DNS, TLS handshake, and any redirect hops.
 * - This is an approximation. Node.js http.request 'response' event fires when
 *   status line + headers have been parsed — close to true TTFB but subject to
 *   event-loop scheduling jitter.
 */

import dns from 'dns';
import http from 'http';
import https from 'https';
import zlib from 'zlib';
import { performance } from 'perf_hooks';
import { isBlockedHostname, isPrivateOrReservedIP } from '../ssrf';
import type { ProbeTiming, RedirectHop, CacheObservation } from './types';

// ─── Test-only transport hook ──────────────────────────────────────
// This symbol is NOT exported from the public API route.
// Tests import this module directly to inject controlled transports.
export type TestTransportFn = (
  url: URL,
  options: https.RequestOptions
) => Promise<TestTransportResult>;

export interface TestTransportResult {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: Buffer;
  /** Simulated header delay in ms */
  headerDelayMs?: number;
  /** Simulated body delay in ms */
  bodyDelayMs?: number;
}

let _testTransport: TestTransportFn | null = null;

/** @internal — test-only, not accessible from the API route */
export function __setTestTransport(fn: TestTransportFn | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test transport cannot be set in production');
  }
  _testTransport = fn;
}

// ─── Constants ─────────────────────────────────────────────────────
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 512 * 1024; // 512 KiB decompressed cap
const MAX_WIRE_BYTES = 2 * 1024 * 1024; // 2 MiB wire cap
const ALLOWED_PORTS = new Set(['80', '443', '']);
const MAX_URL_LENGTH = 2048;

// Each probe gets at most 15s. The overall API endpoint has ~25s wall clock
// (Vercel serverless 30s limit minus 5s safety margin).
const DEFAULT_PROBE_TIMEOUT_MS = 15_000;

// ─── DNS helper ────────────────────────────────────────────────────
const dnsLookupAsync = (
  hostname: string,
  opts: { all: boolean }
): Promise<dns.LookupAddress[]> =>
  new Promise((resolve, reject) => {
    dns.lookup(hostname, opts, (err, addresses) => {
      if (err) return reject(err);
      if (!Array.isArray(addresses)) {
        // Single result returned when all:true still returns single on some platforms
        resolve([addresses as unknown as dns.LookupAddress]);
      } else {
        resolve(addresses);
      }
    });
  });

// ─── Exported result type ──────────────────────────────────────────
export interface TimedFetchResult {
  timing: ProbeTiming;
  httpStatus: number;
  httpStatusText: string;
  headers: Record<string, string>;
  htmlSizeBytes: number;
  isTruncated: boolean;
  isBodyIncomplete: boolean;
  contentType: string;
  redirectChain: RedirectHop[];
  finalUrl: string;
  cacheObservation: CacheObservation;
}

// ─── URL validation (reuses SSRF checks) ───────────────────────────
export function validateTargetUrl(rawUrl: string): URL {
  if (rawUrl.length > MAX_URL_LENGTH) {
    throw new Error(`URL exceeds maximum length of ${MAX_URL_LENGTH} characters.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL format: "${rawUrl}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new Error(`Port "${parsed.port}" is not allowed for security reasons.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('User credentials in URLs are not permitted.');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`Access to blocked or internal hostname is forbidden: ${parsed.hostname}`);
  }

  // Remove fragment
  parsed.hash = '';

  return parsed;
}

// ─── DNS resolution with SSRF check ────────────────────────────────
async function resolveSafe(hostname: string, deadlineMs: number): Promise<string> {
  if (isBlockedHostname(hostname)) {
    throw new Error(`Access to blocked or internal hostname is forbidden: ${hostname}`);
  }

  const remaining = deadlineMs - performance.now();
  if (remaining <= 0) throw new Error('DNS resolution timed out before lookup started.');

  let timer: NodeJS.Timeout | null = null;
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DNS resolution timed out for ${hostname}`)), remaining);
  });

  try {
    const addresses = await Promise.race([dnsLookupAsync(hostname, { all: true }), timeoutP]);

    if (!addresses || addresses.length === 0) {
      throw new Error(`DNS resolution failed for hostname: ${hostname}`);
    }

    for (const record of addresses) {
      if (isPrivateOrReservedIP(record.address)) {
        throw new Error(`Hostname ${hostname} resolves to blocked/private IP: ${record.address}`);
      }
    }

    // Prefer IPv4 for Vercel/Lambda compatibility
    const ipv4 = addresses.find((r) => r.family === 4 || !r.address.includes(':'));
    return ipv4 ? ipv4.address : addresses[0].address;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Cache header extraction ───────────────────────────────────────
function extractCacheObservation(headers: Record<string, string>): CacheObservation {
  return {
    cacheControl: headers['cache-control'] || undefined,
    age: headers['age'] || undefined,
    cfCacheStatus: headers['cf-cache-status'] || undefined,
    xCache: headers['x-cache'] || undefined,
    vary: headers['vary'] || undefined,
    serverTiming: headers['server-timing'] || undefined,
  };
}

// ─── Core timed fetch ──────────────────────────────────────────────
export async function timedFetch(
  rawUrl: string,
  userAgent: string,
  probeTimeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): Promise<TimedFetchResult> {
  const requestStart = performance.now();
  const deadline = requestStart + probeTimeoutMs;

  const redirectChain: RedirectHop[] = [];
  let currentUrl = rawUrl;
  let headersReceivedAt = 0;
  const queueWaitMs = 0; // We don't use a shared queue — tool runs sequentially

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      throw new Error(`Probe timed out after ${probeTimeoutMs}ms for ${rawUrl}`);
    }

    const parsedUrl = validateTargetUrl(currentUrl);

    // DNS + SSRF check for every hop (prevents DNS rebinding)
    const resolvedIp = await resolveSafe(parsedUrl.hostname, deadline);

    const hopStart = performance.now();
    const hopRemainingMs = deadline - hopStart;
    if (hopRemainingMs <= 0) {
      throw new Error(`Probe timed out after ${probeTimeoutMs}ms for ${rawUrl}`);
    }

    // ─── Test transport path ───────────────────────────────────
    if (_testTransport) {
      const result = await _testTransport(parsedUrl, {});
      const flatHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(result.headers)) {
        flatHeaders[k.toLowerCase()] = v;
      }

      const status = result.statusCode;
      if ([301, 302, 303, 307, 308].includes(status) && flatHeaders['location']) {
        const nextUrl = new URL(flatHeaders['location'], currentUrl).toString();
        redirectChain.push({
          from: currentUrl,
          to: nextUrl,
          statusCode: status,
          hopMs: result.headerDelayMs || 0,
        });

        if (hop === MAX_REDIRECTS) {
          throw new Error(`Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops.`);
        }

        // Validate redirect target
        validateTargetUrl(nextUrl);
        currentUrl = nextUrl;
        continue;
      }

      const simHeaderDelay = result.headerDelayMs || 0;
      const simBodyDelay = result.bodyDelayMs || 0;
      headersReceivedAt = requestStart + simHeaderDelay;

      const body = result.body;
      const htmlSize = body.length;
      const truncated = htmlSize > MAX_BODY_BYTES;

      return {
        timing: {
          ttfbMs: Math.round(simHeaderDelay),
          bodyDownloadMs: Math.round(simBodyDelay),
          totalMs: Math.round(simHeaderDelay + simBodyDelay),
          queueWaitMs: 0,
        },
        httpStatus: status,
        httpStatusText: result.statusMessage,
        headers: flatHeaders,
        htmlSizeBytes: Math.min(htmlSize, MAX_BODY_BYTES),
        isTruncated: truncated,
        isBodyIncomplete: false,
        contentType: flatHeaders['content-type'] || '',
        redirectChain,
        finalUrl: currentUrl,
        cacheObservation: extractCacheObservation(flatHeaders),
      };
    }

    // ─── Real transport ────────────────────────────────────────
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const requestOptions: https.RequestOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      servername: parsedUrl.hostname, // TLS SNI
      // Pin to validated IP (prevent DNS rebinding)
      lookup: (_hostname: string, optionsOrCb: unknown, maybeCb?: unknown) => {
        const cb = typeof optionsOrCb === 'function' ? optionsOrCb : (maybeCb as (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void);
        const opts = typeof optionsOrCb === 'object' && optionsOrCb !== null ? (optionsOrCb as { all?: boolean }) : {};
        const family = resolvedIp.includes(':') ? 6 : 4;
        if (opts && opts.all) {
          cb(null, [{ address: resolvedIp, family }]);
        } else {
          cb(null, resolvedIp, family);
        }
      },
      headers: {
        Host: parsedUrl.hostname + (parsedUrl.port ? `:${parsedUrl.port}` : ''),
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'close',
      },
      timeout: hopRemainingMs,
    };

    const hopResult = await new Promise<{
      statusCode: number;
      statusText: string;
      headers: Record<string, string>;
      body: Buffer;
      headersReceivedAt: number;
      bodyCompleteAt: number;
      isTruncated: boolean;
      isBodyIncomplete: boolean;
      redirectLocation?: string;
      wireBytes: number;
    }>((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      let response: http.IncomingMessage | null = null;

      const deadlineTimer = setTimeout(() => {
        if (!settled) {
          timedOut = true;
          settled = true;
          if (response) response.destroy();
          req.destroy();
          reject(new Error(`Probe timed out after ${probeTimeoutMs}ms for ${currentUrl}`));
        }
      }, hopRemainingMs);

      const safe = (fn: () => void) => {
        if (!settled) fn();
      };

      const req = client.request(requestOptions, (res) => {
        response = res;
        const hdrTime = performance.now();
        headersReceivedAt = hdrTime;

        const statusCode = res.statusCode || 0;
        const statusText = res.statusMessage || '';
        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (val) headers[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : val;
        }

        // Redirect?
        if ([301, 302, 303, 307, 308].includes(statusCode) && headers['location']) {
          res.resume();
          safe(() => {
            settled = true;
            clearTimeout(deadlineTimer);
            resolve({
              statusCode,
              statusText,
              headers,
              body: Buffer.alloc(0),
              headersReceivedAt: hdrTime,
              bodyCompleteAt: hdrTime,
              isTruncated: false,
              isBodyIncomplete: false,
              redirectLocation: headers['location'],
              wireBytes: 0,
            });
          });
          return;
        }

        // Decompress
        const encoding = (headers['content-encoding'] || '').toLowerCase().trim();
        let inputStream: NodeJS.ReadableStream = res;
        if (encoding === 'gzip') {
          const d = zlib.createGunzip();
          d.on('error', (err) => safe(() => { settled = true; clearTimeout(deadlineTimer); reject(err); }));
          inputStream = res.pipe(d);
        } else if (encoding === 'deflate') {
          const d = zlib.createInflate();
          d.on('error', (err) => safe(() => { settled = true; clearTimeout(deadlineTimer); reject(err); }));
          inputStream = res.pipe(d);
        } else if (encoding === 'br') {
          const d = zlib.createBrotliDecompress();
          d.on('error', (err) => safe(() => { settled = true; clearTimeout(deadlineTimer); reject(err); }));
          inputStream = res.pipe(d);
        }

        const chunks: Buffer[] = [];
        let totalDecompressed = 0;
        let wireBytes = 0;
        let truncated = false;
        let bodyIncomplete = false;

        const finalize = () => {
          safe(() => {
            settled = true;
            clearTimeout(deadlineTimer);
            resolve({
              statusCode,
              statusText,
              headers,
              body: Buffer.concat(chunks),
              headersReceivedAt: hdrTime,
              bodyCompleteAt: performance.now(),
              isTruncated: truncated,
              isBodyIncomplete: bodyIncomplete,
              wireBytes,
            });
          });
        };

        res.on('data', (chunk: Buffer) => {
          wireBytes += chunk.length;
          if (wireBytes > MAX_WIRE_BYTES) {
            if (!truncated) {
              truncated = true;
              res.destroy();
              if (typeof (inputStream as any).destroy === 'function') {
                (inputStream as any).destroy();
              }
              finalize();
            }
          }
        });

        inputStream.on('data', (chunk: Buffer) => {
          if (totalDecompressed + chunk.length > MAX_BODY_BYTES) {
            const allowed = Math.max(0, MAX_BODY_BYTES - totalDecompressed);
            if (allowed > 0) {
              chunks.push(chunk.subarray(0, allowed));
              totalDecompressed += allowed;
            }
            if (!truncated) {
              truncated = true;
              res.destroy();
              if (typeof (inputStream as any).destroy === 'function') {
                (inputStream as any).destroy();
              }
              finalize();
            }
          } else {
            chunks.push(chunk);
            totalDecompressed += chunk.length;
          }
        });

        inputStream.on('end', finalize);
        inputStream.on('close', () => {
          if (truncated || bodyIncomplete) finalize();
        });

        res.on('error', (err) => {
          if (headersReceivedAt > 0) {
            // We got headers but body failed — retain timing
            bodyIncomplete = true;
            finalize();
          } else {
            safe(() => { settled = true; clearTimeout(deadlineTimer); reject(err); });
          }
        });
      });

      req.on('timeout', () => {
        if (!settled) {
          timedOut = true;
          if (response) response.destroy();
          req.destroy();
          safe(() => {
            settled = true;
            clearTimeout(deadlineTimer);
            reject(new Error(`Probe timed out after ${probeTimeoutMs}ms for ${currentUrl}`));
          });
        }
      });

      req.on('error', (err) => {
        if (!timedOut) {
          safe(() => { settled = true; clearTimeout(deadlineTimer); reject(err); });
        }
      });

      req.end();
    });

    // Handle redirect
    if (hopResult.redirectLocation) {
      if (hop === MAX_REDIRECTS) {
        throw new Error(`Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops.`);
      }

      let nextUrl: string;
      try {
        nextUrl = new URL(hopResult.redirectLocation, currentUrl).toString();
      } catch {
        throw new Error(`Redirect returned invalid Location header: "${hopResult.redirectLocation}"`);
      }

      // Validate redirect destination (SSRF)
      validateTargetUrl(nextUrl);

      redirectChain.push({
        from: currentUrl,
        to: nextUrl,
        statusCode: hopResult.statusCode,
        hopMs: Math.round(hopResult.headersReceivedAt - hopStart),
      });

      currentUrl = nextUrl;
      continue;
    }

    // Final response — compute timing
    const ttfbMs = Math.round(headersReceivedAt - requestStart);
    const bodyDownloadMs = hopResult.isBodyIncomplete
      ? -1
      : Math.round(hopResult.bodyCompleteAt - headersReceivedAt);
    const totalMs = Math.round(hopResult.bodyCompleteAt - requestStart);

    return {
      timing: {
        ttfbMs,
        bodyDownloadMs,
        totalMs,
        queueWaitMs,
      },
      httpStatus: hopResult.statusCode,
      httpStatusText: hopResult.statusText,
      headers: hopResult.headers,
      htmlSizeBytes: hopResult.body.length,
      isTruncated: hopResult.isTruncated,
      isBodyIncomplete: hopResult.isBodyIncomplete,
      contentType: hopResult.headers['content-type'] || '',
      redirectChain,
      finalUrl: currentUrl,
      cacheObservation: extractCacheObservation(hopResult.headers),
    };
  }

  throw new Error(`Redirect loop or exceeded maximum redirect limit for ${rawUrl}`);
}

