import { isPrivateOrReservedIP, isBlockedHostname } from './lib/seo/ssrf';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability, normalizePathAndQuery } from './lib/seo/robotsParser';
import { testRobotsTxt, resolveTargetUrls } from './lib/seo/robotsService';
import { checkSitemaps, checkPageResources } from './lib/seo/resourceService';
import assert from 'assert';

async function runComprehensiveVerification() {
  console.log('=====================================================');
  console.log('ROBOTS.TXT TESTER — COMPREHENSIVE TEST CASE SUITE');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function testCase(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ✗ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  async function testCaseAsync(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ✗ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  // 1. URL Resolution & Path Handling
  console.log('1. URL Resolution & Path Input Handling:');
  testCase('Resolve root path', () => {
    const res = resolveTargetUrls('https://example.com', '/');
    assert.strictEqual(res.targetUrl, 'https://example.com/');
    assert.strictEqual(res.cleanPathAndQuery, '/');
  });

  testCase('Resolve path with leading slash omitted', () => {
    const res = resolveTargetUrls('https://example.com', 'blog/article-1');
    assert.strictEqual(res.cleanPathAndQuery, '/blog/article-1');
  });

  testCase('Preserve query parameters', () => {
    const res = resolveTargetUrls('https://example.com', '/search?q=seo+tools&sort=asc');
    assert.strictEqual(res.cleanPathAndQuery, '/search?q=seo+tools&sort=asc');
  });

  testCase('Pasted full URL with matching origin', () => {
    const res = resolveTargetUrls('https://example.com', 'https://example.com/checkout');
    assert.strictEqual(res.cleanPathAndQuery, '/checkout');
  });

  testCase('Reject cross-origin full URL in path input', () => {
    assert.throws(() => {
      resolveTargetUrls('https://example.com', 'https://malicious.com/attack');
    }, /does not match/);
  });

  // 2. SSRF Protections
  console.log('\n2. SSRF Security Filters:');
  testCase('Block localhost and internal domains', () => {
    assert.strictEqual(isBlockedHostname('localhost'), true);
    assert.strictEqual(isBlockedHostname('metadata.google.internal'), true);
    assert.strictEqual(isBlockedHostname('server.local'), true);
  });

  testCase('Block loopback and private IPv4 ranges', () => {
    assert.strictEqual(isPrivateOrReservedIP('127.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('10.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('192.168.1.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('172.16.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('169.254.169.254'), true);
  });

  testCase('Allow valid public IP', () => {
    assert.strictEqual(isPrivateOrReservedIP('8.8.8.8'), false);
    assert.strictEqual(isPrivateOrReservedIP('1.1.1.1'), false);
  });

  // 3. RFC 9309 Rules & Specificity Matching
  console.log('\n3. RFC 9309 Rules & Specificity Matching:');
  const sampleRobots = `
User-agent: *
Disallow: /admin/
Allow: /admin/public/
Allow: /admin/login$
Disallow: /*.pdf$
Disallow: /folder/*/secret
Allow: /folder/open/secret

User-agent: Googlebot
Disallow: /google-block/
Allow: /google-block/allowed.html

User-agent: Googlebot
Disallow: /repeated-block/
`;

  const parsed = parseRobotsTxt(sampleRobots);
  const wildcardGroup = selectRulesForUserAgent(parsed.groups, '*');
  const googlebotGroup = selectRulesForUserAgent(parsed.groups, 'googlebot');

  testCase('Specificity: Allow overrides Disallow when longer', () => {
    const m = evaluateCrawlability(wildcardGroup.rules, '/admin/public/page', 'Generic', '*');
    assert.strictEqual(m.status, 'ALLOWED');
    assert.strictEqual(m.appliedRule?.type, 'allow');
    assert.strictEqual(m.appliedRule?.pattern, '/admin/public/');
  });

  testCase('Specificity: Disallow blocks when matching longer pattern', () => {
    const m = evaluateCrawlability(wildcardGroup.rules, '/admin/private', 'Generic', '*');
    assert.strictEqual(m.status, 'BLOCKED');
    assert.strictEqual(m.appliedRule?.type, 'disallow');
  });

  testCase('End of string $ anchor matching', () => {
    const exact = evaluateCrawlability(wildcardGroup.rules, '/admin/login', 'Generic', '*');
    assert.strictEqual(exact.status, 'ALLOWED');
    const extended = evaluateCrawlability(wildcardGroup.rules, '/admin/login/dashboard', 'Generic', '*');
    assert.strictEqual(extended.status, 'BLOCKED');
  });

  testCase('Wildcard * pattern matching (*.pdf$)', () => {
    const pdf = evaluateCrawlability(wildcardGroup.rules, '/docs/report.pdf', 'Generic', '*');
    assert.strictEqual(pdf.status, 'BLOCKED');
    const html = evaluateCrawlability(wildcardGroup.rules, '/docs/report.html', 'Generic', '*');
    assert.strictEqual(html.status, 'ALLOWED');
  });

  testCase('Equal specificity tie-breaker: Allow wins over Disallow per RFC 9309', () => {
    const tieRobots = `User-agent: *\nDisallow: /page\nAllow: /page`;
    const p = parseRobotsTxt(tieRobots);
    const grp = selectRulesForUserAgent(p.groups, '*');
    const res = evaluateCrawlability(grp.rules, '/page', 'Generic', '*');
    assert.strictEqual(res.status, 'ALLOWED');
    assert.strictEqual(res.appliedRule?.type, 'allow');
  });

  testCase('Consolidate repeated User-agent blocks', () => {
    assert.strictEqual(googlebotGroup.rules.length, 3);
    const r1 = evaluateCrawlability(googlebotGroup.rules, '/google-block/item', 'Googlebot', 'googlebot');
    const r2 = evaluateCrawlability(googlebotGroup.rules, '/repeated-block/item', 'Googlebot', 'googlebot');
    assert.strictEqual(r1.status, 'BLOCKED');
    assert.strictEqual(r2.status, 'BLOCKED');
  });

  // 4. Live Sandbox Editor Simulation Mode
  console.log('\n4. Live Sandbox Editor:');
  await testCaseAsync('Custom editor simulation without live network overwrite', async () => {
    const customTxt = `User-agent: *\nDisallow: /custom-secret/\nAllow: /custom-secret/public`;
    const res = await testRobotsTxt({
      websiteUrl: 'https://example.com',
      path: '/custom-secret/private',
      userAgent: 'Googlebot',
      mode: 'editor',
      customRobotsTxt: customTxt
    });
    assert.strictEqual(res.source, 'EDITOR_ROBOTS');
    assert.strictEqual(res.result.status, 'BLOCKED');
    assert.strictEqual(res.result.appliedRule?.lineNumber, 2);
  });

  // 5. XML Sitemap Directives Extraction
  console.log('\n5. XML Sitemaps Detection:');
  testCase('Extract all sitemap declarations', () => {
    const txt = `Sitemap: https://example.com/sitemap.xml\nSitemap: https://example.com/sitemap-news.xml`;
    const p = parseRobotsTxt(txt);
    assert.strictEqual(p.sitemaps.length, 2);
    assert.strictEqual(p.sitemaps[0].url, 'https://example.com/sitemap.xml');
    assert.strictEqual(p.sitemaps[1].url, 'https://example.com/sitemap-news.xml');
  });

  // 6. Live Website Verification
  console.log('\n6. Live Website Verification (Wikipedia & Barbeque Nation):');
  await testCaseAsync('Wikipedia /wiki/Special:Search is Disallowed by line 156', async () => {
    const res = await testRobotsTxt({
      websiteUrl: 'https://en.wikipedia.org',
      path: '/wiki/Special:Search',
      userAgent: 'Googlebot'
    });
    assert.strictEqual(res.result.status, 'BLOCKED');
    assert.strictEqual(res.result.appliedRule?.type, 'disallow');
    assert.strictEqual(res.result.appliedRule?.pattern, '/wiki/Special:');
  });

  await testCaseAsync('Barbeque Nation root / is Allowed by Allow: /', async () => {
    const res = await testRobotsTxt({
      websiteUrl: 'https://www.barbequenation.com',
      path: '/',
      userAgent: 'Googlebot'
    });
    assert.strictEqual(res.result.status, 'ALLOWED');
    assert.strictEqual(res.result.appliedRule?.type, 'allow');
  });

  console.log('\n=====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensiveVerification();
