/**
 * 499 Timeout Risk Checker — Type Definitions
 *
 * Defines all data structures for the timeout-risk checking tool.
 * Kept separate from shared SEO types to avoid coupling.
 */

// ─── Probe Identity ────────────────────────────────────────────────
export type ProbeIdentityId = 'chatgpt-user' | 'claude-user' | 'perplexity-user';

export interface ProbeIdentity {
  id: ProbeIdentityId;
  label: string;
  userAgent: string;
}

// ─── Timing measurements ───────────────────────────────────────────
export interface ProbeTiming {
  /** Monotonic ms from request start to final response headers (includes DNS, TLS, redirects) */
  ttfbMs: number;
  /** Monotonic ms for body download after headers arrived. -1 if body was not fully read. */
  bodyDownloadMs: number;
  /** Total monotonic ms from request start to completion or abort */
  totalMs: number;
  /** Time spent waiting in concurrency queue (excluded from network timing) */
  queueWaitMs: number;
}

// ─── Redirect chain entry ──────────────────────────────────────────
export interface RedirectHop {
  from: string;
  to: string;
  statusCode: number;
  /** Approximate time for this hop in ms */
  hopMs: number;
}

// ─── Cache observation ─────────────────────────────────────────────
export interface CacheObservation {
  cacheControl?: string;
  age?: string;
  cfCacheStatus?: string;
  xCache?: string;
  vary?: string;
  serverTiming?: string;
}

// ─── Probe error classification ────────────────────────────────────
export type ProbeErrorKind =
  | 'BLOCKED_OR_CHALLENGED'
  | 'RATE_LIMITED'
  | 'HTTP_ERROR'
  | 'NON_HTML'
  | 'DNS_ERROR'
  | 'TLS_ERROR'
  | 'CONNECTION_FAILURE'
  | 'TIMED_OUT'
  | 'REDIRECT_FAILURE'
  | 'BODY_TRUNCATED'
  | 'BODY_TIMEOUT'
  | 'INSUFFICIENT_DATA';

// ─── Single probe result ───────────────────────────────────────────
export interface ProbeResult {
  /** Probe order (1-4) */
  order: number;
  /** Identity used */
  identity: ProbeIdentity;
  /** Whether this is the cache-busting probe */
  isCacheBust: boolean;
  /** Cache-bust parameter added, if any */
  cacheBustParam?: string;

  // Request details
  requestedUrl: string;
  normalizedUrl: string;
  finalUrl: string;

  // Response
  httpStatus: number;
  httpStatusText: string;
  contentType: string;

  // Timing
  timing: ProbeTiming;

  // Body
  htmlSizeBytes: number;
  isTruncated: boolean;
  isBodyIncomplete: boolean;

  // Redirects
  redirectCount: number;
  redirectChain: RedirectHop[];

  // Cache
  cacheObservation: CacheObservation;

  // Error state
  error?: ProbeErrorKind;
  errorDetail?: string;

  // Whether this probe is eligible for median calculation
  isEligible: boolean;
  ineligibilityReason?: string;
}

// ─── Timing band classification ────────────────────────────────────
export type TimingBand = 'FAST' | 'MODERATE' | 'SLOW' | 'VERY_SLOW';

export interface TimingBandInfo {
  band: TimingBand;
  label: string;
  description: string;
  thresholdMs: number;
}

// ─── Overall summary ──────────────────────────────────────────────
export interface TimeoutRiskSummary {
  /** Median TTFB of eligible standard probes, or null if insufficient */
  medianTtfbMs: number | null;
  /** Timing band for the median */
  medianBand: TimingBandInfo | null;
  /** Number of eligible standard probes used */
  eligibleCount: number;
  /** Total standard probes attempted */
  standardProbeCount: number;
  /** Whether the summary is complete (all 3 standard probes eligible) */
  isComplete: boolean;
  /** Human-readable summary sentence */
  summaryText: string;
  /** Non-timing issues observed (blocked, errored, etc.) */
  accessIssues: { probeOrder: number; identity: string; error: ProbeErrorKind; detail?: string }[];
}

// ─── Recommendation ────────────────────────────────────────────────
export interface Recommendation {
  category: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

// ─── Cache comparison ──────────────────────────────────────────────
export interface CacheBustComparison {
  standardProbeTtfbMs: number | null;
  cacheBustProbeTtfbMs: number | null;
  differenceMs: number | null;
  /** Whether the cache-bust response may be a different resource */
  possibleDifferentResource: boolean;
  note: string;
}

// ─── Full check result ─────────────────────────────────────────────
export interface TimeoutRiskCheckResult {
  /** Input URL after normalization */
  normalizedUrl: string;
  /** ISO timestamp of the check */
  timestamp: string;
  /** Ordered probe results (1–4) */
  probes: ProbeResult[];
  /** Overall risk summary computed from eligible standard probes */
  summary: TimeoutRiskSummary;
  /** Cache-bust comparison */
  cacheBustComparison: CacheBustComparison;
  /** Generated recommendations */
  recommendations: Recommendation[];
  /** Probe execution order description */
  probeOrderNote: string;
  /** Methodology disclaimers */
  disclaimers: string[];
}

// ─── API request/response ──────────────────────────────────────────
export interface TimeoutRiskCheckRequest {
  url: string;
}

export interface TimeoutRiskCheckApiResponse {
  success: boolean;
  data?: TimeoutRiskCheckResult;
  error?: string;
  errorCode?: string;
}

