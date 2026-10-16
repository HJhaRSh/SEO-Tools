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
  body: string;
  redirectHistory: { from: string; to: string; statusCode: number }[];
  durationMs: number;
  contentType: string;
  timestamp: string;
  isTruncated: boolean;
}

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB limit per user agent
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

    return lookupResult[0].address;
  } catch (err: any) {
    if (err.message && err.message.includes('resolves to blocked')) {
      throw err;
    }
    throw new Error(`DNS lookup error for ${hostname}: ${err.message || err}`);
  }
}

/**
 * Executes a secure, connection-level pinned HTTP GET request.
 * Pins DNS to the verified public IP inside the lookup socket hook to eliminate DNS rebinding TOCTOU.
 * Rejects oversized responses exceeding maxBytes with an explicit error.
 */
export async function fetchWithUserAgent(
  rawUrl: string,
  options: PrerenderFetchOptions
): Promise<PrerenderFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const customUserAgent = options.userAgent;
  const allowLocalhostForTesting = options.allowLocalhostForTesting ?? false;

  const redirectHistory: { from: string; to: string; statusCode: number }[] = [];
  let currentUrl = rawUrl;
  const startTime = Date.now();

  for (let hop = 0; hop <= maxRedirects; hop++) {
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
      timeout: timeoutMs,
    };

    const res = await new Promise<{
      statusCode: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      redirectLocation?: string;
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

        // Check for redirects
        if ([301, 302, 303, 307, 308].includes(statusCode) && headers['location']) {
          response.resume(); // discard body
          return resolve({
            statusCode,
            statusText,
            headers,
            body: '',
            redirectLocation: headers['location'],
          });
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        response.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            response.destroy();
            return reject(new Error(`RESPONSE_TOO_LARGE: Response body exceeded maximum allowed limit of ${(maxBytes / (1024 * 1024)).toFixed(1)}MB.`));
          }
          chunks.push(chunk);
        });

        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({
            statusCode,
            statusText,
            headers,
            body,
          });
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
      isTruncated: false,
    };
  }

  throw new Error(`Failed to fetch ${rawUrl}: Redirect loop or exceeded limit.`);
}
