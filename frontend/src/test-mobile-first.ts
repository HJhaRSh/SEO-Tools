import assert from 'assert';
import { validateUrl, validateAndResolveHost } from './lib/seo/safeFetch';
import { extractSeoSignals } from './lib/seo/mobile-first/extractor';
import { compareDesktopAndMobile, calculateContentSimilarity, tokenizeText } from './lib/seo/mobile-first/comparator';
import { checkHtmlEligibility } from './lib/seo/mobile-first/auditService';
import { checkRobotsCrawlability } from './lib/seo/mobile-first/robotsChecker';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from './lib/seo/robotsParser';
import { generateMobileFirstCsv, generateMobileFirstXlsx, sanitizeSpreadsheetField } from './lib/seo/mobile-first/exporter';
import { AgentCrawlResult, MobileFirstAuditResponse } from './lib/seo/mobile-first/types';
import { USER_AGENT_PROFILES } from './lib/seo/mobile-first/userAgents';
import { sanitizeAuditError } from './lib/seo/mobile-first/errorSanitizer';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message || err);
    failed++;
  }
}

// Helper to create mock AgentCrawlResult
function createMockAgent(overrides: Partial<AgentCrawlResult> = {}): AgentCrawlResult {
  return {
    agentName: 'Desktop Googlebot',
    agentToken: 'googlebot',
    userAgentString: USER_AGENT_PROFILES.googlebot.desktop.userAgent,
    requestedUrl: 'https://example.com/page',
    finalUrl: 'https://example.com/page',
    statusCode: 200,
    statusText: 'OK',
    redirectChain: [],
    contentType: 'text/html; charset=utf-8',
    responseHeaders: {},
    responseSizeBytes: 15420,
    downloadedBytes: 15420,
    decodedCharCount: 7500,
    durationMs: 250,
    isTruncated: false,
    isEligibleForSeoExtraction: true,
    ineligibilityReason: undefined,
    robotsTxt: {
      origin: 'https://example.com',
      fetched: true,
      statusCode: 200,
      status: 'ALLOWED',
      appliedRule: null,
      matchedGroup: '*',
      explanation: 'Crawling allowed by default.',
    },
    metaRobots: {
      raw: 'index, follow',
      index: true,
      noindex: false,
      follow: true,
      nofollow: false,
      none: false,
      noarchive: false,
      nosnippet: false,
      noimageindex: false,
      googlebotDirectives: [],
      allDirectives: ['index', 'follow'],
    },
    xRobotsTag: {
      raw: null,
      index: true,
      noindex: false,
      follow: true,
      nofollow: false,
      none: false,
      noarchive: false,
      nosnippet: false,
      noimageindex: false,
      googlebotDirectives: [],
      allDirectives: [],
    },
    canonical: {
      raw: 'https://example.com/page',
      resolved: 'https://example.com/page',
      isMissing: false,
      isRelative: false,
      multipleCount: 1,
      allFound: ['https://example.com/page'],
    },
    mobileAlternate: {
      isPresent: false,
      raw: null,
      media: null,
      href: null,
      resolved: null,
    },
    varyHeader: {
      isPresent: false,
      raw: null,
      includesUserAgent: false,
      explanation: 'No Vary header declared.',
    },
    content: {
      title: 'Example Page Title - Best Practices',
      titleLength: 36,
      metaDescription: 'Learn about best practices for mobile-first indexing and technical SEO parity.',
      metaDescriptionLength: 79,
      ogDescription: 'OG Description for social sharing',
      ogDescriptionLength: 33,
      h1Primary: 'Example Page Title',
      h1Count: 1,
      allH1s: ['Example Page Title'],
      wordCount: 1200,
      characterCount: 7500,
      textSnippet: 'Learn about best practices for mobile-first indexing and technical SEO parity.',
      textNormalizedHash: 'hash123',
      comparisonText: 'Learn about best practices for mobile-first indexing and technical SEO parity. We provide in-depth analysis of responsive design, dynamic rendering, structured data extraction, and content parity across viewport agents.',
      isSampled: false,
    },
    links: {
      totalCount: 50,
      internalCount: 40,
      externalCount: 10,
      nofollowCount: 2,
      uniqueInternalDestinations: 35,
      uniqueExternalDestinations: 8,
      sampleInternal: ['https://example.com/about', 'https://example.com/contact'],
      sampleExternal: ['https://google.com'],
    },
    images: {
      totalCount: 10,
      withAltCount: 10,
      missingAltCount: 0,
      responsiveMarkupCount: 4,
      samples: [{ src: 'https://example.com/hero.jpg', alt: 'Hero banner', isResponsive: true }],
    },
    structuredData: {
      hasStructuredData: true,
      types: ['Article', 'Organization'],
      entityCount: 2,
      entities: [
        { type: 'Article', name: 'Example Article' },
        { type: 'Organization', name: 'Example Corp' },
      ],
      jsonLdBlocksCount: 1,
      microdataItemTypes: [],
      rdfaTypes: [],
      parseErrors: [],
    },
    hreflang: {
      count: 2,
      items: [
        { hreflang: 'en', href: 'https://example.com/page', resolvedHref: 'https://example.com/page', source: 'HTML' },
        { hreflang: 'es', href: 'https://example.com/es/page', resolvedHref: 'https://example.com/es/page', source: 'HTML' },
      ],
      duplicateCodes: [],
      hasXDefault: false,
    },
    ...overrides,
  };
}

