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
import { startSsrfGuardProxy, type SsrfGuardProxyInstance } from '../secureBrowserProxy';

export interface RunBrowserAuditOptions {
  url: string;
  vpWidth?: number;
  vpHeight?: number;
  vpScale?: number;
  allowLocalhostForTesting?: boolean;
  browser?: import('playwright-core').Browser;
  proxyUrl?: string;
}

export interface AuditMobileUrlOptions {
  url: string;
  viewportPresetId?: string;
  allowLocalhostForTesting?: boolean;
  browser?: import('playwright-core').Browser;
  proxyUrl?: string;
}

export interface AuditBulkUrlsOptions {
  urls: string[];
  viewportPresetId?: string;
  allowLocalhostForTesting?: boolean;
  concurrency?: number;
  launcher?: () => Promise<import('playwright-core').Browser>;
}

/**
 * Concurrency runner with bounded limit for parallel audits.
 */
async function asyncPool<T, R>(
  items: T[],
  limit: number,
  iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (limit <= items.length) {
      const e: Promise<void> = p
        .then(() => {
          executing.splice(executing.indexOf(e), 1);
        })
        .catch(() => {
          executing.splice(executing.indexOf(e), 1);
        }) as Promise<void>;
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(ret);
}

/**
 * Launches a Chromium browser instance configured for Mobile-Friendly audits.
 * Uses @sparticuz/chromium on Vercel/Lambda, Playwright's bundled Chromium in local dev.
 */
export async function launchMobileAuditBrowser(): Promise<import('playwright-core').Browser> {
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

  return await playwrightChromium.launch({
    executablePath,
    args: isVercel
      ? chromiumArgs
      : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });
}

/**
 * Runs a real Chromium browser session to audit a URL for mobile-friendliness.
 * Supports both standalone single-URL execution and batch execution with a reused browser.
 * When a browser instance is supplied, it is reused while creating a strictly isolated
 * BrowserContext per URL. The context is always closed in finally without closing the reused browser.
 */
export async function runBrowserAudit(
  urlOrOptions: string | RunBrowserAuditOptions,
  extraOptions?: Partial<RunBrowserAuditOptions>
): Promise<{
  metrics: RenderAuditDomMetrics;
  screenshotBase64: string | null;
  finalUrl: string;
  statusCode: number;
  statusText: string;
}> {
  const options: RunBrowserAuditOptions =
    typeof urlOrOptions === 'string'
      ? { url: urlOrOptions, ...extraOptions }
      : { ...urlOrOptions, ...extraOptions };

  const {
    url,
    vpWidth = 390,
    vpHeight = 844,
    vpScale = 3,
    allowLocalhostForTesting = false,
    browser: providedBrowser,
    proxyUrl: providedProxyUrl,
  } = options;

  // Pre-validate target URL against SSRF threats before launch
  await validateTargetUrlForBrowser(url);

  let localProxyInstance: SsrfGuardProxyInstance | null = null;
  let localBrowser: import('playwright-core').Browser | null = null;
  let context: import('playwright-core').BrowserContext | null = null;

  try {
    const isLocalDevelopment = process.env.NODE_ENV !== 'production';

    // 1. Establish or reuse secure forward proxy
    let effectiveProxyUrl = providedProxyUrl;
    if (!effectiveProxyUrl) {
      localProxyInstance = await startSsrfGuardProxy({
        allowLocalhostForTesting: Boolean(allowLocalhostForTesting && isLocalDevelopment),
      });
      effectiveProxyUrl = localProxyInstance.proxyUrl;
    }

    // 2. Establish or reuse Chromium browser instance
    let effectiveBrowser = providedBrowser;
    if (
      !effectiveBrowser ||
      (typeof effectiveBrowser.isConnected === 'function' && !effectiveBrowser.isConnected())
    ) {
      localBrowser = await launchMobileAuditBrowser();
      effectiveBrowser = localBrowser;
    }

    // 3. Create isolated BrowserContext strictly per URL
    context = await effectiveBrowser.newContext({
      viewport: { width: vpWidth, height: vpHeight },
      deviceScaleFactor: vpScale,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      acceptDownloads: false,
      proxy: {
        server: effectiveProxyUrl,
      },
    });

    // 4. Attach strict browser network isolation (route interception)
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

        // Independent validation of redirect destination
        if (finalUrl !== url) {
          await validateTargetUrlForBrowser(finalUrl);
        }
      }
    } catch (navErr: unknown) {
      const navMsg = navErr instanceof Error ? navErr.message : String(navErr || '');
      if (
        navMsg.includes('net::ERR_') ||
        navMsg.includes('SSRF') ||
        navMsg.includes('BLOCKED')
      ) {
        throw new Error(`Navigation failed: ${navMsg}`);
      }
      // non-fatal nav errors (e.g. mixed content) — continue
    }

    await page.waitForTimeout(1500).catch(() => {});

    let metrics: RenderAuditDomMetrics = {} as RenderAuditDomMetrics;
    try {
      metrics = (await page.evaluate(BROWSER_AUDIT_INJECTION_SCRIPT as string)) as RenderAuditDomMetrics;
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
    // Isolated context is always closed per URL
    if (context) {
      await context.close().catch(() => {});
    }
    // Only close browser if it was spawned locally for this single call
    if (localBrowser) {
      await localBrowser.close().catch(() => {});
    }
    // Only close proxy if it was spawned locally for this single call
    if (localProxyInstance) {
      await localProxyInstance.close().catch(() => {});
    }
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
        allowLocalhostForTesting: options.allowLocalhostForTesting,
        browser: options.browser,
        proxyUrl: options.proxyUrl,
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || 'Browser rendering failed');
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

/**
 * Audits a batch of URLs with bounded concurrency while sharing a single Chromium browser
 * instance and validating proxy across the batch. Each URL executes in a strictly isolated
 * BrowserContext that is cleaned up in finally.
 */
export async function auditBulkUrls(
  options: AuditBulkUrlsOptions
): Promise<SingleUrlMobileAuditResult[]> {
  const {
    urls,
    viewportPresetId,
    allowLocalhostForTesting,
    concurrency = 3,
    launcher,
  } = options;

  let proxyInstance: SsrfGuardProxyInstance | null = null;
  let browser: import('playwright-core').Browser | null = null;

  try {
    if (!process.env.FORCE_STATIC_AUDIT) {
      try {
        const isLocalDevelopment = process.env.NODE_ENV !== 'production';
        proxyInstance = await startSsrfGuardProxy({
          allowLocalhostForTesting: Boolean(allowLocalhostForTesting && isLocalDevelopment),
        });
        browser = launcher ? await launcher() : await launchMobileAuditBrowser();
      } catch {
        if (proxyInstance) {
          await proxyInstance.close().catch(() => {});
          proxyInstance = null;
        }
        browser = null;
      }
    }

    return await asyncPool(urls, concurrency, async (url) => {
      return await auditSingleUrl({
        url,
        viewportPresetId,
        allowLocalhostForTesting,
        browser: browser ?? undefined,
        proxyUrl: proxyInstance?.proxyUrl,
      });
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    if (proxyInstance) {
      await proxyInstance.close().catch(() => {});
      proxyInstance = null;
    }
  }
}

