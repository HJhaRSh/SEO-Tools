export type TestStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_TESTED' | 'ERROR';

export type IssueSeverity = 'CRITICAL' | 'WARNING' | 'NOTICE';

export interface MobileIssue {
  category: 'VIEWPORT' | 'FIXED_WIDTH' | 'OVERFLOW' | 'FONT_SIZE' | 'TAP_TARGET' | 'INCOMPATIBLE_PLUGINS' | 'NETWORK';
  title: string;
  severity: IssueSeverity;
  description: string;
  evidence: string;
  selector?: string;
  dimensions?: {
    elementWidth?: number;
    elementHeight?: number;
    viewportWidth?: number;
    viewportHeight?: number;
    overflowPx?: number;
    fontSizePx?: number;
    targetWidth?: number;
    targetHeight?: number;
    targetDistancePx?: number;
  };
  recommendedAction: string;
  limitationNote?: string;
}

export interface MobileCategoryResult {
  status: TestStatus;
  summary: string;
  evidence?: string;
  issues: MobileIssue[];
  details?: Record<string, any>;
}

export interface ViewportPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  userAgent: string;
}

export interface SingleUrlMobileAuditResult {
  url: string;
  finalUrl: string;
  statusCode?: number;
  statusText?: string;
  durationMs: number;
  testedAt: string;
  isCompleted: boolean;
  overallStatus: TestStatus;
  overallSummary: string;
  executionMode: 'browser-rendered' | 'static-dom-heuristics';
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  viewportDeclaration: {
    present: boolean;
    rawContent: string | null;
    hasDeviceWidth: boolean;
    hasInitialScale: boolean;
    userScalableNo: boolean;
    maximumScaleRestricted: boolean;
  };
  tests: {
    configureViewport: MobileCategoryResult;
    fixedWidthViewport: MobileCategoryResult;
    sizeContentToViewport: MobileCategoryResult;
    legibleFontSizes: MobileCategoryResult;
    tapTargets: MobileCategoryResult;
    incompatiblePlugins: MobileCategoryResult;
  };
  screenshot?: {
    available: boolean;
    base64Data?: string; // In PNG or WEBP format data URL or raw base64
    format: 'png' | 'jpeg';
    width: number;
    height: number;
    errorMessage?: string;
  };
  issues: MobileIssue[];
  metrics: {
    totalTextNodesEvaluated?: number;
    flaggedTextNodes?: number;
    totalTapTargetsEvaluated?: number;
    flaggedTapTargets?: number;
    horizontalScrollWidth?: number;
    viewportClientWidth?: number;
  };
  assessmentLabel?: string;
  errorMessage?: string;
  errorCode?: 'INVALID_URL' | 'BLOCKED_DESTINATION' | 'REQUEST_TIMEOUT' | 'FETCH_FAILED' | 'RENDER_FAILED' | 'UNSUPPORTED_CONTENT' | 'HTTP_ERROR' | 'INTERNAL_ERROR';
}

export interface BulkUrlProgress {
  total: number;
  completed: number;
  failed: number;
  remaining: number;
  currentIndex: number;
  activeUrl?: string;
}

export interface MobileAuditApiResponse {
  success: boolean;
  results: SingleUrlMobileAuditResult[];
  summary: {
    totalTested: number;
    passed: number;
    warning: number;
    failed: number;
    error: number;
  };
  validationReport?: {
    totalSubmitted: number;
    validCount: number;
    duplicateCount: number;
    invalidRows: { row: number; raw: string; error: string }[];
  };
  executionMode: 'browser-rendered' | 'static-dom-heuristics';
  serverRuntimeNotice: string;
  error?: string;
  errorCode?: string;
}
