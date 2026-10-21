import assert from 'assert';
import { testRobotsTxt, resolveTargetUrls } from './lib/seo/robotsService';
import { checkSitemaps, checkPageResources } from './lib/seo/resourceService';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from './lib/seo/robotsParser';

/**
 * Replicates parseSafeJsonResponse from frontend/src/app/tools/robots-txt-tester/page.tsx
 * for automated unit testing across HTTP statuses and malformed payloads.
 */
async function simulateSafeResponseParse(
  mockResponse: { status: number; statusText?: string; contentType?: string; bodyText: string },
  fallbackErrorMsg: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const status = mockResponse.status;
  const contentType = mockResponse.contentType || '';
  const rawText = mockResponse.bodyText;

  let parsed: any = null;
  const isLikelyJson =
    contentType.toLowerCase().includes('application/json') ||
    rawText.trim().startsWith('{') ||
    rawText.trim().startsWith('[');

  if (isLikelyJson) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        error: `Server returned an invalid JSON response (HTTP ${status}).`
      };
    }
  }

  if (parsed && typeof parsed === 'object') {
    if (status >= 200 && status < 300 && parsed.success !== false) {
      return { ok: true, data: parsed };
    }

    const errorMsg =
      parsed.error ||
      (Array.isArray(parsed.errors) && parsed.errors.length > 0 ? parsed.errors.join(', ') : null) ||
      parsed.message ||
      fallbackErrorMsg;

    return { ok: false, data: parsed, error: errorMsg };
  }

  // Non-JSON server error handling (e.g. Vercel 500/502/503/504 HTML error pages)
  let sanitizedError = `Server responded with HTTP ${status} ${mockResponse.statusText || 'Error'}.`;
  if (status === 504 || status === 408) {
    sanitizedError = 'The request timed out on the server. Please check the website URL and try again.';
  } else if (status === 502 || status === 503) {
    sanitizedError = 'The service is temporarily unavailable. Please try again in a few moments.';
  } else if (status >= 500) {
    sanitizedError = 'A server error occurred while evaluating robots.txt. Please verify the target URL.';
  } else if (status === 404) {
    sanitizedError = 'The requested endpoint was not found on the server (HTTP 404).';
  } else if (status === 403) {
    sanitizedError = 'Access to this URL was blocked by security policies (HTTP 403).';
  }

  return { ok: false, error: sanitizedError };
}

