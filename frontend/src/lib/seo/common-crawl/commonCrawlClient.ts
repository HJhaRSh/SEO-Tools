/**
 * Common Crawl Client
 * Safe, rate-respecting, concurrency-controlled HTTP client for Common Crawl CDX and WARC APIs.
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { commonCrawlCache } from './cacheService';
import { CollectionQueryStatus } from './types';

export const TRUSTED_COMMON_CRAWL_HOSTS = new Set([
  'index.commoncrawl.org',
  'data.commoncrawl.org'
]);

const DEFAULT_CDX_TIMEOUT_MS = 7500;
const MAX_CONCURRENT_CDX_REQUESTS = 2;

let activeCdxRequests = 0;
const cdxWaitQueue: (() => void)[] = [];

async function acquireCdxSlot(): Promise<void> {
  if (activeCdxRequests < MAX_CONCURRENT_CDX_REQUESTS) {
    activeCdxRequests++;
    return;
  }
  return new Promise<void>((resolve) => {
    cdxWaitQueue.push(() => {
      activeCdxRequests++;
      resolve();
    });
  });
}

function releaseCdxSlot(): void {
  activeCdxRequests = Math.max(0, activeCdxRequests - 1);
  const next = cdxWaitQueue.shift();
  if (next) {
    next();
  }
}

export interface CdxQueryOptions {
  url: string;
  matchType?: 'exact' | 'prefix' | 'host' | 'domain';
  showNumPages?: boolean;
  page?: number;
  pageSize?: number;
  limit?: number;
  filter?: string;
  fl?: string;
  timeoutMs?: number;
}

export interface CdxRecord {
  url: string;
  mime: string;
  status: string;
  digest: string;
  length: string;
  offset: string;
  filename: string;
  timestamp: string;
}

export interface CdxPagesInfo {
  pages: number;
  pageSize: number;
  blocks: number;
}

export interface CdxQueryResult {
  status: CollectionQueryStatus;
  records: CdxRecord[];
  pagesInfo?: CdxPagesInfo;
  statusCode: number;
  errorMessage?: string;
  rawText?: string;
}

/**
 * Normalizes input domain or URL
 */
