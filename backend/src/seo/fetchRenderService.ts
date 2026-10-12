import crypto from 'crypto';
import {
  FetchRenderRequestOptions,
  FetchRenderCompleteResult,
  FetchRenderMode
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
// BOUNDED DOWNLOAD & RESULT STORE (TTL: 15 MINUTES, MAX 50 ITEMS)
// ========================================================
interface StoredDownload {
  filename: string;
  mimeType: string;
  data: Buffer;
  createdAt: number;
}

const RESULT_STORE = new Map<string, FetchRenderCompleteResult>();
const DOWNLOAD_STORE = new Map<string, StoredDownload>();

const MAX_STORED_RESULTS = 50;
const MAX_TOTAL_STORE_BYTES = 50 * 1024 * 1024; // 50 MiB
const STORE_TTL_MS = 15 * 60 * 1000; // 15 mins

function evictExpiredStoreEntries() {
  const now = Date.now();

  for (const [id, res] of RESULT_STORE.entries()) {
    const age = now - new Date(res.timestamp).getTime();
    if (age > STORE_TTL_MS) {
      RESULT_STORE.delete(id);
    }
  }

  for (const [id, dl] of DOWNLOAD_STORE.entries()) {
    if (now - dl.createdAt > STORE_TTL_MS) {
      DOWNLOAD_STORE.delete(id);
    }
  }

  // Check count bounds
  if (RESULT_STORE.size > MAX_STORED_RESULTS) {
    const keys = Array.from(RESULT_STORE.keys());
    const toRemove = keys.slice(0, keys.length - MAX_STORED_RESULTS);
    for (const k of toRemove) {
      RESULT_STORE.delete(k);
    }
  }

  // Check byte bounds
  let totalBytes = 0;
  for (const dl of DOWNLOAD_STORE.values()) {
    totalBytes += dl.data.length;
  }
  if (totalBytes > MAX_TOTAL_STORE_BYTES) {
    const dlKeys = Array.from(DOWNLOAD_STORE.keys());
    const toRemove = dlKeys.slice(0, Math.floor(dlKeys.length / 2));
    for (const k of toRemove) {
      DOWNLOAD_STORE.delete(k);
    }
  }
}

function storeDownloadPayload(filename: string, mimeType: string, data: Buffer): string {
  evictExpiredStoreEntries();
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
  evictExpiredStoreEntries();
  return DOWNLOAD_STORE.get(token);
}

export function getStoredResult(id: string): FetchRenderCompleteResult | undefined {
  evictExpiredStoreEntries();
  return RESULT_STORE.get(id);
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
  evictExpiredStoreEntries();
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
    validation.respectRobots
  );

  // 3. Initial HTTP Fetch
  const initialFetch = await fetchInitialHtml(
    validation.url,
    userAgent.fullUserAgent,
    validation.timeoutMs,
    validation.acceptLanguage,
    allowLocalhost
  );

  // 4. Extract Initial SEO Signals
  const initialSignals = extractSeoSignals(initialFetch.rawHtml, initialFetch.finalUrl);

  // 5. JavaScript Browser Render (if requested and permitted)
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

  // 7. Store Downloads
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

  // Generate Report & CSV downloads with complete result data
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

  // Store in result cache
  RESULT_STORE.set(testId, result);

  return result;
}
