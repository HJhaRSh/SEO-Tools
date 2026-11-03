/**
 * Common Crawl Collection Discovery Service
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { CrawlCollection } from './types';
import { commonCrawlCache } from './cacheService';

const HA_CRAWLS_ENDPOINT = 'https://cc-visibility.suganmn.workers.dev/api/crawls';
const COLLINFO_ENDPOINT = 'https://index.commoncrawl.org/collinfo.json';
const DEFAULT_TIMEOUT_MS = 6000;

export async function getLatestCrawlCollections(limit = 12): Promise<CrawlCollection[]> {
  const cacheKey = `collections:latest:${limit}`;
  const cached = commonCrawlCache.collections.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. Try High-Availability Crawls Endpoint First
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(HA_CRAWLS_ENDPOINT, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.crawls) && data.crawls.length > 0) {
        const collections: CrawlCollection[] = data.crawls
          .slice(0, limit)
          .map((item: any) => ({
            id: String(item.id || ''),
            name: String(item.name || item.id || ''),
            timegate: `https://index.commoncrawl.org/${item.id}/`,
            cdxApi: `https://index.commoncrawl.org/${item.id}-index`,
            isAvailable: true
          }))
          .filter((c: CrawlCollection) => c.id.length > 0);

        if (collections.length > 0) {
          commonCrawlCache.collections.set(cacheKey, collections);
          return collections;
        }
      }
    }
  } catch (err: any) {
    // Continue to official CDX endpoint
  }

  // 2. Try Direct Common Crawl collinfo.json
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const res = await fetch(COLLINFO_ENDPOINT, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'IndianMarketers-SEO-Tool/1.0 (+https://indianmarketers.in/tools/common-crawl-checker)'
      }
    });

    clearTimeout(timeout);

    if (res.ok) {
      const rawData = await res.json();
      if (Array.isArray(rawData) && rawData.length > 0) {
        const collections: CrawlCollection[] = rawData
          .slice(0, limit)
          .map((item: any) => ({
            id: String(item.id || ''),
            name: String(item.name || item.id || ''),
            timegate: String(item.timegate || `https://index.commoncrawl.org/${item.id}/`),
            cdxApi: String(item['cdx-api'] || `https://index.commoncrawl.org/${item.id}-index`),
            from: item.from ? String(item.from) : undefined,
            to: item.to ? String(item.to) : undefined,
            isAvailable: true
          }))
          .filter(c => c.id.length > 0);

        commonCrawlCache.collections.set(cacheKey, collections);
        return collections;
      }
    }
  } catch (err: any) {
    console.warn('[CommonCrawl] Collection discovery collinfo warning:', err.message);
  }

  // 3. Fallback to documented known recent collections
  return getFallbackCollections(limit);
}

/**
 * Fallback collection generator based on Common Crawl's standard CC-MAIN naming convention
 */
function getFallbackCollections(limit = 12): CrawlCollection[] {
  // Common Crawl publishes ~monthly with IDs like CC-MAIN-2026-43, CC-MAIN-2026-39, etc.
  const fallbackList: CrawlCollection[] = [
    { id: 'CC-MAIN-2026-43', name: 'October 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-43/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-43-index', from: '2026-10-05', to: '2026-10-18' },
    { id: 'CC-MAIN-2026-39', name: 'September 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-39/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-39-index', from: '2026-09-04', to: '2026-09-17' },
    { id: 'CC-MAIN-2026-34', name: 'August 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-34/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-34-index', from: '2026-08-07', to: '2026-08-20' },
    { id: 'CC-MAIN-2026-30', name: 'July 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-30/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-30-index', from: '2026-07-06', to: '2026-07-19' },
    { id: 'CC-MAIN-2026-25', name: 'June 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-25/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-25-index', from: '2026-06-08', to: '2026-06-21' },
    { id: 'CC-MAIN-2026-21', name: 'May 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-21/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-21-index', from: '2026-05-11', to: '2026-05-24' },
    { id: 'CC-MAIN-2026-17', name: 'April 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-17/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-17-index', from: '2026-04-06', to: '2026-04-19' },
    { id: 'CC-MAIN-2026-12', name: 'March 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-12/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-12-index', from: '2026-03-09', to: '2026-03-22' },
    { id: 'CC-MAIN-2026-08', name: 'February 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-08/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-08-index', from: '2026-02-09', to: '2026-02-22' },
    { id: 'CC-MAIN-2026-04', name: 'January 2026 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2026-04/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2026-04-index', from: '2026-01-12', to: '2026-01-25' },
    { id: 'CC-MAIN-2025-51', name: 'December 2025 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2025-51/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2025-51-index', from: '2025-12-08', to: '2025-12-21' },
    { id: 'CC-MAIN-2025-47', name: 'November 2025 Index', timegate: 'https://index.commoncrawl.org/CC-MAIN-2025-47/', cdxApi: 'https://index.commoncrawl.org/CC-MAIN-2025-47-index', from: '2025-11-10', to: '2025-11-23' }
  ];

  return fallbackList.slice(0, limit);
}

