import { buildSchemaObject } from './lib/seo/schema/builders';
import { validateSchema } from './lib/seo/schema/validators';
import { formatIsoDuration, isValidDateString, isValidWebUrl } from './lib/seo/schema/fieldUtils';
import { generateSchemaOutput } from './lib/seo/schema/export';
import { importExistingJsonLd } from './lib/seo/schema/importer';
import { getDefaultSchemasState } from './lib/seo/schema/schemaConfig';
import { SupportedSchemaType } from './lib/seo/schema/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- STARTING COMPREHENSIVE SCHEMA GENERATOR UNIT TESTS ---');

// 1. Duration converter tests
console.log('Testing ISO 8601 duration parser...');
assert(formatIsoDuration('30 mins') === 'PT30M', '30 mins should convert to PT30M');
assert(formatIsoDuration('1 hour 30 mins') === 'PT1H30M', '1 hr 30 mins should convert to PT1H30M');
assert(formatIsoDuration('45m') === 'PT45M', '45m should convert to PT45M');
assert(formatIsoDuration('PT2H') === 'PT2H', 'PT2H should remain PT2H');
assert(formatIsoDuration('invalid string') === null, 'invalid duration should return null');

// 2. URL validator tests
console.log('Testing URL format & security...');
assert(isValidWebUrl('https://indianmarketers.in'), 'https url should be valid');
assert(isValidWebUrl('http://example.com/test?a=1&b=2'), 'http url with query should be valid');
assert(!isValidWebUrl('javascript:alert(1)'), 'javascript: scheme must be rejected');
assert(!isValidWebUrl('data:text/html,test'), 'data: scheme must be rejected');
assert(!isValidWebUrl('file:///etc/passwd'), 'file: scheme must be rejected');

// 3. Date validator tests
console.log('Testing ISO date validation...');
assert(isValidDateString('2026-10-15'), 'YYYY-MM-DD should be valid');
assert(isValidDateString('2026-10-15T18:30:00+05:30'), 'Full ISO datetime should be valid');
assert(!isValidDateString('not-a-date'), 'invalid date should be rejected');

// 4. Test all default schemas generate valid JSON-LD
console.log('Testing builders for all 19 schema types...');
const defaultState = getDefaultSchemasState();
const allTypes: SupportedSchemaType[] = [
  'Article',
  'BlogPosting',
  'NewsArticle',
  'FAQPage',
  'HowTo',
  'LocalBusiness',
  'Restaurant',
  'Organization',
  'Person',
  'Product',
  'Event',
  'BreadcrumbList',
  'Recipe',
  'VideoObject',
  'ImageObject',
  'JobPosting',
  'WebSite',
  'WebPage',
  'SoftwareApplication',
  'Course',
  'Dataset',
  'Service',
];

for (const type of allTypes) {
  const schemaState = defaultState[type];
  const obj = buildSchemaObject(type, schemaState as unknown as Record<string, unknown>);
  assert(obj['@context'] === 'https://schema.org', `${type} must have @context https://schema.org`);
  
  // Verify clean serialization roundtrip
  const jsonStr = JSON.stringify(obj);
  assert(jsonStr.length > 20, `${type} json must not be empty`);
  const parsed = JSON.parse(jsonStr);
  assert(parsed['@context'] === 'https://schema.org', `${type} parsed context must match`);

  // Verify no undefined or empty string values serialized in top properties
  for (const [key, val] of Object.entries(parsed)) {
    assert(val !== undefined, `${type} property ${key} must not be undefined`);
    assert(val !== '', `${type} property ${key} must not be empty string`);
  }

  // Validate schema
  const issues = validateSchema(type, schemaState as unknown as Record<string, unknown>);
  const errors = issues.filter((i) => i.severity === 'error');
  assert(errors.length === 0, `${type} default preset must have 0 errors (found: ${errors.map((e) => e.message).join('; ')})`);
}

// 5. Test FAQPage generation & HTML protection
console.log('Testing FAQPage HTML protection...');
const faqState = {
  questions: [
    { id: '1', question: 'What is </script><script>alert(1)</script>?', answer: 'It is a test string.' }
  ]
};
const output = generateSchemaOutput('FAQPage', faqState, 'script');
assert(!output.code.includes('</script><script>'), 'Generated script tag must safely escape closing script tags');
assert(output.code.includes('<\\/script>'), 'Closing script tag inside content must be escaped');

