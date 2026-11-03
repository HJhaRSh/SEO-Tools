/**
 * Common Crawl Domain Monthly Visibility Service
 * Feature 1 — Monthly Crawl Visibility & Trends
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { CrawlCollection, MonthlyCrawlRecord, ScopeSetting } from './types';
import { queryCdxIndex, CdxQueryResult } from './commonCrawlClient';

const RECORDS_PER_BLOCK_ESTIMATE = 3000;

/**
 * Builds the appropriate CDX URL pattern for a domain based on user scope
 */
export function buildDomainQueryPattern(hostname: string, scope: ScopeSetting): string {
  const cleanHost = hostname.toLowerCase().replace(/^www\./, '');

  switch (scope) {
    case 'subdomains':
      return `*.${cleanHost}/*`;
    case 'include_www':
      // CDX allows wildcard or domain queries; for include_www we match *.cleanHost or cleanHost
      return `*.${cleanHost}/*`;
    case 'exact':
    default:
      return `${hostname}/*`;
  }
}

/**
 * Formats a CDX timestamp string (e.g. "20261012143025") into ISO date "2026-10-12"
 */
export function formatCdxTimestamp(ts?: string): string | undefined {
  if (!ts || ts.length < 8) return undefined;
  const year = ts.substring(0, 4);
  const month = ts.substring(4, 6);
  const day = ts.substring(6, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Analyzes domain visibility for a single crawl collection
 */
export async function analyzeDomainInCollection(
  collection: CrawlCollection,
  hostname: string,
  scope: ScopeSetting
): Promise<MonthlyCrawlRecord> {
  const queryPattern = buildDomainQueryPattern(hostname, scope);
  const dateRange = collection.from && collection.to 
    ? `${collection.from.slice(0, 10)} to ${collection.to.slice(0, 10)}`
    : collection.name;

  // Step 1: Run showNumPages query first to get overall size & block count safely
  const pagesResult: CdxQueryResult = await queryCdxIndex(collection.cdxApi, {
    url: queryPattern,
    showNumPages: true,
    timeoutMs: 7000
  });

  if (pagesResult.status === 'no_records') {
    return {
      collectionId: collection.id,
      collectionName: collection.name,
      dateRange,
      capturedCount: 0,
      countType: 'none',
      status: 'no_records',
      statusMessage: 'No captures found in this crawl collection.'
    };
  }

  if (pagesResult.status === 'temporarily_unavailable' || pagesResult.status === 'rate_limited' || pagesResult.status === 'query_error') {
    return {
      collectionId: collection.id,
      collectionName: collection.name,
      dateRange,
      capturedCount: 0,
      countType: 'none',
      status: pagesResult.status,
      statusMessage: pagesResult.errorMessage || 'Index temporarily unavailable.'
    };
  }

  const blocks = pagesResult.pagesInfo?.blocks || 0;
  const pages = pagesResult.pagesInfo?.pages || 0;

  // If 0 blocks found
  if (blocks === 0) {
    return {
      collectionId: collection.id,
      collectionName: collection.name,
      dateRange,
      capturedCount: 0,
      countType: 'none',
      status: 'no_records',
      statusMessage: 'No matching index blocks recorded.'
    };
  }

  // Step 2: If blocks <= 2, domain is small/medium: fetch page 0 to calculate exact HTML capture count
  if (blocks <= 2) {
    const recordsResult = await queryCdxIndex(collection.cdxApi, {
      url: queryPattern,
      fl: 'url,timestamp,status,mime',
      page: 0,
      limit: 300,
      timeoutMs: 7000
    });

    if (recordsResult.status === 'confirmed' && recordsResult.records.length > 0) {
      // Filter for unique successfully captured HTML URLs (status 200, mime text/html)
      const uniqueHtmlUrls = new Set<string>();
      let latestTs = '';

      for (const rec of recordsResult.records) {
        if (rec.status.startsWith('2') && (rec.mime.includes('html') || !rec.mime.includes('image'))) {
          // Normalize URL for deduplication (strip fragment and trailing slash)
          const cleanUrl = rec.url.split('#')[0].replace(/\/+$/, '');
          uniqueHtmlUrls.add(cleanUrl);
        }
        if (rec.timestamp && rec.timestamp > latestTs) {
          latestTs = rec.timestamp;
        }
      }

      const count = uniqueHtmlUrls.size > 0 ? uniqueHtmlUrls.size : recordsResult.records.length;

      return {
        collectionId: collection.id,
        collectionName: collection.name,
        dateRange,
        capturedCount: count,
        countType: 'exact',
        status: 'confirmed',
        lastCapturedDate: formatCdxTimestamp(latestTs),
        sampleSize: recordsResult.records.length,
        uniqueHtmlUrls: uniqueHtmlUrls.size,
        totalBlocks: blocks,
        totalPages: pages,
        statusMessage: `Confirmed: ${count} unique captured HTML URLs enumerated.`
      };
    }
  }

  // Step 3: Large domain (blocks > 2) or records fetch returned timeout:
  // Use Common Crawl official CDX block-level estimation
  const estimatedCount = blocks * RECORDS_PER_BLOCK_ESTIMATE;

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    dateRange,
    capturedCount: estimatedCount,
    countType: 'estimated',
    status: 'estimated',
    totalBlocks: blocks,
    totalPages: pages,
    estimationMethod: `Common Crawl CDX block estimation (~${RECORDS_PER_BLOCK_ESTIMATE.toLocaleString()} records/block across ${blocks} index blocks)`,
    statusMessage: `Estimated: ~${estimatedCount.toLocaleString()} captures based on ${blocks} index blocks.`
  };
}

const HA_COVERAGE_ENDPOINT = 'https://cc-visibility.suganmn.workers.dev/api/coverage';

/**
 * Analyzes domain visibility across all provided collections
 */
export async function analyzeDomainMonthlyVisibility(
  collections: CrawlCollection[],
  hostname: string,
  scope: ScopeSetting
): Promise<MonthlyCrawlRecord[]> {
  const cleanHost = hostname.toLowerCase().replace(/^www\./, '');

  // 1. Try High-Availability Batched Coverage Endpoint (Parallel Chunks)
  try {
    const recordsMap = new Map<string, MonthlyCrawlRecord>();

    // Prepare batches of 4
    const chunks: string[][] = [];
    for (let i = 0; i < collections.length; i += 4) {
      chunks.push(collections.slice(i, i + 4).map(c => c.id));
    }

    // Execute all batches in parallel with a generous 40s timeout
    await Promise.all(
      chunks.map(async (batchIds) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 40000);

          const res = await fetch(HA_COVERAGE_ENDPOINT, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              domain: cleanHost,
              crawls: batchIds
            })
          });

          clearTimeout(timeout);

          if (res.ok) {
            const data = await res.json();
            const results: any[] = data.results || [];

            for (const item of results) {
              const col = collections.find(c => c.id === item.crawl);
              const colName = col?.name || item.crawl;
              const dateRange = col?.from && col?.to 
                ? `${col.from.slice(0, 10)} to ${col.to.slice(0, 10)}`
                : colName;

              const total = typeof item.total === 'number' ? item.total : 0;
              const lastCap = formatCdxTimestamp(item.lastCapture);

              recordsMap.set(item.crawl, {
                collectionId: item.crawl,
                collectionName: colName,
                dateRange,
                capturedCount: total,
                countType: total > 0 ? (item.exact ? 'exact' : 'estimated') : 'none',
                status: item.error 
                  ? 'temporarily_unavailable' 
                  : (total > 0 ? (item.exact ? 'confirmed' : 'estimated') : 'no_records'),
                statusMessage: item.error 
                  ? 'Index query error' 
                  : (total > 0 ? `${total.toLocaleString()} pages captured in this crawl.` : 'No captures found in this crawl collection.'),
                lastCapturedDate: lastCap,
                uniqueHtmlUrls: item.apex ?? total,
                languages: item.languages || [],
                statuses: item.statuses || {},
                samples: item.samples || [],
                urls: item.urls || [],
                robots: item.robots || [],
                homepageRecord: item.homepageRecord || null
              });
            }
          }
        } catch (err: any) {
          console.warn(`[CommonCrawl] HA coverage batch failed:`, err.message);
        }
      })
    );

    // If we successfully received results for at least some collections
    if (recordsMap.size > 0) {
      return collections.map(col => {
        if (recordsMap.has(col.id)) {
          return recordsMap.get(col.id)!;
        }
        return {
          collectionId: col.id,
          collectionName: col.name,
          dateRange: col.name,
          capturedCount: 0,
          countType: 'none',
          status: 'no_records',
          statusMessage: 'No matching records in this collection.'
        };
      });
    }
  } catch (err: any) {
    console.warn('[CommonCrawl] HA coverage fetch warning, falling back to direct CDX:', err.message);
  }

  // 2. Fallback to Direct CDX Index Queries
  const records: MonthlyCrawlRecord[] = [];
  for (let i = 0; i < collections.length; i += 2) {
    const chunk = collections.slice(i, i + 2);
    const chunkResults = await Promise.all(
      chunk.map(col => analyzeDomainInCollection(col, hostname, scope))
    );
    records.push(...chunkResults);
  }

  return records;
}

