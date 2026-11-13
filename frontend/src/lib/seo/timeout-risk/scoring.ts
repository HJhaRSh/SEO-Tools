/**
 * 499 Timeout Risk Checker — Scoring & Classification
 *
 * Implements:
 * - Timing band classification (heuristic thresholds disclosed in UI)
 * - Probe eligibility determination
 * - Median calculation from eligible standard probes
 * - Overall summary generation
 * - Recommendation engine
 * - Cache-bust comparison
 */

import type {
  ProbeResult,
  TimingBandInfo,
  TimeoutRiskSummary,
  Recommendation,
  CacheBustComparison,
  ProbeErrorKind,
} from './types';

// ─── Timing Band Thresholds ────────────────────────────────────────
// These are this tool's diagnostic thresholds, NOT published AI-provider
// deadlines and NOT a probability of receiving a 499 status.

export const TIMING_BANDS: TimingBandInfo[] = [
  { band: 'FAST', label: 'Fast response', description: 'Below 500 ms', thresholdMs: 500 },
  { band: 'MODERATE', label: 'Moderate delay', description: '500–999 ms', thresholdMs: 1000 },
  { band: 'SLOW', label: 'Slow response', description: '1,000–1,999 ms', thresholdMs: 2000 },
  { band: 'VERY_SLOW', label: 'Very slow response', description: '2,000 ms or more', thresholdMs: Infinity },
];

export function classifyTtfb(ttfbMs: number): TimingBandInfo {
  if (ttfbMs < 500) return TIMING_BANDS[0];
  if (ttfbMs < 1000) return TIMING_BANDS[1];
  if (ttfbMs < 2000) return TIMING_BANDS[2];
  return TIMING_BANDS[3];
}

// ─── Challenge / block detection ───────────────────────────────────
export function isChallengePage(contentType: string, htmlSizeBytes: number, httpStatus: number): boolean {
  // 403 with small HTML body is likely a challenge
  if (httpStatus === 403 && htmlSizeBytes > 0 && htmlSizeBytes < 50_000) return true;
  // 503 with small HTML is often a challenge page
  if (httpStatus === 503 && htmlSizeBytes > 0 && htmlSizeBytes < 50_000) return true;
  return false;
}

// ─── Probe eligibility ─────────────────────────────────────────────
export function determineEligibility(probe: {
  httpStatus: number;
  contentType: string;
  htmlSizeBytes: number;
  error?: ProbeErrorKind;
  isCacheBust: boolean;
}): { eligible: boolean; reason?: string } {
  // Cache-bust probe is never included in median
  if (probe.isCacheBust) {
    return { eligible: false, reason: 'Cache-busting probe excluded from median calculation.' };
  }

  // Error states (Note: BODY_TRUNCATED is an informational limitation for large pages, not an access failure)
  if (probe.error && probe.error !== 'BODY_TRUNCATED') {
    return { eligible: false, reason: `Probe error: ${probe.error}` };
  }

  // Non-2xx status
  if (probe.httpStatus < 200 || probe.httpStatus >= 400) {
    return { eligible: false, reason: `HTTP ${probe.httpStatus} is not a successful response.` };
  }

  // Non-HTML
  const ct = (probe.contentType || '').toLowerCase();
  if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
    return { eligible: false, reason: 'Response is not an HTML document.' };
  }

  // Challenge page
  if (isChallengePage(ct, probe.htmlSizeBytes, probe.httpStatus)) {
    return { eligible: false, reason: 'Response appears to be a challenge or WAF page.' };
  }

  return { eligible: true };
}

// ─── Median calculation ────────────────────────────────────────────
export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

