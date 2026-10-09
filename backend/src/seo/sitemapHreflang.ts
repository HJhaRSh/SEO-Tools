/**
 * Sitemap Hreflang Validation & Cluster Management
 * Tool 4 — XML Sitemap Generator
 */

import { AlternateEntry, SitemapValidationIssue, SitemapUrlEntry } from './sitemapTypes.js';
import { validateSitemapUrl } from './sitemapValidation.js';

// Common ISO 639-1 language codes supported by search engines
const VALID_LANG_CODES = new Set([
  'aa', 'ab', 'ae', 'af', 'ak', 'am', 'an', 'ar', 'as', 'av', 'ay', 'az',
  'ba', 'be', 'bg', 'bh', 'bi', 'bm', 'bn', 'bo', 'br', 'bs',
  'ca', 'ce', 'ch', 'co', 'cr', 'cs', 'cu', 'cv', 'cy',
  'da', 'de', 'dv', 'dz',
  'ee', 'el', 'en', 'eo', 'es', 'et', 'eu',
  'fa', 'ff', 'fi', 'fj', 'fo', 'fr', 'fy',
  'ga', 'gd', 'gl', 'gn', 'gu', 'gv',
  'ha', 'he', 'hi', 'ho', 'hr', 'ht', 'hu', 'hy', 'hz',
  'ia', 'id', 'ie', 'ig', 'ii', 'ik', 'io', 'is', 'it', 'iu',
  'ja', 'jv',
  'ka', 'kg', 'ki', 'kj', 'kk', 'kl', 'km', 'kn', 'ko', 'kr', 'ks', 'ku', 'kv', 'kw', 'ky',
  'la', 'lb', 'lg', 'li', 'ln', 'lo', 'lt', 'lu', 'lv',
  'mg', 'mh', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my',
  'na', 'nb', 'nd', 'ne', 'ng', 'nl', 'nn', 'no', 'nr', 'nv', 'ny',
  'oc', 'oj', 'om', 'or', 'os',
  'pa', 'pi', 'pl', 'ps', 'pt',
  'qu',
  'rm', 'rn', 'ro', 'ru', 'rw',
  'sa', 'sc', 'sd', 'se', 'sg', 'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'ss', 'st', 'su', 'sv', 'sw',
  'ta', 'te', 'tg', 'th', 'ti', 'tk', 'tl', 'tn', 'to', 'tr', 'ts', 'tt', 'tw', 'ty',
  'ug', 'uk', 'ur', 'uz',
  've', 'vi', 'vo',
  'wa', 'wo',
  'xh',
  'yi', 'yo',
  'za', 'zh', 'zu'
]);

// Valid 2-letter ISO 3166-1 alpha-2 region codes (sample of common countries + general check)
const REGION_REGEX = /^[A-Z]{2}$/i;
const SCRIPT_REGEX = /^[A-Z][a-z]{3}$/i; // ISO 15924 (e.g. Hans, Hant)

/**
 * Validates hreflang value according to Google Search documentation:
 * Supported:
 * - 'x-default'
 * - ISO 639-1 language code (e.g. 'en')
 * - ISO 639-1 with ISO 3166-1 alpha-2 region (e.g. 'en-US', 'de-AT')
 * - ISO 639-1 with ISO 15924 script (e.g. 'zh-Hans', 'zh-Hant')
 * - ISO 639-1 with script and region (e.g. 'zh-Hans-TW')
 */
