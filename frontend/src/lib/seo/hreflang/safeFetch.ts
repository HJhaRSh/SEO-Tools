import dns from 'dns';
import { promisify } from 'util';
import { USER_AGENTS } from './constants';
import { UserAgentProfile } from './types';
import { safeFetch as baseSafeFetch } from '../safeFetch';
import { isBlockedHostname, isPrivateOrReservedIP } from '../ssrf';

const lookupAsync = promisify(dns.lookup);

export function isPrivateIPv4(ip: string): boolean {
  return isPrivateOrReservedIP(ip);
}

export function isPrivateIPv6(ip: string): boolean {
  return isPrivateOrReservedIP(ip);
}

/**
 * Validates a target URL against SSRF threats.
 * Blocks non-http/https schemes, localhost, private IP ranges, cloud metadata endpoints,
 * and performs DNS lookup validation to protect against internal IP resolution.
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    const err = new Error('Please enter a URL to inspect.');
    (err as any).code = 'INVALID_URL';
    throw err;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    const err = new Error(`The URL "${trimmed}" is not a valid absolute URL.`);
    (err as any).code = 'INVALID_URL';
    throw err;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error(`Disallowed protocol "${parsed.protocol}". Only HTTP and HTTPS URLs are permitted.`);
    (err as any).code = 'UNSUPPORTED_PROTOCOL';
    throw err;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (isBlockedHostname(hostname)) {
    const err = new Error('Requests to localhost or internal network resources are blocked for security.');
    (err as any).code = 'BLOCKED_DESTINATION';
    throw err;
  }

  // DNS lookup check to reject private / reserved IPs
  try {
    const lookupResult = await lookupAsync(hostname, { all: true });
    if (!lookupResult || lookupResult.length === 0) {
      const err = new Error(`Unable to resolve domain "${hostname}". Ensure the host exists and is publicly accessible.`);
      (err as any).code = 'DNS_ERROR';
      throw err;
    }

    for (const entry of lookupResult) {
      if (isPrivateOrReservedIP(entry.address)) {
        const err = new Error('The domain resolves to a private or restricted IP address.');
        (err as any).code = 'BLOCKED_DESTINATION';
        throw err;
      }
    }
  } catch (err: any) {
    if (err.code === 'BLOCKED_DESTINATION' || (err.message && err.message.includes('resolves to a private'))) {
      throw err;
    }
    const dnsErr = new Error(`Unable to resolve domain "${hostname}". Ensure the host exists and is publicly accessible.`);
    (dnsErr as any).code = 'DNS_ERROR';
    throw dnsErr;
  }

  return parsed;
}

/**
 * Performs connection-level DNS resolution that rejects any internal, loopback,
 * or private IP destinations before the socket connection is made.
 */
export async function resolveAndVerifyPublicIp(hostname: string): Promise<string> {
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  if (isBlockedHostname(cleanHost)) {
    const err = new Error('Requests to private or reserved IP addresses are blocked for security.');
    (err as any).code = 'BLOCKED_DESTINATION';
    throw err;
  }

  const lookupResult = await lookupAsync(cleanHost, { all: true });
  if (!lookupResult || lookupResult.length === 0) {
    const err = new Error(`Unable to resolve domain "${cleanHost}". Ensure the host exists and is publicly accessible.`);
    (err as any).code = 'DNS_ERROR';
    throw err;
  }

  for (const entry of lookupResult) {
    if (isPrivateOrReservedIP(entry.address)) {
      const err = new Error('The domain resolves to a private or restricted IP address.');
      (err as any).code = 'BLOCKED_DESTINATION';
      throw err;
    }
  }

  return lookupResult[0].address;
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
 * Executes a secure, connection-level pinned HTTP GET request.
 * Pins outbound socket connections to verified public IPs to prevent DNS rebinding.
 * Enforces total operation deadlines, response-size caps, strict SSRF validations at every hop,
 * and preserves full HTTPS hostname/TLS certificate verification.
 */
export async function safeFetch(
  targetUrl: string,
  options: FetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024; // 2MB default

  let uaString = USER_AGENTS.default;
  if (options.userAgent && (USER_AGENTS as any)[options.userAgent]) {
    uaString = (USER_AGENTS as any)[options.userAgent];
  } else if (typeof options.userAgent === 'string' && options.userAgent.trim()) {
    uaString = options.userAgent.trim();
  }

  const trimmedUrl = (targetUrl || '').trim();
  const normalizedTarget = trimmedUrl.includes('://') ? trimmedUrl : `https://${trimmedUrl}`;

  try {
    const res = await baseSafeFetch(normalizedTarget, {
      timeoutMs,
      maxRedirects,
      maxBytes,
      userAgent: uaString,
      headers: {
        'Accept': options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const webHeaders = new Headers(res.headers);
    const redirectChain = (res.redirectHistory || []).map((h) => h.to);

    return {
      requestedUrl: res.requestedUrl,
      finalUrl: res.finalUrl,
      status: res.statusCode,
      statusText: res.statusText,
      headers: webHeaders,
      body: res.body,
      redirectChain,
    };
  } catch (err: any) {
    const rawMsg = err?.message || '';
    if (rawMsg.includes('timed out') || rawMsg.includes('REQUEST_TIMEOUT')) {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs / 1000}s. The server may be unresponsive or blocking automated queries.`);
      (timeoutErr as any).code = 'FETCH_TIMEOUT';
      throw timeoutErr;
    }
    if (rawMsg.includes('TOO_MANY_REDIRECTS') || rawMsg.includes('Exceeded maximum redirect limit')) {
      const redirErr = new Error(`Too many redirects encountered (exceeded limit of ${maxRedirects}).`);
      (redirErr as any).code = 'TOO_MANY_REDIRECTS';
      throw redirErr;
    }
    if (rawMsg.includes('RESPONSE_TOO_LARGE') || rawMsg.includes('body exceeded maximum')) {
      const sizeErr = new Error(`RESPONSE_TOO_LARGE: Response body exceeded maximum allowed limit of ${(maxBytes / (1024 * 1024)).toFixed(1)}MB.`);
      (sizeErr as any).code = 'RESPONSE_TOO_LARGE';
      throw sizeErr;
    }
    if (rawMsg.includes('blocked') || rawMsg.includes('private') || rawMsg.includes('restricted')) {
      const blockErr = new Error('The domain resolves to a private or restricted IP address.');
      (blockErr as any).code = 'BLOCKED_DESTINATION';
      throw blockErr;
    }
    throw err;
  }
}
