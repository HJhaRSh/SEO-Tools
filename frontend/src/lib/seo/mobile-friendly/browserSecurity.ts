import dns from 'dns';
import { promisify } from 'util';
import { isBlockedHostname, isPrivateOrReservedIP } from '../ssrf';
import { redactSensitiveDetails } from '../errorSanitizer';

const lookupAsync = promisify(dns.lookup);
const ALLOWED_PORTS = new Set(['80', '443', '']);

/**
 * Validates a target URL against SSRF threats before initiating any browser session.
 */
export async function validateTargetUrlForBrowser(rawUrl: string): Promise<URL> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    const err = new Error('A valid target URL is required.');
    (err as any).code = 'INVALID_URL';
    throw err;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
  } catch {
    const err = new Error('Malformed URL.');
    (err as any).code = 'INVALID_URL';
    throw err;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('Only HTTP and HTTPS URLs are supported.');
    (err as any).code = 'UNSUPPORTED_PROTOCOL';
    throw err;
  }

  if (parsed.username || parsed.password) {
    const err = new Error('Credentials in URLs are forbidden.');
    (err as any).code = 'BLOCKED_DESTINATION';
    throw err;
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    const err = new Error(`Port "${parsed.port}" is not permitted for security reasons.`);
    (err as any).code = 'BLOCKED_DESTINATION';
    throw err;
  }

  if (isBlockedHostname(parsed.hostname)) {
    const err = new Error('Target destination is blocked.');
    (err as any).code = 'BLOCKED_DESTINATION';
    throw err;
  }

  // Resolve DNS to verify IP is public
  try {
    const records = await lookupAsync(parsed.hostname, { all: true });
    if (!records || records.length === 0) {
      const err = new Error(`Unable to resolve domain "${parsed.hostname}".`);
      (err as any).code = 'DNS_FAILURE';
      throw err;
    }

    for (const record of records) {
      if (isPrivateOrReservedIP(record.address)) {
        const err = new Error('Target destination resolves to a private or restricted network.');
        (err as any).code = 'BLOCKED_DESTINATION';
        throw err;
      }
    }
  } catch (lookupErr: any) {
    if (lookupErr.code === 'BLOCKED_DESTINATION') throw lookupErr;
    const err = new Error(`DNS resolution failed for "${parsed.hostname}".`);
    (err as any).code = 'DNS_FAILURE';
    throw err;
  }

  return parsed;
}

export interface BrowserSecurityContext {
  getSecurityViolation: () => string | null;
}

/**
 * Attaches comprehensive network isolation to a Playwright browser context.
 * Intercepts all requests (main document, subresources, iframes, JS fetch/XHR)
 * and enforces strict SSRF and IP restrictions.
 */
