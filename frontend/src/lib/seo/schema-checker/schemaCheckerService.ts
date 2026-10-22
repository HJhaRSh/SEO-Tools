/**
 * Schema Checker Service
 * Fetches a URL using the existing safe fetch infrastructure and extracts schema types.
 * Reuses safeFetch for all SSRF protection, redirect handling, and timeouts.
 */

import { safeFetch, SafeFetchOptions } from '@/lib/seo/safeFetch';
import { extractSchemaTypes } from './schemaExtractor';
import type { SchemaCheckResult } from './types';

const FETCH_OPTIONS: SafeFetchOptions = {
  timeoutMs: 15000,
  maxRedirects: 5,
  maxBytes: 512 * 1024, // 512 KiB — same as default
  userAgent: 'Mozilla/5.0 (compatible; IndianMarketersBot/1.0; +https://indianmarketers.in/seo-tools)',
};

/**
 * Checks a single URL for schema markup.
 * On network errors, returns schemaFound: false rather than throwing.
 */
export async function checkUrlSchema(url: string): Promise<SchemaCheckResult> {
  try {
    const result = await safeFetch(url, FETCH_OPTIONS);
    const types = extractSchemaTypes(result.body);
    return {
      url,
      schemaFound: types.length > 0,
      types,
    };
  } catch {
    // Network/SSRF/timeout errors: return "not found" rather than crashing the batch
    return {
      url,
      schemaFound: false,
      types: [],
    };
  }
}

/**
 * Processes multiple URLs with bounded concurrency (max 5 in-flight).
 * Preserves input order in the output regardless of completion order.
 */
export async function checkUrlsBatch(
  urls: string[],
  concurrency = 5
): Promise<SchemaCheckResult[]> {
  const results: SchemaCheckResult[] = new Array(urls.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < urls.length) {
      const i = nextIndex++;
      results[i] = await checkUrlSchema(urls[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
