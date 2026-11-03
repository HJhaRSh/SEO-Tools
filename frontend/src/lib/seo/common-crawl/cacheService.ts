/**
 * Bounded In-Memory Cache Service for Common Crawl
 * Tool #19 — Indian Marketers SEO Toolkit
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class BoundedLRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries = 200, defaultTtlMs = 1000 * 60 * 30) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh LRU order by delete and re-insert
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = Date.now() + ttl;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest (first inserted in Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, expiresAt });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Dedicated namespaces for Common Crawl operations
export const commonCrawlCache = {
  // Collections list changes ~monthly, cache for 12 hours
  collections: new BoundedLRUCache<any>(10, 1000 * 60 * 60 * 12),
  
  // Historical index results are immutable once published, cache for 2 hours
  indexQueries: new BoundedLRUCache<any>(300, 1000 * 60 * 60 * 2),

  // Historical robots.txt archives are immutable, cache for 4 hours
  robotsHistory: new BoundedLRUCache<any>(100, 1000 * 60 * 60 * 4),

  // Live probes are dynamic, cache for 3 minutes
  liveProbes: new BoundedLRUCache<any>(100, 1000 * 60 * 3),

  // WARC content records are immutable, cache for 2 hours
  warcContent: new BoundedLRUCache<any>(50, 1000 * 60 * 60 * 2)
};

