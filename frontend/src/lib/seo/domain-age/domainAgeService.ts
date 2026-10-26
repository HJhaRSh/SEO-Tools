import { DomainCheckResult, DomainAgeCheckResponse } from './types';
import { normalizeDomainInput, normalizeAndDeduplicateDomains, NormalizedDomainResult } from './domainNormalizer';
import {
  queryRdapRecord,
  extractRegistrar,
  extractRdapEvents,
  extractNameservers,
  normalizeRegistrationStatuses
} from './rdapClient';
import {
  calculateDomainAge,
  calculateExpiryStatus
} from './dateUtils';

interface CacheEntry {
  result: DomainCheckResult;
  timestamp: number;
  ttlMs: number;
}

const SUCCESS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const NOT_FOUND_CACHE_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 500;
const domainResultsCache = new Map<string, CacheEntry>();

/**
 * Checks in-memory cache for a domain.
 */
function getCachedResult(domain: string): DomainCheckResult | null {
  const entry = domainResultsCache.get(domain.toLowerCase());
  if (!entry) return null;

  if (Date.now() - entry.timestamp > entry.ttlMs) {
    domainResultsCache.delete(domain.toLowerCase());
    return null;
  }

  return {
    ...entry.result,
    cached: true,
    cachedAt: new Date(entry.timestamp).toISOString()
  };
}

/**
 * Stores a result in the cache with LRU eviction.
 */
function setCachedResult(domain: string, result: DomainCheckResult, ttlMs: number) {
  if (domainResultsCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry
    const firstKey = domainResultsCache.keys().next().value;
    if (firstKey) domainResultsCache.delete(firstKey);
  }

  domainResultsCache.set(domain.toLowerCase(), {
    result: { ...result, cached: false },
    timestamp: Date.now(),
    ttlMs
  });
}

/**
 * Performs a domain age check for a single domain or URL input.
 */
export async function checkSingleDomain(rawInput: string): Promise<DomainCheckResult> {
  const normalized = normalizeDomainInput(rawInput);

  if (!normalized.isValid || !normalized.registrableDomain) {
    return {
      input: rawInput,
      domain: rawInput,
      status: 'invalid_input',
      createdAt: null,
      updatedAt: null,
      expiresAt: null,
      age: null,
      totalAgeDays: null,
      daysUntilExpiry: null,
      expiryStatus: 'unavailable',
      registrar: null,
      nameServers: [],
      registrationStatuses: [],
      source: 'UNAVAILABLE',
      sourceUrl: null,
      cached: false,
      error: normalized.error || 'Please enter a valid public domain name or website URL.'
    };
  }

  const registrable = normalized.registrableDomain;

  // Check cache
  const cached = getCachedResult(registrable);
  if (cached) {
    return {
      ...cached,
      input: rawInput
    };
  }

  // Query authoritative RDAP
  const rdapResult = await queryRdapRecord(registrable);

  if (rdapResult.status !== 'success' || !rdapResult.data) {
    const errorResult: DomainCheckResult = {
      input: rawInput,
      domain: registrable,
      status: rdapResult.status,
      createdAt: null,
      updatedAt: null,
      expiresAt: null,
      age: null,
      totalAgeDays: null,
      daysUntilExpiry: null,
      expiryStatus: 'unavailable',
      registrar: null,
      nameServers: [],
      registrationStatuses: [],
      source: rdapResult.status === 'unsupported' ? 'UNAVAILABLE' : 'RDAP',
      sourceUrl: rdapResult.sourceUrl,
      cached: false,
      error: rdapResult.error
    };

    // Cache 404s for 1 hour to prevent repeat registry queries
    if (rdapResult.status === 'not_found') {
      setCachedResult(registrable, errorResult, NOT_FOUND_CACHE_TTL_MS);
    }

    return errorResult;
  }

  const rdap = rdapResult.data;
  const { createdAt, updatedAt, expiresAt } = extractRdapEvents(rdap.events);
  const registrar = extractRegistrar(rdap.entities);
  const nameServers = extractNameservers(rdap.nameservers);
  const registrationStatuses = normalizeRegistrationStatuses(rdap.status);

  // Domain Age Calculation
  let age = null;
  let totalAgeDays = null;
  if (createdAt) {
    const ageCalc = calculateDomainAge(createdAt);
    age = ageCalc.age;
    totalAgeDays = ageCalc.totalAgeDays;
  }

  // Expiration calculation
  const expiryInfo = calculateExpiryStatus(expiresAt);

  const isPartial = !createdAt || !registrar || !expiresAt;
  const status = !createdAt ? 'partial_data' : 'success';

  const checkResult: DomainCheckResult = {
    input: rawInput,
    domain: registrable,
    status,
    createdAt: createdAt ? createdAt.toISOString() : null,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    age,
    totalAgeDays,
    daysUntilExpiry: expiryInfo.daysUntilExpiry,
    expiryStatus: expiryInfo.expiryStatus,
    registrar: registrar || 'Not available',
    nameServers,
    registrationStatuses,
    source: 'RDAP',
    sourceUrl: rdapResult.sourceUrl,
    cached: false,
    error: null
  };

  // Cache successful result
  setCachedResult(registrable, checkResult, SUCCESS_CACHE_TTL_MS);

  return checkResult;
}

