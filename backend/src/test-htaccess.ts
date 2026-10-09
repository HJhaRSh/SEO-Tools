/**
 * Tool 3 — .htaccess Tester Automated Regression Test Suite
 */

import { HTACCESS_EXAMPLES } from './seo/htaccessExamples.js';
import { testHtaccessRules, deriveServerVariables } from './seo/htaccessService.js';
import { sanitizeHtaccessSettings } from './seo/htaccessValidation.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('=====================================================');
  console.log('TOOL 3 — .HTACCESS TESTER AUTOMATED REGRESSION SUITE');
  console.log('=====================================================\n');

  // 1. Template Registry Integrity
  console.log('1. Template Registry:');
  assert(HTACCESS_EXAMPLES.length === 8, 'Preserves all eight reference .htaccess templates');
  const ids = HTACCESS_EXAMPLES.map(t => t.id);
  assert(ids.includes('http-to-https'), 'Includes http-to-https template');
  assert(ids.includes('non-www-to-www'), 'Includes non-www-to-www template');
  assert(ids.includes('www-to-non-www'), 'Includes www-to-non-www template');
  assert(ids.includes('single-page-301'), 'Includes single-page-301 template');
  assert(ids.includes('directory-migration'), 'Includes directory-migration template');
  assert(ids.includes('query-param-redirect'), 'Includes query-param-redirect template');
  assert(ids.includes('trailing-slash'), 'Includes trailing-slash template');
  assert(ids.includes('mod-alias-redirectmatch'), 'Includes mod-alias-redirectmatch template');

  // 2. Server Variable Derivation
  console.log('\n2. Server Variable Derivation:');
  const vars = deriveServerVariables(new URL('https://example.com/test?q=seo'));
  assert(vars.HTTPS === 'on', 'HTTPS set to on for https URL');
  assert(vars.HTTP_HOST === 'example.com', 'HTTP_HOST derived correctly');
  assert(vars.REQUEST_URI === '/test?q=seo', 'REQUEST_URI derived correctly');
  assert(vars.QUERY_STRING === 'q=seo', 'QUERY_STRING derived correctly');

  // 3. Settings Sanitization
  console.log('\n3. Settings Sanitization:');
  const cleanSettings = sanitizeHtaccessSettings({
    useLocalOnly: true,
    maxRewritePasses: 5,
    untrustedMockPayload: 'attack'
  });
  assert(cleanSettings.useLocalOnly === true, 'Sanitizes and preserves boolean settings');
  assert(cleanSettings.maxRewritePasses === 5, 'Preserves numeric maxRewritePasses');
  assert(!('untrustedMockPayload' in cleanSettings), 'Strips non-whitelisted properties');

  // 4. Local Engine Rule Evaluation
  console.log('\n4. Local Deterministic Rule Evaluation:');
  const res = await testHtaccessRules({
    url: 'http://example.com/about-us',
    htaccess: `RewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^(.*)$ https://example.com/$1 [R=301,L]`,
    settings: { useLocalOnly: true }
  });
  assert(res.success === true, 'Successfully evaluates RewriteRule locally');
  assert(res.outputUrl === 'https://example.com/about-us', 'Redirects http to https correctly');
  assert(res.statusCode === 301, 'Returns HTTP 301 status code');
  assert(res.engineUsed === 'LOCAL_FALLBACK', 'Reports LOCAL_FALLBACK engine used');

  console.log('\n=====================================================');
  console.log(`TOTAL TOOL 3 HTACCESS TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
