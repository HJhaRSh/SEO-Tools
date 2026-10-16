import { AUDIT_THRESHOLDS } from './constants';

export interface BulkUrlValidationResult {
  validUrls: string[];
  invalidRows: { row: number; raw: string; error: string }[];
  duplicateCount: number;
  totalParsed: number;
}

/**
 * Validates, trims, deduplicates, and sanitizes input URLs for single or bulk mobile-friendly testing.
 * Enforces http/https protocols only and a hard cap of 50 URLs.
 */
export function parseAndValidateBulkUrls(
  rawInput: string,
  maxUrls: number = AUDIT_THRESHOLDS.MAX_URLS_PER_BULK_REQUEST
): BulkUrlValidationResult {
  const lines = (rawInput || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const validUrls: string[] = [];
  const invalidRows: { row: number; raw: string; error: string }[] = [];
  const seenUrls = new Set<string>();
  let duplicateCount = 0;

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const rowNumber = idx + 1;

    // Check scheme and basic URL formatting
    let parsed: URL;
    try {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
      parsed = new URL(hasScheme ? raw : `https://${raw}`);
    } catch {
      invalidRows.push({
        row: rowNumber,
        raw,
        error: 'Invalid URL format.',
      });
      continue;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      invalidRows.push({
        row: rowNumber,
        raw,
        error: `Unsupported scheme "${parsed.protocol}". Only http:// and https:// are accepted.`,
      });
      continue;
    }

    // Normalized string without fragments
    parsed.hash = '';
    const normalized = parsed.toString();

    if (seenUrls.has(normalized.toLowerCase())) {
      duplicateCount++;
      continue;
    }

    if (validUrls.length >= maxUrls) {
      invalidRows.push({
        row: rowNumber,
        raw,
        error: `Exceeded maximum boundary of ${maxUrls} URLs per test.`,
      });
      continue;
    }

    seenUrls.add(normalized.toLowerCase());
    validUrls.push(normalized);
  }

  return {
    validUrls,
    invalidRows,
    duplicateCount,
    totalParsed: lines.length,
  };
}
