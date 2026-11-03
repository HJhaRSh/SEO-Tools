/**
 * Common Crawl Domain Monthly Visibility Service
 * Feature 1 — Monthly Crawl Visibility & Trends
 * Tool #19 — Indian Marketers SEO Toolkit
 *
 * Direct integration with official Common Crawl public cluster indexes on data.commoncrawl.org.
 * Zero third-party proxy dependencies. Genuine binary search over SURT-ordered cluster shards.
 */

import zlib from 'zlib';
import { CrawlCollection, MonthlyCrawlRecord, ScopeSetting } from './types';

export function formatCdxTimestamp(ts?: string): string | undefined {
  if (!ts || ts.length < 8) return undefined;
  const year = ts.substring(0, 4);
  const month = ts.substring(4, 6);
  const day = ts.substring(6, 8);
  return `${year}-${month}-${day}`;
}

const RECORDS_PER_BLOCK_ESTIMATE = 3000;
const clusterLengthCache = new Map<string, number>();

/**
 * Builds SURT (Sort-friendly URI Reordering Transform) prefix for a domain
 */
export function toSURTPrefix(domain: string): string {
  const clean = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0];
  const parts = clean.split('.').reverse();
  return parts.join(',') + ')';
}

/**
 * Builds the appropriate CDX URL pattern for a domain based on user scope
 */
export function buildDomainQueryPattern(hostname: string, scope: ScopeSetting): string {
  const cleanHost = hostname.toLowerCase().replace(/^www\./, '');

  switch (scope) {
    case 'subdomains':
      return `*.${cleanHost}/*`;
    case 'include_www':
      return `*.${cleanHost}/*`;
    case 'exact':
    default:
      return `${hostname}/*`;
  }
}

/**
 * Evaluates whether a CDX record represents a genuine webpage HTML capture.
 * Excludes robots.txt, non-HTML MIME types, and static asset files.
 */
export function isHtmlWebpageRecord(rec: any): boolean {
  if (!rec || !rec.url) return false;
  const urlLower = String(rec.url).toLowerCase();

  // 1. robots.txt is NOT an HTML webpage
  if (urlLower.endsWith('/robots.txt') || urlLower.includes('/robots.txt?')) {
    return false;
  }

  // 2. MIME type verification
  const mime = String(rec.mime || '').toLowerCase();
  const mimeDetected = String(rec['mime-detected'] || '').toLowerCase();

  const isExplicitHtml = mime.includes('html') || mimeDetected.includes('html');
  if (isExplicitHtml) {
    if (urlLower.endsWith('.xml') || urlLower.endsWith('.json') || urlLower.endsWith('.txt') ||
        urlLower.endsWith('.css') || urlLower.endsWith('.js') || urlLower.endsWith('.pdf')) {
      return false;
    }
    return true;
  }

  // 3. Fallback for unclassified records: if no MIME provided, verify it does not have static extension
  if (!mime && !mimeDetected) {
    const isStaticAsset = /\.(xml|json|txt|png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|pdf|zip|gz)$/i.test(urlLower);
    return !isStaticAsset;
  }

  return false;
}

/**
 * Checks if a record URL matches the requested target hostname and scope setting
 */
export function matchesScope(recordUrl: string, targetHost: string, scope: ScopeSetting): boolean {
  try {
    const parsed = new URL(recordUrl);
    const h = parsed.hostname.toLowerCase();
    const cleanTarget = targetHost.toLowerCase().replace(/^www\./, '');

    switch (scope) {
      case 'exact':
        return h === targetHost.toLowerCase();
      case 'include_www':
        return h === cleanTarget || h === `www.${cleanTarget}`;
      case 'subdomains':
        return h === cleanTarget || h.endsWith(`.${cleanTarget}`);
      default:
        return h === cleanTarget || h === `www.${cleanTarget}`;
    }
  } catch {
    return recordUrl.toLowerCase().includes(targetHost.toLowerCase());
  }
}

/**
 * Retrieves the total byte length of a collection cluster.idx from data.commoncrawl.org
 */
async function getClusterIndexLength(crawlId: string, timeoutMs: number = 5000): Promise<number> {
  if (clusterLengthCache.has(crawlId)) {
    return clusterLengthCache.get(crawlId)!;
  }

  const url = `https://data.commoncrawl.org/cc-index/collections/${crawlId}/indexes/cluster.idx`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'IndianMarketers-SEO-Tool/1.0 (+https://indianmarketers.in/tools/common-crawl-checker)'
      }
    });

    if (!res.ok) {
      return 0;
    }

    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > 0) {
      clusterLengthCache.set(crawlId, len);
    }
    return len;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeout);
  }
}