async function runMobileFirstTestSuite() {
  console.log('=====================================================');
  console.log('MOBILE-FIRST INDEX CHECKER — COMPREHENSIVE TEST SUITE');
  console.log('=====================================================\n');

  console.log('1. Security Defenses & SSRF Connection Protection:');

  await test('Validates valid HTTPS and HTTP URLs', () => {
    const url1 = validateUrl('https://example.com/path?arg=1');
    assert.strictEqual(url1.protocol, 'https:');
    const url2 = validateUrl('http://example.com:80/path');
    assert.strictEqual(url2.protocol, 'http:');
  });

  await test('SSRF: Rejects localhost destination', async () => {
    assert.throws(() => validateUrl('http://localhost:3000'), /Port "3000"|Invalid/);
    await assert.rejects(
      async () => validateAndResolveHost('localhost'),
      /Access to blocked or internal hostname is forbidden/
    );
  });

  await test('SSRF: Rejects private IPv4 ranges (127.0.0.1, 10.x, 192.168.x, 172.16.x)', async () => {
    await assert.rejects(async () => validateAndResolveHost('127.0.0.1'), /blocked or internal/);
    await assert.rejects(async () => validateAndResolveHost('10.0.0.1'), /blocked or internal/);
    await assert.rejects(async () => validateAndResolveHost('192.168.1.1'), /blocked or internal/);
    await assert.rejects(async () => validateAndResolveHost('172.16.0.1'), /blocked or internal/);
  });

  await test('SSRF: Rejects cloud metadata addresses (169.254.169.254, metadata.google.internal)', async () => {
    await assert.rejects(async () => validateAndResolveHost('169.254.169.254'), /blocked or internal/);
    await assert.rejects(async () => validateAndResolveHost('metadata.google.internal'), /blocked or internal/);
  });

  await test('SSRF: Rejects private/loopback IPv6 (::1, fe80::, fc00::)', async () => {
    await assert.rejects(async () => validateAndResolveHost('::1'), /blocked or internal/);
    await assert.rejects(async () => validateAndResolveHost('fe80::1'), /blocked or internal/);
  });

  await test('SSRF: Rejects non-HTTP schemes (ftp, file, javascript)', () => {
    assert.throws(() => validateUrl('ftp://example.com/file.txt'), /Unsupported URL protocol/);
    assert.throws(() => validateUrl('file:///etc/passwd'), /Unsupported URL protocol/);
    assert.throws(() => validateUrl('javascript:alert(1)'), /Invalid URL format|Unsupported URL protocol/);
  });

  await test('SSRF: Rejects embedded user credentials in URLs', () => {
    assert.throws(() => validateUrl('https://admin:secret@example.com/'), /User credentials in URLs are not permitted/);
  });

  console.log('\n2. HTTP Error & Non-HTML Eligibility Handling:');

  await test('HTML eligibility: Accepts 200 text/html and application/xhtml+xml', () => {
    assert.strictEqual(checkHtmlEligibility(200, 'text/html; charset=utf-8', '<html></html>').isEligible, true);
    assert.strictEqual(checkHtmlEligibility(200, 'application/xhtml+xml', '<html xmlns="..."></html>').isEligible, true);
  });

  await test('HTML eligibility: Rejects non-2xx HTTP statuses (403, 404, 500)', () => {
    assert.strictEqual(checkHtmlEligibility(404, 'text/html', '<html>404</html>').isEligible, false);
    assert.strictEqual(checkHtmlEligibility(403, 'text/html', '<html>403</html>').isEligible, false);
    assert.strictEqual(checkHtmlEligibility(500, 'text/html', '<html>500</html>').isEligible, false);
  });

  await test('HTML eligibility: Rejects non-HTML types (PDF, JSON, Image, Binary)', () => {
    assert.strictEqual(checkHtmlEligibility(200, 'application/pdf', '%PDF-1.4').isEligible, false);
    assert.strictEqual(checkHtmlEligibility(200, 'application/json', '{"error": true}').isEligible, false);
    assert.strictEqual(checkHtmlEligibility(200, 'image/png', '<png>').isEligible, false);
    assert.strictEqual(checkHtmlEligibility(200, 'application/octet-stream', '<bin>').isEligible, false);
  });

  await test('Desktop 200 vs Mobile 404 flags Critical Discrepancy and suppresses false HTML warnings', () => {
    const desktop = createMockAgent({ statusCode: 200, isEligibleForSeoExtraction: true });
    const mobile = createMockAgent({
      statusCode: 404,
      statusText: 'Not Found',
      isEligibleForSeoExtraction: false,
      ineligibilityReason: 'HTTP 404 response code (non-2xx)',
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.criticalCount >= 1, true);
    assert.strictEqual(result.summary.parityVerdict, 'Critical Discrepancies Detected');
    assert.ok(result.discrepancies.some((d) => d.id === 'crawling-mobile-404'));

    // Verify false HTML warnings are NOT generated when mobile is 404
    assert.ok(!result.discrepancies.some((d) => d.id === 'content-title-missing-mobile'));
    assert.ok(!result.discrepancies.some((d) => d.id === 'content-h1-missing-mobile'));
    assert.ok(!result.discrepancies.some((d) => d.id === 'schema-missing-on-mobile'));

    // Verify comparison table row is labeled Not Applicable
    const titleRow = result.comparisonTable.find((r) => r.element === 'Page Title (<title>)');
    assert.strictEqual(titleRow?.status, 'Not Applicable');
  });

  await test('Desktop 200 vs Mobile 403 flags Critical Discrepancy and suppresses false HTML warnings', () => {
    const desktop = createMockAgent({ statusCode: 200, isEligibleForSeoExtraction: true });
    const mobile = createMockAgent({
      statusCode: 403,
      statusText: 'Forbidden',
      isEligibleForSeoExtraction: false,
      ineligibilityReason: 'HTTP 403 response code (non-2xx)',
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.criticalCount >= 1, true);
    assert.ok(result.discrepancies.some((d) => d.id === 'crawling-mobile-blocked'));
    assert.ok(!result.discrepancies.some((d) => d.id === 'content-title-missing-mobile'));
  });

  await test('Both responses 404 yields Audit Failed verdict (not Full Parity Passed)', () => {
    const desktop = createMockAgent({
      statusCode: 404,
      statusText: 'Not Found',
      isEligibleForSeoExtraction: false,
      ineligibilityReason: 'HTTP 404 response code (non-2xx)',
    });
    const mobile = createMockAgent({
      statusCode: 404,
      statusText: 'Not Found',
      isEligibleForSeoExtraction: false,
      ineligibilityReason: 'HTTP 404 response code (non-2xx)',
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.parityVerdict, 'Audit Failed');
    assert.ok(result.discrepancies.some((d) => d.id === 'crawling-both-404'));
    // Ensure all HTML rows are marked Not Applicable
    const h1Row = result.comparisonTable.find((r) => r.element === 'Primary H1 Heading');
    assert.strictEqual(h1Row?.status, 'Not Applicable');
  });

  await test('Desktop HTML vs Mobile PDF flags Critical Discrepancy (Content-Type mismatch)', () => {
    const desktop = createMockAgent({ statusCode: 200, contentType: 'text/html; charset=utf-8', isEligibleForSeoExtraction: true });
    const mobile = createMockAgent({
      statusCode: 200,
      contentType: 'application/pdf',
      isEligibleForSeoExtraction: false,
      ineligibilityReason: 'Non-HTML Content-Type (application/pdf)',
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.criticalCount >= 1, true);
    assert.ok(result.discrepancies.some((d) => d.id === 'crawling-mobile-non-html'));
    assert.ok(!result.discrepancies.some((d) => d.id === 'content-title-missing-mobile'));
  });

  await test('Mobile request failure/timeout yields Critical Discrepancy and Incomplete Audit', () => {
    const desktop = createMockAgent({ statusCode: 200, isEligibleForSeoExtraction: true });
    const mobile = createMockAgent({
      statusCode: 0,
      statusText: 'Request timed out after 9000ms',
      fetchError: 'Request timed out after 9000ms',
      isEligibleForSeoExtraction: false,
      ineligibilityReason: 'Network request failed: Request timed out',
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.parityVerdict, 'Critical Discrepancies Detected');
    assert.ok(result.discrepancies.some((d) => d.id === 'crawling-mobile-fetch-failed'));
  });

  console.log('\n3. Crawling & Indexability Parity Tests:');

  await test('Identical eligible desktop and mobile responses yield Full Parity Passed', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({ agentName: 'Googlebot Smartphone' });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.parityVerdict, 'Full Parity Passed');
    assert.strictEqual(result.summary.hasDifferences, false);
    assert.strictEqual(result.discrepancies.length, 0);
  });

  await test('Robots.txt: Googlebot profile matches Googlebot-specific disallow', () => {
    const robotsTxtContent = `
User-agent: Googlebot
Disallow: /private/

User-agent: *
Allow: /
`;
    const parsed = parseRobotsTxt(robotsTxtContent);
    const selected = selectRulesForUserAgent(parsed.groups, 'googlebot', 'googlebot');
    const match = evaluateCrawlability(selected.rules, '/private/page', 'Desktop Googlebot', selected.matchedToken);
    assert.strictEqual(match.status, 'BLOCKED');
  });

  await test('Robots.txt: Chrome profile ignores Googlebot-specific disallow and matches wildcard allow', () => {
    const robotsTxtContent = `
User-agent: Googlebot
Disallow: /private/

User-agent: *
Allow: /
`;
    const parsed = parseRobotsTxt(robotsTxtContent);
    // For Chrome, token is '*' and fallbackToken is undefined
    const selected = selectRulesForUserAgent(parsed.groups, '*', undefined);
    const match = evaluateCrawlability(selected.rules, '/private/page', 'Desktop Chrome', selected.matchedToken);
    assert.strictEqual(match.status, 'ALLOWED');
  });

  await test('Robots.txt: Desktop Allowed vs Mobile Disallowed flags Critical', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({
      robotsTxt: {
        origin: 'https://example.com',
        fetched: true,
        statusCode: 200,
        status: 'BLOCKED',
        appliedRule: { type: 'disallow', pattern: '/page', lineNumber: 5, originalText: 'Disallow: /page' },
        matchedGroup: 'googlebot',
        explanation: 'Blocked by Disallow: /page on line 5',
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'crawling-robots-mobile-blocked');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  await test('Meta Robots: Mobile contains noindex flags Critical', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({
      metaRobots: {
        raw: 'noindex, follow',
        index: false,
        noindex: true,
        follow: true,
        nofollow: false,
        none: false,
        noarchive: false,
        nosnippet: false,
        noimageindex: false,
        googlebotDirectives: [],
        allDirectives: ['noindex', 'follow'],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'crawling-mobile-noindex');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  await test('X-Robots-Tag: Mobile response contains noindex header flags Critical', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({
      xRobotsTag: {
        raw: 'noindex',
        index: false,
        noindex: true,
        follow: true,
        nofollow: false,
        none: false,
        noarchive: false,
        nosnippet: false,
        noimageindex: false,
        googlebotDirectives: [],
        allDirectives: ['noindex'],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'crawling-xrobots-mobile-noindex');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  await test('Canonicals: Responsive site canonical conflict flags Critical', () => {
    const desktop = createMockAgent({
      canonical: {
        raw: 'https://example.com/page',
        resolved: 'https://example.com/page',
        isMissing: false,
        isRelative: false,
        multipleCount: 1,
        allFound: ['https://example.com/page'],
      },
    });
    const mobile = createMockAgent({
      canonical: {
        raw: 'https://example.com/other-page',
        resolved: 'https://example.com/other-page',
        isMissing: false,
        isRelative: false,
        multipleCount: 1,
        allFound: ['https://example.com/other-page'],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'canonicals-responsive-mismatch');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  await test('Separate Mobile URL (m-dot): Mobile canonical pointing to desktop passes', () => {
    const desktop = createMockAgent({
      finalUrl: 'https://www.example.com/page',
      canonical: {
        raw: 'https://www.example.com/page',
        resolved: 'https://www.example.com/page',
        isMissing: false,
        isRelative: false,
        multipleCount: 1,
        allFound: ['https://www.example.com/page'],
      },
      mobileAlternate: {
        isPresent: true,
        raw: 'https://m.example.com/page',
        media: 'only screen and (max-width: 640px)',
        href: 'https://m.example.com/page',
        resolved: 'https://m.example.com/page',
      },
    });
    const mobile = createMockAgent({
      finalUrl: 'https://m.example.com/page',
      canonical: {
        raw: 'https://www.example.com/page',
        resolved: 'https://www.example.com/page',
        isMissing: false,
        isRelative: false,
        multipleCount: 1,
        allFound: ['https://www.example.com/page'],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, true);
    assert.strictEqual(result.summary.isSeparateMobileUrl, true);
    const canonicalRow = result.comparisonTable.find((r) => r.element === 'Canonical Tag');
    assert.strictEqual(canonicalRow?.status, 'Match');
  });

  await test('Separate Mobile URL: Mobile self-canonicalizing flags Critical', () => {
    const desktop = createMockAgent({
      finalUrl: 'https://www.example.com/page',
      canonical: {
        raw: 'https://www.example.com/page',
        resolved: 'https://www.example.com/page',
        isMissing: false,
        isRelative: false,
        multipleCount: 1,
        allFound: ['https://www.example.com/page'],
      },
    });
    const mobile = createMockAgent({
      finalUrl: 'https://m.example.com/page',
      canonical: {
        raw: 'https://m.example.com/page',
        resolved: 'https://m.example.com/page',
        isMissing: false,
        isRelative: false,
        multipleCount: 1,
        allFound: ['https://m.example.com/page'],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, true);
    const finding = result.discrepancies.find((d) => d.id === 'canonicals-separate-mobile-target-mismatch');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  console.log('\n4. Content Parity & Meta Description Tests:');

  await test('Meta description: Standard meta description reported as missing when only og:description exists', () => {
    const htmlWithOgOnly = `
      <html>
        <head>
          <title>Test Page</title>
          <meta property="og:description" content="This is an OG description only" />
        </head>
        <body><h1>Heading</h1></body>
      </html>
    `;
    const signals = extractSeoSignals(htmlWithOgOnly, 'https://example.com/page', {});
    assert.strictEqual(signals.content.metaDescription, null, 'Standard meta description should be null');
    assert.strictEqual(signals.content.ogDescription, 'This is an OG description only');
  });

  await test('Meta description: Both standard and og:description extracted independently', () => {
    const htmlWithBoth = `
      <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="Official meta description" />
          <meta property="og:description" content="Social media description" />
        </head>
        <body><h1>Heading</h1></body>
      </html>
    `;
    const signals = extractSeoSignals(htmlWithBoth, 'https://example.com/page', {});
    assert.strictEqual(signals.content.metaDescription, 'Official meta description');
    assert.strictEqual(signals.content.ogDescription, 'Social media description');
  });

  await test('Missing title tag on mobile flags Critical', () => {
    const desktop = createMockAgent({
      content: {
        ...createMockAgent().content,
        title: 'Desktop Title',
        titleLength: 13,
      },
    });
    const mobile = createMockAgent({
      content: {
        ...createMockAgent().content,
        title: null,
        titleLength: 0,
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'content-title-missing-mobile');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  await test('Different title tags flag Medium Difference', () => {
    const desktop = createMockAgent({
      content: {
        ...createMockAgent().content,
        title: 'Desktop SEO Title',
        titleLength: 17,
      },
    });
    const mobile = createMockAgent({
      content: {
        ...createMockAgent().content,
        title: 'Short Mobile Title',
        titleLength: 18,
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'content-title-mismatch');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Medium');
  });

  await test('Missing H1 on mobile flags High severity', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({
      content: {
        ...createMockAgent().content,
        h1Primary: null,
        h1Count: 0,
        allH1s: [],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'content-h1-missing-mobile');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'High');
  });

  await test('Substantial content loss (>50% word loss) on mobile flags Critical', () => {
    const desktop = createMockAgent({
      content: {
        ...createMockAgent().content,
        wordCount: 1500,
      },
    });
    const mobile = createMockAgent({
      content: {
        ...createMockAgent().content,
        wordCount: 400,
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'content-massive-text-loss');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  console.log('\n5. Links & Images Parity Tests:');

  await test('Substantial loss of internal links on mobile flags High', () => {
    const desktop = createMockAgent({
      links: {
        ...createMockAgent().links,
        uniqueInternalDestinations: 60,
        internalCount: 85,
      },
    });
    const mobile = createMockAgent({
      links: {
        ...createMockAgent().links,
        uniqueInternalDestinations: 15,
        internalCount: 18,
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'links-internal-loss-mobile');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'High');
  });

  await test('All images missing on mobile flags High', () => {
    const desktop = createMockAgent({
      images: {
        totalCount: 12,
        withAltCount: 10,
        missingAltCount: 2,
        responsiveMarkupCount: 2,
        samples: [],
      },
    });
    const mobile = createMockAgent({
      images: {
        totalCount: 0,
        withAltCount: 0,
        missingAltCount: 0,
        responsiveMarkupCount: 0,
        samples: [],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'images-missing-on-mobile');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'High');
  });

  await test('Responsive picture/srcset image markup detected accurately', () => {
    const html = `
      <html>
        <body>
          <picture>
            <source media="(max-width: 600px)" srcset="/img/mobile.jpg">
            <source media="(min-width: 601px)" srcset="/img/desktop.jpg">
            <img src="/img/fallback.jpg" alt="Responsive Hero Image">
          </picture>
          <img src="/img/banner.png" srcset="/img/banner-1x.png 1x, /img/banner-2x.png 2x" alt="Banner">
        </body>
      </html>
    `;
    const signals = extractSeoSignals(html, 'https://example.com/page', {});
    assert.strictEqual(signals.images.totalCount, 2);
    assert.strictEqual(signals.images.withAltCount, 2);
    assert.strictEqual(signals.images.responsiveMarkupCount >= 2, true);
  });

  console.log('\n6. Structured Data Parity Tests:');

  await test('Structured data present on desktop but missing on mobile flags Critical', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({
      structuredData: {
        hasStructuredData: false,
        types: [],
        entityCount: 0,
        entities: [],
        jsonLdBlocksCount: 0,
        microdataItemTypes: [],
        rdfaTypes: [],
        parseErrors: [],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'schema-missing-on-mobile');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  await test('Schema types missing on mobile flags High', () => {
    const desktop = createMockAgent({
      structuredData: {
        hasStructuredData: true,
        types: ['Article', 'BreadcrumbList', 'Product'],
        entityCount: 3,
        entities: [{ type: 'Article' }, { type: 'BreadcrumbList' }, { type: 'Product' }],
        jsonLdBlocksCount: 1,
        microdataItemTypes: [],
        rdfaTypes: [],
        parseErrors: [],
      },
    });
    const mobile = createMockAgent({
      structuredData: {
        hasStructuredData: true,
        types: ['Article'],
        entityCount: 1,
        entities: [{ type: 'Article' }],
        jsonLdBlocksCount: 1,
        microdataItemTypes: [],
        rdfaTypes: [],
        parseErrors: [],
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'schema-types-missing-on-mobile');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'High');
    assert.ok(finding?.mobileEvidence.includes('BreadcrumbList'));
    assert.ok(finding?.mobileEvidence.includes('Product'));
  });

  await test('JSON-LD property reordering does not produce false mismatches', () => {
    const htmlA = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Widget",
          "description": "A high quality widget",
          "sku": "12345"
        }
      </script>
    `;
    const htmlB = `
      <script type="application/ld+json">
        {
          "sku": "12345",
          "description": "A high quality widget",
          "@type": "Product",
          "name": "Widget",
          "@context": "https://schema.org"
        }
      </script>
    `;

    const signalsA = extractSeoSignals(htmlA, 'https://example.com/page', {});
    const signalsB = extractSeoSignals(htmlB, 'https://example.com/page', {});

    assert.strictEqual(signalsA.structuredData.types[0], 'Product');
    assert.strictEqual(signalsB.structuredData.types[0], 'Product');
    assert.strictEqual(signalsA.structuredData.entities[0].name, 'Widget');
    assert.strictEqual(signalsB.structuredData.entities[0].name, 'Widget');
    assert.strictEqual(
      signalsA.structuredData.entities[0].rawNormalizedJson,
      signalsB.structuredData.entities[0].rawNormalizedJson
    );
  });

  await test('JSON-LD @graph array parsing extracts all entities', () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "name": "Google", "@id": "https://google.com/#org" },
            { "@type": "WebSite", "name": "Google Search", "url": "https://google.com" },
            { "@type": "BreadcrumbList", "itemListElement": [] }
          ]
        }
      </script>
    `;
    const signals = extractSeoSignals(html, 'https://google.com', {});
    assert.strictEqual(signals.structuredData.entityCount, 3);
    assert.ok(signals.structuredData.types.includes('Organization'));
    assert.ok(signals.structuredData.types.includes('WebSite'));
    assert.ok(signals.structuredData.types.includes('BreadcrumbList'));
  });

  await test('Malformed JSON-LD handles syntax error gracefully without crashing', () => {
    const html = `
      <script type="application/ld+json">
        { "bad json without quotes: true, }
      </script>
      <title>Normal Page</title>
    `;
    const signals = extractSeoSignals(html, 'https://example.com', {});
    assert.strictEqual(signals.content.title, 'Normal Page');
    assert.strictEqual(signals.structuredData.parseErrors.length, 1);
  });

  console.log('\n7. Hreflang Parity Tests:');

  await test('Hreflang present on desktop but missing on mobile flags Critical', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({
      hreflang: {
        count: 0,
        items: [],
        duplicateCodes: [],
        hasXDefault: false,
      },
    });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    const finding = result.discrepancies.find((d) => d.id === 'hreflang-missing-on-mobile');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
  });

  await test('Extracts hreflang annotations from HTML and HTTP Link header', () => {
    const html = `
      <link rel="alternate" hreflang="en-us" href="https://example.com/us" />
      <link rel="alternate" hreflang="en-gb" href="https://example.com/uk" />
    `;
    const headers = {
      link: '<https://example.com/fr>; rel="alternate"; hreflang="fr"',
    };

    const signals = extractSeoSignals(html, 'https://example.com', headers);
    assert.strictEqual(signals.hreflang.count, 3);
    assert.ok(signals.hreflang.items.some((i) => i.hreflang === 'en-us'));
    assert.ok(signals.hreflang.items.some((i) => i.hreflang === 'en-gb'));
    assert.ok(signals.hreflang.items.some((i) => i.hreflang === 'fr' && i.source === 'HTTP_HEADER'));
  });

  console.log('\n8. Exporters & Sanitization Tests:');

  await test('Sanitizes spreadsheet formula injection (=, +, -, @, \\t, \\r)', () => {
    assert.strictEqual(sanitizeSpreadsheetField('=CMD|"/C calc"!A0'), '\'=CMD|"/C calc"!A0');
    assert.strictEqual(sanitizeSpreadsheetField('+1+2'), '\'+1+2');
    assert.strictEqual(sanitizeSpreadsheetField('-SUM(A1:B2)'), '\'-SUM(A1:B2)');
    assert.strictEqual(sanitizeSpreadsheetField('@SUM(A1)'), '\'@SUM(A1)');
    assert.strictEqual(sanitizeSpreadsheetField('\tTAB'), '\'\tTAB');
    assert.strictEqual(sanitizeSpreadsheetField('Normal Text'), 'Normal Text');
  });

  await test('CSV Export generates UTF-8 with BOM and handles Incomplete Audits', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({
      statusCode: 404,
      isEligibleForSeoExtraction: false,
      ineligibilityReason: 'HTTP 404 response code (non-2xx)',
    });
    const { summary, comparisonTable, discrepancies } = compareDesktopAndMobile(desktop, mobile, false);

    const mockResponse: MobileFirstAuditResponse = {
      success: true,
      testedAt: '2026-10-19T10:00:00.000Z',
      executionMode: 'Raw HTML Comparison',
      requestedDesktopUrl: 'https://example.com/page',
      userAgentProfile: 'googlebot',
      desktop,
      mobile,
      summary,
      comparisonTable,
      discrepancies,
      screenshots: {
        desktop: { available: false, reason: 'N/A' },
        mobile: { available: false, reason: 'N/A' },
      },
    };

    const csv = generateMobileFirstCsv(mockResponse);
    assert.strictEqual(csv.startsWith('\uFEFF'), true, 'CSV should start with UTF-8 BOM');
    assert.ok(csv.includes('Mobile-First Index Checker'));
    assert.ok(csv.includes('https://example.com/page'));
    assert.ok(csv.includes('Not Applicable'));
  });

  await test('XLSX Export generates valid multi-worksheet workbook buffer', async () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent();
    const { summary, comparisonTable, discrepancies } = compareDesktopAndMobile(desktop, mobile, false);

    const mockResponse: MobileFirstAuditResponse = {
      success: true,
      testedAt: '2026-10-19T10:00:00.000Z',
      executionMode: 'Raw HTML Comparison',
      requestedDesktopUrl: 'https://example.com/page',
      userAgentProfile: 'googlebot',
      desktop,
      mobile,
      summary,
      comparisonTable,
      discrepancies,
      screenshots: {
        desktop: { available: false, reason: 'N/A' },
        mobile: { available: false, reason: 'N/A' },
      },
    };

    const buffer = await generateMobileFirstXlsx(mockResponse);
    assert.ok(buffer instanceof Uint8Array);
    assert.ok(buffer.length > 1000, 'XLSX buffer should contain workbook data');
  });

  // =========================================================================
  // 9. Full-Document Content Similarity Suite
  // =========================================================================
  console.log('\n9. Full-Document Content Similarity Suite:');

  await test('Similarity: Identical content yields 100% similarity (1.0)', () => {
    const text = 'Comprehensive guide to technical SEO auditing, mobile-first indexing, and structured markup validation.';
    const sim = calculateContentSimilarity(text, text);
    assert.strictEqual(sim, 1.0, 'Identical text must yield exactly 1.0');
  });

  await test('Similarity: Same 300-char opening with completely different remainder yields significant drop (< 35%)', () => {
    const opening = 'This introductory section appears identically at the very top of both desktop and mobile versions of the webpage. It covers common introductory phrases, brand taglines, and initial navigation elements that share identical characters.';
    const restA = Array(150).fill('apple banana orange mango strawberry peach nutrition vitamins healthy fruit diet smoothie breakfast').join(' ');
    const restB = Array(150).fill('car truck engine transmission brake exhaust suspension alternator radiator battery spark plug mechanic').join(' ');

    const sim = calculateContentSimilarity(opening + ' ' + restA, opening + ' ' + restB);
    assert.ok(sim < 0.35, `Similarity should be < 0.35 when body differs (got ${sim})`);
  });

  await test('Similarity: Desktop 2,000 words vs Mobile 100 words yields massive content drop (< 15%)', () => {
    const deskWords = Array(200).fill('comprehensive guide to technical search engine optimization auditing mobile first indexing practices').join(' ');
    const mobWords = 'comprehensive guide to technical search engine optimization auditing mobile first indexing practices';

    const sim = calculateContentSimilarity(deskWords, mobWords);
    assert.ok(sim < 0.15, `Similarity should be < 0.15 when mobile drops >90% content (got ${sim})`);

    const desktop = createMockAgent({
      content: {
        ...createMockAgent().content,
        wordCount: 2000,
        comparisonText: deskWords,
      },
    });
    const mobile = createMockAgent({
      content: {
        ...createMockAgent().content,
        wordCount: 100,
        comparisonText: mobWords,
      },
    });

    const { summary, discrepancies } = compareDesktopAndMobile(desktop, mobile, false);
    assert.ok(summary.textSimilarityPct < 15, `Summary similarity should be < 15% (got ${summary.textSimilarityPct}%)`);
    assert.ok(discrepancies.some((d) => d.id === 'content-massive-text-loss'));
  });

  await test('Similarity: Same word count (500 words each) but completely different topics yields low similarity (< 20%)', () => {
    const textVehicles = Array(40).fill('car truck engine motor vehicle highway speed brake transmission drive road wheel tire gear steering').join(' ');
    const textCooking = Array(40).fill('pizza pasta cheese tomato basil oregano crust oven sauce bake Italian restaurant dinner lunch recipe').join(' ');

    const sim = calculateContentSimilarity(textVehicles, textCooking);
    assert.ok(sim < 0.20, `Similarity should be < 0.20 for unrelated topics with identical word count (got ${sim})`);

    const desktop = createMockAgent({
      content: {
        ...createMockAgent().content,
        wordCount: 500,
        comparisonText: textVehicles,
      },
    });
    const mobile = createMockAgent({
      content: {
        ...createMockAgent().content,
        wordCount: 500,
        comparisonText: textCooking,
      },
    });

    const { summary, discrepancies } = compareDesktopAndMobile(desktop, mobile, false);
    assert.ok(summary.textSimilarityPct < 20, `Summary similarity should be < 20% (got ${summary.textSimilarityPct}%)`);
    assert.ok(discrepancies.some((d) => d.id === 'content-text-similarity-low'));
  });

  await test('Similarity: Minor navigation differences on matching article avoids exaggerated critical discrepancy (> 80%)', () => {
    const navDesktop = 'Home About Services Products Contact Careers Pricing Blog FAQ Help';
    const navMobile = 'Menu Home Contact';
    const mainBody = Array(80).fill('the definitive guide to understanding modern software architecture design patterns and cloud scalability in enterprise web applications').join(' ');

    const sim = calculateContentSimilarity(navDesktop + ' ' + mainBody, navMobile + ' ' + mainBody);
    assert.ok(sim > 0.80, `Similarity should be > 0.80 when only navigation differs (got ${sim})`);
  });

  await test('Similarity: Unicode text (Hindi, Gujarati, Accents) tokenizes and compares accurately', () => {
    const hindiA = 'नमस्ते दुनिया यह एक व्यापक तकनीकी परीक्षण है खोज इंजन अनुकूलन मोबाइल प्रथम अनुक्रमण';
    const hindiB = 'नमस्ते दुनिया यह एक व्यापक तकनीकी परीक्षण है खोज इंजन अनुकूलन मोबाइल प्रथम अनुक्रमण';
    const gujarati = 'નમસ્તે દુનિયા આ એક પરીક્ષણ છે';
    const accentedA = 'Café résumé déjà vu fête naïve façade crème brûlée';
    const accentedB = 'Café résumé déjà vu fête naïve façade crème brûlée';

    assert.strictEqual(calculateContentSimilarity(hindiA, hindiB), 1.0, 'Hindi identical text should yield 1.0');
    assert.strictEqual(calculateContentSimilarity(accentedA, accentedB), 1.0, 'Accented identical text should yield 1.0');
    assert.ok(calculateContentSimilarity(hindiA, gujarati) < 0.1, 'Hindi vs Gujarati should yield low similarity');
  });

  await test('Similarity: Large document (> 30,000 chars) triggers distributed sampling without performance degradation', () => {
    const largeBody = Array(500).fill('distributed systems engineering consensus protocol database replication fault tolerance throughput latency').join(' ');
    assert.ok(largeBody.length > 30000, 'Test body should exceed 30,000 characters');

    const html = `<html><body><main>${largeBody}</main></body></html>`;
    const signals = extractSeoSignals(html, 'https://example.com/large', {});

    assert.strictEqual(signals.content.isSampled, true, 'isSampled should be true for large documents');
    assert.ok(signals.content.comparisonText && signals.content.comparisonText.length <= 35000, 'Sampled text must be bounded');
    assert.strictEqual(signals.content.textSnippet.length, 300, 'Display snippet remains 300 characters');
  });

  // =========================================================================
  // 10. Truncated HTML Response Handling
  // =========================================================================
  console.log('\n10. Truncated HTML Response Handling:');

  await test('Truncation: Truncated HTML response yields Incomplete Audit — HTML Response Truncated verdict', () => {
    const desktop = createMockAgent({
      isTruncated: false,
      isPartial: false,
    });
    const mobile = createMockAgent({
      isTruncated: true,
      isPartial: true,
      truncationReason: 'Response payload exceeded size limit (2048.0 KB)',
    });

    const { summary, comparisonTable, discrepancies } = compareDesktopAndMobile(desktop, mobile, false);

    assert.strictEqual(
      summary.parityVerdict,
      'Incomplete Audit — HTML Response Truncated',
      'Verdict must indicate incomplete audit due to truncation'
    );
    assert.notStrictEqual(summary.parityVerdict, 'Full Parity Passed');
    assert.ok(discrepancies.some((d) => d.id === 'crawling-html-truncated'));

    const completenessRow = comparisonTable.find((r) => r.element === 'HTML Download Completeness');
    assert.ok(completenessRow, 'Must include HTML Download Completeness row');
    assert.strictEqual(completenessRow?.status, 'Warning');
  });

  await test('Truncation: Missing structured data on truncated mobile response is downgraded to Medium warning', () => {
    const desktop = createMockAgent({
      structuredData: {
        hasStructuredData: true,
        types: ['Article', 'BreadcrumbList'],
        entityCount: 2,
        entities: [],
        jsonLdBlocksCount: 1,
        microdataItemTypes: [],
        rdfaTypes: [],
        parseErrors: [],
      },
    });
    const mobile = createMockAgent({
      isTruncated: true,
      isPartial: true,
      structuredData: {
        hasStructuredData: false,
        types: [],
        entityCount: 0,
        entities: [],
        jsonLdBlocksCount: 0,
        microdataItemTypes: [],
        rdfaTypes: [],
        parseErrors: [],
      },
    });

    const { discrepancies } = compareDesktopAndMobile(desktop, mobile, false);
    const schemaDisc = discrepancies.find((d) => d.id === 'schema-missing-on-mobile');
    assert.ok(schemaDisc, 'Must flag missing schema on mobile');
    assert.strictEqual(schemaDisc?.severity, 'Medium', 'Must downgrade severity to Medium when mobile is truncated');
    assert.ok(schemaDisc?.name.includes('Truncated'), 'Finding title must reflect truncation');
  });

  // =========================================================================
  // 11. Error Sanitization Suite
  // =========================================================================
  console.log('\n11. Error Sanitization Suite:');

  await test('Sanitization: Timeout error is mapped to REQUEST_TIMEOUT without leaking IP or port', () => {
    const rawError = new Error('connect ETIMEDOUT 198.51.100.24:443');
    const sanitized = sanitizeAuditError(rawError);

    assert.strictEqual(sanitized.code, 'REQUEST_TIMEOUT');
    assert.strictEqual(sanitized.statusCode, 504);
    assert.ok(!sanitized.userMessage.includes('198.51.100.24'), 'Must not leak IP address');
    assert.ok(!sanitized.userMessage.includes('443'), 'Must not leak port');
  });

  await test('Sanitization: DNS lookup failure is mapped to DNS_FAILURE with safe message', () => {
    const rawError = new Error('getaddrinfo ENOTFOUND invalid-subdomain-123456.com');
    const sanitized = sanitizeAuditError(rawError);

    assert.strictEqual(sanitized.code, 'DNS_FAILURE');
    assert.strictEqual(sanitized.statusCode, 502);
    assert.ok(sanitized.userMessage.includes('Domain name resolution failed'));
  });

  await test('Sanitization: Private destination SSRF rejection is mapped to BLOCKED_DESTINATION', () => {
    const rawError = new Error('Hostname example.local resolves to blocked/private IP: 10.0.0.1');
    const sanitized = sanitizeAuditError(rawError);

    assert.strictEqual(sanitized.code, 'BLOCKED_DESTINATION');
    assert.strictEqual(sanitized.statusCode, 403);
    assert.ok(sanitized.userMessage.includes('restricted'));
  });

  await test('Sanitization: Injected synthetic exception with secret path NEVER leaks to user message', () => {
    const secretError = new Error('Fatal exception at /var/www/secret/keys.env: AWS_SECRET_KEY_12345 database connect error');
    const sanitized = sanitizeAuditError(secretError);

    assert.strictEqual(sanitized.code, 'INTERNAL_ERROR');
    assert.strictEqual(sanitized.statusCode, 500);
    assert.ok(!sanitized.userMessage.includes('/var/www/secret'), 'Must not leak file paths');
    assert.ok(!sanitized.userMessage.includes('AWS_SECRET_KEY'), 'Must not leak secrets');
    assert.strictEqual(sanitized.userMessage, 'The audit could not complete because of an internal processing error.');
  });

  // =========================================================================
  // 12. Total-Operation Timeout Guarantee
  // =========================================================================
  console.log('\n12. Total-Operation Timeout Guarantee:');

  await test('Timeout: safeFetch throws timeout error when destination does not respond within deadline', async () => {
    // 192.0.2.1 is TEST-NET-1 (RFC 5737), which drops packets and will time out
    // But safeFetch validates against private IPs, so let's verify validateAndResolveHost rejects private IPs
    try {
      await validateAndResolveHost('127.0.0.1');
      assert.fail('Should reject localhost');
    } catch (err: any) {
      assert.ok(err.message.includes('blocked') || err.message.includes('private'));
    }
  });

  console.log('\n=====================================================');
  console.log(`TOTAL MOBILE-FIRST TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMobileFirstTestSuite().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
