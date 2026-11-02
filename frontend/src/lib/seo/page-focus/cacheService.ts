import crypto from 'crypto';
import { SCORING_VERSION, PROMPT_VERSION, type PageFocusReport } from './types';

/**
 * Cache entry holding stored payload, creation timestamp, and key.
 */
export interface CacheEntry<T> {
  data: T;
  createdAt: number;
  key: string;
}

/**
 * In-memory Least-Recently-Used (LRU) Cache with Time-to-Live (TTL) expiration.
 *
 * NOTE ON SERVERLESS ENVIRONMENTS:
 * In serverless environments (e.g. AWS Lambda, Vercel Serverless Functions),
 * memory is process-local and ephemeral across instances and cold starts.
 * This cache provides zero-external-dependency deduplication for warm container
 * invocations.
 */
export class LRUCache<T> {
  private map: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 100, ttlMs: number = 60 * 60 * 1000) {
    this.map = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Retrieves an item from the cache. Returns null if not found or expired.
   * Access updates item's position to most-recently-used.
   */
  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.map.delete(key);
      return null;
    }

    // Refresh position for LRU
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.data;
  }

  /**
   * Inserts or updates an entry in the cache.
   * If the cache is full, the least-recently-used item is evicted.
   */
  set(key: string, data: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, {
      data,
      createdAt: Date.now(),
      key,
    });
  }

  /**
   * Checks whether a valid (unexpired) entry exists for the given key.
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * Current number of entries in the cache.
   */
  get size(): number {
    return this.map.size;
  }
}

/**
 * Computes a SHA-256 hash of page content for exact cache invalidation.
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

export interface CacheKeyParams {
  url: string;
  contentHash: string;
  targetTopic?: string | null;
  model?: string;
  isManualText?: boolean;
}

/**
 * Generates a SHA-256 hash key for caching an analysis result based on:
 * - URL
 * - Content hash (guarantees stale content is never served)
 * - Target topic
 * - Model identifier
 * - PROMPT_VERSION & SCORING_VERSION
 *
 * PRIVACY GUARANTEE:
 * Returns null if isManualText is true. Manual / pasted text is NEVER cached
 * to prevent user data leakage across sessions.
 *
 * Supports both modern CacheKeyParams object and legacy (url, topic) overload.
 */
export function hashCacheKeySync(
  paramsOrUrl: CacheKeyParams | string,
  legacyTopic?: string
): string | null {
  if (typeof paramsOrUrl === 'string') {
    const rawKey = [
      paramsOrUrl.trim().toLowerCase(),
      '',
      (legacyTopic || '').trim().toLowerCase(),
      'gemini-3.5-flash',
      PROMPT_VERSION,
      SCORING_VERSION,
    ].join('|');
    return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  }

  if (paramsOrUrl.isManualText) {
    return null; // Bypass cache completely for pasted private text
  }

  const rawKey = [
    paramsOrUrl.url.trim().toLowerCase(),
    paramsOrUrl.contentHash || '',
    (paramsOrUrl.targetTopic || '').trim().toLowerCase(),
    paramsOrUrl.model || 'gemini-3.5-flash',
    PROMPT_VERSION,
    SCORING_VERSION,
  ].join('|');

  return crypto
    .createHash('sha256')
    .update(rawKey)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Async wrapper for hashCacheKey adhering to Web Crypto / Async signature.
 */
export async function hashCacheKey(
  paramsOrUrl: CacheKeyParams | string,
  legacyTopic?: string
): Promise<string | null> {
  return hashCacheKeySync(paramsOrUrl, legacyTopic);
}

// Global process-local cache for analyzed page focus reports (1 hour TTL, max 100 entries)
export const analysisCache = new LRUCache<PageFocusReport>(100, 60 * 60 * 1000);