interface ClusterBlock {
  key: string;
  filename: string;
  offset: number;
  length: number;
}

/**
 * Performs a binary search over the SURT-ordered cluster.idx to locate candidate CDX blocks
 */
async function locateClusterBlocks(
  crawlId: string,
  surtPrefix: string,
  totalLength: number,
  timeoutMs: number = 8000
): Promise<ClusterBlock[]> {
  const clusterUrl = `https://data.commoncrawl.org/cc-index/collections/${crawlId}/indexes/cluster.idx`;
  let low = 0;
  let high = totalLength - 1;
  let bestOffset = 0;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let step = 0; step < 18 && low <= high; step++) {
      const mid = Math.floor((low + high) / 2);
      const rangeStart = Math.max(0, mid - 1500);
      const rangeEnd = Math.min(totalLength - 1, mid + 1500);

      const res = await fetch(clusterUrl, {
        signal: controller.signal,
        headers: {
          Range: `bytes=${rangeStart}-${rangeEnd}`,
          'User-Agent': 'IndianMarketers-SEO-Tool/1.0'
        }
      });

      if (!res.ok && res.status !== 206) break;

      const text = await res.text();
      const lines = text.split('\n').slice(1, -1);
      if (lines.length === 0) break;

      const midLine = lines[Math.floor(lines.length / 2)];
      const key = midLine.split('\t')[0].split(' ')[0];

      if (key <= surtPrefix) {
        bestOffset = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // Read adjacent candidate lines around bestOffset
    const fetchStart = Math.max(0, bestOffset - 2500);
    const fetchEnd = Math.min(totalLength - 1, bestOffset + 4500);

    const blockRes = await fetch(clusterUrl, {
      signal: controller.signal,
      headers: {
        Range: `bytes=${fetchStart}-${fetchEnd}`,
        'User-Agent': 'IndianMarketers-SEO-Tool/1.0'
      }
    });

    if (!blockRes.ok && blockRes.status !== 206) return [];

    const blockText = await blockRes.text();
    const allLines = blockText.split('\n').slice(1, -1);

    const parsedBlocks: ClusterBlock[] = allLines.map(l => {
      const parts = l.split('\t');
      if (parts.length >= 4) {
        return {
          key: parts[0].split(' ')[0],
          filename: parts[1],
          offset: parseInt(parts[2], 10),
          length: parseInt(parts[3], 10)
        };
      }
      return null;
    }).filter((b): b is ClusterBlock => b !== null);

    const candidateBlocks: ClusterBlock[] = [];
    for (let i = 0; i < parsedBlocks.length; i++) {
      const curr = parsedBlocks[i];
      const next = parsedBlocks[i + 1];

      if (curr.key <= surtPrefix && (!next || next.key > surtPrefix || next.key.startsWith(surtPrefix))) {
        candidateBlocks.push(curr);
      } else if (curr.key.startsWith(surtPrefix)) {
        candidateBlocks.push(curr);
      }
    }

    return candidateBlocks;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Queries official Common Crawl CDX cluster records directly from data.commoncrawl.org
 */
export async function queryOfficialCommonCrawlCollection(
  collection: CrawlCollection,
  hostname: string,
  scope: ScopeSetting
): Promise<MonthlyCrawlRecord> {
  const crawlId = collection.id;
  const dateRange = collection.from && collection.to
    ? `${collection.from.slice(0, 10)} to ${collection.to.slice(0, 10)}`
    : collection.name;

  const cleanHost = hostname.toLowerCase().replace(/^www\./, '');
  const surtPrefix = toSURTPrefix(cleanHost);

  try {
    const totalIndexLength = await getClusterIndexLength(crawlId);
    if (!totalIndexLength) {
      return {
        collectionId: crawlId,
        collectionName: collection.name,
        dateRange,
        capturedCount: 0,
        countType: 'unavailable',
        status: 'temporarily_unavailable',
        statusMessage: 'Official Common Crawl cluster index temporarily unreachable.'
      };
    }

    const candidateBlocks = await locateClusterBlocks(crawlId, surtPrefix, totalIndexLength);

    if (candidateBlocks.length === 0) {
      return {
        collectionId: crawlId,
        collectionName: collection.name,
        dateRange,
        capturedCount: 0,
        countType: 'none',
        status: 'no_records',
        statusMessage: 'No captures found in this crawl collection.'
      };
    }

    // Step 1: Small/medium domain (candidate blocks <= 2): Fetch and decompress to obtain exact counts
    if (candidateBlocks.length <= 2) {
      const allRecords: any[] = [];

      for (const block of candidateBlocks) {
        const shardUrl = `https://data.commoncrawl.org/cc-index/collections/${crawlId}/indexes/${block.filename}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        try {
          const shardRes = await fetch(shardUrl, {
            signal: controller.signal,
            headers: {
              Range: `bytes=${block.offset}-${block.offset + block.length - 1}`,
              'User-Agent': 'IndianMarketers-SEO-Tool/1.0'
            }
          });

          if (shardRes.ok || shardRes.status === 206) {
            const buf = Buffer.from(await shardRes.arrayBuffer());
            const decompressed = zlib.gunzipSync(buf).toString('utf-8');
            const lines = decompressed.split('\n');

            for (const line of lines) {
              if (!line.includes(cleanHost)) continue;
              const jsonIdx = line.indexOf('{');
              if (jsonIdx === -1) continue;

              try {
                const rec = JSON.parse(line.slice(jsonIdx));
                if (matchesScope(rec.url, hostname, scope)) {
                  allRecords.push(rec);
                }
              } catch {
                // Ignore malformed line
              }
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      }

      if (allRecords.length === 0) {
        return {
          collectionId: crawlId,
          collectionName: collection.name,
          dateRange,
          capturedCount: 0,
          countType: 'none',
          status: 'no_records',
          statusMessage: 'No captures found matching domain scope in this crawl collection.'
        };
      }

      // Process authentic records with strict resource classification
      const uniqueHtmlUrls = new Set<string>();
      const langCounts: Record<string, number> = {};
      const statusCounts: Record<string, number> = {};
      const samples: Array<{ url: string; ts: string }> = [];
      const urls: Array<{ url: string; ts: string; status: number }> = [];
      let latestTs = '';
      let homepageRecord: any = null;
      const robotsRecords: any[] = [];
      let robotsCount = 0;
      let redirectsCount = 0;
      let forbiddenCount = 0;
      let otherResourcesCount = 0;

      for (const r of allRecords) {
        const urlLower = (r.url || '').toLowerCase();
        const cleanUrl = r.url ? r.url.split('#')[0].replace(/\/+$/, '') : '';
        const statusCode = parseInt(r.status || '200', 10);
        const isRobots = urlLower.endsWith('/robots.txt') || urlLower.includes('/robots.txt?');
        const isRedirect = r.status?.startsWith('3');
        const isForbidden = r.status === '403';
        const isSuccess = r.status?.startsWith('2');
        const isHtml = isHtmlWebpageRecord(r);

        if (isRobots) {
          robotsCount++;
          robotsRecords.push(r);
        } else if (isRedirect) {
          redirectsCount++;
        } else if (isForbidden) {
          forbiddenCount++;
        } else if (isHtml && isSuccess) {
          if (cleanUrl) uniqueHtmlUrls.add(cleanUrl);
        } else {
          otherResourcesCount++;
        }

        if (r.timestamp && r.timestamp > latestTs) {
          latestTs = r.timestamp;
        }

        if (r.languages) {
          for (const lang of r.languages.split(',')) {
            const l = lang.trim();
            if (l) langCounts[l] = (langCounts[l] || 0) + 1;
          }
        }

        const sKey = String(statusCode);
        statusCounts[sKey] = (statusCounts[sKey] || 0) + 1;

        if (samples.length < 20 && r.url) {
          samples.push({ url: r.url, ts: r.timestamp || '' });
        }

        if (urls.length < 500 && r.url) {
          urls.push({ url: r.url, ts: r.timestamp || '', status: statusCode });
        }

        // Homepage detection
        if (cleanUrl === `https://${cleanHost}` || cleanUrl === `http://${cleanHost}` ||
            cleanUrl === `https://www.${cleanHost}` || cleanUrl === `http://www.${cleanHost}`) {
          if (!homepageRecord) homepageRecord = r;
        }
      }

      const exactHtmlCount = uniqueHtmlUrls.size;

      // Status message clearly explaining the classification
      let statusMessage = '';
      if (exactHtmlCount > 0) {
        statusMessage = `Confirmed: ${exactHtmlCount.toLocaleString()} verified HTML webpage captures enumerated.`;
      } else if (robotsCount > 0) {
        statusMessage = `No captured HTML webpages in this collection (${robotsCount} robots.txt snapshot${robotsCount > 1 ? 's' : ''} archived).`;
      } else if (forbiddenCount > 0) {
        statusMessage = `No successful HTML captures (${forbiddenCount} HTTP 403 Forbidden response${forbiddenCount > 1 ? 's' : ''} recorded).`;
      } else if (redirectsCount > 0) {
        statusMessage = `No captured HTML webpages (${redirectsCount} HTTP 3xx redirect${redirectsCount > 1 ? 's' : ''} recorded).`;
      } else {
        statusMessage = `No successful HTML webpage captures found in this crawl collection.`;
      }

      return {
        collectionId: crawlId,
        collectionName: collection.name,
        dateRange,
        capturedCount: exactHtmlCount,
        countType: exactHtmlCount > 0 ? 'exact' : 'none',
        status: exactHtmlCount > 0 ? 'confirmed' : 'no_records',
        lastCapturedDate: formatCdxTimestamp(latestTs),
        sampleSize: allRecords.length,
        uniqueHtmlUrls: exactHtmlCount,
        htmlCapturesCount: exactHtmlCount,
        robotsCount,
        redirectsCount,
        forbiddenCount,
        otherResourcesCount,
        totalBlocks: candidateBlocks.length,
        totalPages: 1,
        languages: Object.entries(langCounts).map(([lang, count]) => ({ lang, count })).sort((a, b) => b.count - a.count),
        statuses: statusCounts,
        samples,
        urls,
        robots: robotsRecords,
        homepageRecord,
        statusMessage
      };
    }

    // Step 2: Large domain (candidate blocks > 2): CDX cluster block estimation
    // Decompress only the first block for authentic samples and language signals
    const firstBlock = candidateBlocks[0];
    const shardUrl = `https://data.commoncrawl.org/cc-index/collections/${crawlId}/indexes/${firstBlock.filename}`;
    const samples: Array<{ url: string; ts: string }> = [];
    const urls: Array<{ url: string; ts: string; status: number }> = [];
    const langCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    let latestTs = '';
    let homepageRecord: any = null;
    const robotsRecords: any[] = [];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const shardRes = await fetch(shardUrl, {
        signal: controller.signal,
        headers: {
          Range: `bytes=${firstBlock.offset}-${firstBlock.offset + firstBlock.length - 1}`,
          'User-Agent': 'IndianMarketers-SEO-Tool/1.0'
        }
      });

      if (shardRes.ok || shardRes.status === 206) {
        const buf = Buffer.from(await shardRes.arrayBuffer());
        const decompressed = zlib.gunzipSync(buf).toString('utf-8');
        const lines = decompressed.split('\n');

        for (const line of lines) {
          if (!line.includes(cleanHost)) continue;
          const jsonIdx = line.indexOf('{');
          if (jsonIdx === -1) continue;

          try {
            const rec = JSON.parse(line.slice(jsonIdx));
            if (matchesScope(rec.url, hostname, scope)) {
              if (samples.length < 20 && rec.url) {
                samples.push({ url: rec.url, ts: rec.timestamp || '' });
              }
              if (urls.length < 500 && rec.url) {
                urls.push({ url: rec.url, ts: rec.timestamp || '', status: parseInt(rec.status || '200', 10) });
              }
              if (rec.timestamp && rec.timestamp > latestTs) {
                latestTs = rec.timestamp;
              }
              if (rec.languages) {
                for (const lang of rec.languages.split(',')) {
                  const l = lang.trim();
                  if (l) langCounts[l] = (langCounts[l] || 0) + 1;
                }
              }
              const sKey = String(rec.status || '200');
              statusCounts[sKey] = (statusCounts[sKey] || 0) + 1;

              if (rec.url?.endsWith('/robots.txt')) {
                robotsRecords.push(rec);
              }
              if (rec.url?.endsWith(`${cleanHost}/`)) {
                homepageRecord = rec;
              }
            }
          } catch {
            // Ignore
          }
        }
      }
      clearTimeout(timeout);
    } catch {
      // Non-fatal, sampling error only
    }

    const estimatedCount = candidateBlocks.length * RECORDS_PER_BLOCK_ESTIMATE;

    return {
      collectionId: crawlId,
      collectionName: collection.name,
      dateRange,
      capturedCount: estimatedCount,
      countType: 'estimated',
      status: 'estimated',
      lastCapturedDate: formatCdxTimestamp(latestTs),
      totalBlocks: candidateBlocks.length,
      totalPages: candidateBlocks.length,
      languages: Object.entries(langCounts).map(([lang, count]) => ({ lang, count })),
      statuses: statusCounts,
      samples,
      urls,
      robots: robotsRecords,
      homepageRecord,
      estimationMethod: `Common Crawl CDX cluster block estimation (~${RECORDS_PER_BLOCK_ESTIMATE.toLocaleString()} records/block across ${candidateBlocks.length} index blocks)`,
      statusMessage: `Estimated: ~${estimatedCount.toLocaleString()} captures based on ${candidateBlocks.length} index blocks.`
    };
  } catch (err: any) {
    return {
      collectionId: crawlId,
      collectionName: collection.name,
      dateRange,
      capturedCount: 0,
      countType: 'unavailable',
      status: 'temporarily_unavailable',
      statusMessage: `Query error: ${err.message || 'Common Crawl cluster index query failed.'}`
    };
  }
}

