import crypto from 'crypto';
import {
  FetchRenderRequestOptions,
  FetchRenderCompleteResult,
  InitialFetchResult,
  ExtractedSeoSignals,
  DiagnosticItem
} from './fetchRenderTypes';
import { validateFetchRenderRequest } from './fetchRenderValidation';
import { getFetchRenderUserAgent } from './fetchRenderUserAgents';
import { fetchInitialHtml } from './fetchRenderFetcher';
import { checkRobotsTxtCrawlability } from './fetchRenderRobots';
import {
  isBrowserRenderAvailable,
  getBrowserRenderProvider
} from './browserRenderProvider';
import {
  extractSeoSignals,
  compareSeoSignals,
  generateDiagnostics
} from './fetchRenderAnalysis';

// ========================================================
// BOUNDED DOWNLOAD & RESULT STORE WITH STRICT BYTE & COUNT LIMITS
// ========================================================
interface StoredDownload {
  filename: string;
  mimeType: string;
  data: Buffer;
  createdAt: number;
}

const RESULT_STORE = new Map<string, FetchRenderCompleteResult>();
const DOWNLOAD_STORE = new Map<string, StoredDownload>();

export const MAX_STORED_RESULTS = 50;
export const MAX_BYTES_PER_RESULT = 4 * 1024 * 1024; // 4 MiB
export const MAX_TOTAL_RESULT_BYTES = 30 * 1024 * 1024; // 30 MiB

export const MAX_STORED_DOWNLOADS = 100;
export const MAX_DOWNLOAD_ITEM_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_TOTAL_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MiB

export const STORE_TTL_MS = 15 * 60 * 1000; // 15 mins

/**
 * Accurately calculates the retained in-memory size of a FetchRenderCompleteResult object.
 * Measures UTF-8 byte lengths for HTML strings, screenshot base64 buffers, and JSON serialized structures.
 */
export function calculateResultRetainedBytes(result: FetchRenderCompleteResult): number {
  let bytes = 0;

  // Initial fetch
  if (result.initialFetch) {
    if (result.initialFetch.rawHtml) {
      bytes += Buffer.byteLength(result.initialFetch.rawHtml, 'utf-8');
    }
    if (result.initialFetch.headers) {
      bytes += Buffer.byteLength(JSON.stringify(result.initialFetch.headers), 'utf-8');
    }
    if (result.initialFetch.redirectHistory) {
      bytes += Buffer.byteLength(JSON.stringify(result.initialFetch.redirectHistory), 'utf-8');
    }
  }

  // Rendered result
  if (result.renderResult) {
    if (result.renderResult.renderedHtml) {
      bytes += Buffer.byteLength(result.renderResult.renderedHtml, 'utf-8');
    }
    if (result.renderResult.screenshotBase64) {
      bytes += Buffer.byteLength(result.renderResult.screenshotBase64, 'utf-8');
    }
    if (result.renderResult.resources) {
      bytes += Buffer.byteLength(JSON.stringify(result.renderResult.resources), 'utf-8');
    }
    if (result.renderResult.consoleMessages) {
      bytes += Buffer.byteLength(JSON.stringify(result.renderResult.consoleMessages), 'utf-8');
    }
  }

  // SEO Signals & Comparison
  if (result.seoSignals) {
    bytes += Buffer.byteLength(JSON.stringify(result.seoSignals), 'utf-8');
  }

  // Diagnostics
  if (result.diagnostics) {
    bytes += Buffer.byteLength(JSON.stringify(result.diagnostics), 'utf-8');
  }

  // Fixed metadata & object descriptor overhead
  bytes += 1024;

  return bytes;
}

function calculateTotalDownloadBytes(): number {
  let total = 0;
  for (const dl of DOWNLOAD_STORE.values()) {
    total += dl.data.length;
  }
  return total;
}

export function calculateTotalResultBytes(): number {
  let total = 0;
  for (const res of RESULT_STORE.values()) {
    total += calculateResultRetainedBytes(res);
  }
  return total;
}

