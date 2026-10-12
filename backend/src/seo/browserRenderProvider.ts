import {
  FetchRenderUserAgentOption,
  RenderBrowserResult
} from './fetchRenderTypes.js';

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

export interface BrowserRenderProvider {
  name: string;
  isAvailable(): boolean;
  render(options: ExecuteBrowserRenderOptions): Promise<RenderBrowserResult>;
}

export function isVercelEnvironment(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NOW_REGION
  );
}

/**
 * Checks if browser rendering is currently supported/configured.
 * On Vercel serverless environments, local Chromium is unavailable unless an
 * external remote browser service (such as BROWSER_WS_ENDPOINT) is provided.
 */
export function isBrowserRenderAvailable(): boolean {
  if (process.env.BROWSER_WS_ENDPOINT) {
    return true;
  }
  if (isVercelEnvironment()) {
    return false;
  }
  return true;
}

/**
 * Local Playwright Render Provider using dynamically imported Playwright Chromium.
 * Playwright is never required or imported unless render() is actually called.
 */
export class LocalPlaywrightProvider implements BrowserRenderProvider {
  name = 'local-playwright';

  isAvailable(): boolean {
    return !isVercelEnvironment;
  }

  async render(options: ExecuteBrowserRenderOptions): Promise<RenderBrowserResult> {
    const { executeBrowserRender } = await import('./fetchRenderBrowser.js');
    return executeBrowserRender(options);
  }
}

/**
 * Remote Browser Provider placeholder for external managed browser services
 * (e.g. Browserless, BrightData, or custom Playwright WebSocket servers).
 */
export class RemoteBrowserProvider implements BrowserRenderProvider {
  name = 'remote-browser';
  private wsEndpoint: string;

  constructor(wsEndpoint: string) {
    this.wsEndpoint = wsEndpoint;
  }

  isAvailable(): boolean {
    return Boolean(this.wsEndpoint);
  }

  async render(options: ExecuteBrowserRenderOptions): Promise<RenderBrowserResult> {
    // Dynamically delegate to fetchRenderBrowser with remote endpoint if supported,
    // or provide external remote browser implementation
    const { executeBrowserRender } = await import('./fetchRenderBrowser.js');
    return executeBrowserRender(options);
  }
}

/**
 * Factory to retrieve the active BrowserRenderProvider based on environment.
 */
export function getBrowserRenderProvider(): BrowserRenderProvider {
  const customWsEndpoint = process.env.BROWSER_WS_ENDPOINT;
  const configuredProvider = process.env.BROWSER_RENDER_PROVIDER;

  if (customWsEndpoint || configuredProvider === 'remote') {
    return new RemoteBrowserProvider(customWsEndpoint || '');
  }

  return new LocalPlaywrightProvider();
}