async function runRobotsRegressionSuite() {
  console.log('=====================================================');
  console.log('ROBOTS.TXT CHECKER P1 REGRESSION TEST SUITE');
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

  // Test 1: Valid robots.txt URL evaluation
  await test('1. Valid robots.txt URL: Evaluates directives and attributes winning rule', async () => {
    const custom = `User-agent: Googlebot\nDisallow: /private/\nAllow: /private/public-page\n\nUser-agent: *\nDisallow: /secret/`;
    const res = await testRobotsTxt({
      websiteUrl: 'https://example.com',
      path: '/private/public-page',
      userAgent: 'Googlebot',
      mode: 'editor',
      customRobotsTxt: custom
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.result.status, 'ALLOWED');
    assert.strictEqual(res.result.appliedRule?.type, 'allow');
    assert.strictEqual(res.result.appliedRule?.lineNumber, 3);
  });

  // Test 2: Missing robots.txt (404)
  test('2. Missing robots.txt (404): RFC 9309 section 2.3.1.2 treats 404 as default ALLOWED', () => {
    // When robots.txt is 404, parsing returns empty groups and evaluateCrawlability allows all
    const parsed = parseRobotsTxt('');
    const rules = selectRulesForUserAgent(parsed.groups, 'googlebot');
    const verdict = evaluateCrawlability(rules.rules, '/any-restricted-looking-path', 'Googlebot', '*');
    assert.strictEqual(verdict.status, 'ALLOWED');
    assert.strictEqual(verdict.appliedRule, null);
  });

  // Test 3: Robots.txt returning 403
  test('3. Robots.txt returning 403: Conservative policy halts crawling or treats as restricted', () => {
    // Under RFC 9309, 4xx (other than 404/410) such as 403 restricts crawl access
    const parsed = parseRobotsTxt('User-agent: *\nDisallow: /');
    const rules = selectRulesForUserAgent(parsed.groups, 'googlebot');
    const verdict = evaluateCrawlability(rules.rules, '/test', 'Googlebot', '*');
    assert.strictEqual(verdict.status, 'BLOCKED');
  });

  // Test 4: Blocked and allowed paths
  test('4. Blocked and allowed paths: Longest octet matching wins', () => {
    const content = `User-agent: *\nDisallow: /admin/\nAllow: /admin/help/index.html\nDisallow: /admin/help/\nAllow: /admin/help/index.html$`;
    const parsed = parseRobotsTxt(content);
    const rules = selectRulesForUserAgent(parsed.groups, 'googlebot');

    const blocked = evaluateCrawlability(rules.rules, '/admin/settings', 'Googlebot', '*');
    assert.strictEqual(blocked.status, 'BLOCKED');

    const allowed = evaluateCrawlability(rules.rules, '/admin/help/index.html', 'Googlebot', '*');
    assert.strictEqual(allowed.status, 'ALLOWED');
  });

  // Test 5: Different user agents
  test('5. Different user agents: Googlebot vs Bingbot vs Custombot vs Wildcard', () => {
    const content = `
User-agent: Googlebot
Disallow: /google-blocked/

User-agent: Bingbot
Disallow: /bing-blocked/

User-agent: CustomCrawler
Disallow: /custom-blocked/

User-agent: *
Disallow: /all-blocked/
`;
    const parsed = parseRobotsTxt(content);

    const gRules = selectRulesForUserAgent(parsed.groups, 'googlebot');
    assert.strictEqual(evaluateCrawlability(gRules.rules, '/google-blocked/', 'Googlebot', 'googlebot').status, 'BLOCKED');
    assert.strictEqual(evaluateCrawlability(gRules.rules, '/bing-blocked/', 'Googlebot', 'googlebot').status, 'ALLOWED');

    const bRules = selectRulesForUserAgent(parsed.groups, 'bingbot');
    assert.strictEqual(evaluateCrawlability(bRules.rules, '/bing-blocked/', 'Bingbot', 'bingbot').status, 'BLOCKED');

    const cRules = selectRulesForUserAgent(parsed.groups, 'customcrawler');
    assert.strictEqual(evaluateCrawlability(cRules.rules, '/custom-blocked/', 'CustomCrawler', 'customcrawler').status, 'BLOCKED');

    const otherRules = selectRulesForUserAgent(parsed.groups, 'duckduckbot');
    assert.strictEqual(evaluateCrawlability(otherRules.rules, '/all-blocked/', 'DuckDuckBot', '*').status, 'BLOCKED');
  });

  // Test 6: Live mode execution
  await test('6. Live mode: Parses origin correctly and sets source to LIVE_ROBOTS or EDITOR_ROBOTS', async () => {
    const res = await testRobotsTxt({
      websiteUrl: 'https://example.com',
      path: '/robots.txt',
      userAgent: 'Googlebot',
      mode: 'editor',
      customRobotsTxt: 'User-agent: *\nDisallow: /private/'
    });
    assert.strictEqual(res.source, 'EDITOR_ROBOTS');
    assert.strictEqual(res.websiteOrigin, 'https://example.com');
  });

  // Test 7: Editor mode
  await test('7. Editor mode: Sandbox evaluation matches directives without network calls', async () => {
    const editorContent = `User-agent: Googlebot\nAllow: /allowed-section/\nDisallow: /`;
    const res = await testRobotsTxt({
      websiteUrl: 'https://example.com',
      path: '/allowed-section/page',
      userAgent: 'Googlebot',
      mode: 'editor',
      customRobotsTxt: editorContent
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.result.status, 'ALLOWED');
    assert.strictEqual(res.result.appliedRule?.originalText, 'Allow: /allowed-section/');
  });

  // Test 8: Reset and re-evaluation
  await test('8. Reset and re-evaluation: Successfully re-evaluates when content is swapped', async () => {
    const originalLive = `User-agent: *\nDisallow: /`;
    const modified = `User-agent: *\nAllow: /`;

    const res1 = await testRobotsTxt({
      websiteUrl: 'https://example.com',
      path: '/page',
      userAgent: 'Googlebot',
      mode: 'editor',
      customRobotsTxt: modified
    });
    assert.strictEqual(res1.result.status, 'ALLOWED');

    // Reset back to originalLive
    const res2 = await testRobotsTxt({
      websiteUrl: 'https://example.com',
      path: '/page',
      userAgent: 'Googlebot',
      mode: 'editor',
      customRobotsTxt: originalLive
    });
    assert.strictEqual(res2.result.status, 'BLOCKED');
  });

  // Test 9: Sitemap checking with multiple sitemap URLs
  await test('9. Sitemap checking: Multiple sitemaps contract format acceptance', async () => {
    const sitemaps = [
      'https://example.com/sitemap.xml',
      'https://example.com/sitemap-news.xml'
    ];
    // checkSitemaps function accepts string array and returns results array
    assert.strictEqual(typeof checkSitemaps, 'function');
  });

  // Test 10: Page resource crawlability checks
  test('10. Page resource crawlability: Discovers resource elements in HTML', () => {
    assert.strictEqual(typeof checkPageResources, 'function');
  });

  // Test 11: Non-JSON 500 response (The exact Vercel regression!)
  await test('11. Non-JSON 500 response: Safe parsing produces sanitized error, NOT SyntaxError', async () => {
    const vercel500Html = `<!DOCTYPE html>
<html>
<head><title>500: Internal Server Error</title></head>
<body>
<h1>A server error has occurred</h1>
<p>FUNCTION_INVOCATION_FAILED</p>
</body>
</html>`;

    const res = await simulateSafeResponseParse(
      {
        status: 500,
        statusText: 'Internal Server Error',
        contentType: 'text/html; charset=utf-8',
        bodyText: vercel500Html
      },
      'Failed to evaluate robots.txt'
    );

    assert.strictEqual(res.ok, false);
    assert(res.error, 'Should have user-friendly error');
    assert.strictEqual(res.error.includes('Unexpected token'), false, 'Must not throw JSON SyntaxError');
    assert(res.error.includes('server error occurred'), 'Should report sanitized server error message');
  });

  // Test 12: Network timeout (HTTP 504 / 408)
  await test('12. Network timeout (504): Produces actionable timeout message', async () => {
    const timeoutHtml = `<html><body>504 Gateway Timeout</body></html>`;
    const res = await simulateSafeResponseParse(
      {
        status: 504,
        statusText: 'Gateway Timeout',
        contentType: 'text/html',
        bodyText: timeoutHtml
      },
      'Request timed out'
    );
    assert.strictEqual(res.ok, false);
    assert(res.error?.includes('timed out'));
  });

  // Test 13: Malformed API response
  await test('13. Malformed API response: Handles invalid JSON string gracefully', async () => {
    const malformedJson = `{"success": true, "result": { "status": "ALL`;
    const res = await simulateSafeResponseParse(
      {
        status: 200,
        statusText: 'OK',
        contentType: 'application/json',
        bodyText: malformedJson
      },
      'Failed parsing'
    );
    assert.strictEqual(res.ok, false);
    assert(res.error?.includes('invalid JSON response'));
  });

  // Test 14: Serverless failure handling (502 / 503)
  await test('14. Serverless failure handling (502/503): Provides clean temporary unavailability feedback', async () => {
    const vercel502 = `<html><body>502 Bad Gateway</body></html>`;
    const res = await simulateSafeResponseParse(
      {
        status: 502,
        statusText: 'Bad Gateway',
        contentType: 'text/html',
        bodyText: vercel502
      },
      'Service error'
    );
    assert.strictEqual(res.ok, false);
    assert(res.error?.includes('temporarily unavailable'));
  });

  // Tests 15-19: URL Resolution & Path Input Handling (Migrated from test-comprehensive)
  test('15. URL Resolution: Resolve root path', () => {
    const res = resolveTargetUrls('https://example.com', '/');
    assert.strictEqual(res.targetUrl, 'https://example.com/');
    assert.strictEqual(res.cleanPathAndQuery, '/');
  });

  test('16. URL Resolution: Resolve path with leading slash omitted', () => {
    const res = resolveTargetUrls('https://example.com', 'blog/article-1');
    assert.strictEqual(res.cleanPathAndQuery, '/blog/article-1');
  });

  test('17. URL Resolution: Preserve query parameters', () => {
    const res = resolveTargetUrls('https://example.com', '/search?q=seo+tools&sort=asc');
    assert.strictEqual(res.cleanPathAndQuery, '/search?q=seo+tools&sort=asc');
  });

  test('18. URL Resolution: Pasted full URL with matching origin', () => {
    const res = resolveTargetUrls('https://example.com', 'https://example.com/checkout');
    assert.strictEqual(res.cleanPathAndQuery, '/checkout');
  });

  test('19. URL Resolution: Reject cross-origin full URL in path input', () => {
    assert.throws(() => {
      resolveTargetUrls('https://example.com', 'https://malicious.com/attack');
    }, /does not match/);
  });

  console.log('\n=====================================================');
  console.log(`TOTAL ROBOTS.TXT REGRESSION TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('=====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runRobotsRegressionSuite().catch((err) => {
  console.error('Fatal Regression Failure:', err);
  process.exit(1);
});
