/**
 * Sitemap Index Builder
 * Tool 4 — XML Sitemap Generator
 */

import { escapeXmlEntities, validateSitemapUrl } from './sitemapValidation.js';

export interface SitemapIndexEntry {
  loc: string;
  lastmod?: string | null;
}

/**
 * Builds valid XML for <sitemapindex>
 * Google and Sitemap Protocol specification:
 * - Root element <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
 * - Contains <sitemap> child elements
 * - Each <sitemap> has <loc> (required absolute URL) and optional <lastmod>
 */
export function buildSitemapIndexXml(entries: SitemapIndexEntry[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];

  for (const entry of entries) {
    lines.push('  <sitemap>');
    lines.push(`    <loc>${escapeXmlEntities(entry.loc)}</loc>`);
    if (entry.lastmod) {
      lines.push(`    <lastmod>${escapeXmlEntities(entry.lastmod)}</lastmod>`);
    }
    lines.push('  </sitemap>');
  }

  lines.push('</sitemapindex>');
  return lines.join('\n');
}

/**
 * Validates and constructs absolute public URLs for each generated split sitemap file.
 * Strict Rule: Never invent a public base URL. If none is supplied or invalid, flag an error.
 */
export function buildIndexEntriesFromFiles(
  filenames: string[],
  publicBaseUrl: string | undefined | null,
  indexLastmod?: string
): {
  success: boolean;
  entries?: SitemapIndexEntry[];
  error?: string;
} {
  if (!publicBaseUrl || typeof publicBaseUrl !== 'string' || !publicBaseUrl.trim()) {
    return {
      success: false,
      error: 'A public sitemap base URL (e.g., https://example.com/sitemaps/) is required to generate a valid sitemap index.'
    };
  }

  const trimmed = publicBaseUrl.trim();
  const urlCheck = validateSitemapUrl(trimmed, undefined, 'publicBaseUrl');
  if (!urlCheck.isValid || !urlCheck.sanitizedUrl) {
    return {
      success: false,
      error: `The specified public sitemap base URL is invalid: "${trimmed}". Must be a valid absolute HTTP/HTTPS URL.`
    };
  }

  // Ensure trailing slash on base URL for clean resolution
  const baseUrl = urlCheck.sanitizedUrl.endsWith('/')
    ? urlCheck.sanitizedUrl
    : `${urlCheck.sanitizedUrl}/`;

  const entries: SitemapIndexEntry[] = filenames.map(fname => ({
    loc: `${baseUrl}${fname}`,
    lastmod: indexLastmod || undefined
  }));

  return {
    success: true,
    entries
  };
}
