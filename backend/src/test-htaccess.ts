import assert from 'assert';
import { testHtaccessRules } from './seo/htaccessService.js';
import { validateHtaccessInput } from './seo/htaccessValidation.js';
import { HTACCESS_EXAMPLES } from './seo/htaccessExamples.js';

async function runHtaccessTests() {
  console.log('=====================================================');
  console.log('TOOL 3 — .HTACCESS TESTER AUTOMATED TEST SUITE');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ✗ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  // 1. Validation & Security Tests
  console.log('1. Input Validation & Security Tests:');
  await testCase('Reject empty URL', async () => {
    assert.throws(() => validateHtaccessInput('', 'RewriteEngine On'), /Please enter a valid URL/);
  });

  await testCase('Reject empty .htaccess rules', async () => {
    assert.throws(() => validateHtaccessInput('https://example.com', '   \n  '), /The \.htaccess rule content is empty/);
  });

  await testCase('Reject disallowed protocol/ports in URL', async () => {
    assert.throws(() => validateHtaccessInput('ftp://example.com', 'RewriteEngine On'), /Unsupported URL protocol/);
  });

  // 2. RewriteEngine Activation Tests
  console.log('\n2. RewriteEngine State Tests:');
  await testCase('Do not execute RewriteRule when RewriteEngine is OFF', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/old-page',
      htaccess: `RewriteEngine Off\nRewriteRule ^old-page$ /new-page [R=301,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, false);
    assert.strictEqual(res.outputUrl, 'https://example.com/old-page');
    assert.strictEqual(res.transformationType, 'NO_CHANGE');
  });

  // 3. Scenario A: HTTP to HTTPS
  console.log('\n3. Common SEO Scenarios:');
  await testCase('Scenario A — HTTP to HTTPS 301 Redirection', async () => {
    const res = await testHtaccessRules({
      url: 'http://example.com/about',
      htaccess: `RewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^(.*)$ https://example.com/$1 [R=301,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/about');
    assert.strictEqual(res.transformationType, 'EXTERNAL_REDIRECT');
  });

  // 4. Scenario B: Non-www to www
  await testCase('Scenario B — Non-www to www 301 Redirection', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/contact',
      htaccess: `RewriteEngine On\nRewriteCond %{HTTP_HOST} ^example\\.com$ [NC]\nRewriteRule ^(.*)$ https://www.example.com/$1 [R=301,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://www.example.com/contact');
  });

  // 5. Scenario C: www to non-www
  await testCase('Scenario C — www to non-www 301 Redirection', async () => {
    const res = await testHtaccessRules({
      url: 'https://www.example.com/pricing',
      htaccess: `RewriteEngine On\nRewriteCond %{HTTP_HOST} ^www\\.example\\.com$ [NC]\nRewriteRule ^(.*)$ https://example.com/$1 [R=301,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/pricing');
  });

  // 6. Scenario D: Single Page 301 Migration
  await testCase('Scenario D — Single Page 301 Migration', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/old-page',
      htaccess: `RewriteEngine On\nRewriteRule ^old-page/?$ /new-page [R=301,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/new-page');
    assert.strictEqual(res.appliedRule?.lineNumber, 2);
  });

  // 7. Scenario E: Directory Migration with Captures
  await testCase('Scenario E — Directory Migration with $1 capture reference', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/blog/seo-checklist-2026',
      htaccess: `RewriteEngine On\nRewriteRule ^blog/(.*)$ /articles/$1 [R=301,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/articles/seo-checklist-2026');
  });

  // 8. Scenario F: Query Parameter Handling with %1 Condition Capture and Discard
  await testCase('Scenario F — Query string parameter extraction (%1) and discard (?)', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/product.php?id=123',
      htaccess: `RewriteEngine On\nRewriteCond %{QUERY_STRING} ^id=([0-9]+)$\nRewriteRule ^product\\.php$ /products/%1? [R=301,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/products/123');
  });

  // 9. Internal Rewrite (No [R] flag)
  console.log('\n4. Internal Rewrite vs External Redirect Tests:');
  await testCase('Internal Rewrite should NOT produce an HTTP 301 redirect code', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/products/shoes',
      htaccess: `RewriteEngine On\nRewriteRule ^products/(.*)$ /index.php?category=$1 [L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(res.transformationType, 'INTERNAL_REWRITE');
    assert.strictEqual(res.outputUrl, 'https://example.com/index.php?category=shoes');
  });

  // 10. Mod_alias Redirect and RedirectMatch
  console.log('\n5. Mod_alias Directives:');
  await testCase('Redirect 301 directive execution', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/legacy/doc',
      htaccess: `Redirect 301 /legacy/doc https://example.com/modern/doc`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/modern/doc');
  });

  await testCase('RedirectMatch 301 with regex capture', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/old/docs/intro',
      htaccess: `RedirectMatch 301 ^/old/docs/(.*)$ /new/docs/$1`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/new/docs/intro');
  });

  // 11. Security Flags (F for Forbidden, G for Gone)
  console.log('\n6. Security & HTTP Status Flags:');
  await testCase('RewriteRule with [F] flag returns 403 Forbidden', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/admin/secrets',
      htaccess: `RewriteEngine On\nRewriteRule ^admin/ - [F,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.transformationType, 'FORBIDDEN');
    assert.strictEqual(res.statusCode, 403);
  });

  await testCase('RewriteRule with [G] flag returns 410 Gone', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/discontinued-item',
      htaccess: `RewriteEngine On\nRewriteRule ^discontinued-item - [G,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.transformationType, 'GONE');
    assert.strictEqual(res.statusCode, 410);
  });

  // 12. Primary Engine Integration (Network test with fallback safety)
  console.log('\n7. Primary Engine Execution & Line Diagnostics:');
  await testCase('Primary API integration returns structured line-by-line trace', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/test-page',
      htaccess: `RewriteEngine On\nRewriteRule ^test-page$ /landing [R=301,L]`
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.outputUrl, 'https://example.com/landing');
    assert.strictEqual(res.statusCode, 301);
    assert.ok(res.trace.length >= 2);
    assert.strictEqual(res.trace[0].isValid, true);
    assert.strictEqual(res.trace[1].isMet, true);
    assert.ok(res.privacyNotice.length > 0);
  });

  console.log('\n=====================================================');
  console.log(`TOTAL .HTACCESS TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHtaccessTests();
