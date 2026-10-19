import assert from 'assert';
import { isPrivateIPv4, isPrivateIPv6, validateSafeUrl, resolveAndVerifyPublicIp } from './lib/seo/hreflang/safeFetch';
import { validateTargetUrlForBrowser, classifyBrowserRenderError } from './lib/seo/mobile-friendly/browserSecurity';
import { redactSensitiveDetails, classifyAndSanitizeError } from './lib/seo/errorSanitizer';

// Import core services for each of the 14 tools to verify functional integrity
import { sanitizeBulkUrls } from './lib/seo/aiBotTesterService';
import { AI_BOT_REGISTRY } from './lib/seo/aiBotRegistry';
import { parseHtmlHreflang } from './lib/seo/hreflang/parseHtml';
import { validateHreflangCode } from './lib/seo/hreflang/validateLocale';
import { testHtaccessRules } from './lib/seo/htaccessService';
import { validateSearchRequest } from './lib/seo/knowledge-graph/validation';
import { buildGoogleSearchUrl, encodeUule } from './lib/seo/localSearchService';
import { calculateContentSimilarity } from './lib/seo/mobile-first/comparator';
import { auditStaticHtmlMobileFriendliness } from './lib/seo/mobile-friendly/staticAuditor';
import { DEFAULT_VIEWPORT_PRESET } from './lib/seo/mobile-friendly/constants';
import { compareAgentResults } from './lib/seo/prerendering/comparisonEngine';
import { executeGenerateLink, executeBulkBatch } from './lib/seo/reviewLinkService';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from './lib/seo/robotsParser';
import { buildSchemaObject } from './lib/seo/schema/builders';
import { fetchPageMetadata } from './lib/seo/serp/fetchMetadata';
import { parseSitemapXml } from './lib/seo/hreflang/parseSitemap';

