import dns from 'dns';
import { promisify } from 'util';
import http from 'http';
import https from 'https';
import { isBlockedHostname, isPrivateOrReservedIP } from '../ssrf';

const dnsLookup = promisify(dns.lookup);

export interface PrerenderFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  userAgent: string;
  allowLocalhostForTesting?: boolean;
}

export interface PrerenderFetchResult {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  rawBuffer: Buffer;
  body: string;
  md5: string;
  sha256: string;
  redirectHistory: { from: string; to: string; statusCode: number }[];
  durationMs: number;
  contentType: string;
  timestamp: string;
  isTruncated: boolean;
}

export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_TIMEOUT_MS = 10000; // Total operation deadline: 10s
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB limit per user agent
const ALLOWED_PORTS = new Set(['80', '443', '']);

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

  const isLocalhostTest = allowLocalhostForTesting && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (!isLocalhostTest && !ALLOWED_PORTS.has(parsed.port)) {
    throw new Error(`Port "${parsed.port}" is not allowed for security reasons.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('User credentials in URLs are not permitted.');
  }

  return parsed;
}

/**
 * Resolves a hostname safely and ensures resolved IP is not private/reserved.
 */
export async function validateAndResolveHost(hostname: string, allowLocalhostForTesting = false): Promise<string> {
  if (allowLocalhostForTesting && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return '127.0.0.1';
  }

  if (isBlockedHostname(hostname)) {
    throw new Error(`Access to blocked or internal hostname is forbidden: ${hostname}`);
  }

  try {
    const lookupResult = await dnsLookup(hostname, { all: true });
    if (!lookupResult || lookupResult.length === 0) {
      throw new Error(`DNS resolution failed for hostname: ${hostname}`);
    }

    for (const record of lookupResult) {
      if (isPrivateOrReservedIP(record.address)) {
        throw new Error(`Hostname ${hostname} resolves to blocked/private IP: ${record.address}`);
      }
    }

    // In cloud serverless environments (AWS Lambda / Vercel), outbound IPv6 is typically unrouted
    // and causes socket ENETUNREACH or timeouts. Prefer IPv4 record for outbound egress compatibility.
    const ipv4Record = lookupResult.find(r => r.family === 4 || !r.address.includes(':'));
    return ipv4Record ? ipv4Record.address : lookupResult[0].address;
  } catch (err: any) {
    if (err.message && err.message.includes('resolves to blocked')) {
      throw err;
    }
    throw new Error(`DNS lookup error for ${hostname}: ${err.message || err}`);
  }
}

import { createHash } from 'node:crypto';

/**
 * Extracts charset parameter from Content-Type header.
 */
function extractCharset(contentType: string): string {
  const match = contentType.match(/charset\s*=\s*['"]?([a-zA-Z0-9_\-]+)['"]?/i);
  return match ? match[1].toLowerCase() : 'utf-8';
}

/**
 * Decodes buffer to string respecting standard charsets (utf-8, iso-8859-1, ascii, etc.).
 */
function decodeResponseBody(buffer: Buffer, contentType: string): string {
  const charset = extractCharset(contentType);
  if (charset === 'iso-8859-1' || charset === 'latin1') {
    return buffer.toString('latin1');
  }
  if (charset === 'ascii') {
    return buffer.toString('ascii');
  }
  try {
    return buffer.toString('utf-8');
  } catch {
    return buffer.toString('latin1');
  }
}

/**
 * Executes a secure, connection-level pinned HTTP GET request.
 * Enforces a strict total-operation deadline across DNS, TLS, connection, redirects, and body streaming.
 * Pins DNS to verified public IP inside socket hook to eliminate DNS rebinding.
 * Computes MD5 and SHA-256 fingerprints directly on raw response bytes before any string decoding.
 */
export async function fetchWithUserAgent(
  rawUrl: string,
  options: PrerenderFetchOptions
): Promise<PrerenderFetchResult> {
  const totalDeadlineMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const customUserAgent = options.userAgent;
  const allowLocalhostForTesting = options.allowLocalhostForTesting ?? false;

  const redirectHistory: { from: string; to: string; statusCode: number }[] = [];
  let currentUrl = rawUrl;
  const startTime = Date.now();

  // Create an overall deadline abort trigger
  let isOverallDeadlineExpired = false;
  let activeRequest: http.ClientRequest | null = null;
  let activeResponse: http.IncomingMessage | null = null;

  const deadlineTimer = setTimeout(() => {
    isOverallDeadlineExpired = true;
    if (activeResponse) {
      activeResponse.destroy();
    }
    if (activeRequest) {
      activeRequest.destroy(new Error(`REQUEST_TIMEOUT: Total operation deadline of ${totalDeadlineMs}ms exceeded.`));
    }
  }, totalDeadlineMs);

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const remainingTimeMs = totalDeadlineMs - (Date.now() - startTime);
      if (remainingTimeMs <= 0 || isOverallDeadlineExpired) {
        throw new Error(`REQUEST_TIMEOUT: Total operation deadline of ${totalDeadlineMs}ms exceeded.`);
      }

      const parsedUrl = validateUrl(currentUrl, allowLocalhostForTesting);
      const resolvedIp = await validateAndResolveHost(parsedUrl.hostname, allowLocalhostForTesting);

      const client = parsedUrl.protocol === 'https:' ? https : http;

      const requestOptions: https.RequestOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        // Pin connection directly to validated IP (mitigates DNS rebinding)
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
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity', // Avoid compressed streams that can hide zip bombs
          'Cache-Control': 'no-cache',
          'Connection': 'close',
        },
        timeout: remainingTimeMs,
      };

      const res = await new Promise<{
        statusCode: number;
        statusText: string;
        headers: Record<string, string>;
        rawBuffer: Buffer;
        redirectLocation?: string;
      }>((resolve, reject) => {
        let isTimedOut = false;
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

          // Check for redirects
          if ([301, 302, 303, 307, 308].includes(statusCode) && headers['location']) {
            response.resume(); // discard body
            return resolve({
              statusCode,
              statusText,
              headers,
              rawBuffer: Buffer.alloc(0),
              redirectLocation: headers['location'],
            });
          }

          const chunks: Buffer[] = [];
          let totalBytes = 0;

          response.on('data', (chunk: Buffer) => {
            if (isOverallDeadlineExpired) {
              response.destroy();
              return reject(new Error(`REQUEST_TIMEOUT: Total operation deadline of ${totalDeadlineMs}ms exceeded.`));
            }
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
              response.destroy();
              return reject(new Error(`RESPONSE_TOO_LARGE: Response body exceeded maximum allowed limit of ${(maxBytes / (1024 * 1024)).toFixed(1)}MB.`));
            }
            chunks.push(chunk);
          });

          response.on('end', () => {
            activeResponse = null;
            const rawBuffer = Buffer.concat(chunks);
            resolve({
              statusCode,
              statusText,
              headers,
              rawBuffer,
            });
          });

          response.on('error', (err) => {
            activeResponse = null;
            reject(err);
          });
        });

        activeRequest = req;

        req.on('timeout', () => {
          isTimedOut = true;
          req.destroy();
          reject(new Error(`REQUEST_TIMEOUT: Request timed out after ${remainingTimeMs}ms for ${currentUrl}`));
        });

        req.on('error', (err) => {
          activeRequest = null;
          if (isOverallDeadlineExpired) {
            reject(new Error(`REQUEST_TIMEOUT: Total operation deadline of ${totalDeadlineMs}ms exceeded.`));
          } else if (!isTimedOut) {
            reject(err);
          }
        });

        req.end();
      });

      if (res.redirectLocation) {
        if (hop === maxRedirects) {
          throw new Error(`TOO_MANY_REDIRECTS: Exceeded maximum redirect limit of ${maxRedirects} hops.`);
        }

        // Check redirect loop
        const nextUrl = new URL(res.redirectLocation, currentUrl).toString();
        if (redirectHistory.some((h) => h.to === nextUrl) || nextUrl === currentUrl) {
          throw new Error('Redirect loop detected.');
        }

        redirectHistory.push({
          from: currentUrl,
          to: nextUrl,
          statusCode: res.statusCode,
        });

        currentUrl = nextUrl;
        continue;
      }

      const durationMs = Date.now() - startTime;
      const contentType = res.headers['content-type'] || 'text/plain';

      // Compute raw byte fingerprints directly on original binary buffer
      const md5 = createHash('md5').update(res.rawBuffer).digest('hex');
      const sha256 = createHash('sha256').update(res.rawBuffer).digest('hex');

      // Decode body respecting declared charset
      const decodedBody = decodeResponseBody(res.rawBuffer, contentType);

      return {
        requestedUrl: rawUrl,
        finalUrl: currentUrl,
        statusCode: res.statusCode,
        statusText: res.statusText,
        headers: res.headers,
        rawBuffer: res.rawBuffer,
        body: decodedBody,
        md5,
        sha256,
        redirectHistory,
        durationMs,
        contentType,
        timestamp: new Date().toISOString(),
        isTruncated: false,
      };
    }

    throw new Error(`Failed to fetch ${rawUrl}: Redirect loop or exceeded limit.`);
  } finally {
    clearTimeout(deadlineTimer);
    activeRequest = null;
    activeResponse = null;
  }
}
