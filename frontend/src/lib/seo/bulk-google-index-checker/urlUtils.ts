export const MAX_BATCH_CAPACITY = 100;

export interface NormalizedUrlResult {
  validUrls: string[];
  errors: { url: string; error: string }[];
}

/**
 * Normalizes and validates input URLs for bulk Google site: searching:
 * - Splits multiline input
 * - Trims whitespace
 * - Discards empty lines
 * - Validates format and restricts to HTTP / HTTPS protocols
 * - Strips URL fragments (#hash) while preserving full path and query parameters
 * - Deduplicates identical URLs while strictly preserving original input order
 * - Enforces batch capacity of up to 100 URLs
 */
export function normalizeInputUrls(input: string | string[]): NormalizedUrlResult {
  let lines: string[] = [];

  if (Array.isArray(input)) {
    lines = input;
  } else if (typeof input === 'string') {
    lines = input.split(/\r?\n/);
  }

  const seen = new Set<string>();
  const validUrls: string[] = [];
  const errors: { url: string; error: string }[] = [];

  for (const raw of lines) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    try {
      const parsed = new URL(trimmed);

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push({
          url: trimmed,
          error: `Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are allowed.`
        });
        continue;
      }

      // Strip URL fragment/hash, keeping path and query params intact
      parsed.hash = '';
      const normalized = parsed.toString();

      if (!seen.has(normalized)) {
        seen.add(normalized);
        if (validUrls.length < MAX_BATCH_CAPACITY) {
          validUrls.push(normalized);
        } else {
          errors.push({
            url: normalized,
            error: `Exceeds maximum batch capacity of ${MAX_BATCH_CAPACITY} URLs.`
          });
        }
      }
    } catch {
      errors.push({
        url: trimmed,
        error: 'Invalid URL format. Please provide a valid absolute URL (e.g., https://example.com/page).'
      });
    }
  }

  return { validUrls, errors };
}

