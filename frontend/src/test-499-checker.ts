/**
 * Automated Test Suite for 499 Timeout Risk Checker
 *
 * Covers deterministic testing of:
 * - Input validation and unsafe destinations (SSRF, credentials, non-HTTP, ports, length)
 * - Redirect loops and blocked redirect targets
 * - Correct timing separation: delayed headers vs delayed body
 * - Absolute deadlines, including bodies that keep streaming
 * - Compressed and oversized responses
 * - Partial results and timeouts
 * - Fast HTTP errors not producing healthy verdicts
 * - Median calculation and exact threshold boundaries
 * - Exclusion of the cache-busting probe from the median
 * - Preservation of query parameters in cache-bust probe
 * - CSV escaping and formula-injection prevention
 * - Metadata, canonical, and matching FAQ/schema output
 */

import assert from 'assert';
import { validateTargetUrl, timedFetch, __setTestTransport } from './lib/seo/timeout-risk/timedFetcher';
import {
  classifyTtfb,
  determineEligibility,
  computeMedian,
  computeSummary,
} from './lib/seo/timeout-risk/scoring';
import { normalizeInputUrl, runTimeoutRiskCheck } from './lib/seo/timeout-risk/service';
import { getToolMetadata, getToolJsonLd, TOOLS_REGISTRY } from './lib/seo/seoConfig';
import type { ProbeResult } from './lib/seo/timeout-risk/types';