export function normalizeTargetInput(raw: string): {
  normalized: string;
  hostname: string;
  isPage: boolean;
  pathname: string;
} {
  let cleaned = raw.trim();
  if (!cleaned) {
    throw new Error('Please enter a valid website domain or webpage URL.');
  }

  // Detect if user pasted protocol
  const hasProtocol = /^https?:\/\//i.test(cleaned);
  let parsedUrl: URL;

  try {
    if (hasProtocol) {
      parsedUrl = new URL(cleaned);
    } else {
      // If it looks like a path or domain without protocol, prefix with https://
      parsedUrl = new URL(`https://${cleaned}`);
    }
  } catch {
    throw new Error(`Invalid URL or domain format: "${raw}"`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname || hostname.includes(' ') || !hostname.includes('.')) {
    throw new Error(`Invalid hostname: "${hostname}"`);
  }

  // Check if target is a specific page or just the domain root
  const hasMeaningfulPath = parsedUrl.pathname.length > 1 && parsedUrl.pathname !== '/';
  const hasQuery = parsedUrl.search.length > 0;
  const isPage = hasMeaningfulPath || hasQuery;

  return {
    normalized: parsedUrl.toString(),
    hostname,
    isPage,
    pathname: parsedUrl.pathname + parsedUrl.search
  };
}

/**
 * Queries a specific CDX Index endpoint safely
 */
export async function queryCdxIndex(
  cdxApiUrl: string,
  options: CdxQueryOptions
): Promise<CdxQueryResult> {
  const parsedEndpoint = new URL(cdxApiUrl);
  if (!TRUSTED_COMMON_CRAWL_HOSTS.has(parsedEndpoint.hostname)) {
    throw new Error(`Untrusted Common Crawl endpoint: ${parsedEndpoint.hostname}`);
  }

  const params = new URLSearchParams();
  params.set('url', options.url);
  params.set('output', 'json');

  if (options.matchType) params.set('matchType', options.matchType);
  if (options.showNumPages) params.set('showNumPages', 'true');
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.filter) params.set('filter', options.filter);
  if (options.fl) params.set('fl', options.fl);

  const fullUrl = `${cdxApiUrl}?${params.toString()}`;
  const cacheKey = `cdx:${fullUrl}`;

  const cached = commonCrawlCache.indexQueries.get(cacheKey);
  if (cached) {
    return cached;
  }

  await acquireCdxSlot();

  try {
    const timeoutMs = options.timeoutMs || DEFAULT_CDX_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(fullUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json, text/plain',
          'User-Agent': 'IndianMarketers-SEO-Tool/1.0 (+https://indianmarketers.in/tools/common-crawl-checker)'
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();

    // 1. Status 404: In CDX, 404 means "No Captures found for: <url>"
    if (res.status === 404) {
      const result: CdxQueryResult = {
        status: 'no_records',
        records: [],
        statusCode: 404,
        errorMessage: 'No captures found in this crawl collection.'
      };
      commonCrawlCache.indexQueries.set(cacheKey, result);
      return result;
    }

    // 2. Rate limited 429
    if (res.status === 429) {
      return {
        status: 'rate_limited',
        records: [],
        statusCode: 429,
        errorMessage: 'Common Crawl public CDX API rate limit encountered.'
      };
    }

    // 3. Timeout / Server load 504 / 502 / 503
    if (res.status === 504 || res.status === 502 || res.status === 503) {
      return {
        status: 'temporarily_unavailable',
        records: [],
        statusCode: res.status,
        errorMessage: `Common Crawl CDX index temporarily busy (HTTP ${res.status}).`
      };
    }

    // 4. Other HTTP errors
    if (!res.ok) {
      return {
        status: 'query_error',
        records: [],
        statusCode: res.status,
        errorMessage: `Common Crawl CDX query returned HTTP ${res.status}.`
      };
    }

    // Check if response is HTML error page disguised with 200 (rare but possible with nginx)
    if (text.startsWith('<!DOCTYPE html') || text.startsWith('<html')) {
      return {
        status: 'temporarily_unavailable',
        records: [],
        statusCode: 502,
        errorMessage: 'Common Crawl index returned an HTML gateway error.'
      };
    }

    // 5. If showNumPages was requested, parse the summary JSON:
    // e.g. {"pages": 1, "pageSize": 5, "blocks": 2}
    if (options.showNumPages) {
      try {
        const parsed = JSON.parse(text);
        const pagesInfo: CdxPagesInfo = {
          pages: Number(parsed.pages || 0),
          pageSize: Number(parsed.pageSize || 5),
          blocks: Number(parsed.blocks || 0)
        };
        const result: CdxQueryResult = {
          status: pagesInfo.blocks > 0 ? 'confirmed' : 'no_records',
          records: [],
          pagesInfo,
          statusCode: 200,
          rawText: text
        };
        commonCrawlCache.indexQueries.set(cacheKey, result);
        return result;
      } catch {
        return {
          status: 'query_error',
          records: [],
          statusCode: 200,
          errorMessage: 'Failed to parse showNumPages JSON response.'
        };
      }
    }

    // 6. Parse JSON Lines records
    const lines = text.trim().split('\n').filter(l => l.trim().length > 0);
    const records: CdxRecord[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record && typeof record === 'object') {
          records.push({
            url: String(record.url || ''),
            mime: String(record.mime || ''),
            status: String(record.status || '200'),
            digest: String(record.digest || ''),
            length: String(record.length || '0'),
            offset: String(record.offset || '0'),
            filename: String(record.filename || ''),
            timestamp: String(record.timestamp || '')
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    const result: CdxQueryResult = {
      status: records.length > 0 ? 'confirmed' : 'no_records',
      records,
      statusCode: 200,
      rawText: text
    };

    commonCrawlCache.indexQueries.set(cacheKey, result);
    return result;
  } catch (err: any) {
    const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
    return {
      status: 'temporarily_unavailable',
      records: [],
      statusCode: isAbort ? 504 : 500,
      errorMessage: isAbort 
        ? 'Common Crawl CDX index query timed out (server busy).'
        : `Network error querying Common Crawl CDX: ${err.message}`
    };
  } finally {
    releaseCdxSlot();
  }
}

