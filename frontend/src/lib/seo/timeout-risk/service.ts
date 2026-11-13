/**
 * 499 Timeout Risk Checker — Service Layer
 *
 * Orchestrates sequential probes, collects results, and produces
 * the final TimeoutRiskCheckResult.
 *
 * Probe execution order (fixed, documented):
 *   1. ChatGPT-User (standard)
 *   2. Claude-User (standard)
 *   3. Perplexity-User (standard)
 *   4. ChatGPT-User with cache-busting parameter (cache-bust)
 *
 * Probes run sequentially to avoid concurrent requests competing
 * against each other on the same target. The order is fixed so
 * results are reproducible. However, request order can affect
 * caching behaviour, which is disclosed in the output.
 */

import { AI_BOT_REGISTRY } from '../aiBotRegistry';
import { timedFetch, validateTargetUrl, type TimedFetchResult } from './timedFetcher';
import {
  determineEligibility,
  computeSummary,
  computeCacheBustComparison,
  generateRecommendations,
} from './scoring';
import type {
  ProbeIdentity,
  ProbeIdentityId,
  ProbeResult,
  ProbeErrorKind,
  TimeoutRiskCheckResult,
} from './types';

// ─── Probe identities from existing registry ──────────────────────
// We look up the 3 required user-agent definitions from aiBotRegistry.ts
// without modifying any registry entries.

function getProbeIdentity(id: ProbeIdentityId): ProbeIdentity {
  const bot = AI_BOT_REGISTRY.find((b) => b.id === id);
  if (!bot || !bot.fullUserAgent) {
    throw new Error(`AI bot identity "${id}" not found or has no full user-agent string.`);
  }
  return {
    id,
    label: bot.name,
    userAgent: bot.fullUserAgent,
  };
}

const PROBE_ORDER: { id: ProbeIdentityId; isCacheBust: boolean }[] = [
  { id: 'chatgpt-user', isCacheBust: false },
  { id: 'claude-user', isCacheBust: false },
  { id: 'perplexity-user', isCacheBust: false },
  { id: 'chatgpt-user', isCacheBust: true },
];

// ─── URL normalization ─────────────────────────────────────────────
export function normalizeInputUrl(raw: string): string {
  let trimmed = raw.trim();
  if (!trimmed) throw new Error('Please provide a URL to check.');

  // Allow bare domain: add https://
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  const parsed = validateTargetUrl(trimmed);
  // Remove fragment (already done in validateTargetUrl)
  return parsed.toString();
}

// ─── Cache-busting URL ─────────────────────────────────────────────
function addCacheBustParam(url: string): { url: string; param: string } {
  const parsed = new URL(url);
  const paramName = '_imcb';
  const paramValue = Date.now().toString(36);
  parsed.searchParams.set(paramName, paramValue);
  return { url: parsed.toString(), param: `${paramName}=${paramValue}` };
}

// ─── Error classification ──────────────────────────────────────────
function classifyError(err: unknown): {
  error: ProbeErrorKind;
  detail: string;
} {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('etimedout')) {
    return { error: 'TIMED_OUT', detail: msg };
  }
  if (lower.includes('dns') || lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return { error: 'DNS_ERROR', detail: msg };
  }
  if (lower.includes('tls') || lower.includes('ssl') || lower.includes('certificate') || lower.includes('handshake')) {
    return { error: 'TLS_ERROR', detail: msg };
  }
  if (lower.includes('econnrefused') || lower.includes('econnreset') || lower.includes('socket hang up')) {
    return { error: 'CONNECTION_FAILURE', detail: msg };
  }
  if (lower.includes('redirect') || lower.includes('location')) {
    return { error: 'REDIRECT_FAILURE', detail: msg };
  }
  if (lower.includes('blocked') || lower.includes('forbidden') || lower.includes('ssrf')) {
    return { error: 'BLOCKED_OR_CHALLENGED', detail: msg };
  }

  return { error: 'INSUFFICIENT_DATA', detail: msg };
}

function classifyResponseError(
  httpStatus: number,
  contentType: string,
  htmlSizeBytes: number
): ProbeErrorKind | null {
  // Challenge / WAF pages
  if ((httpStatus === 403 || httpStatus === 503) && htmlSizeBytes > 0 && htmlSizeBytes < 50_000) {
    return 'BLOCKED_OR_CHALLENGED';
  }
  if (httpStatus === 429) return 'RATE_LIMITED';
  if (httpStatus >= 400 && httpStatus < 600) return 'HTTP_ERROR';

  // Non-HTML
  const ct = (contentType || '').toLowerCase();
  if (httpStatus >= 200 && httpStatus < 300 && !ct.includes('text/html') && !ct.includes('application/xhtml')) {
    return 'NON_HTML';
  }

  return null;
}

