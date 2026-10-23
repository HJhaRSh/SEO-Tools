import assert from 'node:assert';
import { extractSeoSignals, compareSeoSignals } from './lib/seo/fetch-render/fetchRenderAnalysis';

console.log('Testing Fetch & Render Structured Data Parity with Schema Checker...');

// 1. Test JSON-LD with @graph
const htmlGraph = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "name": "Test Org" },
      { "@type": "WebSite", "url": "https://example.com" }
    ]
  }
  </script>
</head>
<body><h1>Hello World</h1></body>
</html>
`;

const sigsGraph = extractSeoSignals(htmlGraph, 'https://example.com');
console.log('Test 1 (JSON-LD @graph):', sigsGraph.structuredDataTypes);
assert.deepStrictEqual(sigsGraph.structuredDataTypes, ['Organization', 'WebSite']);
assert.strictEqual(sigsGraph.structuredDataCount, 2);

// 2. Test Microdata & RDFa
const htmlMicrodataRdfa = `
<!DOCTYPE html>
<html>
<body>
  <div itemscope itemtype="https://schema.org/Product">
    <span itemprop="name">Widget</span>
  </div>
  <div vocab="https://schema.org/" typeof="LocalBusiness">
    <span property="name">Bakery</span>
  </div>
</body>
</html>
`;

const sigsMicrodata = extractSeoSignals(htmlMicrodataRdfa, 'https://example.com');
console.log('Test 2 (Microdata & RDFa):', sigsMicrodata.structuredDataTypes);
assert.deepStrictEqual(sigsMicrodata.structuredDataTypes, ['Product', 'LocalBusiness']);

// 3. Test Parity Comparison: IDENTICAL
const diffsIdentical = compareSeoSignals(sigsGraph, sigsGraph);
const schemaDiffIdentical = diffsIdentical.find(d => d.name === 'structuredData');
console.log('Test 3 (Parity IDENTICAL):', schemaDiffIdentical);
assert(schemaDiffIdentical);
assert.strictEqual(schemaDiffIdentical.initialValue, 'Organization, WebSite');
assert.strictEqual(schemaDiffIdentical.renderedValue, 'Organization, WebSite');
assert.strictEqual(schemaDiffIdentical.status, 'IDENTICAL');

// 4. Test Parity Comparison: ADDED (Client-side JS dynamically injected schema)
const emptySigs = extractSeoSignals('<html><body>No schema</body></html>', 'https://example.com');
const diffsAdded = compareSeoSignals(emptySigs, sigsGraph);
const schemaDiffAdded = diffsAdded.find(d => d.name === 'structuredData');
console.log('Test 4 (Parity ADDED):', schemaDiffAdded);
assert(schemaDiffAdded);
assert.strictEqual(schemaDiffAdded.initialValue, '(none)');
assert.strictEqual(schemaDiffAdded.renderedValue, 'Organization, WebSite');
assert.strictEqual(schemaDiffAdded.status, 'ADDED');

// 5. Test Parity Comparison: REMOVED (Client-side JS wiped server schema)
const diffsRemoved = compareSeoSignals(sigsGraph, emptySigs);
const schemaDiffRemoved = diffsRemoved.find(d => d.name === 'structuredData');
console.log('Test 5 (Parity REMOVED):', schemaDiffRemoved);
assert(schemaDiffRemoved);
assert.strictEqual(schemaDiffRemoved.initialValue, 'Organization, WebSite');
assert.strictEqual(schemaDiffRemoved.renderedValue, '(none)');
assert.strictEqual(schemaDiffRemoved.status, 'REMOVED');

console.log('All Fetch & Render Structured Data Parity tests passed successfully!');
