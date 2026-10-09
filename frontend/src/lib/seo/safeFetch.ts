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
}

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 512 * 1024; // 512 KiB (500 KiB spec)
const ALLOWED_PORTS = new Set(['80', '443', '']);

/**
 * Resolves a hostname safely and ensures resolved IP is not private/reserved.
 */
export async function validateAndResolveHost(hostname: string): Promise<string> {
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

    return lookupResult[0].address;
  } catch (err: any) {
    if (err.message && err.message.includes('resolves to blocked')) {
      throw err;
    }
    throw new Error(`DNS lookup error for ${hostname}: ${err.message || err}`);
  }
}

/**
 * Validates a target URL against SSRF rules.
 */
export function validateUrl(rawUrl: string): URL {
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

  const redirectHistory: { from: string; to: string; statusCode: number }[] = [];
  let currentUrl = rawUrl;
  const startTime = Date.now();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsedUrl = validateUrl(currentUrl);
    // SSRF DNS re-check on every hop
    await validateAndResolveHost(parsedUrl.hostname);

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const requestOptions: https.RequestOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': customUserAgent,
        'Accept': 'text/plain, text/html, application/xml, text/xml, */*;q=0.8',
        'Accept-Encoding': 'identity', // avoid compressed streams that could bypass byte counting or cause zip bombs
        'Connection': 'close',
        ...(options.headers || {})
      },
      timeout: timeoutMs
    };

    const res = await new Promise<{
      statusCode: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      redirectLocation?: string;
      isTruncated: boolean;
    }>((resolve, reject) => {
      let isTimedOut = false;
      const req = client.request(requestOptions, (response) => {
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
          return resolve({
            statusCode,
            statusText,
            headers,
            body: '',
            redirectLocation: headers['location'],
            isTruncated: false
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
          resolve({
            statusCode,
            statusText,
            headers,
            body,
            isTruncated: truncated
          });
        });

        response.on('close', () => {
          if (truncated) {
            const body = Buffer.concat(chunks).toString('utf-8');
            resolve({
              statusCode,
              statusText,
              headers,
              body,
              isTruncated: true
            });
          }
        });

        response.on('error', (err) => {
          reject(err);
        });
      });

      req.on('timeout', () => {
        isTimedOut = true;
        req.destroy();
        reject(new Error(`Request timed out after ${timeoutMs}ms for ${currentUrl}`));
      });

      req.on('error', (err) => {
        if (!isTimedOut) {
          reject(err);
        }
      });

      req.end();
    });

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
      isTruncated: res.isTruncated
    };
  }

  throw new Error(`Failed to fetch ${rawUrl}: Redirect loop or exceeded limit.`);
}
