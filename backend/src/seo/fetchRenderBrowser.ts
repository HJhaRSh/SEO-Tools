import { chromium, Browser, BrowserContext, Page } from 'playwright';
import {
  FetchRenderUserAgentOption,
  RenderBrowserResult,
  CapturedResource,
  CapturedConsoleMessage
} from './fetchRenderTypes.js';
import { startSsrfGuardProxy, SsrfGuardProxyInstance } from './fetchRenderSSRFProxy.js';
import { checkSubresourceRobotsPolicy } from './fetchRenderRobots.js';

// ========================================================
// CONCURRENCY & QUEUE MANAGEMENT
// ========================================================
const MAX_CONCURRENT_RENDERS = 2;
const MAX_PENDING_QUEUE = 5;
const MAX_HTML_CAPTURE_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MiB

let activeRenders = 0;
const renderQueue: (() => void)[] = [];

let sharedBrowser: Browser | null = null;
let browserInitPromise: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  if (browserInitPromise) {
    return browserInitPromise;
  }

  browserInitPromise = (async () => {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check'
      ]
    });

    browser.on('disconnected', () => {
      sharedBrowser = null;
      browserInitPromise = null;
    });

    sharedBrowser = browser;
    return browser;
  })();

  return browserInitPromise;
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch {
      // browser close
    }
    sharedBrowser = null;
    browserInitPromise = null;
  }
}

function acquireRenderingSlot(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    if (activeRenders < MAX_CONCURRENT_RENDERS) {
      activeRenders++;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        activeRenders--;
        dispatchNext();
      };
      return resolve(release);
    }

    if (renderQueue.length >= MAX_PENDING_QUEUE) {
      return reject(
        new Error(
          'Server rendering capacity exhausted (queue limit reached). Please retry in a few moments.'
        )
      );
    }

    renderQueue.push(() => {
      activeRenders++;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        activeRenders--;
        dispatchNext();
      };
      resolve(release);
    });
  });
}

function dispatchNext() {
  if (activeRenders < MAX_CONCURRENT_RENDERS && renderQueue.length > 0) {
    const next = renderQueue.shift();
    if (next) next();
  }
}

export interface ExecuteBrowserRenderOptions {
  url: string;
  userAgent: FetchRenderUserAgentOption;
  respectRobots: boolean;
  robotsTxtContent?: string;
  postLoadWaitMs: number;
  timeoutMs: number;
  acceptLanguage: string;
  captureScreenshot: boolean;
  allowLocalhostForTesting?: boolean;
}

