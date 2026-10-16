import { XMLParser, XMLValidator } from 'fast-xml-parser';
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
 * Robust XML sitemap and sitemap index parser powered by fast-xml-parser.
 * Supports standard XML namespaces (xmlns:xhtml), encoded entities, CDATA,
 * multiple sitemap entries, and rejects dangerous XXE, DTDs, and malformed XML.
 */
export function parseSitemapXml(
  xmlContent: string,
  sourceUrl: string,
  maxEntries = 1000
): ParsedSitemapResult {
  const issues: HreflangIssue[] = [];
  const annotations: HreflangAnnotation[] = [];
  const sitemapIndexUrls: string[] = [];

  const trimmed = (xmlContent || '').trim();
  if (!trimmed) {
    issues.push({
      code: 'EMPTY_XML',
      severity: 'error',
      message: 'The provided XML content is empty.',
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  // Security: Block XML External Entities (XXE) and recursive DTD expansion
  if (/<!DOCTYPE[^>]*SYSTEM/i.test(trimmed) || /<!ENTITY/i.test(trimmed)) {
    issues.push({
      code: 'UNSAFE_XML_DOCTYPE',
      severity: 'error',
      message: 'External DTDs and XML entities are not permitted for security reasons.',
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  // Syntax and structural validation via XMLValidator
  const validationResult = XMLValidator.validate(trimmed);
  if (validationResult !== true) {
    const errorMsg = typeof validationResult === 'object' && validationResult.err
      ? `${validationResult.err.msg} (Line ${validationResult.err.line})`
      : 'Malformed XML structure.';
    issues.push({
      code: 'MALFORMED_XML',
      severity: 'error',
      message: errorMsg,
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  let parsedObj: any;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      processEntities: true,
      htmlEntities: true,
      trimValues: true,
    });
    parsedObj = parser.parse(trimmed);
  } catch (err: any) {
    issues.push({
      code: 'MALFORMED_XML',
      severity: 'error',
      message: err.message || 'Failed to parse XML structure.',
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  if (!parsedObj || typeof parsedObj !== 'object') {
    issues.push({
      code: 'EMPTY_XML',
      severity: 'error',
      message: 'Parsed XML produced no root structure.',
    });
    return { isSitemapIndex: false, sitemapIndexUrls, totalUrls: 0, annotations, issues };
  }

  // Helper to normalize elements into arrays
  const toArray = <T>(val: T | T[] | undefined): T[] => {
    if (val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
  };

  // 1. Check for <sitemapindex>
  const sitemapIndex = parsedObj.sitemapindex || parsedObj['sitemapindex'];
  if (sitemapIndex) {
    const rawSitemaps = toArray(sitemapIndex.sitemap);
    for (const sm of rawSitemaps) {
      if (!sm) continue;
      const loc = typeof sm === 'string' ? sm.trim() : (typeof sm.loc === 'string' ? sm.loc.trim() : '');
      if (loc) {
        sitemapIndexUrls.push(loc);
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
  const urlset = parsedObj.urlset || parsedObj['urlset'];
  const rawUrls = urlset ? toArray(urlset.url) : [];
  const totalUrls = rawUrls.length;
  const urlsToProcess = rawUrls.slice(0, maxEntries);

  if (totalUrls > maxEntries) {
    issues.push({
      code: 'SITEMAP_ENTRIES_CAPPED',
      severity: 'info',
      message: `Sitemap contains ${totalUrls.toLocaleString()} URLs. Analysis bounded to the first ${maxEntries.toLocaleString()} entries to guarantee fast response times.`,
    });
  }

  for (const urlNode of urlsToProcess) {
    if (!urlNode || typeof urlNode !== 'object') continue;

    const pageLoc = typeof urlNode.loc === 'string' && urlNode.loc.trim()
      ? urlNode.loc.trim()
      : sourceUrl;

    // Collect all link tags: check 'xhtml:link', 'link', or any namespaced link variation
    const rawLinks: any[] = [];
    for (const [k, v] of Object.entries(urlNode)) {
      const lowerKey = k.toLowerCase();
      if (lowerKey === 'xhtml:link' || lowerKey === 'link' || lowerKey.endsWith(':link')) {
        rawLinks.push(...toArray(v));
      }
    }

    for (const linkNode of rawLinks) {
      if (!linkNode || typeof linkNode !== 'object') continue;

      // Extract attributes (fast-xml-parser prefixes attributes with '@_')
      let rel = '';
      let hreflang = '';
      let href = '';

      for (const [attrKey, attrVal] of Object.entries(linkNode)) {
        const cleanKey = attrKey.replace(/^@_/, '').toLowerCase();
        const strVal = typeof attrVal === 'string' ? attrVal.trim() : '';
        if (cleanKey === 'rel') rel = strVal.toLowerCase();
        if (cleanKey === 'hreflang') hreflang = strVal;
        if (cleanKey === 'href') href = strVal;
      }

      if (rel === 'alternate' && hreflang && href) {
        const locale = validateHreflangCode(hreflang);
        const isSelf = href === pageLoc;

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