export function evictStoreEntries() {
  const now = Date.now();

  // 1. Evict expired result entries
  for (const [id, res] of RESULT_STORE.entries()) {
    const age = now - new Date(res.timestamp).getTime();
    if (age > STORE_TTL_MS) {
      RESULT_STORE.delete(id);
    }
  }

  // 2. Full eviction loop for results until both count AND byte caps are satisfied
  while (
    (RESULT_STORE.size > MAX_STORED_RESULTS || calculateTotalResultBytes() > MAX_TOTAL_RESULT_BYTES) &&
    RESULT_STORE.size > 0
  ) {
    const oldestKey = RESULT_STORE.keys().next().value;
    if (!oldestKey) break;
    RESULT_STORE.delete(oldestKey);
  }

  // 3. Evict expired download entries
  for (const [id, dl] of DOWNLOAD_STORE.entries()) {
    if (now - dl.createdAt > STORE_TTL_MS) {
      DOWNLOAD_STORE.delete(id);
    }
  }

  // 4. Full eviction loop for downloads until both count AND byte caps are satisfied
  while (
    (DOWNLOAD_STORE.size > MAX_STORED_DOWNLOADS || calculateTotalDownloadBytes() > MAX_TOTAL_DOWNLOAD_BYTES) &&
    DOWNLOAD_STORE.size > 0
  ) {
    const oldestKey = DOWNLOAD_STORE.keys().next().value;
    if (!oldestKey) break;
    DOWNLOAD_STORE.delete(oldestKey);
  }
}

export function storeDownloadPayload(filename: string, mimeType: string, data: Buffer): string {
  if (data.length > MAX_DOWNLOAD_ITEM_BYTES) {
    throw new Error(`Download item exceeds maximum permitted size of 5 MiB (${data.length} bytes).`);
  }

  evictStoreEntries();

  // If adding this item would exceed aggregate capacity, evict oldest downloads until it fits
  while (
    (calculateTotalDownloadBytes() + data.length > MAX_TOTAL_DOWNLOAD_BYTES || DOWNLOAD_STORE.size >= MAX_STORED_DOWNLOADS) &&
    DOWNLOAD_STORE.size > 0
  ) {
    const oldestKey = DOWNLOAD_STORE.keys().next().value;
    if (!oldestKey) break;
    DOWNLOAD_STORE.delete(oldestKey);
  }

  const token = crypto.randomBytes(16).toString('hex');
  DOWNLOAD_STORE.set(token, {
    filename,
    mimeType,
    data,
    createdAt: Date.now()
  });
  return token;
}

export function getDownloadPayload(token: string): StoredDownload | undefined {
  evictStoreEntries();
  return DOWNLOAD_STORE.get(token);
}

/**
 * Stores a result into memory enforcing the 4 MiB per-result limit and 30 MiB aggregate limit.
 * Implements a documented multi-stage priority reduction:
 * Stage 1: Drop screenshot, recalculate size.
 * Stage 2: Bounded truncation of diagnostic/rendered HTML fields, recalculate size.
 * Stage 3: If still > 4 MiB, refuse to store to protect production stability.
 */
export function storeResult(result: FetchRenderCompleteResult): { stored: boolean; sizeBytes: number; reason?: string } {
  evictStoreEntries();

  let currentBytes = calculateResultRetainedBytes(result);

  // Priority 1: Drop screenshot if result exceeds 4 MiB
  if (currentBytes > MAX_BYTES_PER_RESULT && result.renderResult?.screenshotBase64) {
    result.renderResult.screenshotBase64 = undefined;
    result.renderResult.errorMessage =
      (result.renderResult.errorMessage ? result.renderResult.errorMessage + '; ' : '') +
      'Screenshot omitted from stored result to adhere to 4 MiB memory limit.';
    // Recalculate size after dropping screenshot
    currentBytes = calculateResultRetainedBytes(result);
  }

  // Priority 2: Safe bounded truncation of large rendered HTML and diagnostics
  if (currentBytes > MAX_BYTES_PER_RESULT && result.renderResult?.renderedHtml) {
    const maxHtmlAllowedBytes = 1.5 * 1024 * 1024;
    const currentHtmlBytes = Buffer.byteLength(result.renderResult.renderedHtml, 'utf-8');
    if (currentHtmlBytes > maxHtmlAllowedBytes) {
      result.renderResult.renderedHtml = Buffer.from(result.renderResult.renderedHtml, 'utf-8')
        .subarray(0, maxHtmlAllowedBytes)
        .toString('utf-8');
      result.renderResult.isTruncated = true;
      result.renderResult.byteSize = maxHtmlAllowedBytes;
    }
    if (result.renderResult.resources && result.renderResult.resources.length > 150) {
      result.renderResult.resources = result.renderResult.resources.slice(0, 150);
    }
    if (result.renderResult.consoleMessages && result.renderResult.consoleMessages.length > 100) {
      result.renderResult.consoleMessages = result.renderResult.consoleMessages.slice(0, 100);
    }
    // Recalculate size after bounded truncation
    currentBytes = calculateResultRetainedBytes(result);
  }

  // Priority 3: Hard limit check. If STILL oversized, DO NOT STORE IT!
  if (currentBytes > MAX_BYTES_PER_RESULT) {
    return {
      stored: false,
      sizeBytes: currentBytes,
      reason: `Result size (${currentBytes} bytes) exceeds maximum allowable limit of 4 MiB (${MAX_BYTES_PER_RESULT} bytes) and was not stored.`
    };
  }

  // Aggregate capacity enforcement: evict oldest until both count and total bytes fit
  while (
    (calculateTotalResultBytes() + currentBytes > MAX_TOTAL_RESULT_BYTES || RESULT_STORE.size >= MAX_STORED_RESULTS) &&
    RESULT_STORE.size > 0
  ) {
    const oldestKey = RESULT_STORE.keys().next().value;
    if (!oldestKey) break;
    RESULT_STORE.delete(oldestKey);
  }

  RESULT_STORE.set(result.id, result);
  return { stored: true, sizeBytes: currentBytes };
}