// ─── Per-probe timeout ─────────────────────────────────────────────
// Overall API deadline: ~25s. 4 sequential probes ≈ 6s each max.
// We give 12s per probe to allow some variance (most will be <3s).
const PER_PROBE_TIMEOUT_MS = 12_000;

// ─── Main service function ─────────────────────────────────────────
export async function runTimeoutRiskCheck(rawUrl: string): Promise<TimeoutRiskCheckResult> {
  const normalizedUrl = normalizeInputUrl(rawUrl);
  const timestamp = new Date().toISOString();
  const probes: ProbeResult[] = [];

  for (let i = 0; i < PROBE_ORDER.length; i++) {
    const { id, isCacheBust } = PROBE_ORDER[i];
    const identity = getProbeIdentity(id);
    const order = i + 1;

    let targetUrl = normalizedUrl;
    let cacheBustParam: string | undefined;

    if (isCacheBust) {
      const cb = addCacheBustParam(normalizedUrl);
      targetUrl = cb.url;
      cacheBustParam = cb.param;
    }

    let probeResult: ProbeResult;

    try {
      const result: TimedFetchResult = await timedFetch(targetUrl, identity.userAgent, PER_PROBE_TIMEOUT_MS);

      // Classify response-level errors
      const responseError = classifyResponseError(
        result.httpStatus,
        result.contentType,
        result.htmlSizeBytes
      );

      // Body-level issues
      let bodyError: ProbeErrorKind | undefined;
      if (result.isTruncated) bodyError = 'BODY_TRUNCATED';
      if (result.isBodyIncomplete) bodyError = 'BODY_TIMEOUT';

      const error = responseError || bodyError || undefined;
      const errorDetail = error
        ? `HTTP ${result.httpStatus} ${result.httpStatusText}${result.isTruncated ? ' (body truncated)' : ''}${result.isBodyIncomplete ? ' (body incomplete)' : ''}`
        : undefined;

      const { eligible, reason } = determineEligibility({
        httpStatus: result.httpStatus,
        contentType: result.contentType,
        htmlSizeBytes: result.htmlSizeBytes,
        error,
        isCacheBust,
      });

      probeResult = {
        order,
        identity,
        isCacheBust,
        cacheBustParam,
        requestedUrl: targetUrl,
        normalizedUrl,
        finalUrl: result.finalUrl,
        httpStatus: result.httpStatus,
        httpStatusText: result.httpStatusText,
        contentType: result.contentType,
        timing: result.timing,
        htmlSizeBytes: result.htmlSizeBytes,
        isTruncated: result.isTruncated,
        isBodyIncomplete: result.isBodyIncomplete,
        redirectCount: result.redirectChain.length,
        redirectChain: result.redirectChain,
        cacheObservation: result.cacheObservation,
        error,
        errorDetail,
        isEligible: eligible,
        ineligibilityReason: reason,
      };
    } catch (err) {
      const { error, detail } = classifyError(err);

      probeResult = {
        order,
        identity,
        isCacheBust,
        cacheBustParam,
        requestedUrl: targetUrl,
        normalizedUrl,
        finalUrl: targetUrl,
        httpStatus: 0,
        httpStatusText: '',
        contentType: '',
        timing: { ttfbMs: 0, bodyDownloadMs: -1, totalMs: 0, queueWaitMs: 0 },
        htmlSizeBytes: 0,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        error,
        errorDetail: detail,
        isEligible: false,
        ineligibilityReason: `Probe failed: ${detail}`,
      };
    }

    probes.push(probeResult);
  }

  // Compute summary, comparison, and recommendations
  const summary = computeSummary(probes);
  const cacheBustComparison = computeCacheBustComparison(probes);
  const recommendations = generateRecommendations(probes, summary, cacheBustComparison);

  return {
    normalizedUrl,
    timestamp,
    probes,
    summary,
    cacheBustComparison,
    recommendations,
    probeOrderNote:
      'Probes run sequentially in fixed order: (1) ChatGPT-User, (2) Claude-User, (3) Perplexity-User, (4) ChatGPT-User with cache-busting parameter. This small sample is directional — request order can affect caching, and results may vary between checks.',
    disclaimers: [
      'This tool sends HTTP requests using simulated AI user-agent strings. It does not reproduce actual AI-provider IP addresses, verified identities, infrastructure, or timeout policies.',
      'Response-header timing (TTFB) is measured from our server to yours. Geographic distance, network conditions, and server load affect results.',
      'The timing bands used (Fast < 500ms, Moderate 500–999ms, Slow 1,000–1,999ms, Very Slow ≥ 2,000ms) are this tool\'s heuristic thresholds — they are not published AI-provider deadlines.',
      'Real 499 confirmation requires access to your server or CDN access logs.',
      'This tool cannot guarantee AI citations, rankings, or crawler access.',
    ],
  };
}

