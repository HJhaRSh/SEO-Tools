/**
 * Common Crawl Sitemap Coverage Service
 * Feature 5 — Sitemap Discovery, XML Parsing & Crawl Comparison
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { XMLParser } from 'fast-xml-parser';
import zlib from 'zlib';
import { safeFetch } from '../safeFetch';
import { queryCdxIndex } from './commonCrawlClient';
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
export function extractUrlsFromSitemapXml(xmlContent: string): string[] {
  const urls: string[] = [];
  try {
    const parsed = xmlParser.parse(xmlContent);

    // Case 1: Standard urlset (<urlset><url><loc>...</loc></url></urlset>)
    if (parsed.urlset && parsed.urlset.url) {
      const urlList = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
      for (const item of urlList) {
        if (item && item.loc) {
          const locStr = String(item.loc).trim();
          if (locStr.startsWith('http')) {
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
          if (locStr.startsWith('http')) {
            // Note: caller can recursively fetch sub-sitemaps
            urls.push(locStr);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[SitemapParser] XML parsing failed:', err.message);
  }

  return urls;
}

/**
 * Fetches and resolves a sitemap URL (handles .gz and sitemap index files)
 */
export async function fetchAndParseSitemap(sitemapUrl: string): Promise<string[]> {
  const res = await safeFetch(sitemapUrl, {
    timeoutMs: 8000,
    maxBytes: MAX_SITEMAP_FETCH_BYTES
  });

  if (res.statusCode !== 200) {
    throw new Error(`Sitemap request returned HTTP ${res.statusCode}`);
  }

  let body = res.body;

  // If gzip compressed (.xml.gz)
  if (sitemapUrl.endsWith('.gz') || (res.headers['content-encoding'] || '').includes('gzip')) {
    try {
      const decompressed = zlib.gunzipSync(Buffer.from(res.body, 'binary'));
      body = decompressed.toString('utf8');
    } catch {
      // Keep original body if gunzip failed
    }
  }

  const rawUrls = extractUrlsFromSitemapXml(body);

  // If this is a sitemapindex, take up to 2 child sitemaps and fetch their URLs
  if (body.includes('<sitemapindex') && rawUrls.length > 0) {
    const childUrls: string[] = [];
    const childrenToFetch = rawUrls.slice(0, 2); // fetch at most 2 child sitemaps
    for (const childUrl of childrenToFetch) {
      try {
        const childRes = await safeFetch(childUrl, { timeoutMs: 6000, maxBytes: MAX_SITEMAP_FETCH_BYTES });
        if (childRes.statusCode === 200) {
          const extracted = extractUrlsFromSitemapXml(childRes.body);
          childUrls.push(...extracted);
        }
      } catch {
        // Skip child failures
      }
    }
    if (childUrls.length > 0) {
      return Array.from(new Set(childUrls)).slice(0, MAX_SITEMAP_URLS);
    }
  }

  // Deduplicate and cap
  return Array.from(new Set(rawUrls)).slice(0, MAX_SITEMAP_URLS);
}

/**
 * Discovers sitemap URL automatically if not supplied
 */