export function validateHreflangCode(rawCode: string): {
  isValid: boolean;
  normalizedCode?: string;
  error?: string;
} {
  if (!rawCode || typeof rawCode !== 'string') {
    return { isValid: false, error: 'hreflang code is empty or missing.' };
  }

  const trimmed = rawCode.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'x-default') {
    return { isValid: true, normalizedCode: 'x-default' };
  }

  const parts = trimmed.split(/[-_]/); // Accept en-us or en_us
  if (parts.length === 0 || parts.length > 3) {
    return { isValid: false, error: `Invalid hreflang structure: "${trimmed}".` };
  }

  const lang = parts[0].toLowerCase();
  if (!VALID_LANG_CODES.has(lang)) {
    return { isValid: false, error: `Unknown or unsupported language subtag "${parts[0]}". Must be a valid ISO 639-1 code.` };
  }

  if (parts.length === 1) {
    return { isValid: true, normalizedCode: lang };
  }

  if (parts.length === 2) {
    const subtag = parts[1];
    if (SCRIPT_REGEX.test(subtag)) {
      // Script e.g. Hans
      const normalizedScript = subtag.charAt(0).toUpperCase() + subtag.slice(1).toLowerCase();
      return { isValid: true, normalizedCode: `${lang}-${normalizedScript}` };
    } else if (REGION_REGEX.test(subtag)) {
      // Region e.g. US
      return { isValid: true, normalizedCode: `${lang}-${subtag.toUpperCase()}` };
    } else {
      return { isValid: false, error: `Invalid region or script subtag "${subtag}" in "${trimmed}".` };
    }
  }

  if (parts.length === 3) {
    const script = parts[1];
    const region = parts[2];
    if (!SCRIPT_REGEX.test(script) || !REGION_REGEX.test(region)) {
      return { isValid: false, error: `Invalid script/region combination "${trimmed}".` };
    }
    const normalizedScript = script.charAt(0).toUpperCase() + script.slice(1).toLowerCase();
    return { isValid: true, normalizedCode: `${lang}-${normalizedScript}-${region.toUpperCase()}` };
  }

  return { isValid: false, error: `Invalid hreflang code "${trimmed}".` };
}

/**
 * Validates alternate hreflang entries for a single URL entry
 */
export function validateUrlAlternates(
  loc: string,
  alternates: AlternateEntry[],
  rowNumber?: number
): {
  validAlternates: AlternateEntry[];
  issues: SitemapValidationIssue[];
  hasSelfReference: boolean;
} {
  const issues: SitemapValidationIssue[] = [];
  const seenHreflangCodes = new Map<string, string>(); // code -> href
  const validAlternates: AlternateEntry[] = [];
  let hasSelfReference = false;

  for (const alt of alternates) {
    const codeVal = validateHreflangCode(alt.hreflang);
    if (!codeVal.isValid) {
      issues.push({
        rowNumber,
        url: loc,
        field: 'hreflang',
        code: 'HREFLANG_INVALID_CODE',
        message: codeVal.error || `Invalid hreflang code "${alt.hreflang}".`,
        severity: 'error'
      });
      continue;
    }

    const normCode = codeVal.normalizedCode!;

    // Check duplicate code on the same URL entry
    if (seenHreflangCodes.has(normCode)) {
      issues.push({
        rowNumber,
        url: loc,
        field: 'hreflang',
        code: 'HREFLANG_DUPLICATE_CODE',
        message: `Duplicate hreflang code "${normCode}" on URL "${loc}". First points to "${seenHreflangCodes.get(normCode)}", second to "${alt.href}".`,
        severity: 'error'
      });
      continue;
    }

    // Validate alternate URL format
    const urlVal = validateSitemapUrl(alt.href, rowNumber, `hreflang[${normCode}]`);
    if (!urlVal.isValid || !urlVal.sanitizedUrl) {
      issues.push(...urlVal.issues);
      continue;
    }

    seenHreflangCodes.set(normCode, urlVal.sanitizedUrl);

    if (urlVal.sanitizedUrl === loc) {
      hasSelfReference = true;
    }

    validAlternates.push({
      hreflang: normCode,
      href: urlVal.sanitizedUrl
    });
  }

  // Check self-reference warning
  if (validAlternates.length > 0 && !hasSelfReference) {
    issues.push({
      rowNumber,
      url: loc,
      field: 'hreflang',
      code: 'HREFLANG_MISSING_SELF_REFERENCE',
      message: `Google strongly recommends that each URL in an hreflang cluster includes a self-referencing alternate link. No alternate matches loc "${loc}".`,
      severity: 'warning'
    });
  }

  return {
    validAlternates,
    issues,
    hasSelfReference
  };
}