export function getStoredResult(id: string): FetchRenderCompleteResult | undefined {
  evictStoreEntries();
  return RESULT_STORE.get(id);
}

export function getStoreMetrics() {
  evictStoreEntries();
  return {
    resultsCount: RESULT_STORE.size,
    totalResultBytes: calculateTotalResultBytes(),
    downloadsCount: DOWNLOAD_STORE.size,
    totalDownloadBytes: calculateTotalDownloadBytes(),
    maxResultsCount: MAX_STORED_RESULTS,
    maxTotalResultBytes: MAX_TOTAL_RESULT_BYTES,
    maxDownloadsCount: MAX_STORED_DOWNLOADS,
    maxTotalDownloadBytes: MAX_TOTAL_DOWNLOAD_BYTES
  };
}

export function clearStoresForTesting() {
  RESULT_STORE.clear();
  DOWNLOAD_STORE.clear();
}

function generateSeoDiffCsv(result: FetchRenderCompleteResult): string {
  const headers = ['SEO Signal', 'Status', 'Initial Value', 'Rendered Value', 'Importance', 'Summary'];
  const rows = (result.seoSignals.comparison || []).map((diff) => [
    `"${diff.label.replace(/"/g, '""')}"`,
    `"${diff.status}"`,
    `"${String(diff.initialValue || '').replace(/"/g, '""')}"`,
    `"${String(diff.renderedValue || '').replace(/"/g, '""')}"`,
    `"${diff.importance}"`,
    `"${diff.summary.replace(/"/g, '""')}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export async function runFetchAndRenderTest(
  rawBody: FetchRenderRequestOptions,
  serviceOptions?: { allowLocalhostForTesting?: boolean }
): Promise<FetchRenderCompleteResult> {
  evictStoreEntries();
  const allowLocalhost = serviceOptions?.allowLocalhostForTesting ?? false;

  // 1. Validate request
  const validation = validateFetchRenderRequest(rawBody, serviceOptions);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid test parameters.');
  }

  const userAgent = getFetchRenderUserAgent(validation.userAgentId);
  const testId = crypto.randomUUID();
  const startTime = Date.now();

  // 2. robots.txt Crawlability Check
  const robotsInfo = await checkRobotsTxtCrawlability(
    validation.url,
    userAgent.token,
    validation.respectRobots,
    allowLocalhost
  );

  // When respectRobots = true, if tool policy prevents fetching, halt before requesting target page.
  if (validation.respectRobots && !robotsInfo.fetchPermittedByToolPolicy) {
    const totalDurationMs = Date.now() - startTime;
    const initialFetch: InitialFetchResult = {
      requestedUrl: validation.url,
      finalUrl: validation.url,
      statusCode: 0,
      statusText: robotsInfo.explicitlyDisallowed
        ? 'Crawl Disallowed by robots.txt'
        : robotsInfo.classification === 'UNAVAILABLE'
        ? `Robots.txt Unavailable (HTTP ${robotsInfo.statusCode || 'Client Error'})`
        : robotsInfo.classification === 'RATE_LIMITED'
        ? 'Robots.txt Rate Limited (HTTP 429)'
        : robotsInfo.classification === 'UNREACHABLE'
        ? `Robots.txt Server Error (HTTP ${robotsInfo.statusCode || '5xx'})`
        : 'Robots.txt Unresolved (Fetch Halted)',
      headers: {},
      rawHtml: '',
      byteSize: 0,
      durationMs: 0,
      redirectHistory: [],
      contentType: 'text/html',
      isTruncated: false
    };

    const emptySignals: ExtractedSeoSignals = {
      title: null,
      metaDescription: null,
      metaRobots: null,
      canonicalUrl: null,
      h1Headings: [],
      internalLinksCount: 0,
      externalLinksCount: 0,
      imagesCount: 0,
      imagesWithAltCount: 0,
      wordCount: 0,
      structuredDataTypes: [],
      structuredDataCount: 0,
      hreflangTags: []
    };

    const diagnostics: DiagnosticItem[] = [];

    if (robotsInfo.explicitlyDisallowed) {
      // CASE A: Explicit Disallow Directive evaluated and matched
      diagnostics.push({
        id: 'diag_robots_disallowed',
        category: 'CRAWLABILITY',
        severity: 'ERROR',
        title: 'Crawl Disallowed by robots.txt',
        description: `Target URL is blocked by an explicit robots.txt Disallow rule for user-agent "${userAgent.token}". ${robotsInfo.applicableRule ? `Rule: ${robotsInfo.applicableRule.originalText}` : ''} Crawling and rendering halted because "Respect robots.txt" is enabled.`,
        seoImpact: 'Search engine crawlers respecting robots.txt will not fetch or index this URL.',
        source: 'ROBOTS_TXT',
        confidence: 'CONFIRMED'
      });
    } else if (robotsInfo.classification === 'UNAVAILABLE' && (robotsInfo.statusCode === 401 || robotsInfo.statusCode === 403)) {
      // CASE B: HTTP 401 / 403 Unavailable under RFC 9309 — Halted by Conservative Tool Policy
      diagnostics.push({
        id: 'diag_robots_unauthorized_policy',
        category: 'CRAWLABILITY',
        severity: 'WARNING',
        title: `Robots.txt Unavailable (HTTP ${robotsInfo.statusCode}) — Conservative Policy Halt`,
        description: `robots.txt returned HTTP ${robotsInfo.statusCode}. Under RFC 9309 Section 2.3.1.2, 4xx responses mean robots.txt is unavailable. No explicit Disallow directive was evaluated. This tool halted fetching because of its conservative crawl policy, not because of an RFC 9309 disallow directive.`,
        seoImpact: 'Search engine crawlers encountering 401/403 on robots.txt treat the file as unavailable, but if the origin requires authentication, crawlers will not be able to index protected resources.',
        source: 'ROBOTS_TXT',
        confidence: 'CONFIRMED'
      });
    } else if (robotsInfo.classification === 'RATE_LIMITED') {
      // CASE C: HTTP 429 Rate Limited
      diagnostics.push({
        id: 'diag_robots_rate_limited',
        category: 'CRAWLABILITY',
        severity: 'WARNING',
        title: 'Robots.txt Rate Limited (HTTP 429) — Crawl Deferred',
        description: `robots.txt returned HTTP 429 (Too Many Requests). Crawlers treat rate limiting as temporary back-off and halt crawling to protect origin availability. Fetching halted under conservative crawl policy.`,
        seoImpact: 'Search engine crawlers encountering HTTP 429 throttle or defer crawl requests to prevent server exhaustion.',
        source: 'ROBOTS_TXT',
        confidence: 'CONFIRMED'
      });
    } else if (robotsInfo.classification === 'UNREACHABLE') {
      // CASE D: HTTP 5xx Server Error (RFC 9309 Section 2.3.1.3: Temporarily Unreachable)
      diagnostics.push({
        id: 'diag_robots_temp_unavailable',
        category: 'CRAWLABILITY',
        severity: 'WARNING',
        title: `Robots.txt Temporarily Unavailable (HTTP ${robotsInfo.statusCode}) — Crawl Deferred`,
        description: `robots.txt returned server error (HTTP ${robotsInfo.statusCode}). Under RFC 9309 Section 2.3.1.3, crawlers must treat 5xx responses as temporarily unreachable and halt crawling until resolved.`,
        seoImpact: 'Search engine crawlers encountering 5xx errors on robots.txt temporarily halt crawling to avoid indexing restricted content.',
        source: 'ROBOTS_TXT',
        confidence: 'CONFIRMED'
      });
    } else {
      // CASE E: Network, DNS, or Redirect failure
      diagnostics.push({
        id: 'diag_robots_network_failure',
        category: 'CRAWLABILITY',
        severity: 'WARNING',
        title: `Robots.txt Retrieval Failed (${robotsInfo.failureType || 'Network Error'}) — Crawl Deferred`,
        description: `robots.txt could not be retrieved due to ${robotsInfo.failureType || 'network error'} (${robotsInfo.explanation}). Under the tool's conservative crawling policy, fetching and rendering were halted because crawl permission could not be established.`,
        seoImpact: 'Search engine crawlers encountering network timeouts or unreachable origins on robots.txt temporarily halt crawling.',
        source: 'ROBOTS_TXT',
        confidence: 'CONFIRMED'
      });
    }

    const crawlabilitySummary = robotsInfo.explicitlyDisallowed ? 'DISALLOWED' : 'UNKNOWN';
    const httpStatusText = robotsInfo.explicitlyDisallowed
      ? 'Crawl Disallowed (robots.txt)'
      : robotsInfo.classification === 'UNAVAILABLE'
      ? `Robots.txt Unavailable (HTTP ${robotsInfo.statusCode})`
      : robotsInfo.classification === 'RATE_LIMITED'
      ? 'Robots.txt Rate Limited (HTTP 429)'
      : 'Robots.txt Temporarily Unavailable';

    const haltedResult: FetchRenderCompleteResult = {
      id: testId,
      timestamp: new Date().toISOString(),
      requestedUrl: validation.url,
      finalUrl: validation.url,
      mode: validation.mode,
      userAgent,
      summary: {
        httpStatus: 0,
        httpStatusText,
        crawlability: crawlabilitySummary,
        renderingStatus: 'FETCH_ONLY',
        indexabilitySignal: robotsInfo.explicitlyDisallowed ? 'BLOCKING_SIGNAL_DETECTED' : 'UNKNOWN',
        totalDurationMs,
        totalIssuesCount: {
          errors: diagnostics.filter(d => d.severity === 'ERROR').length,
          warnings: diagnostics.filter(d => d.severity === 'WARNING').length,
          notices: diagnostics.filter(d => d.severity === 'INFO').length
        }
      },
      initialFetch,
      renderResult: {
        renderedHtml: '',
        byteSize: 0,
        renderDurationMs: 0,
        resources: [],
        consoleMessages: [],
        totalResourcesLoaded: 0,
        totalResourcesFailed: 0,
        totalResourcesBlocked: 0,
        isTruncated: false,
        renderStatus: 'SKIPPED',
        errorMessage: `Rendering skipped: ${robotsInfo.policyReason}`
      },
      robotsInfo,
      seoSignals: {
        initial: emptySignals,
        rendered: undefined,
        comparison: []
      },
      diagnostics,
      downloads: {
        originalHtmlId: storeDownloadPayload('original.html', 'text/html; charset=utf-8', Buffer.from('', 'utf-8')),
        renderedHtmlId: undefined,
        screenshotId: undefined,
        reportJsonId: '',
        seoDiffCsvId: ''
      }
    };

    const reportJsonId = storeDownloadPayload(
      `fetch-render-report-${testId}.json`,
      'application/json; charset=utf-8',
      Buffer.from(JSON.stringify(haltedResult, null, 2), 'utf-8')
    );
    const seoDiffCsv = generateSeoDiffCsv(haltedResult);
    const seoDiffCsvId = storeDownloadPayload(
      `seo-comparison-${testId}.csv`,
      'text/csv; charset=utf-8',
      Buffer.from(seoDiffCsv, 'utf-8')
    );

    haltedResult.downloads.reportJsonId = reportJsonId;
    haltedResult.downloads.seoDiffCsvId = seoDiffCsvId;
    haltedResult.seoDiffCsv = seoDiffCsv;

    storeResult(haltedResult);
    return haltedResult;
  }

  // 3. Initial HTTP Fetch (Only executed when permitted or respectRobots = false)
  const initialFetch = await fetchInitialHtml(
    validation.url,
    userAgent.fullUserAgent,
    validation.timeoutMs,
    validation.acceptLanguage,
    allowLocalhost
  );

  // 4. Extract Initial SEO Signals
  const initialSignals = extractSeoSignals(initialFetch.rawHtml, initialFetch.finalUrl);

  // 5. JavaScript Browser Render (if requested)
  let renderResult: any = undefined;
  let renderedSignals: any = undefined;
  let comparison: any[] = [];

  const shouldRender =
    validation.mode === 'fetch-and-render' &&
    (!validation.respectRobots || !robotsInfo.blockedMainUrl);

  if (shouldRender) {
    if (!isBrowserRenderAvailable()) {
      const err: any = new Error(
        'Browser rendering is not available in the current Vercel test environment. Switch to Fetch Only mode.'
      );
      err.code = 'BROWSER_RENDER_UNAVAILABLE';
      err.statusCode = 503;
      throw err;
    }

    const provider = getBrowserRenderProvider();
    renderResult = await provider.render({
      url: initialFetch.finalUrl,
      userAgent,
      respectRobots: validation.respectRobots,
      robotsTxtContent: robotsInfo.robotsTxtContent,
      postLoadWaitMs: validation.postLoadWaitMs,
      timeoutMs: validation.timeoutMs,
      acceptLanguage: validation.acceptLanguage,
      captureScreenshot: validation.captureScreenshot,
      allowLocalhostForTesting: allowLocalhost
    });

    if (renderResult.renderStatus === 'COMPLETED') {
      renderedSignals = extractSeoSignals(renderResult.renderedHtml, initialFetch.finalUrl);
      comparison = compareSeoSignals(initialSignals, renderedSignals);
    }
  }

  // 6. Diagnostics Engine
  const diagnostics = generateDiagnostics(initialFetch, robotsInfo, renderResult, comparison);

  // Add override diagnostic if robots.txt had issues but was bypassed by user
  if (!validation.respectRobots && robotsInfo.explicitlyDisallowed) {
    diagnostics.push({
      id: 'diag_robots_override',
      category: 'CRAWLABILITY',
      severity: 'WARNING',
      title: 'robots.txt Disallow Ignored (Override Enabled)',
      description: `Target URL is disallowed by robots.txt for "${userAgent.token}", but the user explicitly disabled "Respect robots.txt". Production crawlers would block this URL.`,
      seoImpact: 'Production search crawlers that honor robots.txt will not crawl or render this page.',
      source: 'ROBOTS_TXT',
      confidence: 'CONFIRMED'
    });
  } else if (!validation.respectRobots && robotsInfo.classification === 'UNAVAILABLE' && (robotsInfo.statusCode === 401 || robotsInfo.statusCode === 403)) {
    diagnostics.push({
      id: 'diag_robots_auth_override',
      category: 'CRAWLABILITY',
      severity: 'WARNING',
      title: 'robots.txt Access Denied Ignored (Override Enabled)',
      description: `robots.txt returned HTTP ${robotsInfo.statusCode} for "${userAgent.token}", but the user explicitly disabled "Respect robots.txt". Testing proceeded under user override.`,
      seoImpact: 'Production search crawlers would treat robots.txt as unavailable and cannot access origin if credentials/permissions are required.',
      source: 'ROBOTS_TXT',
      confidence: 'CONFIRMED'
    });
  } else if (
    !validation.respectRobots &&
    (robotsInfo.classification === 'UNREACHABLE' ||
      robotsInfo.classification === 'RATE_LIMITED' ||
      robotsInfo.classification === 'NETWORK_ERROR' ||
      robotsInfo.classification === 'REDIRECT_ERROR' ||
      robotsInfo.classification === 'UNKNOWN')
  ) {
    diagnostics.push({
      id: 'diag_robots_temp_override',
      category: 'CRAWLABILITY',
      severity: 'WARNING',
      title: 'robots.txt Temporary Failure Ignored (Override Enabled)',
      description: `robots.txt was temporarily unavailable or unreachable for "${userAgent.token}", but the user explicitly disabled "Respect robots.txt". Testing proceeded without establishing robots.txt permissions.`,
      seoImpact: 'Production search crawlers would defer crawling until robots.txt becomes available.',
      source: 'ROBOTS_TXT',
      confidence: 'CONFIRMED'
    });
  }

  // 7. Store Downloads with bounds
  const originalHtmlId = storeDownloadPayload(
    'original.html',
    'text/html; charset=utf-8',
    Buffer.from(initialFetch.rawHtml, 'utf-8')
  );

  let renderedHtmlId: string | undefined = undefined;
  if (renderResult && renderResult.renderedHtml) {
    renderedHtmlId = storeDownloadPayload(
      'rendered.html',
      'text/html; charset=utf-8',
      Buffer.from(renderResult.renderedHtml, 'utf-8')
    );
  }

  let screenshotId: string | undefined = undefined;
  if (renderResult && renderResult.screenshotBase64) {
    screenshotId = storeDownloadPayload(
      'screenshot.png',
      'image/png',
      Buffer.from(renderResult.screenshotBase64, 'base64')
    );
  }

  // 8. Build complete result
  const totalDurationMs = Date.now() - startTime;

  let indexabilitySignal: 'NO_BLOCKING_SIGNAL' | 'BLOCKING_SIGNAL_DETECTED' | 'UNKNOWN' = 'NO_BLOCKING_SIGNAL';
  const hasNoindex =
    (initialFetch.headers['x-robots-tag'] || '').toLowerCase().includes('noindex') ||
    (initialSignals.metaRobots || '').toLowerCase().includes('noindex') ||
    (renderedSignals?.metaRobots || '').toLowerCase().includes('noindex');

  if (hasNoindex) {
    indexabilitySignal = 'BLOCKING_SIGNAL_DETECTED';
  } else if (robotsInfo.fetchStatus === 'UNKNOWN' || robotsInfo.fetchStatus === 'TEMPORARY_UNAVAILABLE' || robotsInfo.classification === 'UNREACHABLE') {
    indexabilitySignal = 'UNKNOWN';
  }

  let renderingStatus: 'COMPLETED' | 'FETCH_ONLY' | 'PARTIAL' | 'FAILED' = 'FETCH_ONLY';
  if (validation.mode === 'fetch-and-render') {
    if (renderResult?.renderStatus === 'COMPLETED') {
      renderingStatus = 'COMPLETED';
    } else if (renderResult?.renderStatus === 'PARTIAL') {
      renderingStatus = 'PARTIAL';
    } else {
      renderingStatus = 'FAILED';
    }
  }

  const result: FetchRenderCompleteResult = {
    id: testId,
    timestamp: new Date().toISOString(),
    requestedUrl: validation.url,
    finalUrl: initialFetch.finalUrl,
    mode: validation.mode,
    userAgent,
    summary: {
      httpStatus: initialFetch.statusCode,
      httpStatusText: initialFetch.statusText,
      crawlability: robotsInfo.explicitlyDisallowed
        ? 'DISALLOWED'
        : robotsInfo.crawlabilityStatus === 'ALLOWED' || robotsInfo.classification === 'ALLOWED'
        ? 'ALLOWED'
        : 'UNKNOWN',
      renderingStatus,
      indexabilitySignal,
      totalDurationMs,
      totalIssuesCount: {
        errors: diagnostics.filter(d => d.severity === 'ERROR').length,
        warnings: diagnostics.filter(d => d.severity === 'WARNING').length,
        notices: diagnostics.filter(d => d.severity === 'INFO').length
      }
    },
    initialFetch,
    renderResult,
    robotsInfo,
    seoSignals: {
      initial: initialSignals,
      rendered: renderedSignals,
      comparison
    },
    diagnostics,
    downloads: {
      originalHtmlId,
      renderedHtmlId,
      screenshotId,
      reportJsonId: '',
      seoDiffCsvId: ''
    }
  };

  const reportJsonId = storeDownloadPayload(
    'fetch-render-report.json',
    'application/json; charset=utf-8',
    Buffer.from(JSON.stringify(result, null, 2), 'utf-8')
  );

  const seoDiffCsv = generateSeoDiffCsv(result);
  const seoDiffCsvId = storeDownloadPayload(
    'seo-comparison.csv',
    'text/csv; charset=utf-8',
    Buffer.from(seoDiffCsv, 'utf-8')
  );

  result.downloads.reportJsonId = reportJsonId;
  result.downloads.seoDiffCsvId = seoDiffCsvId;
  result.seoDiffCsv = seoDiffCsv;

  // Store in bounded result cache with hard caps
  storeResult(result);

  return result;
}
