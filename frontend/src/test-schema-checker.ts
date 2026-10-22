/**
 * Test suite for the Bulk Schema Checker
 * All tests are deterministic — no live network requests.
 */

import { extractSchemaTypes } from './lib/seo/schema-checker/schemaExtractor';
import { checkUrlSchema, checkUrlsBatch } from './lib/seo/schema-checker/schemaCheckerService';
import { validateUrl } from './lib/seo/safeFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal test harness
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

function assertDeepEqual<T>(actual: T, expected: T, description: string): void {
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr === eStr) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     Expected: ${eStr}`);
    console.error(`     Actual:   ${aStr}`);
    failed++;
  }
}

// Helper to simulate the route's server-side URL validation & deduplication
function deduplicateUrls(urls: string[]): string[] {
  const validatedUrls: string[] = [];
  const seen = new Set<string>();
  const allowedProtocols = new Set(['http:', 'https:']);

  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = validateUrl(trimmed);
      if (!allowedProtocols.has(parsed.protocol)) continue;
      parsed.hash = '';
      const normalizedHref = parsed.href;
      if (!seen.has(normalizedHref)) {
        seen.add(normalizedHref);
        validatedUrls.push(normalizedHref);
      }
    } catch {}
  }
  return validatedUrls;
}

async function runTests() {
  console.log('\n=======================================================');
  console.log('SPEC REQUIRED TESTS (A to O)');
  console.log('=======================================================');

  // Test A — Genuine No Schema
  console.log('\n📋 Test A — Genuine No Schema');
  {
    const res = await checkUrlSchema('https://example.com/test-a', async () => ({
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html' },
      body: '<html><head><title>Test</title></head><body>Hello</body></html>',
      isTruncated: false,
      requestedUrl: 'https://example.com/test-a',
      finalUrl: 'https://example.com/test-a',
      redirectHistory: [],
      durationMs: 10,
      contentType: 'text/html',
      timestamp: new Date().toISOString(),
    }));
    assert(res.status === 'not_found', 'Test A: status is not_found');
    assert(res.schemaFound === false, 'Test A: schemaFound is false (No)');
    assertDeepEqual(res.types, [], 'Test A: types is empty array');
  }

  // Test B — Fetch Failure (network, SSRF rejection, and 403 HTTP error)
  console.log('\n📋 Test B — Fetch Failure');
  {
    const resError = await checkUrlSchema('https://example.com/test-b-err', async () => {
      throw new Error('SSRF Guard: DNS resolution failed');
    });
    assert(resError.status === 'unable_to_check', 'Test B (network throw): status is unable_to_check');
    assert(resError.schemaFound === false, 'Test B: schemaFound is false');
    assertDeepEqual(resError.types, [], 'Test B: types is empty array');

    const res403 = await checkUrlSchema('https://example.com/test-b-403', async () => ({
      statusCode: 403,
      statusText: 'Forbidden',
      headers: { 'content-type': 'text/html' },
      body: '<html><body>Access Denied</body></html>',
      isTruncated: false,
      requestedUrl: 'https://example.com/test-b-403',
      finalUrl: 'https://example.com/test-b-403',
      redirectHistory: [],
      durationMs: 10,
      contentType: 'text/html',
      timestamp: new Date().toISOString(),
    }));
    assert(res403.status === 'unable_to_check', 'Test B (403 HTTP failure): status is unable_to_check');
    assert(res403.schemaFound === false, 'Test B: schemaFound is false');
    assertDeepEqual(res403.types, [], 'Test B: types is empty array');
  }

  // Test C — Truncated First Fetch, Schema Found on Retry
  console.log('\n📋 Test C — Truncated First Fetch, Schema Found on Retry');
  {
    let attemptsC = 0;
    const resC = await checkUrlSchema('https://example.com/test-c', async (_url, opts) => {
      attemptsC++;
      if (opts?.maxBytes === 512 * 1024) {
        return {
          statusCode: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/html' },
          body: '<html><body>' + 'x'.repeat(1000) + '</body></html>',
          isTruncated: true,
          requestedUrl: 'https://example.com/test-c',
          finalUrl: 'https://example.com/test-c',
          redirectHistory: [],
          durationMs: 10,
          contentType: 'text/html',
          timestamp: new Date().toISOString(),
        };
      }
      return {
        statusCode: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html><body><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product"}</script></body></html>',
        isTruncated: false,
        requestedUrl: 'https://example.com/test-c',
        finalUrl: 'https://example.com/test-c',
        redirectHistory: [],
        durationMs: 15,
        contentType: 'text/html',
        timestamp: new Date().toISOString(),
      };
    });
    assert(attemptsC === 2, 'Test C: Exactly two fetch attempts verified');
    assert(resC.status === 'found', 'Test C: status is found');
    assert(resC.schemaFound === true, 'Test C: schemaFound is true (Yes)');
    assertDeepEqual(resC.types, ['Product'], 'Test C: types includes Product');
  }

  // Test D — Truncated Retry Still No Schema
  console.log('\n📋 Test D — Truncated Retry Still No Schema');
  {
    let attemptsD = 0;
    const resD = await checkUrlSchema('https://example.com/test-d', async (_url, opts) => {
      attemptsD++;
      return {
        statusCode: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html><body>No schema here either</body></html>',
        isTruncated: opts?.maxBytes === 512 * 1024,
        requestedUrl: 'https://example.com/test-d',
        finalUrl: 'https://example.com/test-d',
        redirectHistory: [],
        durationMs: 10,
        contentType: 'text/html',
        timestamp: new Date().toISOString(),
      };
    });
    assert(attemptsD === 2, 'Test D: Two fetch attempts made');
    assert(resD.status === 'not_found', 'Test D: status is not_found (No)');
    assert(resD.schemaFound === false, 'Test D: schemaFound is false');
    assertDeepEqual(resD.types, [], 'Test D: types is empty array');
  }

  // Test E — No Unnecessary Retry
  console.log('\n📋 Test E — No Unnecessary Retry');
  {
    let attemptsE = 0;
    const resE = await checkUrlSchema('https://example.com/test-e', async () => {
      attemptsE++;
      return {
        statusCode: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html><body>No schema, not truncated</body></html>',
        isTruncated: false,
        requestedUrl: 'https://example.com/test-e',
        finalUrl: 'https://example.com/test-e',
        redirectHistory: [],
        durationMs: 10,
        contentType: 'text/html',
        timestamp: new Date().toISOString(),
      };
    });
    assert(attemptsE === 1, 'Test E: Exactly one fetch attempt verified');
    assert(resE.status === 'not_found', 'Test E: status is not_found (No)');
  }

  // Test F — Schema.org JSON-LD
  console.log('\n📋 Test F — Schema.org JSON-LD');
  {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization"
      }
      </script>
    `;
    const types = extractSchemaTypes(html);
    assertDeepEqual(types, ['Organization'], 'Test F: Organization extracted from Schema.org JSON-LD');
  }

  // Test G — Non-Schema.org JSON-LD
  console.log('\n📋 Test G — Non-Schema.org JSON-LD');
  {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://example.com/custom",
        "@type": "https://example.com/MyCustomThing"
      }
      </script>
    `;
    const types = extractSchemaTypes(html);
    assertDeepEqual(types, [], 'Test G: Non-Schema.org JSON-LD ignored (returns [])');
  }

  // Test H — Microdata Schema.org
  console.log('\n📋 Test H — Microdata Schema.org');
  {
    const html = '<div itemscope itemtype="https://schema.org/Product"></div>';
    const types = extractSchemaTypes(html);
    assertDeepEqual(types, ['Product'], 'Test H: Product extracted from Schema.org Microdata');
  }

  // Test I — Non-Schema Microdata
  console.log('\n📋 Test I — Non-Schema Microdata');
  {
    const html = '<div itemscope itemtype="https://example.com/CustomProduct"></div>';
    const types = extractSchemaTypes(html);
    assertDeepEqual(types, [], 'Test I: Non-Schema Microdata ignored (returns [])');
  }

  // Test J — RDFa
  console.log('\n📋 Test J — RDFa');
  {
    const html = '<div vocab="https://schema.org/" typeof="Organization"></div>';
    const types = extractSchemaTypes(html);
    assertDeepEqual(types, ['Organization'], 'Test J: Organization extracted from Schema.org RDFa');
  }

  // Test K — JSON-LD MIME Case
  console.log('\n📋 Test K — JSON-LD MIME Case');
  {
    const html = `
      <script type="Application/LD+JSON">
      {
        "@context": "https://schema.org",
        "@type": "WebSite"
      }
      </script>
    `;
    const types = extractSchemaTypes(html);
    assertDeepEqual(types, ['WebSite'], 'Test K: WebSite extracted despite mixed-case MIME');
  }

  // Test L — JSON-LD MIME Parameters
  console.log('\n📋 Test L — JSON-LD MIME Parameters');
  {
    const html = `
      <script type="application/ld+json; charset=utf-8">
      {
        "@context": "https://schema.org",
        "@type": "WebPage"
      }
      </script>
    `;
    const types = extractSchemaTypes(html);
    assertDeepEqual(types, ['WebPage'], 'Test L: WebPage extracted with charset parameter');
  }

  // Test M — API Deduplication
  console.log('\n📋 Test M — API Deduplication');
  {
    const inputM = ['https://example.com/a', 'https://example.com/a', 'https://example.com/b'];
    const dedupM = deduplicateUrls(inputM);
    assertDeepEqual(dedupM, ['https://example.com/a', 'https://example.com/b'], 'Test M: Duplicate URLs collapsed, 2 URLs processed');
  }

  // Test N — Fragment Deduplication
  console.log('\n📋 Test N — Fragment Deduplication');
  {
    const inputN = ['https://example.com/page#one', 'https://example.com/page#two'];
    const dedupN = deduplicateUrls(inputN);
    assertDeepEqual(dedupN, ['https://example.com/page'], 'Test N: Fragments stripped and deduplicated to 1 URL');
  }

  // Test O — Query Strings Stay Distinct
  console.log('\n📋 Test O — Query Strings Stay Distinct');
  {
    const inputO = ['https://example.com/page?a=1', 'https://example.com/page?a=2'];
    const dedupO = deduplicateUrls(inputO);
    assertDeepEqual(dedupO, ['https://example.com/page?a=1', 'https://example.com/page?a=2'], 'Test O: Query strings remain distinct, 2 URLs processed');
  }

  console.log('\n=======================================================');
  console.log('ADDITIONAL ROBUSTNESS & REGRESSION TESTS');
  console.log('=======================================================');

  // Additional 1: JSON-LD @graph
  console.log('\n📋 Additional: JSON-LD @graph');
  {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", "name": "Org" },
          { "@type": "WebSite", "name": "Site" },
          { "@type": "WebPage", "name": "Page" }
        ]
      }
      </script>
    `;
    const types = extractSchemaTypes(html);
    assertDeepEqual(types, ['Organization', 'WebSite', 'WebPage'], '@graph extracts all top-level entity types');
  }

  // Additional 2: Sub-property exclusion (e.g. PostalAddress under Organization)
  console.log('\n📋 Additional: Sub-property exclusion (matches Schema.org validator)');
  {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "offers": { "@type": "Offer" },
        "address": { "@type": "PostalAddress" }
      }
      </script>
    `;
    const types = extractSchemaTypes(html);
    assert(types.includes('Product'), 'Top-level Product detected');
    assert(!types.includes('Offer'), 'Nested Offer excluded');
    assert(!types.includes('PostalAddress'), 'Nested PostalAddress excluded');
  }

  // Additional 3: Next.js script payload extraction
  console.log('\n📋 Additional: Next.js script payload extraction');
  {
    const nextHtml = `
      <html>
        <head>
          <script>(self.__next_s=self.__next_s||[]).push([0,{"type":"application/ld+json","children":"{\\"@context\\":\\"https://schema.org\\",\\"@graph\\":[{\\"@type\\":\\"Organization\\"},{\\"@type\\":\\"WebSite\\"}]}"}])</script>
        </head>
        <body><div>Content</div></body>
      </html>
    `;
    const types = extractSchemaTypes(nextHtml);
    assertDeepEqual(types, ['Organization', 'WebSite'], 'Next.js self.__next_s payload extracted');
  }

  // Additional 4: Concurrency & batch preservation of input order
  console.log('\n📋 Additional: Batch preserves input order with concurrency');
  {
    const batchUrls = [
      'https://example.com/fast',
      'https://example.com/slow',
      'https://example.com/fail',
    ];
    const batchRes = await checkUrlsBatch(batchUrls, 2, async (url) => {
      if (url.includes('slow')) {
        await new Promise(r => setTimeout(r, 50));
        return {
          statusCode: 200,
          statusText: 'OK',
          headers: {},
          body: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>',
          isTruncated: false,
          requestedUrl: url,
          finalUrl: url,
          redirectHistory: [],
          durationMs: 50,
          contentType: 'text/html',
          timestamp: new Date().toISOString(),
        };
      }
      if (url.includes('fail')) {
        throw new Error('Timeout');
      }
      return {
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>',
        isTruncated: false,
        requestedUrl: url,
        finalUrl: url,
        redirectHistory: [],
        durationMs: 5,
        contentType: 'text/html',
        timestamp: new Date().toISOString(),
      };
    });
    assert(batchRes[0].url === 'https://example.com/fast', 'Order: 1st is fast');
    assert(batchRes[0].status === 'found', 'fast: status found');
    assert(batchRes[1].url === 'https://example.com/slow', 'Order: 2nd is slow');
    assert(batchRes[1].status === 'found', 'slow: status found');
    assert(batchRes[2].url === 'https://example.com/fail', 'Order: 3rd is fail');
    assert(batchRes[2].status === 'unable_to_check', 'fail: status unable_to_check');
  }

  // Additional 5: Security — validateUrl rejects non-HTTP protocols
  console.log('\n📋 Additional: Security — validateUrl rejects non-HTTP protocols');
  {
    const invalidProtocols = [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<h1>xss</h1>',
      'ftp://example.com',
    ];
    for (const u of invalidProtocols) {
      let threw = false;
      try {
        validateUrl(u);
      } catch {
        threw = true;
      }
      assert(threw, `Security: "${u}" rejected by validateUrl`);
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`Schema Checker Tests: ${passed} passed, ${failed} failed`);
  console.log(`${'─'.repeat(55)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test harness exception:', err);
  process.exit(1);
});
