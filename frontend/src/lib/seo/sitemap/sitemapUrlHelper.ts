/**
 * Sitemap URL Depth & Format Helpers
 * Tool 4 — XML Sitemap Generator
 */

import { SitemapChangeFreq, SitemapUrlEntry } from './sitemapTypes';

/**
 * Calculates URL path depth for hierarchical SEO priority.
 * Examples:
 * - https://example.com/ -> 0 (Homepage)
 * - https://example.com/about/ -> 1 (Top-level section)
 * - https://example.com/services/seo/ -> 2 (Sub-section)
 * - https://example.com/services/seo/audit/ -> 3 (Deep page)
 */
export function calculateUrlDepth(urlStr: string): number {
  if (!urlStr || typeof urlStr !== 'string') return 1;

  try {
    const parsed = new URL(urlStr.trim());
    let pathname = parsed.pathname.trim();

    // Remove leading and trailing slashes
    pathname = pathname.replace(/^\/+|\/+$/g, '');

    if (!pathname) {
      return 0; // Homepage / root
    }

    const segments = pathname.split('/').filter(s => {
      const seg = s.trim().toLowerCase();
      // Ignore empty segments and standard default index files
      return (
        seg.length > 0 &&
        seg !== 'index.html' &&
        seg !== 'index.htm' &&
        seg !== 'index.php' &&
        seg !== 'index.asp' &&
        seg !== 'index.aspx'
      );
    });

    return segments.length;
  } catch {
    // If not a full URL or parsing fails, count path segments
    const clean = urlStr.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
    if (!clean) return 0;
    return clean.split('/').filter(Boolean).length;
  }
}

/**
 * Maps URL depth to standard SEO priority:
 * - Depth 0 (Homepage): 1.0
 * - Depth 1 (Primary Category/Landing): 0.8
 * - Depth 2 (Sub-category / Product / Article): 0.6
 * - Depth 3+ (Deep utility / nested post): 0.4
 */
export function getDepthPriority(depth: number): string {
  if (depth <= 0) return '1.0';
  if (depth === 1) return '0.8';
  if (depth === 2) return '0.6';
  return '0.4';
}

/**
 * Maps URL depth to standard SEO change frequency:
 * - Depth 0 (Homepage): daily
 * - Depth 1 (Top sections): weekly
 * - Depth 2+ (Sub-pages & deep content): monthly
 */
export function getDepthChangefreq(depth: number): SitemapChangeFreq {
  if (depth <= 0) return 'daily';
  if (depth === 1) return 'weekly';
  return 'monthly';
}

/**
 * Parses a single manual input line.
 * Supports:
 * 1. Plain URL:
 *    https://example.com/
 * 2. Delimited (pipe, tab, or comma):
 *    https://example.com/about | 0.8 | weekly
 *    https://example.com/about\t0.8\tweekly
 *    https://example.com/about, 0.8, weekly
 */
export function parseManualUrlLine(line: string): SitemapUrlEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Determine delimiter: pipe '|', tab '\t', or comma ',' (when not in query string)
  let delimiter: string | null = null;
  if (trimmed.includes('|')) {
    delimiter = '|';
  } else if (trimmed.includes('\t')) {
    delimiter = '\t';
  } else if (trimmed.includes(',') && !trimmed.includes('?')) {
    delimiter = ',';
  }

  if (delimiter) {
    const parts = trimmed.split(delimiter).map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      const loc = parts[0];
      let priority: string | undefined = undefined;
      let changefreq: SitemapChangeFreq | undefined = undefined;
      let lastmod: string | undefined = undefined;

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        // Priority match: decimal 0.0 - 1.0
        if (/^(0(\.[0-9]+)?|1(\.0+)?)$/.test(part)) {
          priority = parseFloat(part).toFixed(1);
        }
        // Changefreq match: sitemap protocol keywords
        else if (['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(part.toLowerCase())) {
          changefreq = part.toLowerCase() as SitemapChangeFreq;
        }
        // W3C lastmod match: YYYY-MM-DD
        else if (/^\d{4}-\d{2}-\d{2}/.test(part)) {
          lastmod = part;
        }
      }

      return { loc, priority, changefreq, lastmod };
    }
  }

  return { loc: trimmed };
}
