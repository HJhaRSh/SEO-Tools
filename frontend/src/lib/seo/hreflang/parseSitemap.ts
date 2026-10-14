import { HreflangAnnotation, HreflangIssue } from './types';
import { validateHreflangCode } from './validateLocale';

export interface ParsedSitemapResult {
  isSitemapIndex: boolean;
  sitemapIndexUrls: string[];
  totalUrls: number;
  annotations: HreflangAnnotation[];
  issues: HreflangIssue[];
}

function decodeXmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

function parseXmlAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_\-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = decodeXmlEntities(val.trim());
  }
  return attrs;
}

/**
 * High-performance, zero-external-dependency XML parser specifically built
 * for Google-compliant XML sitemaps and sitemap indexes.
 * Eliminates Vercel monorepo module-not-found build errors while maintaining
 * strict security against XML entity expansion attacks.
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

  // Security: Block XML External Entities (XXE) and recursive DTD expansion
  if (/<!DOCTYPE[^>]*SYSTEM/i.test(xmlContent) || /<!ENTITY/i.test(xmlContent)) {
    issues.push({
      code: 'UNSAFE_XML_DOCTYPE',
      severity: 'error',
      message: 'External DTDs and XML entities are not permitted for security reasons.',
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  // 1. Check for <sitemapindex>
  if (/<sitemapindex[\s>]/i.test(xmlContent)) {
    const sitemapBlocks = xmlContent.match(/<sitemap[\s>][\s\S]*?<\/sitemap>/gi) || [];
    for (const smBlock of sitemapBlocks) {
      const locMatch = smBlock.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i);
      if (locMatch) {
        const cleanLoc = decodeXmlEntities(locMatch[1].trim());
        if (cleanLoc) {
          sitemapIndexUrls.push(cleanLoc);
        }
      }
    }

    return {
      isSitemapIndex: true,
      sitemapIndexUrls,
      totalUrls: sitemapIndexUrls.length,
      annotations,
      issues,
    };
  }

  // 2. Check for standard <urlset>
  const urlBlocks = xmlContent.match(/<url[\s>][\s\S]*?<\/url>/gi) || [];
  const totalUrls = urlBlocks.length;
  const urlsToProcess = urlBlocks.slice(0, maxEntries);

  if (totalUrls > maxEntries) {
    issues.push({
      code: 'SITEMAP_ENTRIES_CAPPED',
      severity: 'info',
      message: `Sitemap contains ${totalUrls.toLocaleString()} URLs. Analysis bounded to the first ${maxEntries.toLocaleString()} entries to guarantee fast response times.`,
    });
  }

  for (const urlBlock of urlsToProcess) {
    const locMatch = urlBlock.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i);
    const pageLoc = locMatch ? decodeXmlEntities(locMatch[1].trim()) : sourceUrl;

    // Match all <xhtml:link ... /> or <link ... /> tags inside this <url> block
    const linkTagRegex = /<(?:xhtml:)?link\s+([^>]*?)(?:\/?>|<\/(?:xhtml:)?link>)/gi;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkTagRegex.exec(urlBlock)) !== null) {
      const attrs = parseXmlAttributes(linkMatch[1]);
      const rel = (attrs.rel || '').toLowerCase();
      const hreflang = attrs.hreflang || '';
      const href = attrs.href || '';

      if (rel === 'alternate' && hreflang && href) {
        const locale = validateHreflangCode(hreflang);
        const isSelf =
          href === pageLoc ||
          href === pageLoc.replace(/\/$/, '') ||
          pageLoc === href.replace(/\/$/, '');

        annotations.push({
          hreflang,
          normalizedHreflang: locale.isXDefault
            ? 'x-default'
            : locale.region
            ? `${locale.language}-${locale.region}`
            : locale.language || hreflang.toLowerCase(),
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