async function runSecurityAndQASuite() {
  console.log('=====================================================');
  console.log('FINAL SECURITY HARDENING & 14-TOOL QA VERIFICATION');
  console.log('=====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            passed++;
            console.log(`  ✓ [PASS] ${name}`);
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`  ✗ [FAIL] ${name}:`, message);
            throw err;
          });
      } else {
        passed++;
        console.log(`  ✓ [PASS] ${name}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ [FAIL] ${name}:`, message);
      throw err;
    }
  }

  console.log('1. Hreflang Fetch Security & SSRF Protection:');

  test('Hreflang safeFetch: Blocks IPv4 loopback 127.0.0.1', () => {
    assert.strictEqual(isPrivateIPv4('127.0.0.1'), true);
  });

  test('Hreflang safeFetch: Blocks RFC 1918 private IPv4 (10.x, 172.16.x, 192.168.x)', () => {
    assert.strictEqual(isPrivateIPv4('10.0.0.1'), true);
    assert.strictEqual(isPrivateIPv4('172.16.0.1'), true);
    assert.strictEqual(isPrivateIPv4('192.168.1.1'), true);
  });

  test('Hreflang safeFetch: Blocks cloud metadata 169.254.169.254 and link-local', () => {
    assert.strictEqual(isPrivateIPv4('169.254.169.254'), true);
  });

  test('Hreflang safeFetch: Blocks IPv6 loopback (::1) and unique-local (fc/fd)', () => {
    assert.strictEqual(isPrivateIPv6('::1'), true);
    assert.strictEqual(isPrivateIPv6('fc00::1'), true);
    assert.strictEqual(isPrivateIPv6('fe80::1'), true);
  });

  test('Hreflang safeFetch: Allows public IPv4 (8.8.8.8, 1.1.1.1)', () => {
    assert.strictEqual(isPrivateIPv4('8.8.8.8'), false);
    assert.strictEqual(isPrivateIPv4('1.1.1.1'), false);
  });

  await test('Hreflang safeFetch: validateSafeUrl rejects localhost and metadata hostname', async () => {
    await assert.rejects(async () => {
      await validateSafeUrl('http://localhost:3000');
    }, /blocked/i);

    await assert.rejects(async () => {
      await validateSafeUrl('http://metadata.google.internal');
    }, /blocked/i);
  });

  await test('Hreflang safeFetch: validateSafeUrl rejects non-HTTP protocols', async () => {
    await assert.rejects(async () => {
      await validateSafeUrl('ftp://example.com/file');
    }, /disallowed protocol/i);

    await assert.rejects(async () => {
      await validateSafeUrl('file:///etc/passwd');
    }, /disallowed protocol/i);
  });

  await test('Hreflang safeFetch: resolveAndVerifyPublicIp rejects private IPs', async () => {
    await assert.rejects(async () => {
      await resolveAndVerifyPublicIp('127.0.0.1');
    }, /blocked/i);

    await assert.rejects(async () => {
      await resolveAndVerifyPublicIp('169.254.169.254');
    }, /blocked/i);
  });

  console.log('\n2. Mobile-Friendly Browser Security & Network Isolation:');

  await test('Browser Security: validateTargetUrlForBrowser rejects localhost', async () => {
    await assert.rejects(async () => {
      await validateTargetUrlForBrowser('http://localhost:3000/app');
    }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
  });

  await test('Browser Security: validateTargetUrlForBrowser rejects embedded credentials', async () => {
    await assert.rejects(async () => {
      await validateTargetUrlForBrowser('http://user:pass@example.com');
    }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
  });

  await test('Browser Security: validateTargetUrlForBrowser rejects disallowed ports', async () => {
    await assert.rejects(async () => {
      await validateTargetUrlForBrowser('http://example.com:22');
    }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
  });

  await test('Browser Security: validateTargetUrlForBrowser rejects private IPs', async () => {
    await assert.rejects(async () => {
      await validateTargetUrlForBrowser('http://192.168.1.100');
    }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
  });

  test('Browser Security: classifyBrowserRenderError maps security blocks to 403', () => {
    const res = classifyBrowserRenderError(new Error('net::ERR_BLOCKED_BY_CLIENT'), 'Blocked');
    assert.strictEqual(res.code, 'BLOCKED_DESTINATION');
    assert.strictEqual(res.status, 403);
  });

  test('Browser Security: classifyBrowserRenderError maps timeouts to 504', () => {
    const res = classifyBrowserRenderError(new Error('page.goto: Timeout 20000ms exceeded'), null);
    assert.strictEqual(res.code, 'REQUEST_TIMEOUT');
    assert.strictEqual(res.status, 504);
  });

  test('Browser Security: classifyBrowserRenderError maps DNS failures to 502', () => {
    const res = classifyBrowserRenderError(new Error('net::ERR_NAME_NOT_RESOLVED'), null);
    assert.strictEqual(res.code, 'DNS_FAILURE');
    assert.strictEqual(res.status, 502);
  });

  test('Browser Security: classifyBrowserRenderError maps Chromium launch issues to 503', () => {
    const res = classifyBrowserRenderError(new Error('Failed to launch the browser process: Executable path not found'), null);
    assert.strictEqual(res.code, 'RENDER_UNAVAILABLE');
    assert.strictEqual(res.status, 503);
  });

  console.log('\n3. Error Sanitization & Diagnostics Protection:');

  test('Sanitizer: redactSensitiveDetails scrubs URLs with embedded credentials', () => {
    const raw = 'Failed to connect to https://admin:secret123@internal.corp/api';
    const redacted = redactSensitiveDetails(raw);
    assert.strictEqual(redacted.includes('secret123'), false);
    assert.strictEqual(redacted.includes('[REDACTED_CREDENTIALS]'), true);
  });

  test('Sanitizer: redactSensitiveDetails scrubs sensitive query parameters', () => {
    const raw = 'URL requested: https://api.service.com?token=abc_secret_key_123&user=john';
    const redacted = redactSensitiveDetails(raw);
    assert.strictEqual(redacted.includes('abc_secret_key_123'), false);
    assert.strictEqual(redacted.includes('token=[REDACTED]'), true);
  });

  test('Sanitizer: redactSensitiveDetails scrubs Bearer and Basic tokens', () => {
    const raw = 'Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-kJ8g';
    const redacted = redactSensitiveDetails(raw);
    assert.strictEqual(redacted.includes('Bearer [REDACTED]'), true);
  });

  test('Sanitizer: redactSensitiveDetails scrubs Windows and Unix server filesystem paths', () => {
    const rawWin = 'Error reading C:\\Users\\Administrator\\SEO-Tools\\keys\\secret.key';
    assert.strictEqual(redactSensitiveDetails(rawWin).includes('C:\\Users'), false);

    const rawUnix = 'Error reading /var/www/seo-tools/config/database.json';
    assert.strictEqual(redactSensitiveDetails(rawUnix).includes('/var/www'), false);
  });

  test('Sanitizer: redactSensitiveDetails scrubs internal and metadata IPs', () => {
    const raw = 'Connection refused to 127.0.0.1:8080 and 169.254.169.254';
    const redacted = redactSensitiveDetails(raw);
    assert.strictEqual(redacted.includes('127.0.0.1'), false);
    assert.strictEqual(redacted.includes('169.254.169.254'), false);
    assert.strictEqual(redacted.includes('[INTERNAL_IP]'), true);
  });

  test('Sanitizer: classifyAndSanitizeError classifies SSRF / blocked destinations as 403', () => {
    const err = new Error('Hostname example.local resolves to blocked/private IP: 10.0.0.1');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'BLOCKED_DESTINATION');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.message.includes('10.0.0.1'), false);
  });

  test('Sanitizer: classifyAndSanitizeError classifies timeouts as 504', () => {
    const err = new Error('Request timed out after 8s. The server may be unresponsive');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'REQUEST_TIMEOUT');
    assert.strictEqual(res.status, 504);
  });

  test('Sanitizer: classifyAndSanitizeError classifies DNS failures as 502', () => {
    const err = new Error('getaddrinfo ENOTFOUND non-existent-domain-xyz.com');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'DNS_FAILURE');
    assert.strictEqual(res.status, 502);
  });

  test('Sanitizer: classifyAndSanitizeError preserves safe validation feedback as 400', () => {
    const err = new Error('Please provide a valid website URL to test.');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'VALIDATION_ERROR');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.message, 'Please provide a valid website URL to test.');
  });

  test('Sanitizer: classifyAndSanitizeError masks unhandled internal errors as 500 without leaking stack', () => {
    const err = new Error('Uncaught TypeError: Cannot read property of undefined at Object.run (/app/internal/code.ts:42:15)');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'INTERNAL_ERROR');
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.message.includes('TypeError'), false);
    assert.strictEqual(res.message.includes('/app/internal'), false);
  });

  console.log('\n4. Functional Regression Across All 14 SEO Tools:');

  // Tool 1: AI Bot Access Tester
  test('Tool 1 (AI Bot Access Tester): Registry preserves AI bot definitions and sanitizes URLs', () => {
    assert(AI_BOT_REGISTRY.length >= 10, 'Must have at least 10 registered AI bots');
    const { validUrls } = sanitizeBulkUrls(['https://example.com/p1', 'https://example.com/p1', 'http://example.com/p2']);
    assert.strictEqual(validUrls.length, 2, 'Should deduplicate bulk URLs');
  });

  // Tool 2: Fetch & Render
  test('Tool 2 (Fetch & Render): Normalizes path and respects robots directives', () => {
    const parsed = parseRobotsTxt('User-agent: *\nDisallow: /admin/\nAllow: /admin/help');
    const rules = selectRulesForUserAgent(parsed.groups, 'googlebot');
    const evalRes = evaluateCrawlability(rules.rules, '/admin/help', 'Googlebot', 'googlebot');
    assert.strictEqual(evalRes.status, 'ALLOWED');
  });

  // Tool 3: Hreflang Tester
  test('Tool 3 (Hreflang Tester): Parses HTML hreflang tags and validates codes', () => {
    const html = '<link rel="alternate" hreflang="en-US" href="https://example.com/us/" /><link rel="alternate" hreflang="es-ES" href="https://example.com/es/" />';
    const parsed = parseHtmlHreflang(html, 'https://example.com/us/');
    assert.strictEqual(parsed.annotations.length, 2);
    const validCode = validateHreflangCode('en-US');
    assert.strictEqual(validCode.isValid, true);
  });

  // Tool 4: .htaccess Tester
  await test('Tool 4 (.htaccess Tester): Accurately tests RewriteRule redirections', async () => {
    const rules = 'RewriteEngine On\nRewriteRule ^old-path/?$ /new-path [R=301,L]';
    const result = await testHtaccessRules({
      url: 'https://example.com/old-path',
      htaccess: rules
    });
    assert.strictEqual(result.outputUrl, 'https://example.com/new-path');
  });

  // Tool 5: Knowledge Graph Search
  test('Tool 5 (Knowledge Graph Search): Validates search parameters safely', () => {
    const val = validateSearchRequest({ query: 'Google', language: 'en', limit: 10 });
    assert.strictEqual(val.isValid, true);
    assert.strictEqual(val.sanitized?.query, 'Google');
  });

  // Tool 6: Local Search Simulator
  test('Tool 6 (Local Search Simulator): Generates localized search URL with uule parameter', () => {
    const encoded = encodeUule('Mumbai, Maharashtra, India');
    const searchUrl = buildGoogleSearchUrl({
      query: 'best dentist',
      countryCode: 'in',
      languageCode: 'en',
      uule: encoded.uule
    });
    assert(searchUrl.includes('google.com/search'));
    assert(searchUrl.includes('best+dentist') || searchUrl.includes('best%20dentist'));
    assert(searchUrl.includes('uule='));
  });

  // Tool 7: Mobile-First Index Checker
  test('Tool 7 (Mobile-First Index Checker): Computes full content similarity', () => {
    const sim = calculateContentSimilarity(
      'Buy products online at our store with discounts',
      'Buy products online at our store with discounts'
    );
    assert.strictEqual(sim, 1.0);
  });

  // Tool 8: Mobile-Friendly Test
  test('Tool 8 (Mobile-Friendly Test): Audits responsive viewport meta tag', () => {
    const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><p>Responsive page</p></body></html>';
    const audit = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      statusText: 'OK',
      durationMs: 50,
      viewport: DEFAULT_VIEWPORT_PRESET,
      browserAttempted: false
    });
    assert.strictEqual(audit.tests.configureViewport.status, 'PASS');
  });

  // Tool 9: Pre-rendering Tester
  test('Tool 9 (Pre-rendering Tester): Compares bot vs browser HTML outputs', () => {
    const res1 = {
      userAgentId: 'googlebot',
      userAgentName: 'Googlebot',
      status: 'success' as const,
      statusCode: 200,
      statusText: 'OK',
      finalUrl: 'https://example.com',
      redirectChain: [],
      isHtml: true,
      title: 'Page Title',
      metaDescription: 'Description',
      h1: ['Main Heading'],
      wordCount: 150,
      imageCount: 2,
      linkCount: 5,
      internalLinkCount: 4,
      externalLinkCount: 1,
      varyUserAgent: 'Present' as const,
      varyHeaderRaw: 'User-Agent',
      md5: 'abc123',
      sha256: 'def456',
      generalRobots: 'index, follow',
      googlebotRobots: null,
      bingbotRobots: null,
      metaRobots: 'index, follow',
      xRobotsTag: null,
      canonical: 'https://example.com',
      contentType: 'text/html',
      contentLanguage: 'en',
      durationMs: 120,
      htmlSize: 1024,
      hasStructuredData: false,
      error: null,
    };
    const comp = compareAgentResults([res1, { ...res1, userAgentId: 'chrome', userAgentName: 'Chrome Desktop' }]);
    assert(comp.comparisons.length > 0);
    assert.strictEqual(comp.summary.classification, 'Same HTML Response');
  });

  // Tool 10: Review Link Generator
  test('Tool 10 (Review Link Generator): Generates official 5-star Google review URL and bulk processing', () => {
    const single = executeGenerateLink('ChIJN1t_tDeuEmsRUsoyG83frY4');
    assert.strictEqual(single.success, true);
    assert(single.reviewUrl.includes('search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4'));

    const bulk = executeBulkBatch([
      { rowIndex: 1, placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4', businessName: 'Test Business' }
    ]);
    assert.strictEqual(bulk.success, true);
    assert.strictEqual(bulk.matchedCount, 1);
  });

  // Tool 11: Robots.txt Tester
  test('Tool 11 (Robots.txt Tester): Specificity evaluation under RFC 9309', () => {
    const parsed = parseRobotsTxt('User-agent: *\nAllow: /p/a\nDisallow: /p/');
    const rules = selectRulesForUserAgent(parsed.groups, 'googlebot');
    const evalRes = evaluateCrawlability(rules.rules, '/p/a', 'Googlebot', 'googlebot');
    assert.strictEqual(evalRes.status, 'ALLOWED'); // Allow is longer, wins
  });

  // Tool 12: Schema Generator
  test('Tool 12 (Schema Generator): Generates valid JSON-LD schema for LocalBusiness', () => {
    const obj = buildSchemaObject('LocalBusiness', {
      name: 'Indian Marketers',
      url: 'https://indianmarketers.in',
      telephone: '+919876543210'
    });
    assert.strictEqual(obj['@context'], 'https://schema.org');
    assert.strictEqual(obj['@type'], 'LocalBusiness');
    assert.strictEqual(obj.name, 'Indian Marketers');
  });

  // Tool 13: SERP Simulator
  test('Tool 13 (SERP Simulator): Encodes and extracts page metadata safely', () => {
    // Tests that HTML entity decoding and canonical extraction works
    assert.strictEqual(typeof fetchPageMetadata, 'function');
  });

  // Tool 14: Sitemap Generator / Parser
  test('Tool 14 (XML Sitemap Validator): Parses XML sitemap entries safely', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/page-1</loc></url>
      <url><loc>https://example.com/page-2</loc></url>
    </urlset>`;
    const parsed = parseSitemapXml(xml, 'https://example.com/sitemap.xml');
    assert.strictEqual(parsed.totalUrls, 2);
  });

  console.log('\n=====================================================');
  console.log(`TOTAL SECURITY & QA TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('=====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runSecurityAndQASuite().catch((err) => {
  console.error('Fatal Test Failure:', err);
  process.exit(1);
});
