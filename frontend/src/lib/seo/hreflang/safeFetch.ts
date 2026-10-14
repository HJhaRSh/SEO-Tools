import dns from 'dns';
import { promisify } from 'util';
import { USER_AGENTS } from './constants';
import { UserAgentProfile } from './types';

const lookupAsync = promisify(dns.lookup);

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 127) return true; // Loopback
  if (a === 0) return true; // Current network
  if (a === 10) return true; // Private 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // Private 172.16.0.0/12
  if (a === 192 && b === 168) return true; // Private 192.168.0.0/16
  if (a === 169 && b === 254) return true; // Link-local / Cloud metadata 169.254.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // Carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a >= 224) return true; // Multicast / Reserved

  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // Unique local
  if (/^fe[89ab]/i.test(normalized)) return true; // Link-local unicast
  if (normalized.startsWith('::ffff:')) {
    const ipv4 = normalized.replace('::ffff:', '');
    return isPrivateIPv4(ipv4);
  }
  return false;
}

/**
 * Validates a target URL against SSRF threats.
 * Blocks non-http/https schemes, localhost, private IP ranges, cloud metadata endpoints,
 * and performs DNS lookup validation to protect against internal IP resolution.
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Please enter a URL to inspect.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(`The URL "${trimmed}" is not a valid absolute URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Disallowed protocol "${parsed.protocol}". Only HTTP and HTTPS URLs are permitted.`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Obvious localhost and internal hostnames
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    throw new Error('Requests to localhost or internal network resources are blocked for security.');
  }

  // Direct IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new Error('Requests to private or reserved IP addresses are blocked for security.');
    }
  }

  // Direct IPv6
  if (hostname.includes(':')) {
    const cleanIpv6 = hostname.replace(/^\[|\]$/g, '');
    if (isPrivateIPv6(cleanIpv6)) {
      throw new Error('Requests to private or loopback IPv6 addresses are blocked for security.');
    }
  }

  // DNS lookup check
  try {
    const lookupResult = await lookupAsync(hostname, { all: true });
    for (const entry of lookupResult) {
      if (entry.family === 4 && isPrivateIPv4(entry.address)) {
        throw new Error('The domain resolves to a private or restricted IP address.');
      }
      if (entry.family === 6 && isPrivateIPv6(entry.address)) {
        throw new Error('The domain resolves to a private or restricted IPv6 address.');
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes('resolves to a private')) {
      throw err;
    }
    throw new Error(`Unable to resolve domain "${hostname}". Ensure the host exists and is publicly accessible.`);
  }

  return parsed;
}

export interface SafeFetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  statusText: string;
  headers: Headers;
  body: string;
  redirectChain: string[];
}

export interface FetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  userAgent?: UserAgentProfile | string;
  accept?: string;
}

/**
 * Executes a secure, bounded HTTP GET request with SSRF validation at every hop,
 * manual redirect following, size cap, and strict timeout.
 */
export async function safeFetch(
  targetUrl: string,
  options: FetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024; // 2MB default

  let uaString = USER_AGENTS.default;
  if (options.userAgent && USER_AGENTS[options.userAgent]) {
    uaString = USER_AGENTS[options.userAgent];
  } else if (typeof options.userAgent === 'string' && options.userAgent.trim()) {
    uaString = options.userAgent.trim();
  }

  let currentUrl = targetUrl;
  const redirectChain: string[] = [];
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    const validatedUrl = await validateSafeUrl(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(validatedUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': uaString,
          'Accept': options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'manual', // Manual handling to inspect and re-validate every redirect against SSRF
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timer);

      // Check for redirect responses
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const locationHeader = response.headers.get('location');
        if (!locationHeader) {
          return {
            requestedUrl: targetUrl,
            finalUrl: currentUrl,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: '',
            redirectChain,
          };
        }

        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error(`Too many redirects encountered (exceeded limit of ${maxRedirects}).`);
        }

        // Resolve relative redirect against current URL
        const nextUrl = new URL(locationHeader, validatedUrl).toString();
        redirectChain.push(nextUrl);
        currentUrl = nextUrl;
        continue;
      }

      // Read response body safely within maxBytes
      const reader = response.body?.getReader();
      let body = '';
      if (reader) {
        let receivedBytes = 0;
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.length;
          body += decoder.decode(value, { stream: true });
          if (receivedBytes > maxBytes) {
            await reader.cancel();
            break;
          }
        }
      } else {
        body = await response.text();
      }

      return {
        requestedUrl: targetUrl,
        finalUrl: currentUrl,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body,
        redirectChain,
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs / 1000}s. The server may be unresponsive or blocking automated queries.`);
      }
      throw err;
    }
  }

  throw new Error(`Redirect chain exceeded ${maxRedirects} redirects.`);
}
