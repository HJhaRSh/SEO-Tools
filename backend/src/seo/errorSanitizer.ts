/**
 * Unified Safe Error Sanitization Utility for Backend Service
 * Sanitizes errors across SEO Tools backend API routes to prevent leakage of internal paths,
 * IP addresses, credentials, and stack traces.
 */

export type SafeErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'BLOCKED_DESTINATION'
  | 'DNS_FAILURE'
  | 'REQUEST_TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  | 'RESPONSE_TOO_LARGE'
  | 'TLS_ERROR'
  | 'NETWORK_ERROR'
  | 'UNSUPPORTED_CONTENT'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

export interface SanitizedErrorInfo {
  code: SafeErrorCode;
  message: string;
  status: number;
}

/**
 * Redacts secrets, credentials, tokens, filesystem paths, and internal IPs from strings
 * to prevent sensitive details from leaking into server logs or responses.
 */
export function redactSensitiveDetails(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let sanitized = raw;

  // 1. Redact credentials in URLs: https://user:pass@example.com -> https://[REDACTED_CREDENTIALS]@example.com
  sanitized = sanitized.replace(
    /([a-zA-Z][a-zA-Z0-9+\-.]*:\/\/)[^/\s:@]+(?::[^/\s:@]+)?@/gi,
    (_match, proto) => `${proto}[REDACTED_CREDENTIALS]@`
  );

  // 2. Redact sensitive query parameter values
  sanitized = sanitized.replace(
    /([?&](?:token|key|secret|auth|api_?key|access_?token|passwd|password|client_?secret)=)[^&\s]+/gi,
    (_match, prefix) => `${prefix}[REDACTED]`
  );

  // 3. Redact Authorization headers and tokens (Bearer / Basic)
  sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9_\-.~+/]+=*/gi, (_match, prefix) => `${prefix}[REDACTED]`);
  sanitized = sanitized.replace(/(Basic\s+)[A-Za-z0-9+/]+=*/gi, (_match, prefix) => `${prefix}[REDACTED]`);

  // 4. Redact common API keys and tokens
  sanitized = sanitized.replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED_AWS_KEY]');
  sanitized = sanitized.replace(/\b(gh[pousr]_[A-Za-z0-9_]{30,})\b/g, '[REDACTED_GITHUB_TOKEN]');
  sanitized = sanitized.replace(/\b([sr]k_(?:live|test)_[0-9a-zA-Z]{16,})\b/g, '[REDACTED_STRIPE_KEY]');
  sanitized = sanitized.replace(/\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.]+\b/g, '[REDACTED_JWT]');
  sanitized = sanitized.replace(/\b[A-Za-z0-9_]*(?:SECRET|PRIVATE|API_KEY|ACCESS_KEY)[A-Za-z0-9_]*\b/gi, '[REDACTED_SECRET]');

  // 5. Redact Windows and Unix filesystem paths that might reveal server folder layout
  sanitized = sanitized.replace(/(?<![a-zA-Z])[a-zA-Z]:\\[^:\s"'`<>]+/g, '[REDACTED_PATH]');
  sanitized = sanitized.replace(/(?<![a-zA-Z])[a-zA-Z]:\/[^:\s"'`<>]+/g, '[REDACTED_PATH]');
  sanitized = sanitized.replace(/(?:\/(?:var|home|etc|tmp|usr|app|root|Users|bin|opt))\/[^\s"'`<>]+/g, '[REDACTED_PATH]');

  // 6. Redact internal/private IP addresses and cloud metadata
  sanitized = sanitized.replace(/\b127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/\b10(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/\b192\.168(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/\b172\.(?:1[6-9]|2[0-9]|3[0-1])(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/\b169\.254(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}\b/g, '[INTERNAL_IP]');
  sanitized = sanitized.replace(/(^|[\s,;:([<])(::1)(?=$|[\s,;:)>\]])/g, (_match, prefix) => `${prefix}[INTERNAL_IP]`);
  sanitized = sanitized.replace(/(^|[\s,;:([<])(fe80:[0-9a-fA-F:]+)(?=$|[\s,;:)>\]])/g, (_match, prefix) => `${prefix}[INTERNAL_IP]`);
  sanitized = sanitized.replace(/(^|[\s,;:([<])(fc00:[0-9a-fA-F:]+)(?=$|[\s,;:)>\]])/g, (_match, prefix) => `${prefix}[INTERNAL_IP]`);

  return sanitized;
}

/**
 * Classifies an error into a safe client-facing category, message, and status code.
 * Preserves user-facing validation messages while redacting system errors.
 */
export function classifyAndSanitizeError(err: unknown, defaultMessage?: string): SanitizedErrorInfo {
  const rawMsg = typeof err === 'string'
    ? err
    : (err as any)?.message || (err as any)?.code || String(err || '');
  const lower = rawMsg.toLowerCase();

  // 1. SSRF / Private network / Cloud metadata protection
  if (
    lower.includes('ssrf') ||
    lower.includes('blocked_destination') ||
    lower.includes('private or reserved') ||
    lower.includes('restricted ip') ||
    lower.includes('resolves to private') ||
    lower.includes('resolves to blocked') ||
    lower.includes('internal network') ||
    lower.includes('loopback') ||
    lower.includes('cloud metadata') ||
    lower.includes('metadata.google.internal') ||
    lower.includes('169.254.169.254') ||
    lower.includes('blockedbyclient') ||
    lower.includes('target destination is blocked')
  ) {
    return {
      code: 'BLOCKED_DESTINATION',
      message: 'The requested destination is restricted or resolves to a private network.',
      status: 403,
    };
  }

  // 2. Invalid URL / protocol
  if (
    lower.includes('malformed url') ||
    lower.includes('invalid url') ||
    lower.includes('cannot parse url') ||
    lower.includes('failed to parse url')
  ) {
    return {
      code: 'INVALID_URL',
      message: 'The provided URL is malformed or invalid.',
      status: 400,
    };
  }

  if (
    lower.includes('disallowed protocol') ||
    lower.includes('unsupported url protocol') ||
    lower.includes('only http and https') ||
    lower.includes('only http:') ||
    lower.includes('only https:')
  ) {
    return {
      code: 'UNSUPPORTED_PROTOCOL',
      message: 'Only HTTP and HTTPS URLs are supported.',
      status: 400,
    };
  }

  // 3. DNS resolution failure
  if (
    lower.includes('dns') ||
    lower.includes('enotfound') ||
    lower.includes('eai_again') ||
    lower.includes('getaddrinfo') ||
    lower.includes('unable to resolve domain')
  ) {
    return {
      code: 'DNS_FAILURE',
      message: 'Domain name resolution failed. Please verify the hostname is public and correct.',
      status: 502,
    };
  }

  // 4. Request timeout
  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('esockettimedout') ||
    lower.includes('deadline') ||
    lower.includes('fetch_timeout')
  ) {
    return {
      code: 'REQUEST_TIMEOUT',
      message: 'The connection timed out while communicating with the remote server.',
      status: 504,
    };
  }

  // 5. Redirect limits & loops
  if (
    lower.includes('redirect loop') ||
    lower.includes('too many redirects') ||
    lower.includes('exceeded limit of') ||
    lower.includes('exceeded maximum redirect')
  ) {
    return {
      code: 'TOO_MANY_REDIRECTS',
      message: 'The target URL encountered a redirect loop or exceeded maximum redirects.',
      status: 502,
    };
  }

  // 6. Response size limit
  if (
    lower.includes('response_too_large') ||
    lower.includes('too large') ||
    lower.includes('size limit') ||
    lower.includes('exceeded max')
  ) {
    return {
      code: 'RESPONSE_TOO_LARGE',
      message: 'The response payload exceeded the maximum allowable size limit.',
      status: 502,
    };
  }

  // 7. TLS / SSL handshake
  if (
    lower.includes('certificate') ||
    lower.includes('tls') ||
    lower.includes('ssl') ||
    lower.includes('handshake')
  ) {
    return {
      code: 'TLS_ERROR',
      message: 'SSL/TLS handshake or certificate verification failed.',
      status: 502,
    };
  }

  // 8. Unsupported content type
  if (
    lower.includes('unsupported content type') ||
    lower.includes('only html pages can be inspected') ||
    lower.includes('not an html webpage')
  ) {
    return {
      code: 'UNSUPPORTED_CONTENT',
      message: 'The URL returned an unsupported content type. Only HTML webpages can be inspected.',
      status: 400,
    };
  }

  // 9. Network connectivity / connection refused
  if (
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('socket hang up') ||
    lower.includes('failed to establish connection')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Failed to establish connection with the target server.',
      status: 502,
    };
  }

  // 10. Explicit user validation feedback (preserves input feedback while blocking sensitive leaks)
  const hasStackTrace = lower.includes('at ') && (lower.includes('node:') || lower.includes('.ts:') || lower.includes('.js:'));
  const hasPathLeak = /(?:[a-zA-Z]:[\\\/]|\/(?:var|home|etc|tmp|usr|app|root|Users|bin|opt)\/)/i.test(rawMsg);
  const hasIpLeak = /\b(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.)/.test(rawMsg);

  if (
    !hasStackTrace &&
    !hasPathLeak &&
    !hasIpLeak &&
    (
      lower.startsWith('please provide') ||
      lower.startsWith('please enter') ||
      lower.startsWith('please select') ||
      lower.startsWith('a valid') ||
      lower.startsWith('invalid') ||
      lower.includes('is required') ||
      lower.includes('required field') ||
      lower.includes('missing required') ||
      lower.includes('limit exceeded') ||
      lower.includes('exceeds limit') ||
      lower.includes('exceeds permitted limit') ||
      lower.includes('exceeds the maximum') ||
      lower.includes('exceeding the maximum') ||
      lower.includes('maximum url limit') ||
      lower.includes('unsupported file') ||
      lower.includes('unsupported format') ||
      lower.includes('no content or file data') ||
      lower.includes('invalid place id') ||
      lower.includes('viewport dimensions')
    )
  ) {
    return {
      code: 'VALIDATION_ERROR',
      message: redactSensitiveDetails(rawMsg),
      status: 400,
    };
  }

  // 11. Generic fallback for unexpected exceptions — never leak file paths, system error codes or stacks
  return {
    code: 'INTERNAL_ERROR',
    message: defaultMessage || 'An unexpected error occurred while processing your request. Please try again.',
    status: 500,
  };
}
