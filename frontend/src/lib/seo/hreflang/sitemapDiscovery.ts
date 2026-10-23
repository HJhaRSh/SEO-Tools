import zlib from 'zlib';
import { safeFetch } from './safeFetch';
import { parseSitemapXml } from './parseSitemap';
import { HreflangAnnotation } from './types';

export interface SitemapDiscoveryResult {
  annotations: HreflangAnnotation[];
  discoveredSitemapUrl: string | null;
  detectedSitemaps: string[];
}

/**
 * Decompresses gzip content if URL ends in .gz or contains gzip magic bytes.
 */
function decompressIfGzipped(rawBody: string, url: string): string {
  if (!rawBody) return '';
  const buf = Buffer.from(rawBody, 'binary');
  // Gzip magic bytes: 0x1f, 0x8b
  if (url.toLowerCase().endsWith('.gz') || (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b)) {
    try {
      return zlib.gunzipSync(buf).toString('utf-8');
    } catch {
      // If binary gunzip fails, try UTF-8 buffer or return raw
      try {
        const utfBuf = Buffer.from(rawBody, 'utf-8');
        return zlib.gunzipSync(utfBuf).toString('utf-8');
      } catch {
        return rawBody;
      }
    }
  }
  return rawBody;
}

/**
 * Extracts the single <url>...</url> block containing targetUrl from a large sitemap XML string.
 * This provides ultra-fast parsing without having to parse tens of thousands of unrelated URLs.
 */
function extractTargetUrlBlock(xmlContent: string, targetUrl: string): string | null {
  const targetVariants = [
    targetUrl,
    targetUrl.replace(/\/+$/, ''),
    targetUrl.endsWith('/') ? targetUrl : `${targetUrl}/`,
  ];

  for (const variant of targetVariants) {
    const searchPattern = `<loc>${variant}</loc>`;
    let locIdx = xmlContent.indexOf(searchPattern);
    if (locIdx === -1) {
      locIdx = xmlContent.toLowerCase().indexOf(searchPattern.toLowerCase());
    }

    if (locIdx !== -1) {
      const startIdx = xmlContent.lastIndexOf('<url', locIdx);
      const endIdx = xmlContent.indexOf('</url>', locIdx);
      if (startIdx !== -1 && endIdx !== -1) {
        return xmlContent.slice(startIdx, endIdx + 6);
      }
    }
  }

  return null;
}

/**
 * Discovers and parses hreflang annotations for a specific URL from XML sitemaps
 * declared in robots.txt, HTML markup, or standard sitemap locations.
 */
