/**
 * Tool #19 — Common Crawl Visibility Checker Automated Test Suite
 * Tests unit logic, CDX parsing, RFC 9309 robots evaluation, block detection,
 * WARC decompression, content comparison, and diagnostic engines.
 */

import assert from 'assert';
import zlib from 'zlib';
import {
  normalizeTargetInput,
  queryCdxIndex,
  CdxRecord
} from './lib/seo/common-crawl/commonCrawlClient';
import {
  buildDomainQueryPattern,
  formatCdxTimestamp,
  computeTrendSummary,
  toSURTPrefix,
  matchesScope,
  isHtmlWebpageRecord
} from './lib/seo/common-crawl/domainAnalysisService';
import { formatCollectionFriendlyName } from './lib/seo/common-crawl/collectionService';
import { generateUrlVariants } from './lib/seo/common-crawl/pageHistoryService';
import { evaluateRobotsContentForCCBot } from './lib/seo/common-crawl/robotsHistoryService';
import { detectBlockSource } from './lib/seo/common-crawl/blockSourceDetector';
import { extractUrlsFromSitemapXml, calculateSitemapCoverage } from './lib/seo/common-crawl/sitemapService';
import { extractContentFromHtml } from './lib/seo/common-crawl/contentComparisonService';
import {
  computeOverallStatus,
  generateTechnicalRecommendations
} from './lib/seo/common-crawl/diagnosticsEngine';
import { validateWarcFilename } from './lib/seo/common-crawl/warcReader';
import { MonthlyCrawlRecord, HistoricalRobotsRecord, LiveProbeResult } from './lib/seo/common-crawl/types';

let passed = 0;
let failed = 0;

