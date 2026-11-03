/**
 * Common Crawl Sitemap Coverage Service
 * Feature 5 — Sitemap Discovery, XML Parsing & Crawl Comparison
 * Tool #19 — Indian Marketers SEO Toolkit
 *
 * Genuine recursive XML sitemap parser with transparent boundary enforcement.
 * Operates independently without third-party proxy reliance.
 */

import { XMLParser } from 'fast-xml-parser';
import zlib from 'zlib';
import { safeFetch } from '../safeFetch';
import { SitemapCoverageAnalysis, SitemapComparisonUrl } from './types';

const MAX_SITEMAP_URLS = 500; // Bounded limit for serverless execution
const MAX_SITEMAP_FETCH_BYTES = 5 * 1024 * 1024; // 5 MB

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true
});

/**
 * Extracts URL locations from parsed XML sitemap structure
 */
export function extractUrlsFromSitemapXml(xmlContent: string): { urls: string[]; childSitemaps: string[] } {
  const urls: string[] = [];
  const childSitemaps: string[] = [];

  try {
    const parsed = xmlParser.parse(xmlContent);

    // Case 1: Standard urlset (<urlset><url><loc>...</loc></url></urlset>)
    if (parsed.urlset && parsed.urlset.url) {
      const urlList = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
      for (const item of urlList) {
        if (item && item.loc) {
          const locStr = String(item.loc).trim();
          if (locStr.startsWith('http://') || locStr.startsWith('https://')) {
            urls.push(locStr);
          }
        }
      }
    }

    // Case 2: Sitemap index (<sitemapindex><sitemap><loc>...</loc></sitemap></sitemapindex>)
    if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
      const sitemapList = Array.isArray(parsed.sitemapindex.sitemap) 
        ? parsed.sitemapindex.sitemap 
        : [parsed.sitemapindex.sitemap];
      for (const item of sitemapList) {
        if (item && item.loc) {
          const locStr = String(item.loc).trim();
          if (locStr.startsWith('http://') || locStr.startsWith('https://')) {
            childSitemaps.push(locStr);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[SitemapParser] XML parsing failed:', err.message);
  }

  return { urls, childSitemaps };
}

export interface FetchSitemapResult {
  urls: string[];
  isPartial: boolean;
  totalParsedBeforeCap: number;
}

/**
 * Fetches and resolves a sitemap URL, handling gzip and sitemap index files recursively
 */
export async function fetchAndParseSitemap(sitemapUrl: string): Promise<FetchSitemapResult> {
  const visited = new Set<string>();
  const queue: string[] = [sitemapUrl];
  const discoveredUrls: string[] = [];
  let isPartial = false;
  let totalCount = 0;

  while (queue.length > 0 && discoveredUrls.length < MAX_SITEMAP_URLS) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      const res = await safeFetch(currentUrl, {
        timeoutMs: 6000,
        maxBytes: MAX_SITEMAP_FETCH_BYTES
      });

      if (res.statusCode !== 200) continue;

      let body = res.body;
      if (currentUrl.endsWith('.gz') || (res.headers['content-encoding'] || '').includes('gzip')) {
        try {
          const decompressed = zlib.gunzipSync(Buffer.from(res.body, 'binary'));
          body = decompressed.toString('utf8');
        } catch {
          // Keep raw body if gunzip failed
        }
      }

      const { urls, childSitemaps } = extractUrlsFromSitemapXml(body);

      for (const u of urls) {
        totalCount++;
        if (discoveredUrls.length < MAX_SITEMAP_URLS) {
          discoveredUrls.push(u);
        } else {
          isPartial = true;
        }
      }

      // Add child sitemaps to queue (up to 8 children to prevent unbounded crawling)
      for (const child of childSitemaps) {
        if (!visited.has(child) && queue.length < 8) {
          queue.push(child);
        }
      }
    } catch {
      // Continue to next item
    }
  }

  if (totalCount > MAX_SITEMAP_URLS) {
    isPartial = true;
  }

  return {
    urls: Array.from(new Set(discoveredUrls)).slice(0, MAX_SITEMAP_URLS),
    isPartial,
    totalParsedBeforeCap: totalCount
  };
}

/**
 * Discovers sitemap URL automatically if not supplied
 * Checks:
 * 1. robots.txt "Sitemap: ..." directives (RFC 9309 standard)
 * 2. Standard candidate paths (/sitemap_index.xml, /sitemap.xml)
 */
export async function discoverSitemapUrl(hostname: string, userSitemapUrl?: string): Promise<string> {
  if (userSitemapUrl && userSitemapUrl.trim().length > 0) {
    return userSitemapUrl.trim();
  }

  const cleanHost = hostname.toLowerCase().replace(/^www\./, '');

  // 1. Check live robots.txt for declared Sitemap directive
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const robotsRes = await fetch(`https://${cleanHost}/robots.txt`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const match = robotsTxt.match(/^\s*Sitemap:\s*(https?:\/\/[^\s\r\n]+)/im);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // Continue to standard probes
  }

  // 2. Fallback candidates
  const candidates = [
    `https://${cleanHost}/sitemap_index.xml`,
    `https://${cleanHost}/sitemap.xml`,
    `https://www.${cleanHost}/sitemap.xml`,
    `https://www.${cleanHost}/sitemap_index.xml`
  ];

  for (const candidate of candidates) {
    try {
      const probe = await safeFetch(candidate, { timeoutMs: 4000, maxBytes: 16 * 1024 });
      if (probe.statusCode === 200 && (probe.body.includes('<urlset') || probe.body.includes('<sitemapindex'))) {
        return candidate;
      }
    } catch {
      // Continue probe
    }
  }

  return `https://${cleanHost}/sitemap.xml`;
}

/**
 * Pure calculation function for evaluating sitemap URLs against verified Common Crawl records.
 */
export function calculateSitemapCoverage(
  sitemapUrl: string,
  sitemapUrls: string[],
  collectionId: string,
  verifiedCapturedRecords?: Array<{ url: string; status?: number; ts?: string }>,
  isPartial = false,
  totalParsedBeforeCap = 0
): SitemapCoverageAnalysis {
  // Build a lookup map from verified captured records
  const capturedMap = new Map<string, { status?: number; ts?: string }>();
  if (Array.isArray(verifiedCapturedRecords)) {
    for (const rec of verifiedCapturedRecords) {
      if (rec && rec.url) {
        const norm = rec.url.toLowerCase().replace(/\/$/, '');
        capturedMap.set(norm, rec);
      }
    }
  }

  const comparisonUrls: SitemapComparisonUrl[] = [];
  let confirmedArchivedCount = 0;

  for (const url of sitemapUrls) {
    const norm = url.toLowerCase().replace(/\/$/, '');
    const match = capturedMap.get(norm);

    if (match) {
      confirmedArchivedCount++;
      comparisonUrls.push({
        url,
        status: 'ARCHIVED',
        httpStatus: match.status || 200,
        captureTimestamp: match.ts
      });
    } else {
      comparisonUrls.push({
        url,
        status: 'NOT_FOUND_IN_COLLECTION'
      });
    }
  }

  const totalSitemapUrls = sitemapUrls.length;
  const missingUrls = Math.max(0, totalSitemapUrls - confirmedArchivedCount);
  const rawPct = totalSitemapUrls > 0 ? (confirmedArchivedCount / totalSitemapUrls) * 100 : 0;
  // Preserve fractional percentages (e.g. 2/500 = 0.4%) rather than rounding down to 0%
  const coveragePercentage = rawPct > 0 && rawPct < 1 ? Number(rawPct.toFixed(1)) : Math.round(rawPct * 10) / 10;

  return {
    sitemapUrl,
    collectionId,
    totalSitemapUrls,
    confirmedArchivedUrls: confirmedArchivedCount,
    missingUrls,
    coveragePercentage,
    nonSitemapArchivedCount: Math.max(0, (verifiedCapturedRecords?.length || 0) - confirmedArchivedCount),
    isPartial: isPartial || totalParsedBeforeCap > MAX_SITEMAP_URLS,
    urls: comparisonUrls
  };
}

/**
 * Compares sitemap URLs against verified Common Crawl records
 * Accepts verified captured records from domain query, never trusting arbitrary client inputs blindly.
 */
export async function compareSitemapWithCollection(
  sitemapUrl: string,
  cdxApiUrl: string,
  collectionId: string,
  verifiedCapturedRecords?: Array<{ url: string; status?: number; ts?: string }>
): Promise<SitemapCoverageAnalysis> {
  const { urls: sitemapUrls, isPartial, totalParsedBeforeCap } = await fetchAndParseSitemap(sitemapUrl);
  if (sitemapUrls.length === 0) {
    throw new Error(`No valid URLs found in sitemap at "${sitemapUrl}".`);
  }

  return calculateSitemapCoverage(
    sitemapUrl,
    sitemapUrls,
    collectionId,
    verifiedCapturedRecords,
    isPartial,
    totalParsedBeforeCap
  );
}