export async function discoverSitemapHreflang(
  targetPageUrl: string,
  userAgent?: string,
  pageHtml?: string
): Promise<SitemapDiscoveryResult> {
  const result: SitemapDiscoveryResult = {
    annotations: [],
    discoveredSitemapUrl: null,
    detectedSitemaps: [],
  };

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetPageUrl);
  } catch {
    return result;
  }

  const origin = parsedTarget.origin;
  const pathSegments = parsedTarget.pathname.split('/').filter(Boolean);
  const primaryPathSegment = pathSegments[0]?.toLowerCase() || '';

  const detectedSitemaps: string[] = [];

  // 1. Scan page HTML for embedded sitemap URLs (e.g. Adobe's home-sitemap.xml or link tags)
  if (pageHtml) {
    const sitemapRegex = /https?:\/\/[^\s"'<>]+\.(?:xml|xml\.gz)|(?:\/[a-zA-Z0-9_\-\/]+\.(?:xml|xml\.gz))/gi;
    let smMatch: RegExpExecArray | null;
    while ((smMatch = sitemapRegex.exec(pageHtml)) !== null) {
      const rawSm = smMatch[0];
      const lower = rawSm.toLowerCase();
      if (lower.includes('sitemap') || lower.includes('hreflang')) {
        try {
          const resolved = new URL(rawSm, origin).toString();
          if (!detectedSitemaps.includes(resolved)) {
            detectedSitemaps.push(resolved);
          }
        } catch {
          // ignore invalid
        }
      }
    }
  }

  // 2. Fetch robots.txt to discover declared sitemaps
  try {
    const robotsFetch = await safeFetch(`${origin}/robots.txt`, {
      userAgent: userAgent || 'default',
      timeoutMs: 4500,
      maxBytes: 512 * 1024,
    });

    if (robotsFetch.status === 200 && robotsFetch.body) {
      const lines = robotsFetch.body.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^sitemap:\s*/i.test(trimmed)) {
          const sitemapLoc = trimmed.replace(/^sitemap:\s*/i, '').trim();
          if (sitemapLoc && /^https?:\/\//i.test(sitemapLoc)) {
            if (!detectedSitemaps.includes(sitemapLoc)) {
              detectedSitemaps.push(sitemapLoc);
            }
          }
        }
      }
    }
  } catch {
    // Non-blocking
  }

  // Common standard sitemap locations
  const standardProbes = [
    `${origin}/sitemap.xml`,
    `${origin}/home-sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ];
  if (primaryPathSegment) {
    standardProbes.push(`${origin}/${primaryPathSegment}/sitemap.xml`);
    standardProbes.push(`${origin}/${primaryPathSegment}/index.xml`);
  }

  for (const probe of standardProbes) {
    if (!detectedSitemaps.includes(probe)) {
      detectedSitemaps.push(probe);
    }
  }

  result.detectedSitemaps = detectedSitemaps;

  // 3. Prioritize candidate sitemaps
  const candidateSitemaps: string[] = [];

  // Priority A: Sitemaps matching page path segment or containing 'hreflang', 'home', or 'top'
  for (const sm of detectedSitemaps) {
    const lowerSm = sm.toLowerCase();
    if (
      lowerSm.includes('hreflang') ||
      lowerSm.includes('home-sitemap') ||
      (primaryPathSegment &&
        (lowerSm.includes(`/${primaryPathSegment}/`) ||
          lowerSm.includes(`_${primaryPathSegment}/`) ||
          lowerSm.includes(`-${primaryPathSegment}/`) ||
          lowerSm.includes(`/${primaryPathSegment}_`)))
    ) {
      candidateSitemaps.push(sm);
    }
  }

  // Priority B: Root sitemaps
  for (const sm of detectedSitemaps) {
    if (!candidateSitemaps.includes(sm)) {
      const lowerSm = sm.toLowerCase();
      if (lowerSm.endsWith('/sitemap.xml') || lowerSm.includes('sitemap_index') || lowerSm.includes('index-')) {
        candidateSitemaps.push(sm);
      }
    }
  }

  // Limit candidates to inspect to prevent long timeouts
  const sitemapsToInspect = candidateSitemaps.slice(0, 5);
  if (sitemapsToInspect.length === 0 && detectedSitemaps.length > 0) {
    sitemapsToInspect.push(detectedSitemaps[0]);
  }

  const startTime = Date.now();
  const MAX_DISCOVERY_MS = 6000;

  // Helper function to inspect a single sitemap or sub-sitemap XML
  async function inspectSitemapContent(sitemapUrl: string, depth = 1): Promise<boolean> {
    if (depth > 3 || Date.now() - startTime > MAX_DISCOVERY_MS) return false;

    try {
      const smFetch = await safeFetch(sitemapUrl, {
        userAgent: userAgent || 'default',
        timeoutMs: 3500,
        maxBytes: 8 * 1024 * 1024,
        accept: 'application/xml,text/xml,application/x-gzip,*/*',
      });

      if (smFetch.status !== 200 || !smFetch.body) return false;

      const decompressedBody = decompressIfGzipped(smFetch.body, sitemapUrl);

      // Check if target URL exists directly in this sitemap
      const urlBlock = extractTargetUrlBlock(decompressedBody, targetPageUrl);
      if (urlBlock) {
        const miniXml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urlBlock}</urlset>`;
        const parsed = parseSitemapXml(miniXml, targetPageUrl, 100);
        if (parsed.annotations.length > 0) {
          result.annotations = parsed.annotations;
          result.discoveredSitemapUrl = sitemapUrl;
          return true;
        }
      }

      // Check if it's a sitemap index
      const parsed = parseSitemapXml(decompressedBody, smFetch.finalUrl, 1000);
      if (parsed.isSitemapIndex && parsed.sitemapIndexUrls.length > 0) {
        // Prioritize child sitemaps matching path segment, or containing 'top', 'main', 'hreflang', 'product'
        const prioritizedChildren: string[] = [];
        for (const childUrl of parsed.sitemapIndexUrls) {
          const lower = childUrl.toLowerCase();
          if (
            (primaryPathSegment && lower.includes(primaryPathSegment)) ||
            lower.includes('top') ||
            lower.includes('main') ||
            lower.includes('hreflang') ||
            lower.includes('home')
          ) {
            prioritizedChildren.push(childUrl);
          }
        }
        for (const childUrl of parsed.sitemapIndexUrls) {
          if (!prioritizedChildren.includes(childUrl)) {
            prioritizedChildren.push(childUrl);
          }
        }

        // Check top 4 children
        for (const childUrl of prioritizedChildren.slice(0, 4)) {
          const found = await inspectSitemapContent(childUrl, depth + 1);
          if (found) return true;
        }
      }
    } catch {
      // Continue searching
    }

    return false;
  }

  for (const sitemapUrl of sitemapsToInspect) {
    const found = await inspectSitemapContent(sitemapUrl, 1);
    if (found) break;
  }

  return result;
}