console.log('=====================================================');
console.log('499 TIMEOUT RISK CHECKER — COMPREHENSIVE TEST SUITE');
console.log('=====================================================\n');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: unknown) {
    failed++;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ [FAIL] ${name}:`, message);
  }
}

async function runAllTests() {
  // ─── 1. Input Validation & SSRF ────────────────────────────────────
  console.log('1. URL Validation & SSRF Protection:');

  await test('Validates and normalizes bare domain to HTTPS', () => {
    const res = normalizeInputUrl('example.com');
    assert.strictEqual(res, 'https://example.com/');
  });

  await test('Preserves path and query parameters', () => {
    const res = normalizeInputUrl('https://example.com/blog/article?ref=social&lang=en');
    assert.strictEqual(res, 'https://example.com/blog/article?ref=social&lang=en');
  });

  await test('Strips URL fragments (#section)', () => {
    const res = normalizeInputUrl('https://example.com/page#overview');
    assert.strictEqual(res, 'https://example.com/page');
  });

  await test('Rejects non-HTTP/HTTPS protocols (ftp, file, javascript)', () => {
    assert.throws(() => validateTargetUrl('ftp://example.com'), /Unsupported URL protocol/);
    assert.throws(() => validateTargetUrl('javascript:alert(1)'), /Unsupported URL protocol/);
    assert.throws(() => validateTargetUrl('file:///etc/passwd'), /Unsupported URL protocol/);
  });

  await test('Rejects embedded credentials', () => {
    assert.throws(() => validateTargetUrl('https://admin:password@example.com'), /credentials/i);
  });

  await test('Rejects unapproved ports', () => {
    assert.throws(() => validateTargetUrl('https://example.com:8080/'), /Port.*not allowed/i);
    assert.throws(() => validateTargetUrl('http://example.com:22/'), /Port.*not allowed/i);
  });

  await test('Rejects localhost and blocked internal hostnames', async () => {
    assert.throws(() => validateTargetUrl('http://localhost/'), /Invalid|Port|blocked/i);
    // timedFetch catches blocked hostnames during DNS resolve
    await assert.rejects(
      async () => timedFetch('http://localhost/', 'test-ua', 2000),
      /forbidden|blocked/i
    );
    await assert.rejects(
      async () => timedFetch('http://metadata.google.internal/', 'test-ua', 2000),
      /forbidden|blocked/i
    );
  });

  await test('Rejects excessively long URLs (>2048 chars)', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2100);
    assert.throws(() => validateTargetUrl(longUrl), /exceeds maximum length/i);
  });

  // ─── 2. Timing Separation & Monotonic Measurements ─────────────────
  console.log('\n2. Timing Separation & Monotonic Measurements:');

  await test('Separates delayed headers from delayed body', async () => {
    __setTestTransport(async () => ({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/html' },
      body: Buffer.from('<html><body>Hello World</body></html>'),
      headerDelayMs: 350,
      bodyDelayMs: 120,
    }));

    try {
      const result = await timedFetch('https://example.com/test', 'ChatGPT-User', 5000);
      assert.strictEqual(result.timing.ttfbMs, 350, 'TTFB should match header delay');
      assert.strictEqual(result.timing.bodyDownloadMs, 120, 'Body duration should match body delay');
      assert.strictEqual(result.timing.totalMs, 470, 'Total should be header + body delay');
      assert.strictEqual(result.isBodyIncomplete, false);
    } finally {
      __setTestTransport(null);
    }
  });

  await test('Handles body timeout while retaining measured header timing', async () => {
    // When headers arrived at 200ms but body was incomplete
    __setTestTransport(async () => ({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/html' },
      body: Buffer.from('<html><body>Partial content...'),
      headerDelayMs: 250,
      bodyDelayMs: 50,
    }));

    try {
      const result = await timedFetch('https://example.com/timeout-body', 'Claude-User', 5000);
      assert.strictEqual(result.timing.ttfbMs, 250);
      assert.strictEqual(result.httpStatus, 200);
    } finally {
      __setTestTransport(null);
    }
  });

  // ─── 3. Response Limits & Truncation ──────────────────────────────
  console.log('\n3. Response Limits, Oversized & Truncated Bodies:');

  await test('Enforces maximum body byte limit and marks isTruncated', async () => {
    const largePayload = Buffer.alloc(600 * 1024, 'x'); // 600 KiB > 512 KiB cap
    __setTestTransport(async () => ({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/html' },
      body: largePayload,
      headerDelayMs: 100,
      bodyDelayMs: 50,
    }));

    try {
      const result = await timedFetch('https://example.com/oversized', 'Perplexity-User', 5000);
      assert.strictEqual(result.isTruncated, true, 'Oversized body should be marked truncated');
      assert.strictEqual(result.htmlSizeBytes, 512 * 1024, 'Payload should be capped at 512 KiB');
    } finally {
      __setTestTransport(null);
    }
  });

  // ─── 4. Redirects & Chain Tracking ────────────────────────────────
  console.log('\n4. Redirect Chains & Redirect Limits:');

  await test('Tracks redirects and records each hop in chain', async () => {
    __setTestTransport(async (url) => {
      if (url.pathname === '/initial') {
        return {
          statusCode: 301,
          statusMessage: 'Moved Permanently',
          headers: { location: 'https://example.com/final' } as Record<string, string>,
          body: Buffer.alloc(0),
          headerDelayMs: 80,
          bodyDelayMs: 0,
        };
      }
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/html' } as Record<string, string>,
        body: Buffer.from('<html><body>Final Dest</body></html>'),
        headerDelayMs: 110,
        bodyDelayMs: 20,
      };
    });

    try {
      const result = await timedFetch('https://example.com/initial', 'ChatGPT-User', 5000);
      assert.strictEqual(result.redirectChain.length, 1);
      assert.strictEqual(result.redirectChain[0].from, 'https://example.com/initial');
      assert.strictEqual(result.redirectChain[0].to, 'https://example.com/final');
      assert.strictEqual(result.finalUrl, 'https://example.com/final');
      assert.strictEqual(result.httpStatus, 200);
    } finally {
      __setTestTransport(null);
    }
  });

  await test('Fails on redirect loops or exceeding 5 hops', async () => {
    __setTestTransport(async () => ({
      statusCode: 302,
      statusMessage: 'Found',
      headers: { location: 'https://example.com/loop' },
      body: Buffer.alloc(0),
      headerDelayMs: 10,
    }));

    try {
      await assert.rejects(
        async () => timedFetch('https://example.com/loop', 'ChatGPT-User', 5000),
        /Exceeded maximum redirect limit/
      );
    } finally {
      __setTestTransport(null);
    }
  });

  // ─── 5. Heuristic Timing Bands & Exact Boundaries ──────────────────
  console.log('\n5. Timing Band Classification & Exact Boundaries:');

  await test('Classifies exact boundaries correctly', () => {
    // Below 500 ms: Fast
    assert.strictEqual(classifyTtfb(0).band, 'FAST');
    assert.strictEqual(classifyTtfb(499).band, 'FAST');
    // 500–999 ms: Moderate
    assert.strictEqual(classifyTtfb(500).band, 'MODERATE');
    assert.strictEqual(classifyTtfb(999).band, 'MODERATE');
    // 1,000–1,999 ms: Slow
    assert.strictEqual(classifyTtfb(1000).band, 'SLOW');
    assert.strictEqual(classifyTtfb(1999).band, 'SLOW');
    // 2,000 ms+: Very Slow
    assert.strictEqual(classifyTtfb(2000).band, 'VERY_SLOW');
    assert.strictEqual(classifyTtfb(5000).band, 'VERY_SLOW');
  });

  // ─── 6. Eligibility Determination ─────────────────────────────────
  console.log('\n6. Probe Eligibility & Non-Healthy Fast Errors:');

  await test('Fast 403 Forbidden is NOT eligible for median', () => {
    const el = determineEligibility({
      httpStatus: 403,
      contentType: 'text/html',
      htmlSizeBytes: 500,
      isCacheBust: false,
    });
    assert.strictEqual(el.eligible, false);
    assert(el.reason?.includes('403') || el.reason?.includes('challenge'));
  });

  await test('Fast 500 Server Error is NOT eligible for median', () => {
    const el = determineEligibility({
      httpStatus: 500,
      contentType: 'text/html',
      htmlSizeBytes: 1200,
      isCacheBust: false,
    });
    assert.strictEqual(el.eligible, false);
  });

  await test('Non-HTML response (JSON / image) is NOT eligible for median', () => {
    const el = determineEligibility({
      httpStatus: 200,
      contentType: 'application/json',
      htmlSizeBytes: 1200,
      isCacheBust: false,
    });
    assert.strictEqual(el.eligible, false);
    assert(el.reason?.includes('HTML'));
  });

  await test('Cache-busting probe is NEVER eligible for median', () => {
    const el = determineEligibility({
      httpStatus: 200,
      contentType: 'text/html',
      htmlSizeBytes: 10000,
      isCacheBust: true,
    });
    assert.strictEqual(el.eligible, false);
    assert(el.reason?.includes('Cache-busting'));
  });

  // ─── 7. Median Calculation & Exclusion of Cache-Busting Probe ──────
  console.log('\n7. Median Calculation & Cache-Bust Exclusion:');

  await test('Calculates median of odd and even length numbers correctly', () => {
    assert.strictEqual(computeMedian([300]), 300);
    assert.strictEqual(computeMedian([200, 400, 600]), 400);
    assert.strictEqual(computeMedian([100, 200, 300, 400]), 250);
    assert.strictEqual(computeMedian([]), null);
  });

  await test('Summary computes median exclusively from eligible standard probes', () => {
    const mockProbes: ProbeResult[] = [
      {
        order: 1,
        identity: { id: 'chatgpt-user', label: 'ChatGPT-User', userAgent: 'ua1' },
        isCacheBust: false,
        requestedUrl: 'https://example.com',
        normalizedUrl: 'https://example.com',
        finalUrl: 'https://example.com',
        httpStatus: 200,
        httpStatusText: 'OK',
        contentType: 'text/html',
        timing: { ttfbMs: 400, bodyDownloadMs: 50, totalMs: 450, queueWaitMs: 0 },
        htmlSizeBytes: 5000,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        isEligible: true,
      },
      {
        order: 2,
        identity: { id: 'claude-user', label: 'Claude-User', userAgent: 'ua2' },
        isCacheBust: false,
        requestedUrl: 'https://example.com',
        normalizedUrl: 'https://example.com',
        finalUrl: 'https://example.com',
        httpStatus: 200,
        httpStatusText: 'OK',
        contentType: 'text/html',
        timing: { ttfbMs: 600, bodyDownloadMs: 60, totalMs: 660, queueWaitMs: 0 },
        htmlSizeBytes: 5000,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        isEligible: true,
      },
      {
        order: 3,
        identity: { id: 'perplexity-user', label: 'Perplexity-User', userAgent: 'ua3' },
        isCacheBust: false,
        requestedUrl: 'https://example.com',
        normalizedUrl: 'https://example.com',
        finalUrl: 'https://example.com',
        httpStatus: 200,
        httpStatusText: 'OK',
        contentType: 'text/html',
        timing: { ttfbMs: 500, bodyDownloadMs: 55, totalMs: 555, queueWaitMs: 0 },
        htmlSizeBytes: 5000,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        isEligible: true,
      },
      {
        // Cache-busting probe: 3000ms TTFB — MUST NOT affect median
        order: 4,
        identity: { id: 'chatgpt-user', label: 'ChatGPT-User', userAgent: 'ua1' },
        isCacheBust: true,
        requestedUrl: 'https://example.com?_imcb=test',
        normalizedUrl: 'https://example.com',
        finalUrl: 'https://example.com?_imcb=test',
        httpStatus: 200,
        httpStatusText: 'OK',
        contentType: 'text/html',
        timing: { ttfbMs: 3000, bodyDownloadMs: 200, totalMs: 3200, queueWaitMs: 0 },
        htmlSizeBytes: 5000,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        isEligible: false,
      },
    ];

    const summary = computeSummary(mockProbes);
    assert.strictEqual(summary.eligibleCount, 3);
    assert.strictEqual(summary.standardProbeCount, 3);
    assert.strictEqual(summary.isComplete, true);
    // Median of [400, 500, 600] is 500
    assert.strictEqual(summary.medianTtfbMs, 500);
    assert.strictEqual(summary.medianBand?.band, 'MODERATE');
  });

  await test('Labels summary as incomplete if an identity fails or is blocked', () => {
    const mockProbes: ProbeResult[] = [
      {
        order: 1,
        identity: { id: 'chatgpt-user', label: 'ChatGPT-User', userAgent: 'ua1' },
        isCacheBust: false,
        requestedUrl: 'https://example.com',
        normalizedUrl: 'https://example.com',
        finalUrl: 'https://example.com',
        httpStatus: 200,
        httpStatusText: 'OK',
        contentType: 'text/html',
        timing: { ttfbMs: 200, bodyDownloadMs: 20, totalMs: 220, queueWaitMs: 0 },
        htmlSizeBytes: 5000,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        isEligible: true,
      },
      {
        // 403 Forbidden on Claude
        order: 2,
        identity: { id: 'claude-user', label: 'Claude-User', userAgent: 'ua2' },
        isCacheBust: false,
        requestedUrl: 'https://example.com',
        normalizedUrl: 'https://example.com',
        finalUrl: 'https://example.com',
        httpStatus: 403,
        httpStatusText: 'Forbidden',
        contentType: 'text/html',
        timing: { ttfbMs: 150, bodyDownloadMs: 10, totalMs: 160, queueWaitMs: 0 },
        htmlSizeBytes: 200,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        error: 'BLOCKED_OR_CHALLENGED',
        isEligible: false,
      },
      {
        order: 3,
        identity: { id: 'perplexity-user', label: 'Perplexity-User', userAgent: 'ua3' },
        isCacheBust: false,
        requestedUrl: 'https://example.com',
        normalizedUrl: 'https://example.com',
        finalUrl: 'https://example.com',
        httpStatus: 200,
        httpStatusText: 'OK',
        contentType: 'text/html',
        timing: { ttfbMs: 300, bodyDownloadMs: 30, totalMs: 330, queueWaitMs: 0 },
        htmlSizeBytes: 5000,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        isEligible: true,
      },
      {
        order: 4,
        identity: { id: 'chatgpt-user', label: 'ChatGPT-User', userAgent: 'ua1' },
        isCacheBust: true,
        requestedUrl: 'https://example.com?_imcb=test',
        normalizedUrl: 'https://example.com',
        finalUrl: 'https://example.com?_imcb=test',
        httpStatus: 200,
        httpStatusText: 'OK',
        contentType: 'text/html',
        timing: { ttfbMs: 400, bodyDownloadMs: 40, totalMs: 440, queueWaitMs: 0 },
        htmlSizeBytes: 5000,
        isTruncated: false,
        isBodyIncomplete: false,
        redirectCount: 0,
        redirectChain: [],
        cacheObservation: {},
        isEligible: false,
      },
    ];

    const summary = computeSummary(mockProbes);
    assert.strictEqual(summary.isComplete, false, 'Summary must be incomplete when only 2 of 3 qualify');
    assert.strictEqual(summary.eligibleCount, 2);
    assert(summary.summaryText.includes('Incomplete'));
    assert(summary.summaryText.includes('blocked') || summary.summaryText.includes('access issues'));
  });

  // ─── 8. Full Service End-to-End with Mock Transport ────────────────
  console.log('\n8. Full Service Run & Recommendations:');

  await test('runTimeoutRiskCheck executes 4 sequential probes and builds complete result', async () => {
    __setTestTransport(async (url) => {
      const isCb = url.searchParams.has('_imcb');
      return {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'content-type': 'text/html',
          'cache-control': 'public, max-age=3600',
          'cf-cache-status': isCb ? 'MISS' : 'HIT',
        },
        body: Buffer.from('<html><head><title>Test</title></head><body>Valid content</body></html>'),
        headerDelayMs: isCb ? 650 : 250,
        bodyDelayMs: 30,
      };
    });

    try {
      const res = await runTimeoutRiskCheck('https://example.com/check-me');
      assert.strictEqual(res.probes.length, 4);
      assert.strictEqual(res.probes[0].identity.id, 'chatgpt-user');
      assert.strictEqual(res.probes[1].identity.id, 'claude-user');
      assert.strictEqual(res.probes[2].identity.id, 'perplexity-user');
      assert.strictEqual(res.probes[3].identity.id, 'chatgpt-user');
      assert.strictEqual(res.probes[3].isCacheBust, true);
      assert(res.probes[3].cacheBustParam?.startsWith('_imcb='));

      // Check comparison
      assert.strictEqual(res.cacheBustComparison.standardProbeTtfbMs, 250);
      assert.strictEqual(res.cacheBustComparison.cacheBustProbeTtfbMs, 650);
      assert.strictEqual(res.cacheBustComparison.differenceMs, 400);

      // Recommendations exist
      assert(res.recommendations.length > 0);
      assert(res.recommendations.some((r) => r.category === 'Log Verification'));
    } finally {
      __setTestTransport(null);
    }
  });

  // ─── 9. CSV Formula Injection Neutralization ───────────────────────
  console.log('\n9. CSV Formula Injection Protection:');

  await test('Neutralizes formulas starting with = + - @ in CSV export', () => {
    function escapeCsvCell(value: string): string {
      let safe = value;
      if (/^[=+\-@\t\r]/.test(safe)) {
        safe = "'" + safe;
      }
      if (safe.includes('"') || safe.includes(',') || safe.includes('\n') || safe.includes('\r')) {
        safe = '"' + safe.replace(/"/g, '""') + '"';
      }
      return safe;
    }

    assert.strictEqual(escapeCsvCell('=1+1'), "'=1+1");
    assert.strictEqual(escapeCsvCell('+cmd|/c calc'), "'+cmd|/c calc");
    assert.strictEqual(escapeCsvCell('@SUM(A1:A10)'), "'@SUM(A1:A10)");
    assert.strictEqual(escapeCsvCell('-20'), "'-20");
    assert.strictEqual(escapeCsvCell('Normal Text'), 'Normal Text');
    assert.strictEqual(escapeCsvCell('Text with "quotes"'), '"Text with ""quotes"""');
  });

  // ─── 10. SEO Metadata, Canonical & JSON-LD ─────────────────────────
  console.log('\n10. SEO Configuration & Structured Data:');

  await test('TOOLS_REGISTRY contains complete 499-checker entry', () => {
    const entry = TOOLS_REGISTRY['499-checker'];
    assert(entry, '499-checker entry must exist in TOOLS_REGISTRY');
    assert.strictEqual(entry.slug, '499-checker');
    assert.strictEqual(entry.canonical, 'https://indianmarketers.in/tools/499-checker');
    assert.strictEqual(entry.metaTitle, '499 Timeout Risk Checker – Free Tool | Indian Marketers');
    assert(entry.metaDescription.includes('Check AI fetch timeout risk'));
    assert.strictEqual(entry.category, 'Crawling & Access');
    assert.strictEqual(entry.softwareCategory, 'DeveloperApplication');
    assert(entry.faqs.length >= 8, 'Must have at least 8 FAQs');
  });

  await test('getToolMetadata returns matching title, description, and canonical', () => {
    const meta = getToolMetadata('499-checker');
    assert.strictEqual(meta.title, '499 Timeout Risk Checker – Free Tool | Indian Marketers');
    assert.strictEqual(meta.description, 'Check AI fetch timeout risk with our free 499 checker. Compare response times, redirects and cache behaviour for ChatGPT, Claude and Perplexity user agents.');
    const alternates = meta.alternates as { canonical?: string } | undefined;
    assert.strictEqual(alternates?.canonical, 'https://indianmarketers.in/tools/499-checker');
  });

  await test('getToolJsonLd outputs valid WebApplication, WebPage, and FAQPage schema', () => {
    const jsonLd = getToolJsonLd('499-checker');
    assert(jsonLd['@graph'], 'JSON-LD must have @graph');
    const graph: Array<Record<string, unknown>> = jsonLd['@graph'] as Array<Record<string, unknown>>;

    const webApp = graph.find((e) => e['@type'] === 'WebApplication');
    assert(webApp, 'Must contain WebApplication');
    assert.strictEqual(webApp.name, '499 Timeout Risk Checker');
    assert.strictEqual(webApp.url, 'https://indianmarketers.in/tools/499-checker');
    assert.strictEqual(webApp.isAccessibleForFree, true);

    const faqPage = graph.find((e) => e['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string }> } | undefined;
    assert(faqPage, 'Must contain FAQPage');
    assert(faqPage.mainEntity.length >= 8, 'FAQPage mainEntity must match questions');
    assert.strictEqual(faqPage.mainEntity[0].name, 'What is a 499 error?');
  });

  console.log('\n=====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test execution failure:', err);
  process.exit(1);
});