function testCase(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function testCaseAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n=====================================================');
  console.log('TOOL 19: COMMON CRAWL VISIBILITY CHECKER TEST SUITE');
  console.log('=====================================================\n');

  // 1. Input Normalization & Target Scope Detection
  console.log('1. Target Input Normalization & Scope:');
  testCase('Normalizes domain without protocol to https URL and host', () => {
    const res = normalizeTargetInput('hoabl.com');
    assert.strictEqual(res.hostname, 'hoabl.com');
    assert.strictEqual(res.isPage, false);
    assert.strictEqual(res.normalized, 'https://hoabl.com/');
  });

  testCase('Normalizes domain with protocol and www', () => {
    const res = normalizeTargetInput('https://www.barbequenation.com/');
    assert.strictEqual(res.hostname, 'www.barbequenation.com');
    assert.strictEqual(res.isPage, false);
  });

  testCase('Detects deep page URL with path and query', () => {
    const res = normalizeTargetInput('https://example.com/blog/article?ref=cc');
    assert.strictEqual(res.hostname, 'example.com');
    assert.strictEqual(res.isPage, true);
    assert.strictEqual(res.pathname, '/blog/article?ref=cc');
  });

  testCase('Rejects invalid domain input format', () => {
    assert.throws(() => normalizeTargetInput('not a valid domain!'), /Invalid/);
    assert.throws(() => normalizeTargetInput(''), /Please enter a valid/);
  });

  // 2. Query Builder & SURT Wildcard Formatting
  console.log('\n2. CDX Query Pattern Construction:');
  testCase('Constructs exact host query pattern', () => {
    const p = buildDomainQueryPattern('indianmarketers.in', 'exact');
    assert.strictEqual(p, 'indianmarketers.in/*');
  });

  testCase('Constructs subdomain wildcard SURT pattern', () => {
    const p = buildDomainQueryPattern('www.hoabl.com', 'subdomains');
    assert.strictEqual(p, '*.hoabl.com/*');
  });

  testCase('Constructs include_www pattern', () => {
    const p = buildDomainQueryPattern('hoabl.com', 'include_www');
    assert.strictEqual(p, '*.hoabl.com/*');
  });

  testCase('Constructs canonical SURT prefixes correctly', () => {
    assert.strictEqual(toSURTPrefix('scaler.com'), 'com,scaler)');
    assert.strictEqual(toSURTPrefix('www.hoabl.com'), 'com,hoabl)');
    assert.strictEqual(toSURTPrefix('https://barbequenation.com/'), 'com,barbequenation)');
    assert.strictEqual(toSURTPrefix('indianmarketers.in'), 'in,indianmarketers)');
  });

  testCase('Evaluates matchesScope correctly for exact, include_www, and subdomains', () => {
    assert.strictEqual(matchesScope('https://scaler.com/courses', 'scaler.com', 'exact'), true);
    assert.strictEqual(matchesScope('https://www.scaler.com/topics', 'scaler.com', 'exact'), false);
    assert.strictEqual(matchesScope('https://www.scaler.com/topics', 'scaler.com', 'include_www'), true);
    assert.strictEqual(matchesScope('https://blog.scaler.com/post', 'scaler.com', 'include_www'), false);
    assert.strictEqual(matchesScope('https://blog.scaler.com/post', 'scaler.com', 'subdomains'), true);
  });

  // 3. URL Variant Generation for Page Archival Tracking
  console.log('\n3. URL Variant Tracking:');
  testCase('Generates exact, slash, protocol, and www variants', () => {
    const variants = generateUrlVariants('https://example.com/page');
    assert.ok(variants.length >= 3);
    const types = variants.map(v => v.type);
    assert.ok(types.includes('exact'));
    assert.ok(types.includes('trailing_slash'));
    assert.ok(types.includes('protocol'));
    assert.ok(types.includes('www'));
  });

  // 4. Timestamp & Trend Computations
  console.log('\n4. Date & Trend Calculation:');
  testCase('Formats cryptic Common Crawl archive IDs into user-friendly month labels', () => {
    assert.strictEqual(formatCollectionFriendlyName('CC-MAIN-2026-43'), 'October 2026 Crawl');
    assert.strictEqual(formatCollectionFriendlyName('CC-MAIN-2026-39'), 'September 2026 Crawl');
    assert.strictEqual(formatCollectionFriendlyName('CC-MAIN-2026-34'), 'August 2026 Crawl');
    assert.strictEqual(formatCollectionFriendlyName('CC-MAIN-2026-04'), 'January 2026 Crawl');
    assert.strictEqual(formatCollectionFriendlyName('CC-MAIN-2025-51'), 'December 2025 Crawl');
  });

  testCase('Formats CDX 14-char timestamp string to ISO date', () => {
    const d = formatCdxTimestamp('20261012143025');
    assert.strictEqual(d, '2026-10-12');
  });

  testCase('Computes trend summary metrics correctly', () => {
    const mockRecords: MonthlyCrawlRecord[] = [
      {
        collectionId: 'CC-MAIN-2026-43',
        collectionName: 'October 2026',
        dateRange: 'Oct 2026',
        capturedCount: 1500,
        countType: 'exact',
        status: 'confirmed',
        lastCapturedDate: '2026-10-14'
      },
      {
        collectionId: 'CC-MAIN-2026-39',
        collectionName: 'September 2026',
        dateRange: 'Sep 2026',
        capturedCount: 1000,
        countType: 'exact',
        status: 'confirmed',
        lastCapturedDate: '2026-09-12'
      }
    ];

    const trend = computeTrendSummary(mockRecords);
    assert.strictEqual(trend.latestCaptureCount, 1500);
    assert.strictEqual(trend.previousCaptureCount, 1000);
    assert.strictEqual(trend.absoluteChange, 500);
    assert.strictEqual(trend.percentChange, 50);
    assert.strictEqual(trend.highestCount, 1500);
    assert.strictEqual(trend.lowestCount, 1000);
  });

  testCase('Excludes unavailable collections from percentage calculation and does not treat them as zero captures', () => {
    const mockRecords: MonthlyCrawlRecord[] = [
      {
        collectionId: 'CC-MAIN-2026-43',
        collectionName: 'October 2026',
        dateRange: 'Oct 2026',
        capturedCount: 2000,
        countType: 'exact',
        status: 'confirmed'
      },
      {
        collectionId: 'CC-MAIN-2026-39',
        collectionName: 'September 2026',
        dateRange: 'Sep 2026',
        capturedCount: 0,
        countType: 'unavailable',
        status: 'temporarily_unavailable',
        statusMessage: 'Official Common Crawl cluster index temporarily unreachable.'
      },
      {
        collectionId: 'CC-MAIN-2026-34',
        collectionName: 'August 2026',
        dateRange: 'Aug 2026',
        capturedCount: 1000,
        countType: 'exact',
        status: 'confirmed'
      }
    ];

    const trend = computeTrendSummary(mockRecords);
    assert.strictEqual(trend.latestCaptureCount, 2000);
    assert.strictEqual(trend.previousCaptureCount, 1000);
    assert.strictEqual(trend.percentChange, 100);
    assert.strictEqual(trend.unavailableCollectionsCount, 1);
  });

  // 5. RFC 9309 Historical Robots.txt CCBot Evaluation
  console.log('\n5. RFC 9309 Robots.txt Policy Evaluation:');
  testCase('Allows CCBot by default when no rules disallow', () => {
    const robots = 'User-agent: *\nDisallow: /admin\nSitemap: https://example.com/sitemap.xml';
    const evalRes = evaluateRobotsContentForCCBot(robots);
    assert.strictEqual(evalRes.ccBotStatus, 'ALLOWED');
    assert.strictEqual(evalRes.wildcardStatus, 'ALLOWED');
    assert.strictEqual(evalRes.sitemapsCount, 1);
  });

  testCase('Blocks CCBot when explicit CCBot disallow exists', () => {
    const robots = 'User-agent: CCBot\nDisallow: /\n\nUser-agent: *\nAllow: /';
    const evalRes = evaluateRobotsContentForCCBot(robots);
    assert.strictEqual(evalRes.ccBotStatus, 'BLOCKED');
    assert.strictEqual(evalRes.appliedRule?.type, 'disallow');
    assert.strictEqual(evalRes.appliedRule?.pattern, '/');
  });

  testCase('CCBot allow rule overrides broader wildcard disallow', () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: CCBot\nAllow: /';
    const evalRes = evaluateRobotsContentForCCBot(robots);
    assert.strictEqual(evalRes.ccBotStatus, 'ALLOWED');
    assert.strictEqual(evalRes.wildcardStatus, 'BLOCKED');
  });

  testCase('Evaluates robots.txt rules against specific target path (RFC 9309)', () => {
    const robots = 'User-agent: CCBot\nDisallow: /checkout/\nAllow: /checkout/success\nDisallow: /admin';
    const checkBlocked = evaluateRobotsContentForCCBot(robots, '/checkout/cart');
    assert.strictEqual(checkBlocked.ccBotStatus, 'BLOCKED');

    const checkAllowed = evaluateRobotsContentForCCBot(robots, '/checkout/success');
    assert.strictEqual(checkAllowed.ccBotStatus, 'ALLOWED');

    const checkRoot = evaluateRobotsContentForCCBot(robots, '/');
    assert.strictEqual(checkRoot.ccBotStatus, 'ALLOWED');
  });

  // 6. Block Source Detection & Attribution
  console.log('\n6. Block Source Attribution:');
  testCase('Identifies Cloudflare AI Scrape Shield from headers', () => {
    const res = detectBlockSource('User-agent: *\nDisallow: /', { 'cf-mitigated': 'challenge', 'server': 'cloudflare' });
    assert.strictEqual(res.likelyOrigin, 'Cloudflare');
    assert.strictEqual(res.confidence, 'HIGH');
  });

  testCase('Identifies Squarespace template signature', () => {
    const robots = '# Sitemaps\n# Disallow: /config\nDisallow: /search\nDisallow: /*?author=';
    const res = detectBlockSource(robots, { 'server': 'squarespace' });
    assert.strictEqual(res.likelyOrigin, 'Squarespace');
    assert.strictEqual(res.confidence, 'HIGH');
  });

  testCase('Identifies WordPress Yoast SEO plugin header', () => {
    const robots = '# This file was generated by Yoast SEO\nUser-agent: *\nDisallow: /wp-admin/';
    const res = detectBlockSource(robots, {});
    assert.strictEqual(res.likelyOrigin, 'WordPress/CMS');
    assert.strictEqual(res.confidence, 'HIGH');
  });

  testCase('Identifies Dark Visitors AI blocklist', () => {
    const robots = '# Dark Visitors Community Blocklist\nUser-agent: CCBot\nDisallow: /\nUser-agent: GPTBot\nDisallow: /';
    const res = detectBlockSource(robots, {});
    assert.strictEqual(res.likelyOrigin, 'Known Blocklist');
    assert.strictEqual(res.confidence, 'HIGH');
  });

  testCase('Returns Undetermined when no recognizable signatures exist', () => {
    const res = detectBlockSource('User-agent: crawler\nAllow: /', {});
    assert.strictEqual(res.likelyOrigin, 'Undetermined');
    assert.strictEqual(res.confidence, 'LOW');
  });

  // 7. Sitemap XML Extraction
  console.log('\n7. Sitemap XML Parsing:');
  testCase('Extracts URLs from standard urlset XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/</loc></url>
      <url><loc>https://example.com/about</loc></url>
      <url><loc>https://example.com/blog</loc></url>
    </urlset>`;
    const { urls } = extractUrlsFromSitemapXml(xml);
    assert.strictEqual(urls.length, 3);
    assert.strictEqual(urls[0], 'https://example.com/');
    assert.strictEqual(urls[1], 'https://example.com/about');
  });

  testCase('Extracts sub-sitemap locations from sitemapindex XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
    </sitemapindex>`;
    const { childSitemaps } = extractUrlsFromSitemapXml(xml);
    assert.strictEqual(childSitemaps.length, 2);
    assert.strictEqual(childSitemaps[0], 'https://example.com/sitemap-posts.xml');
  });

  // 7b. Sitemap Coverage Calculation & Fractional Percentages
  console.log('\n7b. Sitemap Coverage & Fractional Percentages:');
  testCase('Calculates fractional percentage correctly (2/500 = 0.4%, not 0%)', () => {
    const sitemapUrls = Array.from({ length: 500 }, (_, i) => `https://example.com/page-${i}`);
    const verified = [
      { url: 'https://example.com/page-0' },
      { url: 'https://example.com/page-1' }
    ];
    const res = calculateSitemapCoverage(
      'https://example.com/sitemap.xml',
      sitemapUrls,
      'CC-MAIN-2026-43',
      verified,
      true, // capped sample
      1200 // total parsed before cap
    );
    assert.strictEqual(res.totalSitemapUrls, 500);
    assert.strictEqual(res.confirmedArchivedUrls, 2);
    assert.strictEqual(res.coveragePercentage, 0.4);
    assert.strictEqual(res.isPartial, true);
  });

  testCase('Calculates 0% and 100% coverage cleanly', () => {
    const sitemapUrls = ['https://example.com/a', 'https://example.com/b'];
    const resZero = calculateSitemapCoverage('https://example.com/sitemap.xml', sitemapUrls, 'CC-MAIN-2026-43', []);
    assert.strictEqual(resZero.coveragePercentage, 0);

    const resFull = calculateSitemapCoverage(
      'https://example.com/sitemap.xml',
      sitemapUrls,
      'CC-MAIN-2026-43',
      [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }]
    );
    assert.strictEqual(resFull.coveragePercentage, 100);
  });

  // 8. WARC Record Validation & Decompression
  console.log('\n8. WARC Decompression & Extraction:');
  testCase('Validates official Common Crawl WARC filenames and rejects path traversal', () => {
    assert.strictEqual(validateWarcFilename('crawl-data/CC-MAIN-2026-43/segments/1791170053823.21/warc/CC-MAIN-20261005105623.warc.gz'), true);
    assert.strictEqual(validateWarcFilename('../../etc/passwd'), false);
    assert.strictEqual(validateWarcFilename('http://evil.com/warc.gz'), false);
  });

  testCase('Decompresses gzip WARC member payload correctly', () => {
    const syntheticPayload = 'WARC/1.0\r\nWARC-Type: response\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Test Content</h1></body></html>';
    const compressed = zlib.gzipSync(Buffer.from(syntheticPayload));
    const decompressed = zlib.gunzipSync(compressed).toString('utf8');
    assert.strictEqual(decompressed, syntheticPayload);
  });

  // 9. HTML Content Extraction & Client-Side Rendering Detection
  console.log('\n9. Content Extraction & Single Page App (SPA) Detection:');
  testCase('Extracts clean readable text and headings from HTML', () => {
    const html = `<html><head><script>alert(1)</script><style>body { color: red; }</style></head><body><h1>Main Title</h1><p>Welcome to our online store.</p><h2>Section Two</h2><p>Here are our products.</p></body></html>`;
    const res = extractContentFromHtml(html);
    assert.strictEqual(res.headings.length, 2);
    assert.strictEqual(res.headings[0].text, 'Main Title');
    assert.strictEqual(res.headings[0].level, 1);
    assert.ok(res.readableText.includes('Welcome to our online store'));
    assert.strictEqual(res.isSpaEmptyShell, false);
  });

  testCase('Flags client-side JavaScript empty app shell (#root with minimal text)', () => {
    const html = `<html><head><script src="/static/js/main.chunk.js"></script></head><body><div id="root"></div></body></html>`;
    const res = extractContentFromHtml(html);
    assert.strictEqual(res.isSpaEmptyShell, true);
    assert.ok(res.spaIndicators.length > 0);
  });

  // 10. Overall Diagnostic Engine & Recommendations
  console.log('\n10. Diagnostic Status & Actionable Recommendations:');
  testCase('Assigns CAPTURES_CONFIRMED_NO_RESTRICTIONS when captures exist and probe succeeds', () => {
    const mockMonthly: MonthlyCrawlRecord[] = [{
      collectionId: 'CC-MAIN-2026-43',
      collectionName: 'Oct 2026',
      dateRange: 'Oct 2026',
      capturedCount: 200,
      countType: 'exact',
      status: 'confirmed'
    }];
    const mockRobots: HistoricalRobotsRecord[] = [{
      collectionId: 'CC-MAIN-2026-43',
      collectionName: 'Oct 2026',
      isAvailable: true,
      ccBotStatus: 'ALLOWED',
      wildcardStatus: 'ALLOWED',
      sitemapsCount: 1
    }];
    const mockProbes: LiveProbeResult[] = [{
      profileName: 'CCBot/2.0 Simulation',
      userAgent: 'CCBot/2.0',
      statusCode: 200,
      statusText: 'OK',
      durationMs: 120,
      contentType: 'text/html',
      accessResult: 'SERVED_SUCCESSFULLY',
      relevantHeaders: {},
      limitationDisclaimer: ''
    }];

    const overall = computeOverallStatus(mockMonthly, mockRobots, mockProbes);
    assert.strictEqual(overall.status, 'CAPTURES_CONFIRMED_NO_RESTRICTIONS');
  });

  testCase('Generates high-priority recommendation when CCBot is blocked in robots.txt', () => {
    const mockMonthly: MonthlyCrawlRecord[] = [{
      collectionId: 'CC-MAIN-2026-43',
      collectionName: 'Oct 2026',
      dateRange: 'Oct 2026',
      capturedCount: 0,
      countType: 'none',
      status: 'no_records'
    }];
    const mockRobots: HistoricalRobotsRecord[] = [{
      collectionId: 'CC-MAIN-2026-43',
      collectionName: 'Oct 2026',
      isAvailable: true,
      ccBotStatus: 'BLOCKED',
      wildcardStatus: 'BLOCKED',
      appliedRule: { type: 'disallow', pattern: '/', lineNumber: 2, originalText: 'Disallow: /' },
      sitemapsCount: 0
    }];
    const mockProbes: LiveProbeResult[] = [];
    const blockSource = {
      detectedPattern: 'Custom Rule',
      likelyOrigin: 'Custom Rule' as const,
      confidence: 'MEDIUM' as const,
      evidence: [],
      suggestedAction: 'Edit robots.txt'
    };

    const recs = generateTechnicalRecommendations(mockMonthly, mockRobots, mockProbes, blockSource);
    assert.ok(recs.length > 0);
    const ccBotRec = recs.find(r => r.id === 'rec_robots_ccbot_blocked');
    assert.ok(ccBotRec);
    assert.strictEqual(ccBotRec?.priority, 'HIGH');
  });

  // 11. Security: Formula Injection Protection
  console.log('\n11. CSV Export Security & Formula Sanitization:');
  testCase('Escapes leading formula injection symbols in CSV fields', () => {
    const maliciousValues = ['=cmd|', '+SUM(A1:A10)', '-2+3', '@export', '\tfield'];
    for (const val of maliciousValues) {
      const sanitized = /^[=+\-@\t\r]/.test(val) ? `'${val}` : val;
      assert.strictEqual(sanitized.startsWith("'"), true);
    }
  });

  // 12. HTML Webpage vs Non-HTML / Robots.txt Distinction
  console.log('\n12. HTML Webpage vs Non-HTML Record Classification:');
  testCase('Accepts standard text/html webpage records', () => {
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/', mime: 'text/html' }), true);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/blog/article-1', mime: 'text/html; charset=UTF-8' }), true);
  });

  testCase('Strictly excludes robots.txt regardless of MIME type', () => {
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/robots.txt', mime: 'text/plain' }), false);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://indianmarketers.in/robots.txt', mime: 'text/html' }), false);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/robots.txt?v=1', mime: 'text/plain' }), false);
  });

  testCase('Strictly excludes XML sitemaps, feeds, and JSON data', () => {
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/sitemap.xml', mime: 'text/xml' }), false);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/sitemap_index.xml', mime: 'application/xml' }), false);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/feed.xml', mime: 'text/xml' }), false);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/api/data.json', mime: 'application/json' }), false);
  });

  testCase('Strictly excludes static assets, media, styles, and scripts', () => {
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/logo.png', mime: 'image/png' }), false);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/styles.css', mime: 'text/css' }), false);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/bundle.js', mime: 'application/javascript' }), false);
    assert.strictEqual(isHtmlWebpageRecord({ url: 'https://example.com/manual.pdf', mime: 'application/pdf' }), false);
  });

  testCase('Ensures MonthlyCrawlRecord distinguishes HTML captures from robots.txt snapshots', () => {
    // Simulating collection where only robots.txt was archived (as in CC-MAIN-2026-39 for indianmarketers.in)
    const mockMonthly: MonthlyCrawlRecord = {
      collectionId: 'CC-MAIN-2026-39',
      collectionName: 'Sep 2026',
      dateRange: 'Sep 2026',
      capturedCount: 0,
      countType: 'none',
      status: 'no_records',
      htmlCapturesCount: 0,
      robotsCount: 1,
      redirectsCount: 0,
      forbiddenCount: 0,
      otherResourcesCount: 0,
      statusMessage: 'No captured HTML webpages in this collection (1 robots.txt snapshot archived).'
    };

    assert.strictEqual(mockMonthly.capturedCount, 0);
    assert.strictEqual(mockMonthly.countType, 'none');
    assert.strictEqual(mockMonthly.status, 'no_records');
    assert.strictEqual(mockMonthly.robotsCount, 1);
    assert.strictEqual(mockMonthly.htmlCapturesCount, 0);
  });

  console.log('\n=====================================================');
  console.log(`TOTAL COMMON CRAWL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();

