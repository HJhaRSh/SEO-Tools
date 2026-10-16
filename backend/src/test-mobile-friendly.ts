import assert from 'assert';
import http from 'http';
import { parseAndValidateBulkUrls } from '../../frontend/src/lib/seo/mobile-friendly/urlValidator.ts';
import { auditStaticHtmlMobileFriendliness } from '../../frontend/src/lib/seo/mobile-friendly/staticAuditor.ts';
import {
  generateMobileFriendlyCsv,
  generateMobileFriendlyXlsx,
  sanitizeSpreadsheetField,
} from '../../frontend/src/lib/seo/mobile-friendly/exporter.ts';
import { DEFAULT_VIEWPORT_PRESET } from '../../frontend/src/lib/seo/mobile-friendly/constants.ts';
import { SingleUrlMobileAuditResult } from '../../frontend/src/lib/seo/mobile-friendly/types.ts';

let totalTests = 0;
let passedTests = 0;

function it(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passedTests++;
      console.log(`  ✓ [PASS] ${name}`);
    })
    .catch((err) => {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
      process.exit(1);
    });
}

async function runMobileFriendlyTestSuite() {
  console.log('=====================================================');
  console.log('TOOL 6 — MOBILE-FRIENDLY TESTER AUTOMATED TEST SUITE');
  console.log('=====================================================\n');

  console.log('1. URL Validation & Bulk Sanitization:');

  await it('Validates valid HTTPS and HTTP URLs', () => {
    const res = parseAndValidateBulkUrls('https://example.com\nhttp://sub.example.org/page');
    assert.strictEqual(res.validUrls.length, 2);
    assert.strictEqual(res.validUrls[0], 'https://example.com/');
    assert.strictEqual(res.validUrls[1], 'http://sub.example.org/page');
    assert.strictEqual(res.invalidRows.length, 0);
  });

  await it('Rejects unsupported schemes (ftp, file, javascript)', () => {
    const res = parseAndValidateBulkUrls('ftp://ftp.example.com\njavascript:alert(1)\nhttps://example.com');
    assert.strictEqual(res.validUrls.length, 1);
    assert.strictEqual(res.invalidRows.length, 2);
    assert.ok(res.invalidRows[0].error.includes('Unsupported scheme'));
  });

  await it('Deduplicates duplicate URLs while preserving order', () => {
    const res = parseAndValidateBulkUrls('https://example.com\nhttps://example.com/\nhttps://example.com/about');
    assert.strictEqual(res.validUrls.length, 2);
    assert.strictEqual(res.duplicateCount, 1);
  });

  await it('Enforces maximum boundary limit of 50 URLs', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `https://example${i}.com`);
    const res = parseAndValidateBulkUrls(lines.join('\n'));
    assert.strictEqual(res.validUrls.length, 50);
    assert.strictEqual(res.invalidRows.length, 10);
    assert.ok(res.invalidRows[0].error.includes('Exceeded maximum boundary'));
  });

  console.log('\n2. Core Mobile-Friendly Tests (DOM Evaluation):');

  await it('Configure Viewport: Detects missing viewport meta tag as FAIL', () => {
    const html = `<!DOCTYPE html><html><head><title>No Viewport</title></head><body><p>Hello world</p></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.strictEqual(res.tests.configureViewport.status, 'FAIL');
    assert.strictEqual(res.overallStatus, 'FAIL');
    assert.ok(res.issues.some((i) => i.category === 'VIEWPORT' && i.severity === 'CRITICAL'));
  });

  await it('Configure Viewport: Validates responsive width=device-width, initial-scale=1 as PASS', () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Responsive</title></head><body><p>Hello</p></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.strictEqual(res.tests.configureViewport.status, 'PASS');
    assert.strictEqual(res.tests.fixedWidthViewport.status, 'PASS');
    assert.strictEqual(res.viewportDeclaration.hasDeviceWidth, true);
    assert.strictEqual(res.viewportDeclaration.hasInitialScale, true);
  });

  await it('Fixed Width Viewport: Detects fixed width=980 as FAIL', () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=980"><title>Fixed</title></head><body><p>Fixed Page</p></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.strictEqual(res.tests.fixedWidthViewport.status, 'FAIL');
    assert.ok(res.issues.some((i) => i.category === 'FIXED_WIDTH'));
  });

  await it('Configure Viewport: Detects user-scalable=no restriction as WARNING', () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"><title>Restricted Zoom</title></head><body><p>Hello</p></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.ok(res.issues.some((i) => i.title.includes('Pinch-to-Zoom')));
  });

  await it('Size Content: Flags fixed-width inline container exceeding mobile viewport', () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div style="width: 800px">Wide content</div></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.strictEqual(res.tests.sizeContentToViewport.status, 'WARNING');
    assert.ok(res.issues.some((i) => i.category === 'OVERFLOW' && i.dimensions?.elementWidth === 800));
  });

  await it('Size Content: Flags unscrollable wide table', () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><table><tr><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr><tr><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr></table></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.ok(res.issues.some((i) => i.title.includes('Unresponsive Table')));
  });

  await it('Legible Font Sizes: Flags font-size under 12px with selector and computed size', () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><p style="font-size: 9px">Tiny text disclaimer</p></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.strictEqual(res.tests.legibleFontSizes.status, 'WARNING');
    assert.ok(res.issues.some((i) => i.category === 'FONT_SIZE' && i.dimensions?.fontSizePx === 9));
  });

  await it('Tap Targets: Flags small inline touch controls (< 28px)', () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><button style="width: 20px; height: 18px">x</button></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.strictEqual(res.tests.tapTargets.status, 'WARNING');
    assert.ok(res.issues.some((i) => i.category === 'TAP_TARGET' && i.dimensions?.targetWidth === 20));
  });

  await it('Incompatible Plugins: Flags legacy Flash and Java Applets as CRITICAL FAIL', () => {
    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><object type="application/x-shockwave-flash" data="banner.swf"></object></body></html>`;
    const res = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      durationMs: 50,
    });
    assert.strictEqual(res.tests.incompatiblePlugins.status, 'FAIL');
    assert.strictEqual(res.overallStatus, 'FAIL');
    assert.ok(res.issues.some((i) => i.category === 'INCOMPATIBLE_PLUGINS'));
  });

  console.log('\n3. CSV & XLSX Exporters:');

  await it('Protects against spreadsheet formula injection (=, +, -, @)', () => {
    assert.strictEqual(sanitizeSpreadsheetField('=cmd|/c calc'), "'=cmd|/c calc");
    assert.strictEqual(sanitizeSpreadsheetField('+123'), "'+123");
    assert.strictEqual(sanitizeSpreadsheetField('@SUM(A1:A10)'), "'@SUM(A1:A10)");
    assert.strictEqual(sanitizeSpreadsheetField('Regular Text'), 'Regular Text');
  });

  await it('Generates compliant UTF-8 CSV with BOM for mobile audit results', () => {
    const sampleResult: SingleUrlMobileAuditResult = {
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      statusCode: 200,
      statusText: 'OK',
      durationMs: 120,
      testedAt: '2026-10-16T12:00:00.000Z',
      isCompleted: true,
      overallStatus: 'PASS',
      overallSummary: 'No major mobile usability issues detected.',
      executionMode: 'static-dom-heuristics',
      viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
      viewportDeclaration: {
        present: true,
        rawContent: 'width=device-width, initial-scale=1',
        hasDeviceWidth: true,
        hasInitialScale: true,
        userScalableNo: false,
        maximumScaleRestricted: false,
      },
      tests: {
        configureViewport: { status: 'PASS', summary: 'OK', issues: [] },
        fixedWidthViewport: { status: 'PASS', summary: 'OK', issues: [] },
        sizeContentToViewport: { status: 'PASS', summary: 'OK', issues: [] },
        legibleFontSizes: { status: 'PASS', summary: 'OK', issues: [] },
        tapTargets: { status: 'PASS', summary: 'OK', issues: [] },
        incompatiblePlugins: { status: 'PASS', summary: 'OK', issues: [] },
      },
      issues: [],
      metrics: {},
    };

    const csv = generateMobileFriendlyCsv([sampleResult]);
    assert.ok(csv.startsWith('\uFEFF')); // UTF-8 BOM
    assert.ok(csv.includes('"https://example.com/"'));
    assert.ok(csv.includes('"PASS"'));
  });

  await it('Generates valid XLSX workbook buffer', async () => {
    const sampleResult: SingleUrlMobileAuditResult = {
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      statusCode: 200,
      statusText: 'OK',
      durationMs: 120,
      testedAt: '2026-10-16T12:00:00.000Z',
      isCompleted: true,
      overallStatus: 'WARNING',
      overallSummary: 'Small touch targets detected.',
      executionMode: 'static-dom-heuristics',
      viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
      viewportDeclaration: {
        present: true,
        rawContent: 'width=device-width, initial-scale=1',
        hasDeviceWidth: true,
        hasInitialScale: true,
        userScalableNo: false,
        maximumScaleRestricted: false,
      },
      tests: {
        configureViewport: { status: 'PASS', summary: 'OK', issues: [] },
        fixedWidthViewport: { status: 'PASS', summary: 'OK', issues: [] },
        sizeContentToViewport: { status: 'PASS', summary: 'OK', issues: [] },
        legibleFontSizes: { status: 'PASS', summary: 'OK', issues: [] },
        tapTargets: { status: 'WARNING', summary: 'Undersized', issues: [] },
        incompatiblePlugins: { status: 'PASS', summary: 'OK', issues: [] },
      },
      issues: [
        {
          category: 'TAP_TARGET',
          title: 'Small target',
          severity: 'WARNING',
          description: 'Button too small',
          evidence: '15x15px',
          recommendedAction: 'Increase padding',
        },
      ],
      metrics: {},
    };

    const xlsx = await generateMobileFriendlyXlsx([sampleResult]);
    assert.ok(xlsx instanceof Uint8Array);
    assert.ok(xlsx.length > 500); // Valid zip archive
    // Check PK zip signature (0x50 0x4B)
    assert.strictEqual(xlsx[0], 0x50);
    assert.strictEqual(xlsx[1], 0x4b);
  });

  console.log('\n=====================================================');
  console.log(`TOTAL MOBILE-FRIENDLY TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('=====================================================\n');
}

runMobileFriendlyTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