// 6. Test BreadcrumbList automatic 1-based indexing
console.log('Testing BreadcrumbList position ordering...');
const breadcrumbs = buildSchemaObject('BreadcrumbList', {
  items: [
    { id: 'b1', name: 'Home', url: 'https://example.com' },
    { id: 'b2', name: 'Blog', url: 'https://example.com/blog' },
    { id: 'b3', name: 'Post', url: 'https://example.com/blog/post' },
  ]
});
const list = breadcrumbs.itemListElement as Array<{ position: number; name: string }>;
assert(list.length === 3, 'Breadcrumb must have 3 items');
assert(list[0].position === 1 && list[0].name === 'Home', 'First item must have position 1');
assert(list[1].position === 2 && list[1].name === 'Blog', 'Second item must have position 2');
assert(list[2].position === 3 && list[2].name === 'Post', 'Third item must have position 3');

// 7. Test Product Offers and Price
console.log('Testing Product offer formatting...');
const product = buildSchemaObject('Product', {
  name: 'Gaming Mouse',
  price: '4999',
  priceCurrency: 'INR',
  availability: 'InStock',
});
assert((product.offers as { price: number }).price === 4999, 'Product price must be a clean number');
assert((product.offers as { priceCurrency: string }).priceCurrency === 'INR', 'Product priceCurrency must be INR');

// 8. Test Importer
console.log('Testing JSON-LD Importer...');
const sampleScript = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Acme Corp",
  "url": "https://acme.example.com"
}
</script>`;
const importRes = importExistingJsonLd(sampleScript);
assert(importRes.success === true, 'Import should succeed');
assert(importRes.detectedType === 'Organization', 'Import should detect Organization');
assert(importRes.parsedData?.name === 'Acme Corp', 'Import should extract Acme Corp');

// 9. Test @type array (valid JSON-LD edge case)
console.log('Testing JSON-LD @type array import...');
const arrayTypeScript = `{
  "@context": "https://schema.org",
  "@type": ["Article", "NewsArticle"],
  "headline": "Test article"
}`;
const arrayImportRes = importExistingJsonLd(arrayTypeScript);
assert(arrayImportRes.success === true, '@type array import should succeed');
assert(
  arrayImportRes.detectedType === 'Article' || arrayImportRes.detectedType === 'NewsArticle',
  `@type array import should detect a supported article type (got ${arrayImportRes.detectedType})`
);
assert(
  typeof arrayImportRes.parsedData?.headline === 'string' && (arrayImportRes.parsedData.headline as string).length > 0,
  '@type array import should extract the headline'
);

// 10. Test Organization Subtype
console.log('Testing Organization Subtype serialization...');
const orgWithSubtype = buildSchemaObject('Organization', {
  subType: 'Corporation',
  name: 'Acme Enterprise Holdings',
  url: 'https://acme.example.com',
});
assert(orgWithSubtype['@type'] === 'Corporation', 'Organization with subType Corporation must output @type: Corporation');

// 11. Test ImageObject Google Licensable Metadata
console.log('Testing ImageObject builder & Google Licensable metadata...');
const imageObj = buildSchemaObject('ImageObject', {
  name: 'Diagram of Entity Search',
  contentUrl: 'https://example.com/photo.jpg',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  acquireLicensePage: 'https://example.com/buy-rights',
  creditText: 'Harsh Jha',
  creatorType: 'Person',
  creatorName: 'Harsh Jha',
  width: '1200',
  height: '630',
});
assert(imageObj['@type'] === 'ImageObject', 'ImageObject must have @type ImageObject');
assert(imageObj.contentUrl === 'https://example.com/photo.jpg', 'contentUrl must match');
assert(imageObj.license === 'https://creativecommons.org/licenses/by/4.0/', 'license must match');
assert(imageObj.acquireLicensePage === 'https://example.com/buy-rights', 'acquireLicensePage must match');
assert((imageObj.creator as { name: string }).name === 'Harsh Jha', 'creator name must match');

// 12. Test Importer for ImageObject & Corporation
console.log('Testing Importer with ImageObject & Corporation subtype...');
const imageScript = `{
  "@context": "https://schema.org",
  "@type": "ImageObject",
  "contentUrl": "https://example.com/imported.png",
  "license": "https://example.com/license"
}`;
const imgImport = importExistingJsonLd(imageScript);
assert(imgImport.success === true, 'ImageObject import must succeed');
assert(imgImport.detectedType === 'ImageObject', 'Detected type must be ImageObject');
assert(imgImport.parsedData?.contentUrl === 'https://example.com/imported.png', 'Parsed contentUrl must match');

const corpScript = `{
  "@context": "https://schema.org",
  "@type": "Corporation",
  "name": "Global Corp Ltd"
}`;
const corpImport = importExistingJsonLd(corpScript);
assert(corpImport.success === true, 'Corporation import must succeed');
assert(corpImport.detectedType === 'Organization', 'Corporation should detect as Organization');
assert(corpImport.parsedData?.subType === 'Corporation', 'Corporation subType must be preserved');
assert(corpImport.parsedData?.name === 'Global Corp Ltd', 'Corporation name must be extracted');

console.log('ALL UNIT & LOGIC TESTS PASSED SUCCESSFULLY! ✓');

