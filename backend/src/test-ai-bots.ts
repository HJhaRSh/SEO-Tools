import { sanitizeBulkUrls, analyzePageContent, runAiBotAccessTest } from './seo/aiBotTesterService.js';
import { AI_BOT_REGISTRY, getAiBotById } from './seo/aiBotRegistry.js';
import assert from 'assert';

async function runAiBotTests() {
  console.log('=====================================================');
  console.log('TOOL 2 — AI BOT ACCESS TESTER AUTOMATED TEST SUITE');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function testCase(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ✗ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  async function testCaseAsync(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ✗ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  // 1. Bulk URL Sanitizer Tests
  console.log('1. Bulk URL Sanitization:');
  testCase('Deduplicate and clean valid URLs', () => {
    const raw = [
      'https://example.com/page1',
      'https://example.com/page1',
      'example.com/page2',
      '   ',
      'https://example.com/page3#fragment'
    ];
    const { validUrls } = sanitizeBulkUrls(raw);
    assert.strictEqual(validUrls.length, 3);
    assert.strictEqual(validUrls[0], 'https://example.com/page1');
    assert.strictEqual(validUrls[1], 'https://example.com/page2');
    assert.strictEqual(validUrls[2], 'https://example.com/page3');
  });

  testCase('Enforce 100 URL boundary', () => {
    const raw = Array.from({ length: 110 }, (_, i) => `https://example.com/page-${i}`);
    const { validUrls, errors } = sanitizeBulkUrls(raw);
    assert.strictEqual(validUrls.length, 100);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /Maximum 100 URLs/);
  });

  // 2. AI Bot Registry Integrity
  console.log('\n2. AI Bot Registry Integrity:');
  testCase('Ensure all 35 reference AI bots are registered with correct tokens', () => {
    assert.strictEqual(AI_BOT_REGISTRY.length, 35);
    assert.strictEqual(AI_BOT_REGISTRY[0].name, 'OpenAI');
    assert.strictEqual(AI_BOT_REGISTRY[0].token, 'GPTBot');
    assert.strictEqual(AI_BOT_REGISTRY[34].name, 'SemrushBot-OCOB');
    assert.strictEqual(AI_BOT_REGISTRY[34].token, 'SemrushBot-OCOB');

    assert.ok(getAiBotById('gptbot'));
    assert.ok(getAiBotById('claudebot'));
    assert.ok(getAiBotById('oai-searchbot'));
    assert.ok(getAiBotById('perplexitybot'));
    assert.ok(getAiBotById('bytespider'));
    assert.ok(getAiBotById('omgili'));
    assert.ok(getAiBotById('semrushbot-ocob'));
  });

  testCase('Verify Policy-Only Token special cases', () => {
    const gExt = getAiBotById('google-extended');
    assert.strictEqual(gExt?.isPolicyOnlyToken, true);
    assert.strictEqual(gExt?.isHttpTestable, false);

    const aExt = getAiBotById('applebot-extended');
    assert.strictEqual(aExt?.isPolicyOnlyToken, true);
    assert.strictEqual(aExt?.isHttpTestable, false);

    const wExt = getAiBotById('webzio-extended');
    assert.strictEqual(wExt?.isPolicyOnlyToken, true);
    assert.strictEqual(wExt?.isHttpTestable, false);
  });

  // 3. Challenge & Content Detection
  console.log('\n3. Content Access & Challenge Detection:');
  testCase('Detect Cloudflare Challenge screen', () => {
    const html = '<html><head><title>Just a moment...</title></head><body>Please verify you are a human before accessing. Turnstile challenge.</body></html>';
    const res = analyzePageContent(200, 'text/html', html);
    assert.strictEqual(res.status, 'POSSIBLE_CHALLENGE');
    assert.strictEqual(res.challengeDetected, true);
  });

  testCase('Do not falsely classify normal pages mentioning Cloudflare as challenges', () => {
    const html = '<html><head><title>Cloudflare Review & Features</title></head><body><h1>About Cloudflare CDN</h1><p>We use Cloudflare for our DNS and SSL acceleration.</p></body></html>';
    const res = analyzePageContent(200, 'text/html', html);
    assert.strictEqual(res.status, 'CONTENT_RETRIEVED');
    assert.strictEqual(res.challengeDetected, false);
    assert.ok(res.wordCount > 5);
  });

  testCase('Identify normal HTML content and word count', () => {
    const html = '<html><head><title>SEO Articles</title></head><body><h1>Welcome to Indian Marketers SEO Suite</h1><p>Comprehensive tools.</p></body></html>';
    const res = analyzePageContent(200, 'text/html', html);
    assert.strictEqual(res.status, 'CONTENT_RETRIEVED');
    assert.strictEqual(res.title, 'SEO Articles');
    assert.strictEqual(res.wordCount, 10);
  });

  testCase('Identify HTTP 403 Access Denied', () => {
    const res = analyzePageContent(403, 'text/html', 'Forbidden');
    assert.strictEqual(res.status, 'ACCESS_DENIED');
  });

  // 4. Fallback Isolation Test (Issue 4)
  console.log('\n4. Fallback Independence Tests:');
  testCase('Verify OAI-SearchBot and GPTBot have independent tokens and no borrowed fallbacks', () => {
    const gpt = getAiBotById('gptbot');
    const oaiSearch = getAiBotById('oai-searchbot');
    assert.strictEqual(gpt?.token, 'GPTBot');
    assert.strictEqual(oaiSearch?.token, 'OAI-SearchBot');
    assert.strictEqual(oaiSearch?.fallbackToken, undefined);
  });

  // 5. Duplicate URL Reporting Test (Issue 8)
  console.log('\n5. Duplicate URL Reporting:');
  testCase('Accurately track submitted, unique, and duplicate counts', () => {
    const raw = [
      'https://example.com/blog',
      'https://example.com/about',
      'https://example.com/blog',
      'https://example.com/blog#ref'
    ];
    const { validUrls, stats, warnings } = sanitizeBulkUrls(raw);
    assert.strictEqual(stats.submittedCount, 4);
    assert.strictEqual(stats.uniqueCount, 2);
    assert.strictEqual(stats.duplicateCount, 2);
    assert.ok(warnings.length > 0);
    assert.match(warnings[0], /2 duplicate URLs were removed/);
  });

  // 6. Batch 3-Layer Evaluation & Blocked-Skip Test (Issue 1 & 2)
  console.log('\n6. Batch 3-Layer Access Evaluation:');
  await testCaseAsync('Evaluate Wikipedia: GPTBot (Blocked & Skipped HTTP) & Google-Extended (Policy Only)', async () => {
    const res = await runAiBotAccessTest({
      urls: ['https://en.wikipedia.org/wiki/Special:Search'],
      botIds: ['gptbot', 'google-extended']
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.results.length, 2);

    const gptResult = res.results.find(r => r.botId === 'gptbot');
    assert.strictEqual(gptResult?.robotsTxt.status, 'BLOCKED');
    // Issue 1: HTTP must be NOT_TESTED when robots.txt is BLOCKED
    assert.strictEqual(gptResult?.http.status, 'NOT_TESTED');
    assert.strictEqual(gptResult?.content.status, 'NOT_TESTED');
    assert.match(gptResult?.explanation || '', /HTTP testing skipped because robots\.txt disallows/);

    const gExtResult = res.results.find(r => r.botId === 'google-extended');
    assert.strictEqual(gExtResult?.http.isPolicyOnly, true);
    assert.strictEqual(gExtResult?.http.status, 'NOT_APPLICABLE');
    assert.strictEqual(gExtResult?.content.status, 'NOT_APPLICABLE');
  });

  console.log('\n=====================================================');
  console.log(`TOTAL AI BOT TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAiBotTests();
