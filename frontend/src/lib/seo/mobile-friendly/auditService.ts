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

  // Determine whether to attempt real browser rendering
  // If FORCE_STATIC_AUDIT is set, skip browser rendering immediately
  let browserResult: SingleUrlMobileAuditResult | null = null;

  if (!process.env.FORCE_STATIC_AUDIT) {
    try {
      const backendUrl = getBackendBaseUrl();
      const renderRes = await fetch(`${backendUrl}/api/seo/mobile-friendly/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: options.url,
          viewport: {
            width: preset.width,
            height: preset.height,
            deviceScaleFactor: preset.deviceScaleFactor,
          },
          evaluateScript: BROWSER_AUDIT_INJECTION_SCRIPT,
          allowLocalhostForTesting: Boolean(options.allowLocalhostForTesting),
        }),
        signal: AbortSignal.timeout(18000),
      }).catch(() => null);

      if (renderRes && renderRes.ok) {
        const data = await renderRes.json().catch(() => null);
        if (data && data.success && data.result && data.result.metrics) {
          const r = data.result;
          const liveMetrics: RenderAuditDomMetrics = r.metrics;
          const screenshot = r.screenshotBase64;

          browserResult = buildBrowserRenderedAuditResult({
            url: options.url,
            finalUrl: options.url,
            statusCode: 200,
            statusText: 'OK',
            durationMs: Date.now() - startTime,
            viewport: preset,
            screenshotBase64: screenshot,
            metrics: liveMetrics,
          });
        }
      }
    } catch {
      // Backend browser render unavailable, errored, or 503; gracefully fallback to safe mobile fetch
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
