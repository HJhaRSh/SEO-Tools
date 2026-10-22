/**
 * Schema Checker Service
 * Fetches a URL using the existing safe fetch infrastructure and extracts schema types.
 * Reuses safeFetch for all SSRF protection, redirect handling, and timeouts.
 */

import { safeFetch, SafeFetchOptions, SafeFetchResult } from '@/lib/seo/safeFetch';
import { extractSchemaTypes } from './schemaExtractor';
import type { SchemaCheckResult } from './types';

export type FetchFn = (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResult>;

const INITIAL_MAX_BYTES = 512 * 1024; // 512 KiB initial cap
const RETRY_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB retry cap for truncated responses

export const BASE_FETCH_OPTIONS: SafeFetchOptions = {
  timeoutMs: 10000,
  maxRedirects: 5,
  maxBytes: INITIAL_MAX_BYTES,
  userAgent: 'Mozilla/5.0 (compatible; IndianMarketersBot/1.0; +https://indianmarketers.in/seo-tools)',
};

/**
 * Checks a single URL for schema markup.
 * - If network error, DNS failure, 4xx/5xx HTTP error, or SSRF rejection: status: 'unable_to_check'.
 * - If HTML successfully received and schema types detected: status: 'found'.
 * - If HTML successfully received, no schema detected, and response NOT truncated: status: 'not_found'.
 * - If HTML successfully received, no schema detected, and response WAS truncated: retries ONCE with 2 MB cap.
 */
export async function checkUrlSchema(
  url: string,
  fetchFn: FetchFn = safeFetch
): Promise<SchemaCheckResult> {
  try {
    const result = await fetchFn(url, BASE_FETCH_OPTIONS);

    // If HTTP error (e.g. 403, 404, 500, blocked by redirect policy)
    if (
      !result ||
      typeof result.statusCode !== 'number' ||
      result.statusCode < 200 ||
      result.statusCode >= 400 ||
      result.blockedByRedirectHook
    ) {
      return {
        url,
        schemaFound: false,
        status: 'unable_to_check',
        types: [],
      };
    }

    // First extraction pass
    const types = extractSchemaTypes(result.body);
    if (types.length > 0) {
      return {
        url,
        schemaFound: true,
        status: 'found',
        types,
      };
    }

    // No schema found: check if response was truncated at 512 KB
    if (result.isTruncated) {
      // Retry once using 2 MB maximum
      try {
        const retryResult = await fetchFn(url, {
          ...BASE_FETCH_OPTIONS,
          maxBytes: RETRY_MAX_BYTES,
        });

        if (
          retryResult &&
          retryResult.statusCode >= 200 &&
          retryResult.statusCode < 400 &&
          !retryResult.blockedByRedirectHook
        ) {
          const retryTypes = extractSchemaTypes(retryResult.body);
          if (retryTypes.length > 0) {
            return {
              url,
              schemaFound: true,
              status: 'found',
              types: retryTypes,
            };
          }
        }

        // Retry completed without detecting schema
        return {
          url,
          schemaFound: false,
          status: 'not_found',
          types: [],
        };
      } catch {
        // Retry failed; the initial fetch already proved no schema in the first 512 KB
        return {
          url,
          schemaFound: false,
          status: 'not_found',
          types: [],
        };
      }
    }

    // Genuine No: page was successfully fetched, not truncated, no schema found
    return {
      url,
      schemaFound: false,
      status: 'not_found',
      types: [],
    };
  } catch {
    // Network errors, timeouts, DNS failures, SSRF guards, connection refused
    return {
      url,
      schemaFound: false,
      status: 'unable_to_check',
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
  concurrency = 5,
  fetchFn: FetchFn = safeFetch
): Promise<SchemaCheckResult[]> {
  const results: SchemaCheckResult[] = new Array(urls.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < urls.length) {
      const i = nextIndex++;
      results[i] = await checkUrlSchema(urls[i], fetchFn);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
