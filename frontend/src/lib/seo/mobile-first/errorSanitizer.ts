/**
 * Error Sanitization Utility for Mobile-First Index Checker
 * Maps internal, network, and parser errors to safe, user-facing error codes and messages.
 * Prevents leakage of internal IPs, ports, file paths, credentials, and stack traces.
 */

export type SanitizedErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'BLOCKED_DESTINATION'
  | 'DNS_FAILURE'
  | 'REQUEST_TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  | 'RESPONSE_TOO_LARGE'
  | 'TLS_ERROR'
  | 'NETWORK_ERROR'
  | 'ROBOTS_FETCH_FAILED'
  | 'INTERNAL_ERROR';

export interface SanitizedErrorInfo {
  code: SanitizedErrorCode;
  userMessage: string;
  statusCode: number;
}

/**
 * Redacts secrets, credentials, tokens, filesystem paths, and internal IPs from strings
 * to prevent sensitive details from leaking into server logs or diagnostics.
 */
export function redactSensitiveDetails(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let sanitized = raw;

  // 1. Redact credentials in URLs: https://user:pass@example.com -> https://[REDACTED_CREDENTIALS]@example.com
  sanitized = sanitized.replace(
    /([a-zA-Z][a-zA-Z0-9+\-.]*:\/\/)[^/\s:@]+(?::[^/\s:@]+)?@/gi,
    (_match, proto) => `${proto}[REDACTED_CREDENTIALS]@`
  );

  // 2. Redact sensitive query parameter values (token, key, secret, auth, api_key, password, etc.)
  sanitized = sanitized.replace(
    /([?&](?:token|key|secret|auth|api_?key|access_?token|passwd|password|client_?secret)=)[^&\s]+/gi,
    (_match, prefix) => `${prefix}[REDACTED]`
  );

  // 3. Redact Authorization headers and tokens (Bearer / Basic)
  sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9_\-.~+/]+=*/gi, (_match, prefix) => `${prefix}[REDACTED]`);
  sanitized = sanitized.replace(/(Basic\s+)[A-Za-z0-9+/]+=*/gi, (_match, prefix) => `${prefix}[REDACTED]`);

  // 4. Redact common API keys and tokens (AWS, GitHub, Stripe, generic JWTs, generic SECRET tokens)
  sanitized = sanitized.replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED_AWS_KEY]');
  sanitized = sanitized.replace(/\b(gh[pousr]_[A-Za-z0-9_]{30,})\b/g, '[REDACTED_GITHUB_TOKEN]');
  sanitized = sanitized.replace(/\b([sr]k_(?:live|test)_[0-9a-zA-Z]{16,})\b/g, '[REDACTED_STRIPE_KEY]');
  sanitized = sanitized.replace(/\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.]+\b/g, '[REDACTED_JWT]');
  sanitized = sanitized.replace(/\b[A-Za-z0-9_]*(?:SECRET|PRIVATE|API_KEY|ACCESS_KEY)[A-Za-z0-9_]*\b/gi, '[REDACTED_SECRET]');

  // 5. Redact Windows and Unix filesystem paths that might reveal server folder layout
  // Windows: C:\... or C:/... (require drive letter not preceded by alphabet character to avoid false matching URL schemes like https:/)
  sanitized = sanitized.replace(/(?<![a-zA-Z])[a-zA-Z]:\\[^:\s"'`<>]+/g, '[REDACTED_PATH]');
  sanitized = sanitized.replace(/(?<![a-zA-Z])[a-zA-Z]:\/[^:\s"'`<>]+/g, '[REDACTED_PATH]');
  // Unix paths: /var/..., /home/..., /etc/..., /tmp/..., /usr/..., /app/...
  sanitized = sanitized.replace(/(?:\/(?:var|home|etc|tmp|usr|app|root|Users|bin|opt))\/[^\s"'`<>]+/g, '[REDACTED_PATH]');

  // 6. Redact internal/private IP addresses and cloud metadata
  // 127.0.0.1, 10.x.x.x, 192.168.x.x, 172.(16-31).x.x, 169.254.x.x
  sanitized = sanitized.replace(/\b127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/\b10(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/\b192\.168(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/\b172\.(?:1[6-9]|2[0-9]|3[0-1])(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/\b169\.254(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}\b/g, '[INTERNAL_IP]');
  // IPv6 loopback / unique local / link local (not using \b because colons are not word characters)
  sanitized = sanitized.replace(/(^|[\s,;:([<])(::1)(?=$|[\s,;:)>\]])/g, (_match, prefix) => `${prefix}[INTERNAL_IP]`);
  sanitized = sanitized.replace(/(^|[\s,;:([<])(fe80:[0-9a-fA-F:]+)(?=$|[\s,;:)>\]])/g, (_match, prefix) => `${prefix}[INTERNAL_IP]`);
  sanitized = sanitized.replace(/(^|[\s,;:([<])(fc00:[0-9a-fA-F:]+)(?=$|[\s,;:)>\]])/g, (_match, prefix) => `${prefix}[INTERNAL_IP]`);

  return sanitized;
}

/**
 * Sanitizes an error into a structured, safe client representation.
 * Technical diagnostics are sanitized to redact sensitive secrets/paths before server logging.
 */
export function sanitizeAuditError(err: any): SanitizedErrorInfo {
  const rawMsg = typeof err === 'string' ? err : err?.message || err?.code || String(err || '');
  const lower = rawMsg.toLowerCase();

  // Log sanitized diagnostic details securely on server (excluding test environments to prevent noisy logs)
  if (process.env.NODE_ENV !== 'test') {
    const sanitizedMsg = redactSensitiveDetails(rawMsg);
    console.error('[MobileFirstAudit Sanitized Exception]', sanitizedMsg);
  }

  // 1. Invalid URL / protocol
  if (
    lower.includes('invalid url') ||
    lower.includes('cannot parse url') ||
    lower.includes('failed to parse')
  ) {
    return {
      code: 'INVALID_URL',
      userMessage: 'The provided URL is malformed or invalid.',
      statusCode: 400,
    };
  }

  if (
    lower.includes('unsupported protocol') ||
    lower.includes('only http:') ||
    lower.includes('only https:')
  ) {
    return {
      code: 'UNSUPPORTED_PROTOCOL',
      userMessage: 'Only HTTP and HTTPS protocols are supported.',
      statusCode: 400,
    };
  }

  // 2. SSRF / Private network / Cloud metadata protection
  if (
    lower.includes('blocked') ||
    lower.includes('private') ||
    lower.includes('internal') ||
    lower.includes('loopback') ||
    lower.includes('metadata') ||
    lower.includes('credentials') ||
    lower.includes('localhost')
  ) {
    return {
      code: 'BLOCKED_DESTINATION',
      userMessage: 'The requested destination is restricted or resolves to a private network.',
      statusCode: 403,
    };
  }

  // 3. DNS resolution failure
  if (
    lower.includes('dns') ||
    lower.includes('enotfound') ||
    lower.includes('eai_again') ||
    lower.includes('getaddrinfo')
  ) {
    return {
      code: 'DNS_FAILURE',
      userMessage: 'Domain name resolution failed. Please verify the hostname is public and correct.',
      statusCode: 502,
    };
  }

  // 4. Timeouts
  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('esockettimedout') ||
    lower.includes('deadline')
  ) {
    return {
      code: 'REQUEST_TIMEOUT',
      userMessage: 'The connection timed out while requesting the webpage.',
      statusCode: 504,
    };
  }

  // 5. Redirect limits
  if (lower.includes('redirect') || lower.includes('too many redirects')) {
    return {
      code: 'TOO_MANY_REDIRECTS',
      userMessage: 'The target URL exceeded the maximum allowable redirect limit.',
      statusCode: 502,
    };
  }

  // 6. Response size limits
  if (
    lower.includes('too large') ||
    lower.includes('size limit') ||
    lower.includes('exceeded max') ||
    lower.includes('maxbytes')
  ) {
    return {
      code: 'RESPONSE_TOO_LARGE',
      userMessage: 'The response payload exceeded the maximum allowable size limit.',
      statusCode: 502,
    };
  }

  // 7. TLS / SSL handshake
  if (
    lower.includes('certificate') ||
    lower.includes('tls') ||
    lower.includes('ssl') ||
    lower.includes('handshake') ||
    lower.includes('cert')
  ) {
    return {
      code: 'TLS_ERROR',
      userMessage: 'SSL/TLS handshake or certificate verification failed.',
      statusCode: 502,
    };
  }

  // 8. Robots.txt specific failure
  if (lower.includes('robots.txt') || lower.includes('robots fetch')) {
    return {
      code: 'ROBOTS_FETCH_FAILED',
      userMessage: 'Could not retrieve or evaluate the site robots.txt file.',
      statusCode: 502,
    };
  }

  // 9. Network connectivity / connection refused / socket reset
  if (
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('pipe') ||
    lower.includes('socket hang up') ||
    lower.includes('network')
  ) {
    return {
      code: 'NETWORK_ERROR',
      userMessage: 'A network connection failure occurred while communicating with the remote server.',
      statusCode: 502,
    };
  }

  // 10. Default / unexpected internal error — NEVER leak file paths, IP addresses, or stack traces
  return {
    code: 'INTERNAL_ERROR',
    userMessage: 'The audit could not complete because of an internal processing error.',
    statusCode: 500,
  };
}