/**
 * Computes trend metrics across monthly crawl records
 */
export function computeTrendSummary(records: MonthlyCrawlRecord[]) {
  const validRecords = records.filter(r => r.status === 'confirmed' || r.status === 'estimated');
  const counts = validRecords.map(r => r.capturedCount);

  const latest = records[0];
  const previous = records.length > 1 ? records[1] : undefined;

  const latestCount = latest && (latest.status === 'confirmed' || latest.status === 'estimated') 
    ? latest.capturedCount 
    : 0;

  const prevCount = previous && (previous.status === 'confirmed' || previous.status === 'estimated')
    ? previous.capturedCount
    : 0;

  const absoluteChange = latestCount - prevCount;
  let percentChange: number | null = null;
  if (prevCount > 0) {
    percentChange = Math.round(((latestCount - prevCount) / prevCount) * 100);
  }

  const highestCount = counts.length > 0 ? Math.max(...counts) : 0;
  const lowestCount = counts.length > 0 ? Math.min(...counts) : 0;

  // Find latest observed capture date
  let lastObservedDate: string | undefined = undefined;
  for (const r of records) {
    if (r.lastCapturedDate) {
      lastObservedDate = r.lastCapturedDate;
      break;
    }
  }

  return {
    latestCollection: latest?.collectionName || latest?.collectionId,
    latestCaptureCount: latestCount,
    previousCaptureCount: prevCount,
    absoluteChange,
    percentChange,
    highestCount,
    lowestCount,
    lastObservedCaptureDate: lastObservedDate,
    totalAvailableCollections: records.length,
    successfulCollectionsCount: validRecords.length
  };
}