/**
 * Analyzes domain visibility across all provided collections using direct official Common Crawl index
 */
export async function analyzeDomainMonthlyVisibility(
  collections: CrawlCollection[],
  hostname: string,
  scope: ScopeSetting
): Promise<MonthlyCrawlRecord[]> {
  const records: MonthlyCrawlRecord[] = [];

  // Query collections in concurrent batches of 3 to stay within serverless execution budgets
  const CHUNK_SIZE = 3;
  for (let i = 0; i < collections.length; i += CHUNK_SIZE) {
    const chunk = collections.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(col => queryOfficialCommonCrawlCollection(col, hostname, scope))
    );
    records.push(...chunkResults);
  }

  return records;
}

/**
 * Computes trend metrics across monthly crawl records, strictly excluding unavailable collections
 */
export function computeTrendSummary(records: MonthlyCrawlRecord[]) {
  // Only valid collections are used for trend metrics
  const validRecords = records.filter(r => r.status === 'confirmed' || r.status === 'estimated' || (r.status === 'no_records' && r.countType === 'none'));
  const counts = validRecords.filter(r => r.status === 'confirmed' || r.status === 'estimated').map(r => r.capturedCount);

  // Find latest valid record and previous valid record
  const latestValid = validRecords[0];
  const previousValid = validRecords.length > 1 ? validRecords[1] : undefined;

  const latestCount = latestValid && (latestValid.status === 'confirmed' || latestValid.status === 'estimated')
    ? latestValid.capturedCount
    : 0;

  const prevCount = previousValid && (previousValid.status === 'confirmed' || previousValid.status === 'estimated')
    ? previousValid.capturedCount
    : 0;

  const absoluteChange = latestCount - prevCount;
  let percentChange: number | null = null;
  if (prevCount > 0 && latestValid && (latestValid.status === 'confirmed' || latestValid.status === 'estimated')) {
    percentChange = Math.round(((latestCount - prevCount) / prevCount) * 100);
  }

  const highestCount = counts.length > 0 ? Math.max(...counts) : 0;
  const lowestCount = counts.length > 0 ? Math.min(...counts) : 0;

  // Find latest observed capture date from any confirmed/estimated record
  let lastObservedDate: string | undefined = undefined;
  for (const r of records) {
    if (r.lastCapturedDate && (r.status === 'confirmed' || r.status === 'estimated')) {
      lastObservedDate = r.lastCapturedDate;
      break;
    }
  }

  const unavailableCount = records.filter(r => r.countType === 'unavailable' || r.status === 'temporarily_unavailable').length;

  return {
    latestCollection: latestValid?.collectionName || latestValid?.collectionId,
    latestCaptureCount: latestCount,
    previousCaptureCount: prevCount,
    absoluteChange,
    percentChange,
    highestCount,
    lowestCount,
    lastObservedCaptureDate: lastObservedDate,
    totalAvailableCollections: records.length,
    successfulCollectionsCount: validRecords.length,
    unavailableCollectionsCount: unavailableCount
  };
}
