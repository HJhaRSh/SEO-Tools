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
 * Sanitizes an error into a structured, safe client representation.
 * Technical diagnostics are logged safely to server logs without exposure to the client.
 */
export function sanitizeAuditError(err: any): SanitizedErrorInfo {
  const rawMsg = typeof err === 'string' ? err : err?.message || err?.code || String(err || '');
  const lower = rawMsg.toLowerCase();

  // Log raw diagnostic details securely on server (excluding test environments to prevent noisy logs)
  if (process.env.NODE_ENV !== 'test') {
    console.error('[MobileFirstAudit Sanitized Exception]', rawMsg);
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
