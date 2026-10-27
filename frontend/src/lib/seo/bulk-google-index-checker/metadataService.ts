import * as cheerio from 'cheerio';
import { safeFetch, SafeFetchResult } from '@/lib/seo/safeFetch';
import type { MetadataResultItem } from './types';

export const METADATA_CONCURRENCY = 5;
export const METADATA_TIMEOUT_MS = 10000;
export const METADATA_MAX_BYTES = 1024 * 1024; // 1 MiB bound

/**
 * Executes async tasks with a bounded concurrency pool
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Normalizes title or description text by collapsing multiple whitespace characters and trimming
 */
export function cleanTextContent(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Extracts live HTML meta title and meta description from raw HTML string
 */
export function parseHtmlMetadata(html: string): {
  metaTitle: string | null;
  titleLength: number;
  metaDescription: string | null;
  descriptionLength: number;
} {
  if (!html || typeof html !== 'string') {
    return {
      metaTitle: null,
      titleLength: 0,
      metaDescription: null,
      descriptionLength: 0,
    };
  }

  const $ = cheerio.load(html);

  // 1. Live <title> extraction
  // Cheerio automatically handles uppercase tags, decode HTML entities, and malformed tags
  const titleEl = $('title').first();
  const rawTitle = titleEl.length > 0 ? titleEl.text() : null;
  const metaTitle = cleanTextContent(rawTitle);
  const titleLength = metaTitle ? metaTitle.length : 0;

  // 2. Live <meta name="description" content="..."> extraction
  // Handle case-insensitivity in name attribute and attribute ordering
  let rawDesc: string | null = null;
  const descEl = $('meta[name="description" i], meta[name="Description"]').first();
  if (descEl.length > 0) {
    const content = descEl.attr('content');
    if (content !== undefined && content !== null) {
      rawDesc = content;
    }
  }

  const metaDescription = cleanTextContent(rawDesc);
  const descriptionLength = metaDescription ? metaDescription.length : 0;

  return {
    metaTitle,
    titleLength,
    metaDescription,
    descriptionLength,
  };
}

/**
 * Fetches a single public URL securely using safeFetch with SSRF protection,
 * then parses the HTML for meta title and description.
 */
export async function fetchSingleUrlMetadata(url: string): Promise<MetadataResultItem> {
  try {
    const fetchRes: SafeFetchResult = await safeFetch(url, {
      timeoutMs: METADATA_TIMEOUT_MS,
      maxRedirects: 5,
      maxBytes: METADATA_MAX_BYTES,
      userAgent: 'Mozilla/5.0 (compatible; IndianMarketersIndexBot/2.0; +https://indianmarketers.in/tools)',
    });

    if (fetchRes.blockedByRedirectHook) {
      return {
        url,
        metaTitle: null,
        titleLength: 0,
        metaDescription: null,
        descriptionLength: 0,
        fetchStatus: 'error',
        error: fetchRes.redirectBlockedReason || 'Redirect to restricted host was blocked.',
      };
    }

    if (fetchRes.statusCode && (fetchRes.statusCode < 200 || fetchRes.statusCode >= 400)) {
      return {
        url,
        metaTitle: null,
        titleLength: 0,
        metaDescription: null,
        descriptionLength: 0,
        fetchStatus: 'error',
        error: `Server responded with HTTP ${fetchRes.statusCode}`,
      };
    }

    const { metaTitle, titleLength, metaDescription, descriptionLength } = parseHtmlMetadata(fetchRes.body);

    const hasTitle = metaTitle !== null;
    const hasDesc = metaDescription !== null;

    return {
      url,
      metaTitle,
      titleLength,
      metaDescription,
      descriptionLength,
      fetchStatus: hasTitle || hasDesc ? 'success' : 'missing',
      error: null,
    };
  } catch (err: any) {
    const message = err?.message || 'Failed to fetch webpage';
    return {
      url,
      metaTitle: null,
      titleLength: 0,
      metaDescription: null,
      descriptionLength: 0,
      fetchStatus: 'error',
      error: message.includes('blocked/private IP')
        ? 'Target URL resolves to a forbidden private or local IP.'
        : message.includes('timed out')
        ? 'Page request timed out.'
        : message.includes('forbidden')
        ? 'Access to target host is forbidden.'
        : message,
    };
  }
}

/**
 * Batch fetches metadata for an array of URLs with bounded concurrency (max 5)
 */
export async function fetchBatchMetadata(urls: string[]): Promise<MetadataResultItem[]> {
  return runWithConcurrency(urls, METADATA_CONCURRENCY, (url) => fetchSingleUrlMetadata(url));
}