export async function setupBrowserSecurityContext(
  context: import('playwright-core').BrowserContext
): Promise<BrowserSecurityContext> {
  let securityViolation: string | null = null;
  const dnsSafetyCache = new Map<string, boolean>();

  // 1. Intercept all outbound network traffic from the browser context
  await context.route('**/*', async (route, request) => {
    const reqUrl = request.url();

    // Allow benign local memory schemes
    if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:') || reqUrl === 'about:blank') {
      return route.continue();
    }

    let parsed: URL;
    try {
      parsed = new URL(reqUrl);
    } catch {
      securityViolation = `Malformed subresource URL: ${reqUrl}`;
      return route.abort('blockedbyclient');
    }

    // Protocol check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      securityViolation = `Disallowed subresource protocol: ${parsed.protocol}`;
      return route.abort('blockedbyclient');
    }

    // Port check
    if (!ALLOWED_PORTS.has(parsed.port)) {
      securityViolation = `Disallowed subresource port: ${parsed.port}`;
      return route.abort('blockedbyclient');
    }

    // Blocked hostname check
    if (isBlockedHostname(parsed.hostname)) {
      securityViolation = `Blocked internal hostname: ${parsed.hostname}`;
      return route.abort('blockedbyclient');
    }

    // DNS & IP check with session cache
    const host = parsed.hostname.toLowerCase();
    const cachedSafety = dnsSafetyCache.get(host);
    if (cachedSafety === false) {
      securityViolation = `Host previously determined unsafe: ${host}`;
      return route.abort('blockedbyclient');
    }

    if (cachedSafety === true) {
      return route.continue();
    }

    try {
      const records = await lookupAsync(host, { all: true });
      if (!records || records.length === 0) {
        dnsSafetyCache.set(host, false);
        securityViolation = `DNS failed for host: ${host}`;
        return route.abort('blockedbyclient');
      }

      for (const record of records) {
        if (isPrivateOrReservedIP(record.address)) {
          dnsSafetyCache.set(host, false);
          securityViolation = `Host ${host} resolves to private/restricted IP`;
          return route.abort('blockedbyclient');
        }
      }

      dnsSafetyCache.set(host, true);
      return route.continue();
    } catch {
      dnsSafetyCache.set(host, false);
      securityViolation = `DNS lookup failed for host: ${host}`;
      return route.abort('blockedbyclient');
    }
  });

  // 2. Add init script to disable internal-network probing APIs (WebSockets, WebRTC)
  await context.addInitScript(() => {
    try {
      // Disable WebSockets
      (window as any).WebSocket = class extends EventTarget {
        constructor() {
          super();
          throw new Error('WebSockets are disabled during audit');
        }
      };

      // Disable WebRTC to prevent local IP enumeration via ICE candidates
      (window as any).RTCPeerConnection = undefined;
      (window as any).webkitRTCPeerConnection = undefined;
    } catch {
      // Ignore if running in non-window context
    }
  });

  return {
    getSecurityViolation: () => securityViolation,
  };
}

/**
 * Classifies browser rendering errors into safe, client-facing status codes and messages.
 */
export function classifyBrowserRenderError(
  err: unknown,
  securityViolation: string | null
): { code: string; message: string; status: number } {
  const rawMsg = typeof err === 'string'
    ? err
    : (err as any)?.message || (err as any)?.code || String(err || '');
  const lower = rawMsg.toLowerCase();

  if (
    securityViolation ||
    lower.includes('blocked_destination') ||
    lower.includes('net::err_blocked_by_client') ||
    lower.includes('blocked destination') ||
    lower.includes('private or restricted')
  ) {
    return {
      code: 'BLOCKED_DESTINATION',
      message: 'Target destination or requested subresource is restricted for security.',
      status: 403,
    };
  }

  if (
    lower.includes('executable') ||
    lower.includes('failed to launch') ||
    lower.includes('chromium unavailable')
  ) {
    return {
      code: 'RENDER_UNAVAILABLE',
      message: 'Browser rendering engine is temporarily unavailable.',
      status: 503,
    };
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('navigation timeout')
  ) {
    return {
      code: 'REQUEST_TIMEOUT',
      message: 'The page took too long to load or render.',
      status: 504,
    };
  }

  if (
    lower.includes('net::err_name_not_resolved') ||
    lower.includes('dns_failure') ||
    lower.includes('dns resolution failed')
  ) {
    return {
      code: 'DNS_FAILURE',
      message: 'Domain name resolution failed for the target URL.',
      status: 502,
    };
  }

  if (
    lower.includes('net::err_connection_refused') ||
    lower.includes('net::err_connection_reset') ||
    lower.includes('net::err_connection_closed') ||
    lower.includes('network_error')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Could not establish connection with the target server.',
      status: 502,
    };
  }

  if (
    lower.includes('malformed url') ||
    lower.includes('invalid url') ||
    lower.includes('unsupported protocol')
  ) {
    return {
      code: 'INVALID_URL',
      message: 'The target URL is invalid or uses an unsupported protocol.',
      status: 400,
    };
  }

  return {
    code: 'RENDER_FAILED',
    message: 'Browser rendering could not complete for this page.',
    status: 500,
  };
}
