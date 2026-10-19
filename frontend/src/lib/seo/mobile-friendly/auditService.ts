import { SingleUrlMobileAuditResult } from './types';
import { DEFAULT_VIEWPORT_PRESET, MOBILE_VIEWPORT_PRESETS } from './constants';
import { safeFetch } from '../hreflang/safeFetch';
import { auditStaticHtmlMobileFriendliness } from './staticAuditor';
import {
  BROWSER_AUDIT_INJECTION_SCRIPT,
  buildBrowserRenderedAuditResult,
  RenderAuditDomMetrics,
} from './browserEvaluator';
import { validateTargetUrlForBrowser, setupBrowserSecurityContext } from './browserSecurity';

export interface AuditMobileUrlOptions {
  url: string;
  viewportPresetId?: string;
  allowLocalhostForTesting?: boolean;
}

/**
 * Runs a real Chromium browser session to audit a URL for mobile-friendliness.
 * Uses @sparticuz/chromium on Vercel/Lambda, Playwright's bundled Chromium in local dev.
 * Called directly — no HTTP round-trip to a separate endpoint.
 */
async function runBrowserAudit(options: {
  url: string;
  vpWidth: number;
  vpHeight: number;
  vpScale: number;
}): Promise<{ metrics: RenderAuditDomMetrics; screenshotBase64: string | null; finalUrl: string; statusCode: number; statusText: string }> {
  const { url, vpWidth, vpHeight, vpScale } = options;

  // Pre-validate target URL against SSRF threats before launch
  await validateTargetUrlForBrowser(url);

  const isVercel = Boolean(
    process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION
  );

  let executablePath: string | undefined;
  let chromiumArgs: string[] = [];

  if (isVercel) {
    const chromium = (await import('@sparticuz/chromium')).default;
    executablePath = await chromium.executablePath();
    chromiumArgs = chromium.args;
  }

  const { chromium: playwrightChromium } = await import('playwright-core');

  const browser = await playwrightChromium.launch({
    executablePath,
    args: isVercel
      ? chromiumArgs
      : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: vpWidth, height: vpHeight },
      deviceScaleFactor: vpScale,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      acceptDownloads: false,
    });

    // Attach strict browser network isolation
    await setupBrowserSecurityContext(context);

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(20000);
    page.setDefaultTimeout(15000);

    let finalUrl = url;
    let statusCode = 200;
    let statusText = 'OK';

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (response) {
        statusCode = response.status();
        statusText = response.statusText();
        finalUrl = response.url();
      }
    } catch (navErr: any) {
      if (navErr?.message?.includes('net::ERR_')) {
        throw new Error(`Navigation failed: ${navErr.message}`);
      }
      // non-fatal nav errors (e.g. mixed content) — continue
    }

    await page.waitForTimeout(1500).catch(() => {});

    let metrics: RenderAuditDomMetrics = {} as RenderAuditDomMetrics;
    try {
      metrics = await page.evaluate(BROWSER_AUDIT_INJECTION_SCRIPT as string) as RenderAuditDomMetrics;
    } catch {
      // metrics unavailable — still return screenshot
    }

    let screenshotBase64: string | null = null;
    try {
      const buf = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: vpWidth, height: Math.min(vpHeight * 2, 1600) },
        fullPage: false,
      });
      screenshotBase64 = `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      // non-fatal
    }

    return { metrics, screenshotBase64, finalUrl, statusCode, statusText };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Audits a single URL for mobile friendliness:
 * 1. Attempts real Chromium browser rendering directly (no HTTP hop).
 * 2. Falls back to high-fidelity static DOM analysis using mobile HTTP fetch and Cheerio heuristics.
 */
export async function auditSingleUrl(
  options: AuditMobileUrlOptions
): Promise<SingleUrlMobileAuditResult> {
  const startTime = Date.now();
  const preset =
    (options.viewportPresetId && MOBILE_VIEWPORT_PRESETS[options.viewportPresetId]) ||
    DEFAULT_VIEWPORT_PRESET;

  let browserAttempted = false;
  let browserFailureReason: string | undefined = undefined;
  let browserResult: SingleUrlMobileAuditResult | null = null;

  if (!process.env.FORCE_STATIC_AUDIT) {
    browserAttempted = true;
    try {
      const renderData = await runBrowserAudit({
        url: options.url,
        vpWidth: preset.width,
        vpHeight: preset.height,
        vpScale: preset.deviceScaleFactor,
      });

      browserResult = buildBrowserRenderedAuditResult({
        url: options.url,
        finalUrl: renderData.finalUrl,
        statusCode: renderData.statusCode,
        statusText: renderData.statusText,
        durationMs: Date.now() - startTime,
        viewport: preset,
        screenshotBase64: renderData.screenshotBase64 ?? undefined,
        metrics: renderData.metrics,
      });
    } catch (err: any) {
      const msg = err?.message || 'Browser rendering failed';
      if (msg.includes('Executable') || msg.includes('Failed to launch') || msg.includes('not available')) {
        browserFailureReason = 'Chromium browser rendering unavailable in this environment';
      } else if (msg.includes('timeout') || msg.includes('Timeout')) {
        browserFailureReason = 'Browser render timed out';
      } else {
        browserFailureReason = msg;
      }
    }
  }

  if (browserResult) {
    return browserResult;
  }

  // Fallback: static DOM heuristics via HTTP fetch
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

