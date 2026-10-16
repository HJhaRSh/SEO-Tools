import { SingleUrlMobileAuditResult } from './types';
import { DEFAULT_VIEWPORT_PRESET, MOBILE_VIEWPORT_PRESETS } from './constants';
import { safeFetch } from '@/lib/seo/hreflang/safeFetch';
import { auditStaticHtmlMobileFriendliness } from './staticAuditor';
import {
  BROWSER_AUDIT_INJECTION_SCRIPT,
  buildBrowserRenderedAuditResult,
  RenderAuditDomMetrics,
} from './browserEvaluator';

export interface AuditMobileUrlOptions {
  url: string;
  viewportPresetId?: string;
  allowLocalhostForTesting?: boolean;
}

/**
 * Checks whether backend browser rendering is available in current runtime.
 */
function getBackendBaseUrl(): string {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  return 'http://localhost:5000';
}

/**
 * Audits a single URL for mobile friendliness:
 * 1. Checks if browser rendering via dedicated service is viable.
 * 2. If browser rendering is available, captures real mobile viewport metrics and screenshot.
 * 3. If running purely in serverless environment or browser rendering is unavailable, executes
 *    high-fidelity static DOM analysis using mobile HTTP fetch and Cheerio heuristics.
 */
export async function auditSingleUrl(
  options: AuditMobileUrlOptions
): Promise<SingleUrlMobileAuditResult> {
  const startTime = Date.now();
  const preset =
    (options.viewportPresetId && MOBILE_VIEWPORT_PRESETS[options.viewportPresetId]) ||
    DEFAULT_VIEWPORT_PRESET;

  // Attempt real browser rendering via backend if configured and available
  const isVercel = Boolean(
    process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION
  );

  let browserResult: SingleUrlMobileAuditResult | null = null;

  // If local development or explicit remote browser configured, we can attempt backend fetch-render
  if (!isVercel && !process.env.FORCE_STATIC_AUDIT) {
    try {
      const backendUrl = getBackendBaseUrl();
      const testRes = await fetch(`${backendUrl}/api/seo/fetch-render/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: options.url,
          userAgent: 'chrome-mobile',
          mode: 'fetch-and-render',
          postLoadWaitMs: 1500,
          timeoutMs: 12000,
          captureScreenshot: true,
        }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);

      if (testRes && testRes.ok) {
        const data = await testRes.json().catch(() => null);
        if (data && data.success && data.result) {
          const r = data.result;
          const html = r.renderResult?.renderedHtml || r.initialFetch?.rawHtml || '';
          const screenshot = r.renderResult?.screenshotBase64;

          // Perform DOM metrics analysis on the rendered HTML
          const staticParsed = auditStaticHtmlMobileFriendliness(html, {
            url: options.url,
            finalUrl: r.initialFetch?.finalUrl || options.url,
            statusCode: r.initialFetch?.statusCode || 200,
            statusText: r.initialFetch?.statusText || 'OK',
            durationMs: Date.now() - startTime,
            viewport: preset,
          });

          browserResult = {
            ...staticParsed,
            executionMode: 'browser-rendered',
            screenshot: screenshot
              ? {
                  available: true,
                  base64Data: screenshot,
                  format: 'png',
                  width: preset.width,
                  height: preset.height,
                }
              : undefined,
          };
        }
      }
    } catch {
      // Backend browser render unavailable or errored; gracefully fallback to safe mobile fetch
    }
  }

  if (browserResult) {
    return browserResult;
  }

  // Pure Next.js safe fetch + static DOM heuristics audit
  const fetchRes = await safeFetch(options.url, {
    userAgent: preset.userAgent,
    timeoutMs: 10000,
    maxBytes: 2 * 1024 * 1024,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });

  const durationMs = Date.now() - startTime;
  return auditStaticHtmlMobileFriendliness(fetchRes.body, {
    url: fetchRes.requestedUrl,
    finalUrl: fetchRes.finalUrl,
    statusCode: fetchRes.status,
    statusText: fetchRes.statusText,
    durationMs,
    viewport: preset,
  });
}
