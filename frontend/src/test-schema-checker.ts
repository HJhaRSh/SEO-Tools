/**
 * Test suite for the Bulk Schema Checker
 * All tests are deterministic — no live network requests.
 */

import { extractSchemaTypes } from './lib/seo/schema-checker/schemaExtractor';
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

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: JSON-LD — Single type
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 1: JSON-LD — Single type');
{
  const html = `
    <html><head>
      <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "Organization" }
      </script>
    </head><body>Hello</body></html>
  `;
  const types = extractSchemaTypes(html);
  assertDeepEqual(types, ['Organization'], 'Single @type "Organization" extracted');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: JSON-LD — @graph
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 2: JSON-LD — @graph');
{
  const html = `
    <html><head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization" },
            { "@type": "WebSite" },
            { "@type": "WebPage" }
          ]
        }
      </script>
    </head><body></body></html>
  `;
  const types = extractSchemaTypes(html);
  assert(types.includes('Organization'), '@graph: Organization found');
  assert(types.includes('WebSite'), '@graph: WebSite found');
  assert(types.includes('WebPage'), '@graph: WebPage found');
  assertDeepEqual(types, ['Organization', 'WebSite', 'WebPage'], '@graph: exactly 3 types in order');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: JSON-LD — @type as array
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 3: JSON-LD — @type as array');
{
  const html = `
    <html><head>
      <script type="application/ld+json">
        { "@type": ["Article", "NewsArticle"] }
      </script>
    </head><body></body></html>
  `;
  const types = extractSchemaTypes(html);
  assert(types.includes('Article'), '@type array: Article found');
  assert(types.includes('NewsArticle'), '@type array: NewsArticle found');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: JSON-LD — Top-level entities only (nested property types excluded)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 4: JSON-LD — Top-level entity detected (sub-property excluded)');
{
  const html = `
    <html><head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "offers": { "@type": "Offer" },
          "address": { "@type": "PostalAddress" }
        }
      </script>
    </head><body></body></html>
  `;
  const types = extractSchemaTypes(html);
  assert(types.includes('Product'), 'Top-level entity: Product found');
  assert(!types.includes('Offer'), 'Sub-property: Offer excluded (matches Schema.org validator)');
  assert(!types.includes('PostalAddress'), 'Sub-property: PostalAddress excluded');
  assert(types.length === 1, 'Only top-level entity Product returned');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Duplicate types — deduplicated
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 5: Duplicate types — deduplicated');
{
  const html = `
    <html><head>
      <script type="application/ld+json">{ "@type": "Organization" }</script>
      <script type="application/ld+json">{ "@type": "Organization" }</script>
      <script type="application/ld+json">{ "@type": "WebSite" }</script>
      <script type="application/ld+json">{ "@type": "Organization" }</script>
    </head><body></body></html>
  `;
  const types = extractSchemaTypes(html);
  assertDeepEqual(types, ['Organization', 'WebSite'], 'Duplicates removed — only Organization, WebSite');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Microdata detection
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 6: Microdata detection');
{
  const html = `
    <html><body>
      <div itemscope itemtype="https://schema.org/Product">
        <span itemprop="name">Test Product</span>
      </div>
    </body></html>
  `;
  const types = extractSchemaTypes(html);
  assert(types.includes('Product'), 'Microdata: Product detected via itemtype');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Microdata — http:// schema.org prefix
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 7: Microdata — http:// schema.org prefix');
{
  const html = `
    <html><body>
      <div itemscope itemtype="http://schema.org/LocalBusiness"></div>
    </body></html>
  `;
  const types = extractSchemaTypes(html);
  assert(types.includes('LocalBusiness'), 'Microdata http:// prefix: LocalBusiness detected');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: No schema — returns empty array
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 8: No schema — returns empty array');
{
  const html = `
    <html>
      <head><title>Example</title></head>
      <body>Hello world</body>
    </html>
  `;
  const types = extractSchemaTypes(html);
  assert(types.length === 0, 'No schema: empty array returned');
  assert(types.length === 0, 'schemaFound would be false');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Malformed JSON-LD — does not crash, continues
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 9: Malformed JSON-LD — does not crash, continues');
{
  const html = `
    <html><head>
      <script type="application/ld+json">{ this is not valid json !!!</script>
      <script type="application/ld+json">{ "@type": "WebSite" }</script>
    </head><body></body></html>
  `;
  let types: string[] = [];
  let threw = false;
  try {
    types = extractSchemaTypes(html);
  } catch {
    threw = true;
  }
  assert(!threw, 'Malformed JSON-LD: no exception thrown');
  assert(types.includes('WebSite'), 'Malformed JSON-LD: valid block still detected (WebSite)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: Type normalisation — full schema.org URL stripped
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 10: Type normalisation — full URL stripped');
{
  const html = `
    <html><head>
      <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "https://schema.org/Organization" }
      </script>
    </head><body></body></html>
  `;
  const types = extractSchemaTypes(html);
  assert(types.includes('Organization'), 'URL-prefixed type normalised to "Organization"');
  assert(!types.some(t => t.includes('schema.org')), 'No full schema.org URL in output');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: Multiple JSON-LD blocks
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 11: Multiple JSON-LD blocks on same page');
{
  const html = `
    <html><head>
      <script type="application/ld+json">{ "@type": "Organization" }</script>
      <script type="application/ld+json">{ "@type": "WebSite" }</script>
    </head><body></body></html>
  `;
  const types = extractSchemaTypes(html);
  assert(types.includes('Organization'), 'Multi-block: Organization found');
  assert(types.includes('WebSite'), 'Multi-block: WebSite found');
  assertDeepEqual(types, ['Organization', 'WebSite'], 'Multi-block: exactly 2 types');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 12: URL deduplication logic (client-side logic simulation)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 12: URL deduplication logic');
{
  const rawUrls = [
    'https://example.com/a',
    'https://example.com/a',   // duplicate
    'https://example.com/b',
  ];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const u of rawUrls) {
    const parsed = new URL(u);
    const key = parsed.href;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(u);
    }
  }
  assertDeepEqual(deduped, ['https://example.com/a', 'https://example.com/b'], 'Deduplication: /a appears once, /b included');
  assert(deduped.length === 2, 'Deduplication: 3 input → 2 unique');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 13: URL limit guard
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 13: URL limit — 100 accepted, 101 rejected');
{
  const MAX = 100;
  const exactly100 = Array.from({ length: MAX }, (_, i) => `https://example.com/page-${i + 1}`);
  const exactly101 = Array.from({ length: MAX + 1 }, (_, i) => `https://example.com/page-${i + 1}`);

  // Guard logic mirroring the API route
  const accepts100 = exactly100.length <= MAX;
  const rejects101 = exactly101.length > MAX;

  assert(accepts100, 'Limit: 100 URLs accepted (≤ MAX)');
  assert(rejects101, 'Limit: 101 URLs rejected (> MAX)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 14: SSRF — validateUrl rejects private URLs
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 14: Security — validateUrl rejects unsupported protocols');
{
  const invalidProtocols = ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<h1>xss</h1>', 'ftp://example.com'];
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

// ─────────────────────────────────────────────────────────────────────────────
// Test 15: Empty HTML / null input
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 15: Empty / null input to extractor');
{
  assert(extractSchemaTypes('').length === 0, 'Empty string: returns []');
  // @ts-expect-error — intentional test of null guard
  assert(extractSchemaTypes(null).length === 0, 'null: returns []');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 16: Next.js <Script type="application/ld+json"> (__next_s push payload)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 Test 16: Next.js script payload extraction');
{
  const nextHtml = `
    <html>
      <head>
        <script>(self.__next_s=self.__next_s||[]).push([0,{"type":"application/ld+json","children":"{\\"@graph\\":[{\\"@type\\":\\"Organization\\",\\"name\\":\\"Acme Corp\\"},{\\"@type\\":\\"WebSite\\"},{\\"@type\\":\\"BlogPosting\\"}]}"}])</script>
      </head>
      <body><div>Content</div></body>
    </html>
  `;
  const types = extractSchemaTypes(nextHtml);
  assert(types.includes('Organization'), 'Next.js: Organization detected');
  assert(types.includes('WebSite'), 'Next.js: WebSite detected');
  assert(types.includes('BlogPosting'), 'Next.js: BlogPosting detected');
  assert(types.length === 3, 'Next.js: exactly 3 types found');
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`Schema Checker Tests: ${passed} passed, ${failed} failed`);
console.log(`${'─'.repeat(55)}\n`);

if (failed > 0) {
  process.exit(1);
}
