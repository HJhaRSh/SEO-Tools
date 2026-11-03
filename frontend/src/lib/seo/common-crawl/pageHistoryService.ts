/**
 * Common Crawl Exact Page Capture History Service
 * Feature 6 — Exact Page Archival History & URL Variant Tracking
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { CrawlCollection, PageCaptureRecord, DiscoveredUrlVariant } from './types';
import { queryCdxIndex } from './commonCrawlClient';

/**
 * Normalizes URL variants to detect protocol, www, trailing slash, and query differences
 */
export function generateUrlVariants(targetUrl: string): { url: string; type: DiscoveredUrlVariant['variantType'] }[] {
  const variants: { url: string; type: DiscoveredUrlVariant['variantType'] }[] = [];
  try {
    const parsed = new URL(targetUrl);
    
    // 1. Exact
    variants.push({ url: parsed.toString(), type: 'exact' });

    // 2. Trailing slash flip
    let flippedPath = parsed.pathname;
    if (flippedPath.endsWith('/')) {
      flippedPath = flippedPath.replace(/\/+$/, '') || '/';
    } else {
      flippedPath = `${flippedPath}/`;
    }
    const slashUrl = new URL(parsed.toString());
    slashUrl.pathname = flippedPath;
    variants.push({ url: slashUrl.toString(), type: 'trailing_slash' });

    // 3. Protocol flip (http <-> https)
    const protocolUrl = new URL(parsed.toString());
    protocolUrl.protocol = parsed.protocol === 'https:' ? 'http:' : 'https:';
    variants.push({ url: protocolUrl.toString(), type: 'protocol' });

    // 4. www flip
    const wwwUrl = new URL(parsed.toString());
    if (parsed.hostname.startsWith('www.')) {
      wwwUrl.hostname = parsed.hostname.replace(/^www\./, '');
    } else {
      wwwUrl.hostname = `www.${parsed.hostname}`;
    }
    variants.push({ url: wwwUrl.toString(), type: 'www' });

  } catch {
    // If invalid URL, return just input
    variants.push({ url: targetUrl, type: 'exact' });
  }

  // Deduplicate URLs
  const seen = new Set<string>();
  return variants.filter(v => {
    if (seen.has(v.url)) return false;
    seen.add(v.url);
    return true;
  });
}

/**
 * Searches archival history for an exact page across collections
 */
export async function analyzePageCaptureHistory(
  collections: CrawlCollection[],
  pageUrl: string
): Promise<{
  checkedUrl: string;
  firstCapture?: string;
  lastCapture?: string;
  totalCapturesCount: number;
  collectionsWithCaptures: number;
  captures: PageCaptureRecord[];
  discoveredVariants: DiscoveredUrlVariant[];
}> {
  const captures: PageCaptureRecord[] = [];
  const variantMap = new Map<string, DiscoveredUrlVariant>();

  // Initialize primary variant
  variantMap.set(pageUrl, {
    url: pageUrl,
    variantType: 'exact',
    captureCount: 0
  });

  // Query each collection with exact match type
  // Use batch concurrency of 3
  for (let i = 0; i < collections.length; i += 3) {
    const chunk = collections.slice(i, i + 3);
    await Promise.all(
      chunk.map(async (col) => {
        const queryRes = await queryCdxIndex(col.cdxApi, {
          url: pageUrl,
          matchType: 'exact',
          fl: 'url,timestamp,status,mime,digest,length,offset,filename',
          limit: 20,
          timeoutMs: 6500
        });

        if (queryRes.status === 'confirmed' && queryRes.records.length > 0) {
          for (const rec of queryRes.records) {
            const capture: PageCaptureRecord = {
              timestamp: rec.timestamp,
              collectionId: col.id,
              url: rec.url,
              status: parseInt(rec.status, 10) || 200,
              mime: rec.mime,
              digest: rec.digest,
              length: parseInt(rec.length, 10) || 0,
              offset: parseInt(rec.offset, 10) || 0,
              filename: rec.filename
            };
            captures.push(capture);

            // Update variant map
            const existingVar: DiscoveredUrlVariant = variantMap.get(rec.url) || {
              url: rec.url,
              variantType: rec.url === pageUrl ? 'exact' : 'trailing_slash',
              captureCount: 0
            };
            existingVar.captureCount += 1;
            if (!existingVar.latestTimestamp || rec.timestamp > existingVar.latestTimestamp) {
              existingVar.latestTimestamp = rec.timestamp;
              existingVar.latestStatus = capture.status;
            }
            variantMap.set(rec.url, existingVar);
          }
        }
      })
    );
  }

  // Sort captures chronologically descending
  captures.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const collectionsWithCaptures = new Set(captures.map(c => c.collectionId)).size;
  const lastCapture = captures.length > 0 ? captures[0].timestamp : undefined;
  const firstCapture = captures.length > 0 ? captures[captures.length - 1].timestamp : undefined;

  return {
    checkedUrl: pageUrl,
    firstCapture,
    lastCapture,
    totalCapturesCount: captures.length,
    collectionsWithCaptures,
    captures,
    discoveredVariants: Array.from(variantMap.values())
  };
}