/**
 * Validates cross-cluster reciprocal annotations.
 * Google requirement: If Page A links to Page B as an alternate, Page B MUST link back to Page A.
 */
export function validateReciprocalHreflang(
  urlEntries: SitemapUrlEntry[]
): {
  issues: SitemapValidationIssue[];
  missingReciprocalCount: number;
} {
  const issues: SitemapValidationIssue[] = [];
  const urlMap = new Map<string, SitemapUrlEntry>();

  for (const entry of urlEntries) {
    urlMap.set(entry.loc, entry);
  }

  let missingReciprocalCount = 0;

  for (const entry of urlEntries) {
    if (!entry.alternates || entry.alternates.length === 0) continue;

    for (const alt of entry.alternates) {
      // Self-reference does not need reciprocal check across different URLs
      if (alt.href === entry.loc) continue;

      const targetEntry = urlMap.get(alt.href);
      if (!targetEntry) {
        // Target alternate URL not in sitemap
        issues.push({
          url: entry.loc,
          field: 'hreflang',
          code: 'HREFLANG_ALTERNATE_NOT_IN_SITEMAP',
          message: `Alternate URL "${alt.href}" (hreflang="${alt.hreflang}") is referenced by "${entry.loc}" but is not defined as its own <url> entry in the sitemap.`,
          severity: 'warning'
        });
        missingReciprocalCount++;
        continue;
      }

      // Check if target points back to entry.loc
      const pointsBack = targetEntry.alternates?.some(a => a.href === entry.loc);
      if (!pointsBack) {
        issues.push({
          url: entry.loc,
          field: 'hreflang',
          code: 'HREFLANG_NO_RECIPROCAL_LINK',
          message: `No reciprocal return tag: "${entry.loc}" references "${alt.href}" as alternate, but "${alt.href}" does not reference "${entry.loc}" in return.`,
          severity: 'warning'
        });
        missingReciprocalCount++;
      }
    }
  }

  return { issues, missingReciprocalCount };
}

/**
 * Auto-expands reciprocal hreflang entries from a wide-format dataset or single cluster rows.
 * ONLY invoked if the user explicitly requests auto-generation of reciprocal entries.
 */
export function expandReciprocalEntries(
  primaryEntries: SitemapUrlEntry[]
): {
  expandedEntries: SitemapUrlEntry[];
  addedCount: number;
  addedUrls: string[];
} {
  const urlMap = new Map<string, SitemapUrlEntry>();
  const addedUrls: string[] = [];

  // Register existing entries
  for (const entry of primaryEntries) {
    urlMap.set(entry.loc, { ...entry, alternates: entry.alternates ? [...entry.alternates] : [] });
  }

  // Iterate over entries and ensure all alternates also have <url> entries with reciprocal alternates
  for (const entry of primaryEntries) {
    if (!entry.alternates || entry.alternates.length === 0) continue;

    // Cluster links: all alternates in this cluster plus self if not present
    const cluster = [...entry.alternates];

    for (const alt of entry.alternates) {
      if (!urlMap.has(alt.href)) {
        // Create reciprocal entry
        const newEntry: SitemapUrlEntry = {
          loc: alt.href,
          lastmod: entry.lastmod, // propagate parent lastmod if available
          changefreq: entry.changefreq,
          priority: entry.priority,
          alternates: cluster
        };
        urlMap.set(alt.href, newEntry);
        addedUrls.push(alt.href);
      } else {
        // Ensure target entry contains references to all cluster alternates
        const existing = urlMap.get(alt.href)!;
        const currentAlts = existing.alternates || [];
        const seenHref = new Set(currentAlts.map(a => `${a.hreflang}|${a.href}`));

        for (const c of cluster) {
          const key = `${c.hreflang}|${c.href}`;
          if (!seenHref.has(key)) {
            currentAlts.push(c);
            seenHref.add(key);
          }
        }
        existing.alternates = currentAlts;
      }
    }
  }

  return {
    expandedEntries: Array.from(urlMap.values()),
    addedCount: addedUrls.length,
    addedUrls
  };
}
