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
 * Returns the base URL for the mobile-friendly browser render endpoint.
 * In Next.js server context (Vercel), we call our own /api/seo/mobile-friendly/render route
 * which uses @sparticuz/chromium — no external backend needed.
 */
function getRenderEndpointUrl(): string {
  // When running inside a Next.js server action/route handler, use relative path.
  // VERCEL_URL is always set on Vercel deployments.
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/seo/mobile-friendly/render`;
  }
  // Local dev: call the same Next.js dev server
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}/api/seo/mobile-friendly/render`;
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
  let browserAttempted = false;
  let browserFailureReason: string | undefined = undefined;
  let browserResult: SingleUrlMobileAuditResult | null = null;

  if (!process.env.FORCE_STATIC_AUDIT) {
    browserAttempted = true;
    try {
      const renderEndpoint = getRenderEndpointUrl();
      const renderRes = await fetch(renderEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: options.url,
          viewport: {
            width: preset.width,
            height: preset.height,
            deviceScaleFactor: preset.deviceScaleFactor,
          },
          allowLocalhostForTesting: Boolean(options.allowLocalhostForTesting),
        }),
        signal: AbortSignal.timeout(18000),
      }).catch((fetchErr) => {
        browserFailureReason = fetchErr?.name === 'TimeoutError' ? 'Browser render request timed out' : 'Backend browser service unreachable';
        return null;
      });

      if (renderRes && renderRes.ok) {
        const data = await renderRes.json().catch(() => null);
        if (data && data.success && data.result && data.result.metrics) {
          const r = data.result;
          const liveMetrics: RenderAuditDomMetrics = r.metrics;
          const screenshot = r.screenshotBase64;

          browserResult = buildBrowserRenderedAuditResult({
            url: options.url,
            finalUrl: r.finalUrl || options.url,
            statusCode: typeof r.statusCode === 'number' ? r.statusCode : 200,
            statusText: r.statusText || 'OK',
            durationMs: Date.now() - startTime,
            viewport: preset,
            screenshotBase64: screenshot,
            metrics: liveMetrics,
          });
        } else {
          browserFailureReason = data?.error || 'Browser returned incomplete metrics';
        }
      } else if (renderRes) {
        if (renderRes.status === 503) {
          browserFailureReason = 'Chromium browser rendering unavailable in serverless environment';
        } else if (renderRes.status === 403) {
          browserFailureReason = 'Target destination blocked by browser SSRF guard';
        } else {
          browserFailureReason = `Browser rendering endpoint returned HTTP ${renderRes.status}`;
        }
      }
    } catch (err: any) {
      browserFailureReason = err?.message || 'Unexpected browser rendering failure';
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
    browserAttempted,
    browserFailureReason,
  });
}
