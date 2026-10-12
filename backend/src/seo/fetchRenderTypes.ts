export type FetchRenderMode = 'fetch-only' | 'fetch-and-render';

export interface FetchRenderUserAgentOption {
  id: string;
  name: string;
  token: string;
  fullUserAgent: string;
  viewport: {
    width: number;
    height: number;
    isMobile: boolean;
    deviceScaleFactor: number;
  };
  isGooglebot: boolean;
  category: 'search' | 'browser' | 'ai';
  disclaimer: string;
}

export interface FetchRenderRequestOptions {
  url: string;
  userAgent?: string;
  mode?: FetchRenderMode;
  respectRobots?: boolean;
  postLoadWaitMs?: number;
  timeoutMs?: number;
  acceptLanguage?: string;
  captureScreenshot?: boolean;
}

export interface HttpRedirectHop {
  from: string;
  to: string;
  statusCode: number;
}

export interface InitialFetchResult {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  rawHtml: string;
  byteSize: number;
  durationMs: number;
  redirectHistory: HttpRedirectHop[];
  contentType: string;
  isTruncated: boolean;
}

export interface CapturedResource {
  url: string;
  type: 'Document' | 'Script' | 'Stylesheet' | 'Image' | 'Font' | 'Media' | 'Other';
  httpStatus: number | null;
  statusText: string;
  sizeBytes?: number;
  loadStatus: 'LOADED' | 'FAILED' | 'BLOCKED_ROBOTS' | 'BLOCKED_SSRF' | 'ABORTED';
  robotsStatus?: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN';
  failureReason?: string;
}

export interface CapturedConsoleMessage {
  type: 'error' | 'warning' | 'log' | 'pageerror';
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  timestamp: string;
}

export interface RenderBrowserResult {
  renderedHtml: string;
  byteSize: number;
  renderDurationMs: number;
  screenshotBase64?: string;
  resources: CapturedResource[];
  consoleMessages: CapturedConsoleMessage[];
  totalResourcesLoaded: number;
  totalResourcesFailed: number;
  totalResourcesBlocked: number;
  isTruncated: boolean;
  renderStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  errorMessage?: string;
}

export interface ExtractedSeoSignals {
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  canonicalUrl: string | null;
  h1Headings: string[];
  internalLinksCount: number;
  externalLinksCount: number;
  imagesCount: number;
  imagesWithAltCount: number;
  wordCount: number;
  structuredDataTypes: string[];
  structuredDataCount: number;
  hreflangTags: { lang: string; href: string }[];
}

export type SeoParityStatus = 'IDENTICAL' | 'MODIFIED' | 'ADDED' | 'REMOVED' | 'DISCREPANCY';

export interface SeoSignalDiffItem {
  name: string;
  label: string;
  initialValue: any;
  renderedValue: any;
  status: SeoParityStatus;
  summary: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DiagnosticItem {
  id: string;
  category: 'CRAWLABILITY' | 'INDEXABILITY' | 'RENDERING' | 'PERFORMANCE' | 'REDIRECT' | 'SECURITY';
  severity: 'INFO' | 'WARNING' | 'ERROR';
  title: string;
  description: string;
  seoImpact: string;
  source: 'INITIAL_HTTP' | 'RENDERED_DOM' | 'ROBOTS_TXT' | 'CONSOLE' | 'NETWORK';
  confidence: 'CONFIRMED' | 'POTENTIAL_RISK';
}

export interface FetchRenderRobotsInfo {
  url: string;
  fetchStatus: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN' | 'ERROR';
  applicableRule?: {
    type: 'allow' | 'disallow';
    pattern: string;
    lineNumber: number;
    originalText: string;
  } | null;
  explanation: string;
  statusCode: number | null;
  respectRobotsEnabled: boolean;
  blockedMainUrl: boolean;
}

export interface FetchRenderCompleteResult {
  id: string;
  timestamp: string;
  requestedUrl: string;
  finalUrl: string;
  mode: FetchRenderMode;
  userAgent: FetchRenderUserAgentOption;
  
  // Executive summary
  summary: {
    httpStatus: number;
    httpStatusText: string;
    crawlability: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN';
    renderingStatus: 'COMPLETED' | 'FETCH_ONLY' | 'PARTIAL' | 'FAILED';
    indexabilitySignal: 'NO_BLOCKING_SIGNAL' | 'BLOCKING_SIGNAL_DETECTED' | 'UNKNOWN';
    totalDurationMs: number;
    totalIssuesCount: {
      errors: number;
      warnings: number;
      notices: number;
    };
  };

  initialFetch: InitialFetchResult;
  renderResult?: RenderBrowserResult;
  robotsInfo: FetchRenderRobotsInfo;
  
  seoSignals: {
    initial: ExtractedSeoSignals;
    rendered?: ExtractedSeoSignals;
    comparison: SeoSignalDiffItem[];
  };

  diagnostics: DiagnosticItem[];

  downloads: {
    originalHtmlId: string;
    renderedHtmlId?: string;
    screenshotId?: string;
    reportJsonId: string;
    seoDiffCsvId: string;
  };
}
