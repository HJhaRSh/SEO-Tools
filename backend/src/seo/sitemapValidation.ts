/**
 * Sitemap URL & Metadata Validation
 * Tool 4 — XML Sitemap Generator
 */

import { SitemapChangeFreq, SitemapValidationIssue } from './sitemapTypes.js';

export const VALID_CHANGEFREQS: ReadonlySet<SitemapChangeFreq> = new Set([
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never'
]);

/**
 * Validates absolute URL according to RFC 3986 and Sitemap Protocol.
 * Protocol requirements:
 * - Must start with http:// or https://
 * - No fragment identifiers (#anchor)
 * - Valid domain/host
 * - Preserves query parameters, encoded characters, trailing slashes, path case
 */
export function validateSitemapUrl(rawUrl: string, rowNumber?: number, fieldName: string = 'loc'): {
  isValid: boolean;
  sanitizedUrl?: string;
  issues: SitemapValidationIssue[];
} {
  const issues: SitemapValidationIssue[] = [];

  if (!rawUrl || typeof rawUrl !== 'string') {
    issues.push({
      rowNumber,
      field: fieldName,
      code: 'URL_EMPTY',
      message: `${fieldName} is empty or missing.`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    issues.push({
      rowNumber,
      field: fieldName,
      code: 'URL_EMPTY',
      message: `${fieldName} is whitespace only.`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    issues.push({
      rowNumber,
      url: trimmed,
      field: fieldName,
      code: 'URL_MALFORMED',
      message: `Invalid URL format: "${trimmed}". Must be a valid absolute URL.`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    issues.push({
      rowNumber,
      url: trimmed,
      field: fieldName,
      code: 'URL_UNSUPPORTED_SCHEME',
      message: `Unsupported scheme "${parsed.protocol}". Sitemaps only permit http: and https:.`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes('.')) {
    // Note: localhost is acceptable in dev/testing, but check for valid hostname
    if (parsed.hostname !== 'localhost') {
      issues.push({
        rowNumber,
        url: trimmed,
        field: fieldName,
        code: 'URL_INVALID_HOSTNAME',
        message: `Invalid or incomplete hostname "${parsed.hostname}".`,
        severity: 'error'
      });
      return { isValid: false, issues };
    }
  }

  // Fragment warning: Sitemap specification disallows fragments
  if (parsed.hash) {
    issues.push({
      rowNumber,
      url: trimmed,
      field: fieldName,
      code: 'URL_FRAGMENT_REMOVED',
      message: `URL contains fragment "${parsed.hash}". Fragments are not recognized by search engines and will be stripped.`,
      severity: 'warning'
    });
  }

  // Sanitize: strip hash fragment while strictly preserving path, query params, port, and trailing slash
  parsed.hash = '';
  const sanitized = parsed.toString();

  return {
    isValid: true,
    sanitizedUrl: sanitized,
    issues
  };
}

/**
 * Validates W3C Datetime format for sitemap <lastmod>.
 * Allowed:
 * - YYYY-MM-DD
 * - YYYY-MM-DDThh:mm:ssTZD (e.g. 2026-10-01T10:30:00+05:30 or 2026-10-01T05:00:00Z)
 */
export function validateLastmodDate(rawDate: string | Date | undefined | null, rowNumber?: number): {
  isValid: boolean;
  formattedDate?: string;
  issues: SitemapValidationIssue[];
} {
  const issues: SitemapValidationIssue[] = [];

  if (rawDate === undefined || rawDate === null || rawDate === '') {
    return { isValid: true, formattedDate: undefined, issues };
  }

  if (rawDate instanceof Date) {
    if (isNaN(rawDate.getTime())) {
      issues.push({
        rowNumber,
        field: 'lastmod',
        code: 'DATE_INVALID',
        message: 'Invalid Date object provided.',
        severity: 'error'
      });
      return { isValid: false, issues };
    }
    // Return YYYY-MM-DD
    return { isValid: true, formattedDate: rawDate.toISOString().split('T')[0], issues };
  }

  const str = String(rawDate).trim();
  if (!str) {
    return { isValid: true, formattedDate: undefined, issues };
  }

  // Strict regex for W3C sitemap formats
  // 1. Date only: YYYY-MM-DD
  const dateOnlyRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  // 2. Full datetime with TZD: YYYY-MM-DDThh:mm:ss(Z|([+-]\d{2}:\d{2}))
  const dateTimeRegex = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

  const dateMatch = str.match(dateOnlyRegex);
  const dateTimeMatch = str.match(dateTimeRegex);

  if (!dateMatch && !dateTimeMatch) {
    // Attempt standard ISO parsing check to give a helpful error message
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
      // Possible non-W3C format like MM/DD/YYYY or DD-MM-YYYY
      issues.push({
        rowNumber,
        field: 'lastmod',
        code: 'DATE_NON_W3C_FORMAT',
        message: `Date "${str}" is not in standard W3C format (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss+TZ). Converted to YYYY-MM-DD.`,
        severity: 'warning'
      });
      const d = new Date(parsed);
      return { isValid: true, formattedDate: d.toISOString().split('T')[0], issues };
    }

    issues.push({
      rowNumber,
      field: 'lastmod',
      code: 'DATE_MALFORMED',
      message: `Invalid lastmod date format: "${str}". Expected YYYY-MM-DD or W3C Datetime.`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  // Validate calendar validity (e.g. reject 2026-02-30)
  const [yearStr, monthStr, dayStr] = (dateMatch || dateTimeMatch)!.slice(1, 4);
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);

  if (m < 1 || m > 12) {
    issues.push({
      rowNumber,
      field: 'lastmod',
      code: 'DATE_INVALID_MONTH',
      message: `Month ${m} is out of bounds in "${str}".`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) {
    issues.push({
      rowNumber,
      field: 'lastmod',
      code: 'DATE_INVALID_DAY',
      message: `Day ${d} is invalid for month ${m}/${y} in "${str}".`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  // Check if date is in the far future (warn if > 30 days ahead)
  const now = new Date();
  const targetDate = new Date(str.includes('T') ? str : `${str}T00:00:00Z`);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (targetDate > thirtyDaysAhead) {
    issues.push({
      rowNumber,
      field: 'lastmod',
      code: 'DATE_FUTURE',
      message: `lastmod "${str}" is in the future. Google advises accurate modification dates.`,
      severity: 'warning'
    });
  }

  return { isValid: true, formattedDate: str, issues };
}

/**
 * Validates changefreq
 */
export function validateChangeFreq(rawFreq: string | undefined | null, rowNumber?: number): {
  isValid: boolean;
  value?: SitemapChangeFreq;
  issues: SitemapValidationIssue[];
} {
  const issues: SitemapValidationIssue[] = [];
  if (!rawFreq) return { isValid: true, issues };

  const lower = rawFreq.trim().toLowerCase() as SitemapChangeFreq;
  if (!VALID_CHANGEFREQS.has(lower)) {
    issues.push({
      rowNumber,
      field: 'changefreq',
      code: 'CHANGEFREQ_INVALID',
      message: `Invalid changefreq "${rawFreq}". Allowed values: always, hourly, daily, weekly, monthly, yearly, never.`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  issues.push({
    rowNumber,
    field: 'changefreq',
    code: 'CHANGEFREQ_GOOGLE_IGNORED',
    message: `changefreq is valid per Sitemap Protocol, but note that Google and major search engines currently ignore this hint.`,
    severity: 'info'
  });

  return { isValid: true, value: lower, issues };
}

/**
 * Validates priority (0.0 to 1.0)
 */
export function validatePriority(rawPriority: string | number | undefined | null, rowNumber?: number): {
  isValid: boolean;
  value?: string;
  issues: SitemapValidationIssue[];
} {
  const issues: SitemapValidationIssue[] = [];
  if (rawPriority === undefined || rawPriority === null || rawPriority === '') {
    return { isValid: true, issues };
  }

  const num = typeof rawPriority === 'number' ? rawPriority : parseFloat(String(rawPriority).trim());
  if (isNaN(num) || num < 0.0 || num > 1.0) {
    issues.push({
      rowNumber,
      field: 'priority',
      code: 'PRIORITY_OUT_OF_RANGE',
      message: `Priority "${rawPriority}" is invalid. Must be a decimal number between 0.0 and 1.0.`,
      severity: 'error'
    });
    return { isValid: false, issues };
  }

  const formatted = num.toFixed(1);

  issues.push({
    rowNumber,
    field: 'priority',
    code: 'PRIORITY_GOOGLE_IGNORED',
    message: `priority is valid per Sitemap Protocol, but note that Google ignores priority scores.`,
    severity: 'info'
  });

  return { isValid: true, value: formatted, issues };
}

/**
 * Escapes XML entities strictly
 */
export function escapeXmlEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
