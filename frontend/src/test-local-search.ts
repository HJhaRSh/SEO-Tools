import {
  encodeUule,
  generateLocalSearchResults,
  buildGoogleSearchUrl,
  buildGoogleMapsSearchUrl,
  sanitizeSearchInput,
  normalizeCountryCode,
  normalizeLanguageCode,
  UULE_SECRET_KEY,
  UULE_CANONICAL_PREFIX
} from './lib/seo/localSearchService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    failed++;
  }
}

async function runLocalSearchTests() {
  console.log('\n=====================================================');
  console.log('LOCAL SEARCH RESULTS TOOL — VERIFICATION SUITE');
  console.log('=====================================================\n');

  // 1. UULE Canonical Encoding
  console.log('1. UULE Canonical Algorithm & Fixtures:');
  const sfLocation = 'San Francisco,California,United States';
  const sfEncoded = encodeUule(sfLocation);
  // Length is 38 -> secret key index 38 is 'm'
  assert(sfLocation.length === 38, 'San Francisco location length is 38');
  assert(UULE_SECRET_KEY[38] === 'm', 'Length key 38 resolves to m');
  assert(
    sfEncoded.uule === 'w+CAIQICImU2FuIEZyYW5jaXNjbyxDYWxpZm9ybmlhLFVuaXRlZCBTdGF0ZXM=',
    'UULE exactly matches verified TechnicalSEO / Google canonical fixture for San Francisco'
  );

  const mumbaiLocation = 'Mumbai, Maharashtra, India';
  const mumbaiEncoded = encodeUule(mumbaiLocation);
  assert(mumbaiEncoded.uule !== null, 'Mumbai canonical location encodes successfully');
  assert(mumbaiEncoded.uule?.startsWith(UULE_CANONICAL_PREFIX) === true, 'Mumbai UULE has canonical prefix');

  const londonLocation = 'London, England, United Kingdom';
  const londonEncoded = encodeUule(londonLocation);
  assert(londonEncoded.uule !== null, 'London canonical location encodes successfully');

  // Empty location fallback
  const emptyEncoded = encodeUule('');
  assert(emptyEncoded.uule === null, 'Empty location returns null without error');

  // Very long location exceeding UULE index limit (>63 chars)
  const longLoc = 'A'.repeat(75);
  const longEncoded = encodeUule(longLoc);
  assert(longEncoded.uule === null, 'Excessive length location returns null fallback');
  assert(Boolean(longEncoded.warning), 'Excessive length location provides informative warning');

  // 2. Input Sanitization & Normalization
  console.log('\n2. Input Sanitization & Validation:');
  assert(sanitizeSearchInput('  best restaurants   in Mumbai  \u0000') === 'best restaurants in Mumbai', 'Sanitizes whitespace & control characters');
  assert(sanitizeSearchInput('A'.repeat(500), 50).length === 50, 'Enforces max length bound');
  assert(normalizeCountryCode('IN') === 'in', 'Normalizes uppercase country code');
  assert(normalizeCountryCode('  us ') === 'us', 'Normalizes padded country code');
  assert(normalizeCountryCode('invalidCountry') === '', 'Rejects invalid country code');
  assert(normalizeLanguageCode('EN') === 'en', 'Normalizes language code');
  assert(normalizeLanguageCode('en-us') === 'en-us', 'Accepts locale language code');
  assert(normalizeLanguageCode('invalidLangTooLong') === '', 'Rejects malformed language code');

  // 3. Google Search URL Generation
  console.log('\n3. Google Search URL Construction:');
  const searchUrl1 = buildGoogleSearchUrl({
    query: 'best restaurants in Mumbai',
    countryCode: 'in',
    languageCode: 'en',
    reducePersonalization: true,
    uule: mumbaiEncoded.uule
  });
  const parsed1 = new URL(searchUrl1);
  assert(parsed1.hostname === 'www.google.com', 'Search host is www.google.com');
  assert(parsed1.pathname === '/search', 'Search path is /search');
  assert(parsed1.searchParams.get('q') === 'best restaurants in Mumbai', 'Parameter q is preserved correctly');
  assert(parsed1.searchParams.get('gl') === 'in', 'Parameter gl is in');
  assert(parsed1.searchParams.get('hl') === 'en', 'Parameter hl is en');
  assert(parsed1.searchParams.get('pws') === '0', 'Parameter pws is 0');
  assert(parsed1.searchParams.get('uule') === mumbaiEncoded.uule, 'Parameter uule matches generated UULE');
  assert(parsed1.searchParams.get('ip') === '0.0.0.0', 'Parameter ip decouples client IP');

  // Special characters & Unicode in query
  const unicodeQuery = 'सर्वश्रेष्ठ रेस्टोरेंट & कैफे Mumbai 100% "veg"';
  const searchUrlUnicode = buildGoogleSearchUrl({ query: unicodeQuery, countryCode: 'in', languageCode: 'hi' });
  const parsedUnicode = new URL(searchUrlUnicode);
  assert(parsedUnicode.searchParams.get('q') === unicodeQuery, 'Handles Hindi, ampersands, quotes and special characters cleanly');
  assert(parsedUnicode.searchParams.get('hl') === 'hi', 'Sets Hindi language hl=hi');

  // 4. Google Maps Search URL Generation
  console.log('\n4. Google Maps Search URL Construction:');
  const maps1 = buildGoogleMapsSearchUrl('dentist near me', 'Andheri West, Mumbai, India');
  const parsedMaps1 = new URL(maps1.url);
  assert(parsedMaps1.origin === 'https://www.google.com', 'Maps origin is https://www.google.com');
  assert(parsedMaps1.pathname === '/maps/search/', 'Maps path is /maps/search/');
  assert(parsedMaps1.searchParams.get('api') === '1', 'Maps api param is 1');
  assert(parsedMaps1.searchParams.get('query') === 'dentist near me, Andheri West, Mumbai, India', 'Maps query combined properly');

  // Avoid duplicating location if already inside query
  const maps2 = buildGoogleMapsSearchUrl('pizza in Mumbai', 'Mumbai');
  assert(maps2.mapsQuery === 'pizza in Mumbai', 'Does not duplicate location if query already contains it');

  // 5. Full Pipeline & Edge Cases
  console.log('\n5. Full Local Search Generation Pipeline:');
  const fullResult = generateLocalSearchResults({
    query: 'SEO agency',
    location: 'London, England, United Kingdom',
    countryCode: 'gb',
    languageCode: 'en',
    reducePersonalization: true
  });
  assert(fullResult.uuleStatus === 'encoded', 'Status is encoded');
  assert(fullResult.countryCode === 'gb', 'Country code is gb');
  assert(fullResult.reducePersonalization === true, 'Personalization reduction is true');
  assert(fullResult.googleSearchEmbedUrl.includes('igu=1'), 'Search embed URL includes igu=1 for inline browser pane');
  assert(fullResult.googleMapsEmbedUrl.includes('output=embed'), 'Maps embed URL includes output=embed for inline browser pane');

  // Blank query error handling
  let threwError = false;
  try {
    generateLocalSearchResults({ query: '   ' });
  } catch (err: unknown) {
    threwError = true;
  }
  assert(threwError, 'Throws validation error when query is empty');

  // 6. Zero Duplicate q Parameter & Accented Unicode Locations:
  console.log('\n6. Duplicate Parameter Protection & Accented Canonical Locations:');
  const saoPauloEncoded = encodeUule('São Paulo, State of São Paulo, Brazil');
  assert(saoPauloEncoded.uule !== null, 'Accented location São Paulo encodes without error');
  assert(saoPauloEncoded.uule?.startsWith('w+CAIQICI') === true, 'São Paulo has canonical prefix');

  // Verify URL replacement produces exactly one q parameter without duplicate keys
  const testUrl = new URL(fullResult.googleSearchUrl);
  const cityIntent = 'London';
  testUrl.searchParams.set('q', `${fullResult.searchQuery} in ${cityIntent}`);
  assert(testUrl.searchParams.getAll('q').length === 1, 'URL has exactly 1 q parameter');
  assert(testUrl.searchParams.get('q') === 'SEO agency in London', 'Query string replaced correctly with city intent');

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runLocalSearchTests();
