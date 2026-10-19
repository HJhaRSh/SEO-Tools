import assert from 'assert';
import { validateUrl, validateAndResolveHost } from './lib/seo/safeFetch';
import { extractSeoSignals } from './lib/seo/mobile-first/extractor';
import { compareDesktopAndMobile } from './lib/seo/mobile-first/comparator';
import { generateMobileFirstCsv, generateMobileFirstXlsx, sanitizeSpreadsheetField } from './lib/seo/mobile-first/exporter';
import { AgentCrawlResult, MobileFirstAuditResponse } from './lib/seo/mobile-first/types';
import { USER_AGENT_PROFILES } from './lib/seo/mobile-first/userAgents';

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
    durationMs: 250,
    isTruncated: false,
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
      h1Primary: 'Example Page Title',
      h1Count: 1,
      allH1s: ['Example Page Title'],
      wordCount: 1200,
      characterCount: 7500,
      textSnippet: 'Learn about best practices for mobile-first indexing and technical SEO parity.',
      textNormalizedHash: 'hash123',
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

  console.log('\n2. Crawling & Indexability Parity Tests:');

  await test('Identical desktop and mobile responses yield Full Parity Passed', () => {
    const desktop = createMockAgent();
    const mobile = createMockAgent({ agentName: 'Googlebot Smartphone' });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.parityVerdict, 'Full Parity Passed');
    assert.strictEqual(result.summary.hasDifferences, false);
    assert.strictEqual(result.discrepancies.length, 0);
  });

  await test('Desktop 200 vs Mobile 404 flags Critical Discrepancy', () => {
    const desktop = createMockAgent({ statusCode: 200 });
    const mobile = createMockAgent({ statusCode: 404, statusText: 'Not Found' });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.criticalCount >= 1, true);
    assert.strictEqual(result.summary.parityVerdict, 'Critical Discrepancies Detected');
    const finding = result.discrepancies.find((d) => d.id === 'crawling-mobile-404');
    assert.ok(finding, 'crawling-mobile-404 discrepancy should be reported');
    assert.strictEqual(finding?.severity, 'Critical');
  });

  await test('Desktop 200 vs Mobile 403 flags Critical Discrepancy', () => {
    const desktop = createMockAgent({ statusCode: 200 });
    const mobile = createMockAgent({ statusCode: 403, statusText: 'Forbidden' });

    const result = compareDesktopAndMobile(desktop, mobile, false);
    assert.strictEqual(result.summary.criticalCount >= 1, true);
    const finding = result.discrepancies.find((d) => d.id === 'crawling-mobile-blocked');
    assert.ok(finding);
    assert.strictEqual(finding?.severity, 'Critical');
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

  console.log('\n3. Content Parity Tests:');

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

  console.log('\n4. Links & Images Parity Tests:');

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

  console.log('\n5. Structured Data Parity Tests:');

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
    // Normalized JSON strings match identically despite original key order
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

  console.log('\n6. Hreflang Parity Tests:');

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

  console.log('\n7. Exporters & Sanitization Tests:');

  await test('Sanitizes spreadsheet formula injection (=, +, -, @, \\t, \\r)', () => {
    assert.strictEqual(sanitizeSpreadsheetField('=CMD|"/C calc"!A0'), '\'=CMD|"/C calc"!A0');
    assert.strictEqual(sanitizeSpreadsheetField('+1+2'), '\'+1+2');
    assert.strictEqual(sanitizeSpreadsheetField('-SUM(A1:B2)'), '\'-SUM(A1:B2)');
    assert.strictEqual(sanitizeSpreadsheetField('@SUM(A1)'), '\'@SUM(A1)');
    assert.strictEqual(sanitizeSpreadsheetField('\tTAB'), '\'\tTAB');
    assert.strictEqual(sanitizeSpreadsheetField('Normal Text'), 'Normal Text');
  });

  await test('CSV Export generates UTF-8 with BOM and escaped cells', () => {
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

    const csv = generateMobileFirstCsv(mockResponse);
    assert.strictEqual(csv.startsWith('\uFEFF'), true, 'CSV should start with UTF-8 BOM');
    assert.ok(csv.includes('Mobile-First Index Checker'));
    assert.ok(csv.includes('https://example.com/page'));
    assert.ok(csv.includes('Raw HTML Comparison'));
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