export async function executeBrowserRender(
  options: ExecuteBrowserRenderOptions
): Promise<RenderBrowserResult> {
  const releaseSlot = await acquireRenderingSlot();
  const startTime = Date.now();

  let proxyInstance: SsrfGuardProxyInstance | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  const capturedResources: CapturedResource[] = [];
  const consoleMessages: CapturedConsoleMessage[] = [];
  let isTruncated = false;

  try {
    // 1. Launch dedicated in-process SSRF validating forward proxy
    proxyInstance = await startSsrfGuardProxy({ allowLocalhostForTesting: options.allowLocalhostForTesting });

    // 2. Obtain shared Chromium browser instance
    const browser = await getSharedBrowser();

    // 3. Create isolated browser context routed through SSRF validating proxy
    context = await browser.newContext({
      userAgent: options.userAgent.fullUserAgent,
      viewport: {
        width: options.userAgent.viewport.width,
        height: options.userAgent.viewport.height
      },
      deviceScaleFactor: options.userAgent.viewport.deviceScaleFactor,
      isMobile: options.userAgent.viewport.isMobile,
      hasTouch: options.userAgent.viewport.isMobile,
      locale: options.acceptLanguage.split(',')[0] || 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': options.acceptLanguage
      },
      proxy: {
        server: proxyInstance.proxyUrl
      },
      ignoreHTTPSErrors: true
    });

    page = await context.newPage();

    // 4. Attach event listeners for console messages and uncaught exceptions
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        const location = msg.location();
        consoleMessages.push({
          type: type === 'error' ? 'error' : 'warning',
          text: msg.text(),
          location: {
            url: location.url || undefined,
            lineNumber: location.lineNumber || undefined,
            columnNumber: location.columnNumber || undefined
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    page.on('pageerror', (err) => {
      consoleMessages.push({
        type: 'pageerror',
        text: err.message || String(err),
        timestamp: new Date().toISOString()
      });
    });

    page.on('crash', () => {
      throw new Error('Chromium tab process crashed unexpectedly during rendering.');
    });

    // 5. Route interception: enforce robots.txt on subresources and record network activity
    await page.route('**', async (route) => {
      const request = route.request();
      const reqUrl = request.url();
      const resourceTypeRaw = request.resourceType();

      let type: CapturedResource['type'] = 'Other';
      if (resourceTypeRaw === 'document') type = 'Document';
      else if (resourceTypeRaw === 'stylesheet') type = 'Stylesheet';
      else if (resourceTypeRaw === 'script') type = 'Script';
      else if (resourceTypeRaw === 'image') type = 'Image';
      else if (resourceTypeRaw === 'font') type = 'Font';
      else if (resourceTypeRaw === 'media') type = 'Media';

      // Check protocol security
      if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) {
        capturedResources.push({
          url: reqUrl,
          type,
          httpStatus: null,
          statusText: 'Blocked non-HTTP protocol',
          loadStatus: 'BLOCKED_SSRF',
          failureReason: 'Unsupported protocol scheme'
        });
        await route.abort('blockedbyclient');
        return;
      }

      // If respectRobots is enabled, evaluate subresources against robots.txt
      if (options.respectRobots && options.robotsTxtContent && resourceTypeRaw !== 'document') {
        const policy = checkSubresourceRobotsPolicy(
          reqUrl,
          options.robotsTxtContent,
          options.userAgent.token
        );
        if (!policy.isAllowed && policy.status === 'DISALLOWED') {
          capturedResources.push({
            url: reqUrl,
            type,
            httpStatus: null,
            statusText: 'Disallowed by robots.txt',
            loadStatus: 'BLOCKED_ROBOTS',
            robotsStatus: 'DISALLOWED',
            failureReason: policy.ruleSummary || 'Disallowed by applicable robots.txt rule'
          });
          await route.abort('blockedbyclient');
          return;
        }
      }

      // Continue request
      try {
        await route.continue();
      } catch {
        // Ignored if route was already handled or navigation completed
      }
    });

    // Track responses
    page.on('response', (response) => {
      const respUrl = response.url();
      const status = response.status();
      const req = response.request();
      const resourceTypeRaw = req.resourceType();

      let type: CapturedResource['type'] = 'Other';
      if (resourceTypeRaw === 'document') type = 'Document';
      else if (resourceTypeRaw === 'stylesheet') type = 'Stylesheet';
      else if (resourceTypeRaw === 'script') type = 'Script';
      else if (resourceTypeRaw === 'image') type = 'Image';
      else if (resourceTypeRaw === 'font') type = 'Font';
      else if (resourceTypeRaw === 'media') type = 'Media';

      // Check if already logged as blocked
      const existing = capturedResources.find(r => r.url === respUrl);
      if (!existing) {
        capturedResources.push({
          url: respUrl,
          type,
          httpStatus: status,
          statusText: response.statusText(),
          loadStatus: status < 400 ? 'LOADED' : 'FAILED',
          failureReason: status >= 400 ? `HTTP Error ${status}` : undefined
        });
      }
    });

    page.on('requestfailed', (request) => {
      const reqUrl = request.url();
      const failure = request.failure();
      const existing = capturedResources.find(r => r.url === reqUrl);
      if (!existing) {
        capturedResources.push({
          url: reqUrl,
          type: 'Other',
          httpStatus: null,
          statusText: failure?.errorText || 'Request Failed',
          loadStatus: 'FAILED',
          failureReason: failure?.errorText || 'Network request failed'
        });
      }
    });

    // 6. Navigate with bounded timeout
    const navTimeout = Math.min(options.timeoutMs, 20000);
    try {
      await page.goto(options.url, {
        timeout: navTimeout,
        waitUntil: 'domcontentloaded'
      });
    } catch (navErr: any) {
      // Continue even if navigation had partial failure (e.g., timeout on subresources), if DOM is present
      if (!page || navErr.message.includes('SSRF Blocked') || navErr.message.includes('ERR_CONNECTION_REFUSED')) {
        throw navErr;
      }
    }

    // 7. Post-load wait for JavaScript execution and DOM updates
    if (options.postLoadWaitMs > 0) {
      await page.waitForTimeout(options.postLoadWaitMs);
    }

    // 8. Capture rendered DOM snapshot before any scrolling
    let renderedHtml = await page.content();
    let byteSize = Buffer.byteLength(renderedHtml, 'utf-8');

    if (byteSize > MAX_HTML_CAPTURE_BYTES) {
      renderedHtml = renderedHtml.slice(0, MAX_HTML_CAPTURE_BYTES);
      byteSize = MAX_HTML_CAPTURE_BYTES;
      isTruncated = true;
    }

    // 9. Capture screenshot if requested
    let screenshotBase64: string | undefined = undefined;
    if (options.captureScreenshot) {
      try {
        const screenshotBuffer = await page.screenshot({
          type: 'png',
          fullPage: false // Viewport capture
        });
        if (screenshotBuffer.length <= MAX_SCREENSHOT_BYTES) {
          screenshotBase64 = screenshotBuffer.toString('base64');
        }
      } catch (err: any) {
        consoleMessages.push({
          type: 'warning',
          text: `Screenshot capture warning: ${err.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    const renderDurationMs = Date.now() - startTime;
    const totalLoaded = capturedResources.filter(r => r.loadStatus === 'LOADED').length;
    const totalFailed = capturedResources.filter(r => r.loadStatus === 'FAILED').length;
    const totalBlocked = capturedResources.filter(r => r.loadStatus === 'BLOCKED_ROBOTS' || r.loadStatus === 'BLOCKED_SSRF').length;

    return {
      renderedHtml,
      byteSize,
      renderDurationMs,
      screenshotBase64,
      resources: capturedResources,
      consoleMessages,
      totalResourcesLoaded: totalLoaded,
      totalResourcesFailed: totalFailed,
      totalResourcesBlocked: totalBlocked,
      isTruncated,
      renderStatus: 'COMPLETED'
    };
  } catch (err: any) {
    const renderDurationMs = Date.now() - startTime;
    return {
      renderedHtml: '',
      byteSize: 0,
      renderDurationMs,
      resources: capturedResources,
      consoleMessages,
      totalResourcesLoaded: 0,
      totalResourcesFailed: 0,
      totalResourcesBlocked: 0,
      isTruncated: false,
      renderStatus: 'FAILED',
      errorMessage: err.message || 'Browser rendering failed'
    };
  } finally {
    // Guaranteed cleanup
    if (context) {
      try {
        await context.close();
      } catch {
        // Context close cleanup
      }
    }
    if (proxyInstance) {
      try {
        await proxyInstance.close();
      } catch {
        // Proxy close cleanup
      }
    }
    releaseSlot();
  }
}
