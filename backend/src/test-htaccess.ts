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

  // 13. ISSUE 1 — RewriteCond [OR] Evaluation Suite
  console.log('\n8. ISSUE 1 — RewriteCond [OR] Evaluation:');
  const orHtaccess = `RewriteEngine On
RewriteCond %{HTTP_HOST} ^example\\.com$ [OR]
RewriteCond %{HTTP_HOST} ^example\\.org$
RewriteRule ^about$ /new-about [R=301,L]`;

  await testCase('OR group: first condition true matches and redirects', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/about',
      htaccess: orHtaccess,
      serverVariables: { HTTP_HOST: 'example.com' },
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/new-about');
  });

  await testCase('OR group: second condition true matches and redirects', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.org/about',
      htaccess: orHtaccess,
      serverVariables: { HTTP_HOST: 'example.org' },
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.org/new-about');
  });

  await testCase('OR group: neither condition true fails and does not redirect', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.net/about',
      htaccess: orHtaccess,
      serverVariables: { HTTP_HOST: 'example.net' },
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, false);
    assert.strictEqual(res.transformationType, 'NO_CHANGE');
    assert.strictEqual(res.outputUrl, 'https://example.net/about');
  });

  await testCase('Multiple AND conditions: all must match', async () => {
    const andRules = `RewriteEngine On
RewriteCond %{HTTP_HOST} ^example\\.com$
RewriteCond %{REQUEST_METHOD} GET
RewriteRule ^shop$ /new-shop [R=301,L]`;

    const matchRes = await testHtaccessRules({
      url: 'https://example.com/shop',
      htaccess: andRules,
      serverVariables: { HTTP_HOST: 'example.com', REQUEST_METHOD: 'GET' },
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(matchRes.changed, true);
    assert.strictEqual(matchRes.outputUrl, 'https://example.com/new-shop');

    const failRes = await testHtaccessRules({
      url: 'https://example.com/shop',
      htaccess: andRules,
      serverVariables: { HTTP_HOST: 'example.com', REQUEST_METHOD: 'POST' },
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(failRes.changed, false);
  });

  await testCase('Mixed AND/OR groups: (A OR B) AND C', async () => {
    const mixedRules = `RewriteEngine On
RewriteCond %{HTTP_HOST} ^alpha\\.com$ [OR]
RewriteCond %{HTTP_HOST} ^beta\\.com$
RewriteCond %{HTTPS} on
RewriteRule ^portal$ /secure-portal [R=301,L]`;

    // alpha.com with HTTPS on -> MATCH
    const r1 = await testHtaccessRules({
      url: 'https://alpha.com/portal',
      htaccess: mixedRules,
      serverVariables: { HTTP_HOST: 'alpha.com', HTTPS: 'on' },
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(r1.changed, true);

    // beta.com with HTTPS on -> MATCH
    const r2 = await testHtaccessRules({
      url: 'https://beta.com/portal',
      htaccess: mixedRules,
      serverVariables: { HTTP_HOST: 'beta.com', HTTPS: 'on' },
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(r2.changed, true);

    // beta.com with HTTPS off -> FAIL
    const r3 = await testHtaccessRules({
      url: 'http://beta.com/portal',
      htaccess: mixedRules,
      serverVariables: { HTTP_HOST: 'beta.com', HTTPS: 'off' },
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(r3.changed, false);
  });

  // 14. ISSUE 2 — Unsupported Flags
  console.log('\n9. ISSUE 2 — Unsupported Flags:');
  await testCase('Rule with [PT] flag returns UNSUPPORTED and does not execute blindly', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/passthru',
      htaccess: `RewriteEngine On\nRewriteRule ^passthru$ /app/run [PT,L]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.transformationType, 'UNSUPPORTED');
    assert.strictEqual(res.fullyEvaluated, false);
    assert.ok(res.warnings.some(w => w.includes('[PT]')));
  });

  await testCase('Rule with [N] (Next) flag returns UNSUPPORTED', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/loop',
      htaccess: `RewriteEngine On\nRewriteRule ^loop$ /next [N]`,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.transformationType, 'UNSUPPORTED');
    assert.strictEqual(res.fullyEvaluated, false);
  });

  // 15. ISSUE 3 — Internal Rewrite & [L] vs [END]
  console.log('\n10. ISSUE 3 — Internal Rewrites, [L], [END], & Loop Detection:');
  await testCase('Multi-pass evaluation with [L]: internal rewrite followed by redirect', async () => {
    const rules = `RewriteEngine On
RewriteRule ^old$ /new [L]
RewriteRule ^new$ /final [R=301,L]`;

    const res = await testHtaccessRules({
      url: 'https://example.com/old',
      htaccess: rules,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/final');
  });

  await testCase('[END] flag prevents subsequent passes', async () => {
    const rules = `RewriteEngine On
RewriteRule ^old$ /new [END]
RewriteRule ^new$ /final [R=301,L]`;

    const res = await testHtaccessRules({
      url: 'https://example.com/old',
      htaccess: rules,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.transformationType, 'INTERNAL_REWRITE');
    assert.strictEqual(res.outputUrl, 'https://example.com/new');
  });

  await testCase('Circular rewrite loop is detected and halted safely', async () => {
    const rules = `RewriteEngine On
RewriteRule ^page-a$ /page-b [L]
RewriteRule ^page-b$ /page-a [L]`;

    const res = await testHtaccessRules({
      url: 'https://example.com/page-a',
      htaccess: rules,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.transformationType, 'UNKNOWN');
    assert.strictEqual(res.fullyEvaluated, false);
    assert.ok(res.warnings.some(w => w.includes('loop detected')));
  });

  // 16. ISSUE 5 — RewriteBase & Relative URL Substitutions
  console.log('\n11. ISSUE 5 — RewriteBase & Relative URL Substitutions:');
  await testCase('Relative substitution with RewriteBase /shop/', async () => {
    const rules = `RewriteEngine On
RewriteBase /shop/
RewriteRule ^old$ new [R=301,L]`;

    const res = await testHtaccessRules({
      url: 'https://example.com/shop/old',
      htaccess: rules,
      settings: { useLocalOnly: true, directoryContext: '/shop/' }
    });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/shop/new');
  });

  // 17. ISSUE 6 — Query String Handling
  console.log('\n12. ISSUE 6 — Query String Handling (QSA, QSD, Preserve):');
  await testCase('Preserve existing query string when no ? in substitution', async () => {
    const rules = `RewriteEngine On\nRewriteRule ^old-page$ /new-page [R=301,L]`;
    const res = await testHtaccessRules({
      url: 'https://example.com/old-page?source=google',
      htaccess: rules,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.outputUrl, 'https://example.com/new-page?source=google');
  });

  await testCase('QSA appends original query to substitution query', async () => {
    const rules = `RewriteEngine On\nRewriteRule ^search$ /results?type=all [QSA,R=301,L]`;
    const res = await testHtaccessRules({
      url: 'https://example.com/search?source=google',
      htaccess: rules,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.outputUrl, 'https://example.com/results?type=all&source=google');
  });

  await testCase('QSD discards original query string', async () => {
    const rules = `RewriteEngine On\nRewriteRule ^old-page$ /new-page [QSD,R=301,L]`;
    const res = await testHtaccessRules({
      url: 'https://example.com/old-page?tracking=123',
      htaccess: rules,
      settings: { useLocalOnly: true }
    });
    assert.strictEqual(res.outputUrl, 'https://example.com/new-page');
  });

  // 18. ISSUE 4 & ISSUE 8 & FIX 9 — Primary Engine Response Validation & Mocking
  console.log('\n13. Primary Engine Response Validation & Mock Scenarios:');
  
  await testCase('Primary API Mock: Successful 301 evaluation', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/mock-test',
      htaccess: `RewriteEngine On\nRewriteRule ^mock-test$ /target [R=301,L]`,
      settings: {
        mockApiResponse: {
          output_url: 'https://example.com/target',
          output_status_code: 301,
          lines: [
            { value: 'RewriteEngine On', isValid: true, wasReached: true, isMet: true, isSupported: true, message: 'RewriteEngine turned ON' },
            { value: 'RewriteRule ^mock-test$ /target [R=301,L]', isValid: true, wasReached: true, isMet: true, isSupported: true, message: 'Redirected to https://example.com/target' }
          ]
        }
      }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.transformationType, 'EXTERNAL_REDIRECT');
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/target');
    assert.strictEqual(res.engineUsed, 'PRIMARY_API');
    assert.strictEqual(res.fullyEvaluated, true);
  });

  await testCase('Primary API Mock: Invalid directive reports INVALID_RULES and syntax error', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/broken',
      htaccess: `RewriteRuleInvalidPattern`,
      settings: {
        mockApiResponse: {
          output_url: 'https://example.com/broken',
          output_status_code: null,
          lines: [
            { value: 'RewriteRuleInvalidPattern', isValid: false, wasReached: true, isMet: false, message: 'Syntax error: invalid directive' }
          ]
        }
      }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.transformationType, 'INVALID_RULES');
    assert.strictEqual(res.fullyEvaluated, false);
    assert.ok(res.errors.length > 0);
  });

  await testCase('Primary API Mock: Unsupported directive reports warning and fullyEvaluated false', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/custom',
      htaccess: `SomeUnsupportedModuleDirective on`,
      settings: {
        mockApiResponse: {
          output_url: 'https://example.com/custom',
          output_status_code: null,
          lines: [
            { value: 'SomeUnsupportedModuleDirective on', isValid: true, wasReached: true, isMet: false, isSupported: false, message: 'Directive not supported by Apache tester' }
          ]
        }
      }
    });
    assert.strictEqual(res.fullyEvaluated, false);
    assert.ok(res.warnings.some(w => w.includes('unsupported by the primary simulation engine')));
  });

  await testCase('Primary API Mock: Malformed/Empty object response falls back to local engine', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/malformed',
      htaccess: `RewriteEngine On\nRewriteRule ^malformed$ /recovered [R=301,L]`,
      settings: {
        mockApiResponse: null
      }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.engineUsed, 'LOCAL_FALLBACK');
    assert.strictEqual(res.outputUrl, 'https://example.com/recovered');
  });

  await testCase('Primary API Mock: Timeout / HTTP 500 error triggers local fallback', async () => {
    const res = await testHtaccessRules({
      url: 'https://example.com/timeout-test',
      htaccess: `RewriteEngine On\nRewriteRule ^timeout-test$ /fallback-target [R=301,L]`,
      settings: {
        mockApiError: 'Primary testing API returned HTTP status 500: Server Error'
      }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.statusCode, 301);
    assert.strictEqual(res.outputUrl, 'https://example.com/fallback-target');
    assert.strictEqual(res.engineUsed, 'LOCAL_FALLBACK');
    assert.ok(res.warnings.some(w => w.includes('Primary engine unavailable')));
  });

  // 19. All 8 Quick-Load Templates Regression Test
  console.log('\n14. Regression Verification for All 8 Quick-Load SEO Templates:');
  for (const tpl of HTACCESS_EXAMPLES) {
    await testCase(`Quick-load Template "${tpl.title}" evaluates successfully`, async () => {
      const res = await testHtaccessRules({
        url: tpl.sampleUrl,
        htaccess: tpl.rules,
        settings: { useLocalOnly: true }
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.changed, true);
      assert.ok(res.trace.length > 0);
    });
  }

  console.log('\n=====================================================');
  console.log(`TOTAL .HTACCESS TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHtaccessTests();
