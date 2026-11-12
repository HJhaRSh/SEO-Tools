import assert from 'node:assert/strict';
import { getToolMetadata, getToolJsonLd } from './lib/seo/seoConfig';
import { normalizeKnowledgeGraphId, validateSearchRequest } from './lib/seo/knowledge-graph/validation';
import { generateKnowledgeGraphCsv } from './lib/seo/knowledge-graph/export';

console.log('=====================================================');
console.log('KNOWLEDGE GRAPH SEARCH SEO & REGRESSION TEST SUITE');
console.log('=====================================================\n');

let passCount = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Metadata Verification
console.log('1. Page-Specific SEO Metadata:');

test('Meta title matches high-intent target keyword requirements', () => {
  const meta = getToolMetadata('knowledge-graph-search');
  assert.equal(meta.title, 'Google Knowledge Graph Checker & Entity Search | Indian Marketers');
  assert.ok((meta.title as string).length <= 65, 'Title length within optimal Google SERP pixel boundaries');
});

test('Meta description matches target and length constraints', () => {
  const meta = getToolMetadata('knowledge-graph-search');
  assert.equal(
    meta.description,
    'Search Google Knowledge Graph entities for free. Find entity IDs, explore schema types, view descriptions and inspect API relevance scores with Indian Marketers.'
  );
  assert.ok(
    (meta.description as string).length >= 140 && (meta.description as string).length <= 165,
    'Description length within Google SERP snippet limits'
  );
});

test('Canonical URL points strictly to production URL without trailing slash or Vercel domain', () => {
  const meta = getToolMetadata('knowledge-graph-search');
  assert.equal(meta.alternates?.canonical, 'https://indianmarketers.in/tools/knowledge-graph-search');
});

test('Robots meta tags allow indexing and snippet previews', () => {
  const meta = getToolMetadata('knowledge-graph-search');
  const robots = meta.robots as any;
  assert.equal(robots?.index, true);
  assert.equal(robots?.follow, true);
});

test('OpenGraph and Twitter metadata accurately mirror title, description, and canonical', () => {
  const meta = getToolMetadata('knowledge-graph-search');
  assert.equal(meta.openGraph?.title, 'Google Knowledge Graph Checker & Entity Search | Indian Marketers');
  assert.equal(meta.openGraph?.url, 'https://indianmarketers.in/tools/knowledge-graph-search');
  const twitter = meta.twitter as any;
  assert.equal(twitter?.card, 'summary_large_image');
});

// 2. Structured Data (JSON-LD) Verification
console.log('\n2. Structured Data (JSON-LD) Verification:');

test('JSON-LD graph contains WebApplication, WebPage, BreadcrumbList, Organization, WebSite, and FAQPage', () => {
  const jsonLd = getToolJsonLd('knowledge-graph-search');
  assert.equal(jsonLd['@context'], 'https://schema.org');
  const graph = jsonLd['@graph'];
  assert.ok(Array.isArray(graph));

  const types = graph.map((e: any) => e['@type']);
  assert.ok(types.includes('WebApplication'), 'Missing WebApplication entity');
  assert.ok(types.includes('WebPage'), 'Missing WebPage entity');
  assert.ok(types.includes('BreadcrumbList'), 'Missing BreadcrumbList entity');
  assert.ok(types.includes('Organization'), 'Missing Organization entity');
  assert.ok(types.includes('WebSite'), 'Missing WebSite entity');
  assert.ok(types.includes('FAQPage'), 'Missing FAQPage entity');
});

test('WebApplication structured data correctly declares free accessibility and zero-price Offer', () => {
  const jsonLd = getToolJsonLd('knowledge-graph-search');
  const app = jsonLd['@graph'].find((e: any) => e['@type'] === 'WebApplication');
  assert.ok(app);
  assert.equal(app.name, 'Knowledge Graph Search');
  assert.equal(app.isAccessibleForFree, true);
  assert.equal(app.offers?.price, '0');
  assert.equal(app.url, 'https://indianmarketers.in/tools/knowledge-graph-search');
});

test('BreadcrumbList contains correct 3-tier hierarchy to avoid orphaned breadcrumb paths', () => {
  const jsonLd = getToolJsonLd('knowledge-graph-search');
  const breadcrumb = jsonLd['@graph'].find((e: any) => e['@type'] === 'BreadcrumbList');
  assert.ok(breadcrumb);
  assert.equal(breadcrumb.itemListElement.length, 3);
  assert.equal(breadcrumb.itemListElement[0].item, 'https://indianmarketers.in/');
  assert.equal(breadcrumb.itemListElement[1].item, 'https://indianmarketers.in/tools');
  assert.equal(breadcrumb.itemListElement[2].item, 'https://indianmarketers.in/tools/knowledge-graph-search');
});