// ─── Summary generation ───────────────────────────────────────────
export function computeSummary(probes: ProbeResult[]): TimeoutRiskSummary {
  const standardProbes = probes.filter((p) => !p.isCacheBust);
  const eligibleProbes = standardProbes.filter((p) => p.isEligible);
  const eligibleTtfbs = eligibleProbes.map((p) => p.timing.ttfbMs);

  const medianTtfb = computeMedian(eligibleTtfbs);
  const medianBand = medianTtfb !== null ? classifyTtfb(medianTtfb) : null;
  const isComplete = eligibleProbes.length === standardProbes.length && standardProbes.length === 3;

  // Collect access issues from all probes (excluding informational BODY_TRUNCATED)
  const accessIssues: TimeoutRiskSummary['accessIssues'] = [];
  for (const probe of probes) {
    if (probe.error && probe.error !== 'BODY_TRUNCATED') {
      accessIssues.push({
        probeOrder: probe.order,
        identity: probe.identity.label,
        error: probe.error,
        detail: probe.errorDetail,
      });
    }
  }

  // Build summary text
  let summaryText: string;
  if (eligibleProbes.length === 0) {
    summaryText =
      'Insufficient data: no standard probes returned a successful HTML response. Check individual probe results for blocking, errors, or non-HTML responses.';
  } else if (!isComplete) {
    summaryText = `Incomplete: ${eligibleProbes.length} of ${standardProbes.length} standard probes eligible. Median TTFB: ${medianTtfb}ms (${medianBand!.label}). One or more identities were blocked or returned errors — the overall assessment may not reflect all AI fetcher experiences.`;
  } else {
    summaryText = `All ${standardProbes.length} standard probes eligible. Median TTFB: ${medianTtfb}ms (${medianBand!.label}).`;
    if (medianBand!.band === 'FAST') {
      summaryText += ' Response headers arrived quickly for the tested identities.';
    } else if (medianBand!.band === 'VERY_SLOW') {
      summaryText +=
        ' Response headers were very slow, which may increase the chance of timeout-related issues for time-sensitive fetchers.';
    }
  }

  // Never produce a reassuring result if any identity was blocked
  if (accessIssues.length > 0 && medianBand?.band === 'FAST') {
    summaryText +=
      ' However, one or more probe identities encountered access issues (blocked, challenged, or errored). A fast median does not indicate healthy access for all identities.';
  }

  return {
    medianTtfbMs: medianTtfb,
    medianBand,
    eligibleCount: eligibleProbes.length,
    standardProbeCount: standardProbes.length,
    isComplete,
    summaryText,
    accessIssues,
  };
}

// ─── Cache-bust comparison ────────────────────────────────────────
export function computeCacheBustComparison(probes: ProbeResult[]): CacheBustComparison {
  const cacheBustProbe = probes.find((p) => p.isCacheBust);
  if (!cacheBustProbe) {
    return {
      standardProbeTtfbMs: null,
      cacheBustProbeTtfbMs: null,
      differenceMs: null,
      possibleDifferentResource: false,
      note: 'Cache-busting probe was not executed.',
    };
  }

  // Find the matching standard probe (same identity)
  const matchingStandard = probes.find(
    (p) => !p.isCacheBust && p.identity.id === cacheBustProbe.identity.id
  );

  if (!matchingStandard) {
    return {
      standardProbeTtfbMs: null,
      cacheBustProbeTtfbMs: cacheBustProbe.timing.ttfbMs,
      differenceMs: null,
      possibleDifferentResource: false,
      note: 'No matching standard probe found for comparison.',
    };
  }

  const stdTtfb = matchingStandard.timing.ttfbMs;
  const cbTtfb = cacheBustProbe.timing.ttfbMs;
  const diff = cbTtfb - stdTtfb;

  // Detect possible different resource
  const possibleDifferent =
    matchingStandard.httpStatus !== cacheBustProbe.httpStatus ||
    matchingStandard.finalUrl !== cacheBustProbe.finalUrl ||
    (matchingStandard.contentType || '').split(';')[0].trim() !==
      (cacheBustProbe.contentType || '').split(';')[0].trim();

  let note = `Compared ${cacheBustProbe.identity.label} standard probe (${stdTtfb}ms) vs cache-busting probe (${cbTtfb}ms). Difference: ${diff > 0 ? '+' : ''}${diff}ms.`;

  if (possibleDifferent) {
    note +=
      ' Warning: The cache-busting URL returned a different HTTP status, final URL, or content type — this comparison may not represent the same resource.';
  }

  note +=
    ' Note: A cache-busting query parameter does not guarantee a CDN bypass or origin request. This comparison is directional, not conclusive.';

  return {
    standardProbeTtfbMs: stdTtfb,
    cacheBustProbeTtfbMs: cbTtfb,
    differenceMs: diff,
    possibleDifferentResource: possibleDifferent,
    note,
  };
}

