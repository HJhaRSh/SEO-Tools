import { chromium, Browser, BrowserContext, Page, Request } from 'playwright';
import {
  FetchRenderUserAgentOption,
  RenderBrowserResult,
  CapturedResource,
  CapturedConsoleMessage
} from './fetchRenderTypes.js';
import { startSsrfGuardProxy, SsrfGuardProxyInstance } from './fetchRenderSSRFProxy.js';
import { SubresourceRobotsManager } from './fetchRenderRobots.js';

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

let sharedRemoteBrowser: Browser | null = null;

async function getSharedBrowser(wsEndpoint?: string): Promise<Browser> {
  if (wsEndpoint) {
    if (sharedRemoteBrowser && sharedRemoteBrowser.isConnected()) {
      return sharedRemoteBrowser;
    }
    const remote = await chromium.connect(wsEndpoint);
    remote.on('disconnected', () => {
      sharedRemoteBrowser = null;
    });
    sharedRemoteBrowser = remote;
    return remote;
  }

  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  if (browserInitPromise) {
    return browserInitPromise;
  }

  browserInitPromise = (async () => {
    // Preserve Chromium sandboxing; restrict background tasks
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate'
      ]
    });

    browser.on('disconnected', () => {
      sharedBrowser = null;
      browserInitPromise = null;
    });

    sharedBrowser = browser;
    return browser;
  })();

  try {
    return await browserInitPromise;
  } finally {
    browserInitPromise = null;
  }
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch {
      // browser close cleanup
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
  evaluateScript?: string;
  customViewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
  };
  wsEndpoint?: string;
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

  // Track each network request uniquely
  let reqSeq = 0;
  const requestMetadata = new WeakMap<Request, {
    requestId: string;
    url: string;
    type: CapturedResource['type'];
    startTime: number;
  }>();

  // Crash detection & propagation
  let hasCrashed = false;
  let crashReason = '';
  let crashReject: ((err: Error) => void) | null = null;

  const crashPromise = new Promise<never>((_, reject) => {
    crashReject = reject;
  });

  try {
    // 1. Launch dedicated in-process SSRF validating forward proxy
    proxyInstance = await startSsrfGuardProxy({ allowLocalhostForTesting: options.allowLocalhostForTesting });

    // 2. Initialize Subresource Robots Policy Manager
    const urlObj = new URL(options.url);
    const subresourceRobotsManager = new SubresourceRobotsManager(
      urlObj.origin,
      options.robotsTxtContent,
      options.userAgent.token,
      options.allowLocalhostForTesting
    );

    // 3. Obtain Chromium browser instance
    const browser = await getSharedBrowser(options.wsEndpoint);

    // 4. Create isolated browser context routed through SSRF validating proxy
    const effectiveViewport = options.customViewport || {
      width: options.userAgent.viewport.width,
      height: options.userAgent.viewport.height,
      deviceScaleFactor: options.userAgent.viewport.deviceScaleFactor,
      isMobile: options.userAgent.viewport.isMobile,
    };

    context = await browser.newContext({
      userAgent: options.userAgent.fullUserAgent,
      viewport: {
        width: effectiveViewport.width,
        height: effectiveViewport.height
      },
      deviceScaleFactor: effectiveViewport.deviceScaleFactor ?? options.userAgent.viewport.deviceScaleFactor,
      isMobile: effectiveViewport.isMobile ?? options.userAgent.viewport.isMobile,
      hasTouch: effectiveViewport.isMobile ?? options.userAgent.viewport.isMobile,
      locale: options.acceptLanguage.split(',')[0] || 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': options.acceptLanguage
      },
      proxy: {
        server: proxyInstance.proxyUrl
      },
      ignoreHTTPSErrors: false
    });

    page = await context.newPage();

    // 5. Attach event listeners for console, page errors, and crash
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
      hasCrashed = true;
      crashReason = 'Chromium page process crashed unexpectedly during rendering.';
      if (crashReject) {
        crashReject(new Error(crashReason));
      }
    });

    // 6. Route interception: enforce subresource robots.txt and protocol security
    await page.route('**', async (route) => {
      const request = route.request();
      const reqUrl = request.url();
      const resourceTypeRaw = request.resourceType();
      const reqId = `req_${++reqSeq}`;
      const reqStart = Date.now();

      let type: CapturedResource['type'] = 'Other';
      if (resourceTypeRaw === 'document') type = 'Document';
      else if (resourceTypeRaw === 'stylesheet') type = 'Stylesheet';
      else if (resourceTypeRaw === 'script') type = 'Script';
      else if (resourceTypeRaw === 'image') type = 'Image';
      else if (resourceTypeRaw === 'font') type = 'Font';
      else if (resourceTypeRaw === 'media') type = 'Media';

      requestMetadata.set(request, {
        requestId: reqId,
        url: reqUrl,
        type,
        startTime: reqStart
      });

      // Protocol security check
      if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) {
        capturedResources.push({
          requestId: reqId,
          url: reqUrl,
          type,
          httpStatus: null,
          statusText: 'Blocked non-HTTP protocol',
          loadStatus: 'BLOCKED_SSRF',
          failureReason: 'Unsupported protocol scheme',
          timingMs: Date.now() - reqStart
        });
        await route.abort('blockedbyclient');
        return;
      }

      // Subresource robots.txt policy enforcement
      if (resourceTypeRaw !== 'document') {
        const policy = await subresourceRobotsManager.checkSubresource(reqUrl);
        if (options.respectRobots) {
          if (policy.status === 'DISALLOWED') {
            capturedResources.push({
              requestId: reqId,
              url: reqUrl,
              type,
              httpStatus: null,
              statusText: 'Disallowed by robots.txt',
              loadStatus: 'BLOCKED_ROBOTS',
              robotsStatus: 'DISALLOWED',
              failureReason: policy.ruleSummary || 'Disallowed by applicable robots.txt rule',
              timingMs: Date.now() - reqStart
            });
            await route.abort('blockedbyclient');
            return;
          } else if (policy.status === 'UNKNOWN') {
            capturedResources.push({
              requestId: reqId,
              url: reqUrl,
              type,
              httpStatus: null,
              statusText: 'Blocked by conservative policy (robots.txt unresolved)',
              loadStatus: 'BLOCKED_ROBOTS',
              robotsStatus: 'UNKNOWN',
              failureReason: policy.ruleSummary || 'Origin robots.txt unresolved; blocked under conservative policy',
              timingMs: Date.now() - reqStart
            });
            await route.abort('blockedbyclient');
            return;
          }
        }
      }

      try {
        await route.continue();
      } catch {
        // Ignored if route was already handled or page closed
      }
    });

    // 7. Track responses (preserves multiple requests to same URL)
    page.on('response', (response) => {
      const req = response.request();
      const meta = requestMetadata.get(req);
      const reqId = meta?.requestId || `req_${++reqSeq}`;
      const timingMs = meta ? Date.now() - meta.startTime : undefined;
      const respUrl = response.url();
      const status = response.status();
      const resourceTypeRaw = req.resourceType();

      let type: CapturedResource['type'] = meta?.type || 'Other';
      if (!meta) {
        if (resourceTypeRaw === 'document') type = 'Document';
        else if (resourceTypeRaw === 'stylesheet') type = 'Stylesheet';
        else if (resourceTypeRaw === 'script') type = 'Script';
        else if (resourceTypeRaw === 'image') type = 'Image';
        else if (resourceTypeRaw === 'font') type = 'Font';
        else if (resourceTypeRaw === 'media') type = 'Media';
      }

      const redirectedTo = req.redirectedTo()?.url();

      capturedResources.push({
        requestId: reqId,
        url: respUrl,
        type,
        httpStatus: status,
        statusText: response.statusText(),
        loadStatus: status < 400 ? 'LOADED' : 'FAILED',
        failureReason: status >= 400 ? `HTTP Error ${status}` : undefined,
        redirectUrl: redirectedTo,
        timingMs
      });
    });

    page.on('requestfailed', (request) => {
      const meta = requestMetadata.get(request);
      const reqId = meta?.requestId || `req_${++reqSeq}`;
      const timingMs = meta ? Date.now() - meta.startTime : undefined;
      const reqUrl = request.url();
      const failure = request.failure();

      // Avoid duplicate entry if request was already aborted by route filter
      const alreadyLogged = capturedResources.some(
        r => r.requestId === reqId && (r.loadStatus === 'BLOCKED_ROBOTS' || r.loadStatus === 'BLOCKED_SSRF')
      );
      if (alreadyLogged) return;

      capturedResources.push({
        requestId: reqId,
        url: reqUrl,
        type: meta?.type || 'Other',
        httpStatus: null,
        statusText: failure?.errorText || 'Request Failed',
        loadStatus: 'FAILED',
        failureReason: failure?.errorText || 'Network request failed',
        timingMs
      });
    });

    // 8. Navigate with bounded timeout and crash race
    const navTimeout = Math.min(options.timeoutMs, 20000);
    let navResponse: any = null;
    try {
      navResponse = await Promise.race([
        page.goto(options.url, {
          timeout: navTimeout,
          waitUntil: 'domcontentloaded'
        }),
        crashPromise
      ]);
    } catch (navErr: any) {
      if (hasCrashed) throw new Error(crashReason);
      if (!page || navErr.message.includes('SSRF Blocked') || navErr.message.includes('ERR_CONNECTION_REFUSED')) {
        throw navErr;
      }
    }

    // 9. Post-load wait for JavaScript execution and DOM updates
    if (options.postLoadWaitMs > 0) {
      await Promise.race([
        page.waitForTimeout(options.postLoadWaitMs),
        crashPromise
      ]);
    }

    // 10. Capture rendered DOM snapshot
    let renderedHtml = await Promise.race([
      page.content(),
      crashPromise
    ]);
    let byteSize = Buffer.byteLength(renderedHtml, 'utf-8');

    if (byteSize > MAX_HTML_CAPTURE_BYTES) {
      renderedHtml = renderedHtml.slice(0, MAX_HTML_CAPTURE_BYTES);
      byteSize = MAX_HTML_CAPTURE_BYTES;
      isTruncated = true;
    }

    // 11. Capture screenshot if requested
    let screenshotBase64: string | undefined = undefined;
    if (options.captureScreenshot) {
      try {
        const screenshotBuffer = await Promise.race([
          page.screenshot({
            type: 'png',
            fullPage: false
          }),
          crashPromise
        ]);
        if (screenshotBuffer.length <= MAX_SCREENSHOT_BYTES) {
          screenshotBase64 = screenshotBuffer.toString('base64');
        }
      } catch (err: any) {
        if (hasCrashed) throw new Error(crashReason);
        consoleMessages.push({
          type: 'warning',
          text: `Screenshot capture warning: ${err.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // 12. Execute client-side DOM evaluation script if requested
    let evaluatedMetrics: any = undefined;
    if (options.evaluateScript) {
      try {
        evaluatedMetrics = await Promise.race([
          page.evaluate(options.evaluateScript),
          crashPromise
        ]);
      } catch (err: any) {
        if (hasCrashed) throw new Error(crashReason);
        consoleMessages.push({
          type: 'warning',
          text: `Evaluate script warning: ${err.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    const renderDurationMs = Date.now() - startTime;
    const totalLoaded = capturedResources.filter(r => r.loadStatus === 'LOADED').length;
    const totalFailed = capturedResources.filter(r => r.loadStatus === 'FAILED').length;
    const totalBlocked = capturedResources.filter(r => r.loadStatus === 'BLOCKED_ROBOTS' || r.loadStatus === 'BLOCKED_SSRF').length;

    const finalUrl = page.url() || options.url;
    const statusCode = navResponse ? navResponse.status() : (capturedResources.find(r => r.type === 'Document')?.httpStatus ?? 200);
    const statusText = navResponse ? navResponse.statusText() : 'OK';

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
      renderStatus: 'COMPLETED',
      evaluatedMetrics,
      finalUrl,
      statusCode,
      statusText
    };
  } catch (err: any) {
    const renderDurationMs = Date.now() - startTime;
    if (hasCrashed || err.message?.includes('crashed')) {
      // Discard broken browser instance so subsequent tests spawn a clean process
      sharedBrowser = null;
    }
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
      errorMessage: hasCrashed ? crashReason : (err.message || 'Browser rendering failed')
    };
  } finally {
    // Guaranteed cleanup
    if (page) {
      try {
        await page.close();
      } catch {
        // Page cleanup
      }
    }
    if (context) {
      try {
        await context.close();
      } catch {
        // Context cleanup
      }
    }
    if (proxyInstance) {
      try {
        await proxyInstance.close();
      } catch {
        // Proxy cleanup
      }
    }
    releaseSlot();
  }
}
