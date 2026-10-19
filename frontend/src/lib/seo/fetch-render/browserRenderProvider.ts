import {
  FetchRenderUserAgentOption,
  RenderBrowserResult
} from './fetchRenderTypes';

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
 */
export function isBrowserRenderAvailable(): boolean {
  const provider = getBrowserRenderProvider();
  return provider.isAvailable();
}

/**
 * Local Playwright Render Provider using dynamically imported Playwright Chromium.
 * Playwright is never required or imported unless render() is actually called.
 */
export class LocalPlaywrightProvider implements BrowserRenderProvider {
  name = 'local-playwright';

  isAvailable(): boolean {
    return true;
  }

  async render(options: ExecuteBrowserRenderOptions): Promise<RenderBrowserResult> {
    const { executeBrowserRender } = await import('./fetchRenderBrowser');
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
    this.wsEndpoint = wsEndpoint ? wsEndpoint.trim() : '';
  }

  isAvailable(): boolean {
    return Boolean(this.wsEndpoint && this.wsEndpoint.length > 0);
  }

  async render(options: ExecuteBrowserRenderOptions): Promise<RenderBrowserResult> {
    if (!this.isAvailable()) {
      throw new Error('Remote browser provider is not configured. Please set BROWSER_WS_ENDPOINT.');
    }
    const { executeBrowserRender } = await import('./fetchRenderBrowser');
    return executeBrowserRender({
      ...options,
      wsEndpoint: this.wsEndpoint
    });
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