// ─── Recommendations ──────────────────────────────────────────────
export function generateRecommendations(
  probes: ProbeResult[],
  summary: TimeoutRiskSummary,
  cacheBustComparison: CacheBustComparison
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Slow header response
  const slowProbes = probes.filter(
    (p) => !p.isCacheBust && p.isEligible && p.timing.ttfbMs >= 1000
  );
  if (slowProbes.length > 0) {
    recs.push({
      category: 'Response Speed',
      message:
        'One or more probes measured response-header times ≥1,000 ms. Investigate backend processing, database queries, server-side rendering, caching layers, and geographic latency between your server and this tool.',
      severity: 'warning',
    });
  }

  // Very slow
  const verySlowProbes = probes.filter(
    (p) => !p.isCacheBust && p.isEligible && p.timing.ttfbMs >= 2000
  );
  if (verySlowProbes.length > 0) {
    recs.push({
      category: 'High Timeout Risk',
      message:
        'Response-header times ≥2,000 ms significantly increase the chance that time-sensitive AI fetchers will abandon the request before receiving content. Review origin processing time, edge caching, and CDN configuration.',
      severity: 'critical',
    });
  }

  // Cache-bust comparison
  if (cacheBustComparison.differenceMs !== null && cacheBustComparison.differenceMs > 500) {
    recs.push({
      category: 'Cache Behaviour',
      message: `The cache-busting probe was ${cacheBustComparison.differenceMs}ms slower than the standard probe for the same identity. This may indicate that cached responses are significantly faster, but a query parameter alone cannot guarantee CDN bypass. Review cache behaviour and uncached origin performance.`,
      severity: 'info',
    });
  }

  // Multiple redirects
  const maxRedirects = Math.max(...probes.map((p) => p.redirectCount));
  if (maxRedirects >= 2) {
    recs.push({
      category: 'Redirect Chain',
      message: `Up to ${maxRedirects} redirects were followed. Review whether any redirect hops (e.g. HTTP→HTTPS, www→non-www) are avoidable to reduce response-header latency.`,
      severity: 'info',
    });
  }

  // Large HTML
  const largeProbes = probes.filter((p) => p.htmlSizeBytes >= 200_000);
  if (largeProbes.length > 0) {
    const maxSize = Math.max(...largeProbes.map((p) => p.htmlSizeBytes));
    recs.push({
      category: 'HTML Size',
      message: `HTML body was ${Math.round(maxSize / 1024)} KiB or larger. Review whether unnecessary server-rendered markup, inline styles, or embedded data can be reduced.`,
      severity: 'info',
    });
  }

  // Challenge / access denial
  const blockedProbes = probes.filter(
    (p) => p.error === 'BLOCKED_OR_CHALLENGED' || p.error === 'RATE_LIMITED'
  );
  if (blockedProbes.length > 0) {
    const identities = blockedProbes.map((p) => p.identity.label).join(', ');
    recs.push({
      category: 'Access Control',
      message: `The following identities were blocked or challenged: ${identities}. Review CDN/WAF rules if you intend for these user agents to access your content. Do not broadly disable security protections — configure targeted exceptions for specific verified bots.`,
      severity: 'warning',
    });
  }

  // Timeout
  const timeoutProbes = probes.filter((p) => p.error === 'TIMED_OUT');
  if (timeoutProbes.length > 0) {
    recs.push({
      category: 'Timeout',
      message:
        'One or more probes timed out before receiving a response. Repeat the measurement and inspect server/CDN access logs for the tested URL and time window. Network conditions, geographic distance, and server load can all affect results.',
      severity: 'critical',
    });
  }

  // Truncated body
  const truncatedProbes = probes.filter((p) => p.isTruncated || p.isBodyIncomplete);
  if (truncatedProbes.length > 0) {
    recs.push({
      category: 'Body Download',
      message:
        'One or more probes had truncated or incomplete body downloads. The reported HTML size is partial. This may indicate a very large page or a body-transfer timeout.',
      severity: 'info',
    });
  }

  // Always add the log confirmation recommendation
  recs.push({
    category: 'Log Verification',
    message:
      'Real 499 confirmation requires access to your server or CDN logs. This tool measures response timing from our server to yours using simulated user-agent strings — it cannot verify actual AI-provider requests, their IP addresses, infrastructure, or internal timeout policies.',
    severity: 'info',
  });

  return recs;
}

