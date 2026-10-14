import { XMLParser } from 'fast-xml-parser';
import { HreflangAnnotation, HreflangIssue } from './types';
import { validateHreflangCode } from './validateLocale';

export interface ParsedSitemapResult {
  isSitemapIndex: boolean;
  sitemapIndexUrls: string[];
  totalUrls: number;
  annotations: HreflangAnnotation[];
  issues: HreflangIssue[];
}

/**
 * Parses XML sitemaps safely, supporting:
 * - standard <urlset> with <xhtml:link rel="alternate" hreflang="..." href="..." />
 * - <sitemapindex> for sitemap indexes
 * - XML entity protection (no external DTD or entities)
 * - Bounded traversal (up to maxEntries)
 */
export function parseSitemapXml(
  xmlContent: string,
  sourceUrl: string,
  maxEntries = 1000
): ParsedSitemapResult {
  const issues: HreflangIssue[] = [];
  const annotations: HreflangAnnotation[] = [];
  const sitemapIndexUrls: string[] = [];

  if (!xmlContent || !xmlContent.trim()) {
    issues.push({
      code: 'EMPTY_XML',
      severity: 'error',
      message: 'The provided XML content is empty.',
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  // Basic check against XML Bomb / DOCTYPE expansion
  if (/<!DOCTYPE[^>]*SYSTEM/i.test(xmlContent) || /<!ENTITY/i.test(xmlContent)) {
    issues.push({
      code: 'UNSAFE_XML_DOCTYPE',
      severity: 'error',
      message: 'External DTDs and XML entities are not permitted for security reasons.',
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  let parsed: any;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseTagValue: false, // Keep raw string values
      trimValues: true,
    });
    parsed = parser.parse(xmlContent);
  } catch (err: any) {
    issues.push({
      code: 'MALFORMED_XML',
      severity: 'error',
      message: `Failed to parse XML sitemap: ${err.message || 'Syntax error'}`,
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  if (!parsed || typeof parsed !== 'object') {
    issues.push({
      code: 'INVALID_SITEMAP_ROOT',
      severity: 'error',
      message: 'The XML document does not contain a recognized sitemap or sitemap index structure.',
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  // Check if it's a sitemapindex
  if (parsed.sitemapindex) {
    const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : parsed.sitemapindex.sitemap
      ? [parsed.sitemapindex.sitemap]
      : [];

    for (const sm of sitemaps) {
      if (sm && sm.loc) {
        sitemapIndexUrls.push(String(sm.loc).trim());
      }
    }

    return {
      isSitemapIndex: true,
      sitemapIndexUrls,
      totalUrls: 0,
      annotations,
      issues,
    };
  }

  // Check for urlset
  if (parsed.urlset) {
    const rawUrls = Array.isArray(parsed.urlset.url)
      ? parsed.urlset.url
      : parsed.urlset.url
      ? [parsed.urlset.url]
      : [];

    const totalUrls = rawUrls.length;
    const urlsToProcess = rawUrls.slice(0, maxEntries);

    if (totalUrls > maxEntries) {
      issues.push({
        code: 'SITEMAP_ENTRIES_CAPPED',
        severity: 'info',
        message: `Sitemap contains ${totalUrls.toLocaleString()} URLs. Analysis bounded to the first ${maxEntries.toLocaleString()} entries to ensure high performance.`,
      });
    }

    for (const urlObj of urlsToProcess) {
      if (!urlObj) continue;
      const pageLoc = urlObj.loc ? String(urlObj.loc).trim() : sourceUrl;

      // Extract xhtml:link or link tags
      const linkCandidates: any[] = [];
      for (const [key, val] of Object.entries(urlObj)) {
        if (key.includes('link')) {
          if (Array.isArray(val)) {
            linkCandidates.push(...val);
          } else if (val && typeof val === 'object') {
            linkCandidates.push(val);
          }
        }
      }

      for (const link of linkCandidates) {
        const rel = String(link['@_rel'] || '').toLowerCase();
        const hreflang = String(link['@_hreflang'] || '').trim();
        const href = String(link['@_href'] || '').trim();

        if (rel === 'alternate' && hreflang && href) {
          const locale = validateHreflangCode(hreflang);
          const isSelf = href === pageLoc || href === pageLoc.replace(/\/$/, '') || pageLoc === href.replace(/\/$/, '');

          annotations.push({
            hreflang,
            normalizedHreflang: locale.isXDefault ? 'x-default' : (locale.region ? `${locale.language}-${locale.region}` : (locale.language || hreflang.toLowerCase())),
            language: locale.language,
            region: locale.region,
            script: locale.script,
            href,
            source: 'XML_SITEMAP',
            sourceUrl: pageLoc,
            isSelfReference: isSelf,
          });

          for (const iss of locale.issues) {
            issues.push({
              ...iss,
              sourceUrl: pageLoc,
              alternateUrl: href,
              hreflang,
            });
          }
        }
      }
    }

    return {
      isSitemapIndex: false,
      sitemapIndexUrls: [],
      totalUrls,
      annotations,
      issues,
    };
  }

  issues.push({
    code: 'UNKNOWN_SITEMAP_FORMAT',
    severity: 'error',
    message: 'Could not find <urlset> or <sitemapindex> root elements in the XML.',
  });

  return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
}