/**
 * Concurrency-limited worker pool for batch checking domains.
 * Limits simultaneous RDAP connections to maxConcurrency (default: 3).
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Checks a batch of domains with concurrency control and deduplication.
 */
export async function checkDomainsBatch(
  rawInputs: string[],
  maxConcurrency = 3
): Promise<DomainAgeCheckResponse> {
  const checkedAt = new Date().toISOString();

  // Deduplicate and normalize
  const { normalized, uniqueDomains } = normalizeAndDeduplicateDomains(rawInputs);

  // Map of unique domain -> Promise/Result
  const uniqueResultMap = new Map<string, DomainCheckResult>();

  // Process unique domains with bounded concurrency
  const uniqueResults = await runWithConcurrencyLimit(
    uniqueDomains,
    maxConcurrency,
    async (domain) => {
      return checkSingleDomain(domain);
    }
  );

  for (let i = 0; i < uniqueDomains.length; i++) {
    uniqueResultMap.set(uniqueDomains[i], uniqueResults[i]);
  }

  // Construct results in original input order
  const finalResults: DomainCheckResult[] = normalized.map((norm, index) => {
    const originalInput = rawInputs[index] || norm.rawInput;

    if (!norm.isValid || !norm.registrableDomain) {
      return {
        input: originalInput,
        domain: originalInput,
        status: 'invalid_input',
        createdAt: null,
        updatedAt: null,
        expiresAt: null,
        age: null,
        totalAgeDays: null,
        daysUntilExpiry: null,
        expiryStatus: 'unavailable',
        registrar: null,
        nameServers: [],
        registrationStatuses: [],
        source: 'UNAVAILABLE',
        sourceUrl: null,
        cached: false,
        error: norm.error || 'Please enter a valid public domain name or website URL.'
      };
    }

    const uniqueRes = uniqueResultMap.get(norm.registrableDomain);
    if (uniqueRes) {
      return {
        ...uniqueRes,
        input: originalInput
      };
    }

    return {
      input: originalInput,
      domain: norm.registrableDomain,
      status: 'error',
      createdAt: null,
      updatedAt: null,
      expiresAt: null,
      age: null,
      totalAgeDays: null,
      daysUntilExpiry: null,
      expiryStatus: 'unavailable',
      registrar: null,
      nameServers: [],
      registrationStatuses: [],
      source: 'UNAVAILABLE',
      sourceUrl: null,
      cached: false,
      error: 'Lookup failed.'
    };
  });

  const successfulCount = finalResults.filter(r => r.status === 'success' || r.status === 'partial_data').length;
  const failedCount = finalResults.length - successfulCount;

  return {
    success: true,
    checkedAt,
    totalCount: finalResults.length,
    successfulCount,
    failedCount,
    results: finalResults
  };
}
