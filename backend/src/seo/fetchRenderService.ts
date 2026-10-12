import crypto from 'crypto';
import {
  FetchRenderRequestOptions,
  FetchRenderCompleteResult,
  FetchRenderMode,
  InitialFetchResult,
  ExtractedSeoSignals,
  DiagnosticItem
} from './fetchRenderTypes.js';
import { validateFetchRenderRequest } from './fetchRenderValidation.js';
import { getFetchRenderUserAgent } from './fetchRenderUserAgents.js';
import { fetchInitialHtml } from './fetchRenderFetcher.js';
import { checkRobotsTxtCrawlability } from './fetchRenderRobots.js';
import { executeBrowserRender } from './fetchRenderBrowser.js';
import {
  extractSeoSignals,
  compareSeoSignals,
  generateDiagnostics
} from './fetchRenderAnalysis.js';

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

function calculateTotalDownloadBytes(): number {
  let total = 0;
  for (const dl of DOWNLOAD_STORE.values()) {
    total += dl.data.length;
  }
  return total;
}

function calculateTotalResultBytes(): number {
  let total = 0;
  for (const res of RESULT_STORE.values()) {
    const originalLen = res.initialFetch?.rawHtml?.length || 0;
    const renderedLen = res.renderResult?.renderedHtml?.length || 0;
    const screenshotLen = res.renderResult?.screenshotBase64?.length || 0;
    total += originalLen + renderedLen + screenshotLen + 2048;
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

function storeResult(result: FetchRenderCompleteResult) {
  evictStoreEntries();

  const approxBytes =
    (result.initialFetch?.rawHtml?.length || 0) +
    (result.renderResult?.renderedHtml?.length || 0) +
    (result.renderResult?.screenshotBase64?.length || 0) +
    2048;

  if (approxBytes > MAX_BYTES_PER_RESULT && result.renderResult?.screenshotBase64) {
    // Drop screenshot to preserve memory within byte cap
    result.renderResult.screenshotBase64 = undefined;
  }

  while (
    (calculateTotalResultBytes() + approxBytes > MAX_TOTAL_RESULT_BYTES || RESULT_STORE.size >= MAX_STORED_RESULTS) &&
    RESULT_STORE.size > 0
  ) {
    const oldestKey = RESULT_STORE.keys().next().value;
    if (!oldestKey) break;
    RESULT_STORE.delete(oldestKey);
  }

  RESULT_STORE.set(result.id, result);
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

  // FIX 1: When respectRobots = true:
  // If explicitly Disallowed, do NOT fetch or render the disallowed target page!
  if (validation.respectRobots && robotsInfo.blockedMainUrl) {
    const totalDurationMs = Date.now() - startTime;
    const initialFetch: InitialFetchResult = {
      requestedUrl: validation.url,
      finalUrl: validation.url,
      statusCode: 0,
      statusText: 'Crawl Disallowed by robots.txt',
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

    const diagnostics: DiagnosticItem[] = [
      {
        id: 'diag_robots_disallowed',
        category: 'CRAWLABILITY',
        severity: 'ERROR',
        title: 'Crawl Disallowed by robots.txt',
        description: `Target URL is blocked by robots.txt rule for user-agent "${userAgent.token}". ${robotsInfo.applicableRule ? `Rule: ${robotsInfo.applicableRule.originalText}` : ''} Crawling and rendering halted because "Respect robots.txt" is enabled.`,
        seoImpact: 'Search engine crawlers respecting robots.txt will not fetch or index this URL.',
        source: 'ROBOTS_TXT',
        confidence: 'CONFIRMED'
      }
    ];

    const blockedResult: FetchRenderCompleteResult = {
      id: testId,
      timestamp: new Date().toISOString(),
      requestedUrl: validation.url,
      finalUrl: validation.url,
      mode: validation.mode,
      userAgent,
      summary: {
        httpStatus: 0,
        httpStatusText: 'Crawl Disallowed (robots.txt)',
        crawlability: 'DISALLOWED',
        renderingStatus: 'FETCH_ONLY',
        indexabilitySignal: 'BLOCKING_SIGNAL_DETECTED',
        totalDurationMs,
        totalIssuesCount: {
          errors: 1,
          warnings: 0,
          notices: 0
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
        errorMessage: 'Rendering skipped: Target URL is disallowed by robots.txt.'
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
      Buffer.from(JSON.stringify(blockedResult, null, 2), 'utf-8')
    );
    const seoDiffCsv = generateSeoDiffCsv(blockedResult);
    const seoDiffCsvId = storeDownloadPayload(
      `seo-comparison-${testId}.csv`,
      'text/csv; charset=utf-8',
      Buffer.from(seoDiffCsv, 'utf-8')
    );

    blockedResult.downloads.reportJsonId = reportJsonId;
    blockedResult.downloads.seoDiffCsvId = seoDiffCsvId;

    storeResult(blockedResult);
    return blockedResult;
  }

  // 3. Initial HTTP Fetch (Only executed when allowed or respectRobots = false)
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
    renderResult = await executeBrowserRender({
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

  // Add override diagnostic if robots.txt was disallowed but bypassed by user
  if (!validation.respectRobots && robotsInfo.fetchStatus === 'DISALLOWED') {
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
  } else if (robotsInfo.fetchStatus === 'UNKNOWN') {
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
      crawlability: robotsInfo.fetchStatus === 'DISALLOWED' ? 'DISALLOWED' : robotsInfo.fetchStatus === 'ALLOWED' ? 'ALLOWED' : 'UNKNOWN',
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

  // Store in bounded result cache
  storeResult(result);

  return result;
}