export async function discoverSitemapUrl(hostname: string, userSitemapUrl?: string): Promise<string> {
  if (userSitemapUrl && userSitemapUrl.trim().length > 0) {
    return userSitemapUrl.trim();
  }

  const cleanHost = hostname.toLowerCase();
  const candidates = [
    `https://${cleanHost}/sitemap.xml`,
    `https://${cleanHost}/sitemap_index.xml`
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

const HA_SITEMAP_ENDPOINT = 'https://cc-visibility.suganmn.workers.dev/api/sitemap';

/**
 * Compares sitemap URLs against a Common Crawl collection CDX index
 */
export async function compareSitemapWithCollection(
  sitemapUrl: string,
  cdxApiUrl: string,
  collectionId: string,
  knownCapturedUrls?: string[]
): Promise<SitemapCoverageAnalysis> {
  const cleanHost = new URL(sitemapUrl).hostname.toLowerCase().replace(/^www\./, '');

  // 1. Try High-Availability Sitemap Endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(HA_SITEMAP_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        domain: cleanHost,
        sitemaps: [sitemapUrl]
      })
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.urls) && data.urls.length > 0) {
        const sitemapUrls: string[] = data.urls.slice(0, MAX_SITEMAP_URLS);
        const capturedSet = new Set((knownCapturedUrls || []).map(u => u.toLowerCase().replace(/\/$/, '')));

        const comparisonUrls: SitemapComparisonUrl[] = [];
        let confirmedArchivedCount = 0;

        for (const url of sitemapUrls) {
          const norm = url.toLowerCase().replace(/\/$/, '');
          const isArchived = capturedSet.has(norm);
          if (isArchived) {
            confirmedArchivedCount++;
            comparisonUrls.push({
              url,
              status: 'ARCHIVED',
              httpStatus: 200
            });
          } else {
            comparisonUrls.push({
              url,
              status: 'NOT_FOUND_IN_COLLECTION'
            });
          }
        }

        const totalSitemapUrls = sitemapUrls.length;
        const missingUrls = totalSitemapUrls - confirmedArchivedCount;
        const coveragePercentage = totalSitemapUrls > 0 
          ? Math.round((confirmedArchivedCount / totalSitemapUrls) * 100) 
          : 0;

        return {
          sitemapUrl,
          collectionId,
          totalSitemapUrls,
          confirmedArchivedUrls: confirmedArchivedCount,
          missingUrls,
          coveragePercentage,
          nonSitemapArchivedCount: Math.max(0, (knownCapturedUrls?.length || 0) - confirmedArchivedCount),
          isPartial: !!data.truncated || totalSitemapUrls >= MAX_SITEMAP_URLS,
          urls: comparisonUrls
        };
      }
    }
  } catch (err: any) {
    console.warn('[CommonCrawl] HA sitemap warning, falling back to direct parse:', err.message);
  }

  // 2. Fallback to Direct Fetch and Parse
  const sitemapUrls = await fetchAndParseSitemap(sitemapUrl);
  if (sitemapUrls.length === 0) {
    throw new Error(`No valid URLs found in sitemap at "${sitemapUrl}".`);
  }

  const comparisonUrls: SitemapComparisonUrl[] = [];
  let confirmedArchivedCount = 0;

  // Process in batches of 4
  for (let i = 0; i < sitemapUrls.length; i += 4) {
    const chunk = sitemapUrls.slice(i, i + 4);
    await Promise.all(
      chunk.map(async (url) => {
        try {
          const cdx = await queryCdxIndex(cdxApiUrl, {
            url,
            matchType: 'exact',
            fl: 'url,timestamp,status,mime',
            limit: 1,
            timeoutMs: 5000
          });

          if (cdx.status === 'confirmed' && cdx.records.length > 0) {
            const rec = cdx.records[0];
            confirmedArchivedCount++;
            comparisonUrls.push({
              url,
              status: 'ARCHIVED',
              captureTimestamp: rec.timestamp,
              httpStatus: parseInt(rec.status, 10) || 200,
              mimeType: rec.mime
            });
          } else {
            comparisonUrls.push({
              url,
              status: 'NOT_FOUND_IN_COLLECTION'
            });
          }
        } catch {
          comparisonUrls.push({
            url,
            status: 'NOT_FOUND_IN_COLLECTION'
          });
        }
      })
    );
  }

  const totalSitemapUrls = sitemapUrls.length;
  const missingUrls = totalSitemapUrls - confirmedArchivedCount;
  const coveragePercentage = totalSitemapUrls > 0 
    ? Math.round((confirmedArchivedCount / totalSitemapUrls) * 100) 
    : 0;

  return {
    sitemapUrl,
    collectionId,
    totalSitemapUrls,
    confirmedArchivedUrls: confirmedArchivedCount,
    missingUrls,
    coveragePercentage,
    nonSitemapArchivedCount: 0,
    isPartial: totalSitemapUrls >= MAX_SITEMAP_URLS,
    urls: comparisonUrls
  };
}