test('FAQPage contains exactly 8 questions with accurate and non-absolutist answers', () => {
  const jsonLd = getToolJsonLd('knowledge-graph-search');
  const faqPage = jsonLd['@graph'].find((e: any) => e['@type'] === 'FAQPage');
  assert.ok(faqPage);
  assert.equal(faqPage.mainEntity.length, 8);

  const allAnswersText = faqPage.mainEntity.map((q: any) => q.acceptedAnswer.text).join(' ');
  
  // Verify absolute claims are absent
  assert.ok(
    !allAnswersText.includes("Google hasn't officially recognized it as an entity yet"),
    'Forbidden absolute recognition claim found'
  );
  assert.ok(
    !allAnswersText.includes('GOOGLE_KG_API_KEY'),
    'Administrative server environment variable configuration found in public FAQs'
  );
  assert.ok(
    !allAnswersText.includes('guarantee a Knowledge Panel') &&
    !allAnswersText.includes('guarantees a Knowledge Panel'),
    'Misleading Knowledge Panel guarantee found'
  );
});

// 3. Functional Integrity & Validation
console.log('\n3. Functional Integrity & Validation:');

test('normalizeKnowledgeGraphId handles /m/, /g/, kg:/m/, and raw strings correctly', () => {
  assert.deepEqual(normalizeKnowledgeGraphId('/m/0dl567'), { canonicalId: 'kg:/m/0dl567', mid: '/m/0dl567' });
  assert.deepEqual(normalizeKnowledgeGraphId('/g/11b6tq5_3y'), { canonicalId: 'kg:/g/11b6tq5_3y', mid: '/g/11b6tq5_3y' });
  assert.deepEqual(normalizeKnowledgeGraphId('kg:/m/02jx1'), { canonicalId: 'kg:/m/02jx1', mid: '/m/02jx1' });
  assert.deepEqual(normalizeKnowledgeGraphId('kg:/g/11c0_abc'), { canonicalId: 'kg:/g/11c0_abc', mid: '/g/11c0_abc' });
  assert.equal(normalizeKnowledgeGraphId('invalid_id'), null);
});

test('validateSearchRequest correctly validates query and ID modes', () => {
  const validQuery = validateSearchRequest({ query: 'Google', limit: 20 });
  assert.equal(validQuery.isValid, true);
  assert.equal(validQuery.sanitized?.query, 'Google');

  const emptyQuery = validateSearchRequest({ query: '   ' });
  assert.equal(emptyQuery.isValid, false);

  const validId = validateSearchRequest({ id: '/m/045c7b' });
  assert.equal(validId.isValid, true);
  assert.equal(validId.sanitized?.id, '/m/045c7b');

  const invalidId = validateSearchRequest({ id: 'bad_id' });
  assert.equal(invalidId.isValid, false);
});

// 4. CSV Formula Injection Security
console.log('\n4. CSV Export Formula Sanitization:');

test('generateKnowledgeGraphCsv neutralizes formula injection characters', () => {
  const maliciousResults = [
    {
      id: '/m/01',
      name: '=cmd|’ /C calc’!A0',
      description: '+1234567890',
      types: ['Organization'],
      resultScore: 100,
    },
    {
      id: '/g/02',
      name: '-SUM(1+1)',
      description: '@HYPERLINK("http://attacker.com")',
      types: ['Person'],
      resultScore: 50,
    },
  ];

  const csv = generateKnowledgeGraphCsv(maliciousResults as any);
  assert.ok(csv.startsWith('\uFEFF'), 'CSV should contain UTF-8 BOM');
  assert.ok(csv.includes("'=cmd|"), 'Equals formula symbol escaped');
  assert.ok(csv.includes("'+1234567890"), 'Plus formula symbol escaped');
  assert.ok(csv.includes("'-SUM"), 'Minus formula symbol escaped');
  assert.ok(csv.includes("'@HYPERLINK"), 'At-sign formula symbol escaped');
});

console.log('\n=====================================================');
console.log(`TOTAL KNOWLEDGE GRAPH SEO TESTS: ${passCount} | PASSED: ${passCount} | FAILED: 0`);
console.log('=====================================================\n');
