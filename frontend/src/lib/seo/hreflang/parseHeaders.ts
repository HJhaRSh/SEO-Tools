import { HreflangAnnotation, HreflangIssue } from './types';
import { validateHreflangCode } from './validateLocale';

export interface ParsedHeaderResult {
  contentLanguageHeader: string | null;
  xRobotsTag: string | null;
  canonicalUrl: string | null;
  annotations: HreflangAnnotation[];
  issues: HreflangIssue[];
}

/**
 * Parses RFC 5988 / RFC 8288 Link headers accurately.
 * Handles comma-separated values, quoted strings with escaped characters,
 * reordered parameters, case insensitivity, and optional whitespace.
 *
 * Example:
 * <https://example.com/en/>; rel="alternate"; hreflang="en", <https://example.com/fr/>; rel="alternate"; hreflang="fr"
 */
export function parseLinkHeaders(linkHeaderValue: string, baseUrl: string): {
  canonicalUrl: string | null;
  annotations: HreflangAnnotation[];
  issues: HreflangIssue[];
} {
  const annotations: HreflangAnnotation[] = [];
  const issues: HreflangIssue[] = [];
  let canonicalUrl: string | null = null;

  if (!linkHeaderValue || !linkHeaderValue.trim()) {
    return { canonicalUrl, annotations, issues };
  }

  // Tokenize by comma, but respect commas inside double quotes
  const linkEntries: string[] = [];
  let inQuotes = false;
  let currentEntry = '';

  for (let i = 0; i < linkHeaderValue.length; i++) {
    const char = linkHeaderValue[i];
    if (char === '"' && (i === 0 || linkHeaderValue[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
      currentEntry += char;
    } else if (char === ',' && !inQuotes) {
      if (currentEntry.trim()) {
        linkEntries.push(currentEntry.trim());
      }
      currentEntry = '';
    } else {
      currentEntry += char;
    }
  }
  if (currentEntry.trim()) {
    linkEntries.push(currentEntry.trim());
  }

  for (const entry of linkEntries) {
    // Match <URL>
    const urlMatch = entry.match(/<([^>]+)>/);
    if (!urlMatch) continue;

    const rawTargetUrl = urlMatch[1].trim();
    const paramsPart = entry.slice(urlMatch[0].length);

    // Parse parameters: ; name="value" or ; name=value
    const paramRegex = /;\s*([a-zA-Z0-9_\-]+)\s*(?:=\s*(?:"([^"]*)"|([^;,\s]+)))?/g;
    const params: Record<string, string> = {};
    let pMatch: RegExpExecArray | null;

    while ((pMatch = paramRegex.exec(paramsPart)) !== null) {
      const pName = pMatch[1].toLowerCase();
      const pVal = pMatch[2] ?? pMatch[3] ?? '';
      params[pName] = pVal.trim();
    }

    const rel = (params.rel || '').toLowerCase();
    const relTokens = rel.split(/\s+/).filter(Boolean);

    // Canonical link header
    if (relTokens.includes('canonical')) {
      try {
        canonicalUrl = new URL(rawTargetUrl, baseUrl).toString();
      } catch {
        canonicalUrl = rawTargetUrl;
      }
    }

    // Hreflang link header
    if (relTokens.includes('alternate') && params.hreflang) {
      const rawHreflang = params.hreflang;
      let resolvedHref = rawTargetUrl;

      if (!/^https?:\/\//i.test(rawTargetUrl)) {
        issues.push({
          code: 'RELATIVE_URL_IN_HEADER',
          severity: 'warning',
          message: `HTTP Link header contains relative URL "${rawTargetUrl}". Google requires absolute URLs.`,
          hreflang: rawHreflang,
          alternateUrl: rawTargetUrl,
        });
        try {
          resolvedHref = new URL(rawTargetUrl, baseUrl).toString();
        } catch {
          resolvedHref = rawTargetUrl;
        }
      }

      const locale = validateHreflangCode(rawHreflang);
      const isSelf = resolvedHref === baseUrl || resolvedHref === baseUrl.replace(/\/$/, '') || baseUrl === resolvedHref.replace(/\/$/, '');

      annotations.push({
        hreflang: rawHreflang,
        normalizedHreflang: locale.isXDefault ? 'x-default' : (locale.region ? `${locale.language}-${locale.region}` : (locale.language || rawHreflang.toLowerCase())),
        language: locale.language,
        region: locale.region,
        script: locale.script,
        href: resolvedHref,
        source: 'HTTP_HEADER',
        sourceUrl: baseUrl,
        isSelfReference: isSelf,
      });

      for (const iss of locale.issues) {
        issues.push({
          ...iss,
          alternateUrl: resolvedHref,
          hreflang: rawHreflang,
        });
      }
    }
  }

  return { canonicalUrl, annotations, issues };
}

/**
 * Extracts all HTTP response header annotations, Content-Language, X-Robots-Tag, and canonical Link headers.
 */
export function parseHttpHeaders(headers: Headers, baseUrl: string): ParsedHeaderResult {
  const contentLanguageHeader = headers.get('content-language');
  const xRobotsTag = headers.get('x-robots-tag');

  // Support multiple Link headers if present
  const linkHeader = headers.get('link') || '';
  const { canonicalUrl, annotations, issues } = parseLinkHeaders(linkHeader, baseUrl);

  return {
    contentLanguageHeader,
    xRobotsTag,
    canonicalUrl,
    annotations,
    issues,
  };
}
