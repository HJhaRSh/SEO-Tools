import assert from 'assert';
import http from 'http';
import { validateFetchRenderRequest } from './seo/fetchRenderValidation.js';
import { extractSeoSignals, compareSeoSignals, generateDiagnostics } from './seo/fetchRenderAnalysis.js';
import { FETCH_RENDER_USER_AGENTS, getFetchRenderUserAgent } from './seo/fetchRenderUserAgents.js';
import { checkSubresourceRobotsPolicy } from './seo/fetchRenderRobots.js';
import { executeBrowserRender, closeSharedBrowser } from './seo/fetchRenderBrowser.js';
import { runFetchAndRenderTest, getStoredResult, getDownloadPayload } from './seo/fetchRenderService.js';
import { isBlockedHostname, isPrivateOrReservedIP } from './seo/ssrf.js';

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  totalTests++;
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passedTests++;
      console.log(`  ✓ [PASS] ${name}`);
    })
    .catch((err) => {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

async function main() {
  console.log('\n=====================================================');
  console.log('TOOL 5 — FETCH & RENDER AUTOMATED TEST SUITE');
  console.log('=====================================================\n');

  console.log('1. URL Validation & SSRF Security:');

  await runTest('Accepts valid HTTPS URL', () => {
    const res = validateFetchRenderRequest({ url: 'https://example.com/page/' });
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.url, 'https://example.com/page/');
  });

  await runTest('Accepts valid HTTP URL', () => {
    const res = validateFetchRenderRequest({ url: 'http://example.com/blog' });
    assert.strictEqual(res.isValid, true);
  });

  await runTest('Rejects missing or empty URL', () => {
    const res = validateFetchRenderRequest({ url: '' });
    assert.strictEqual(res.isValid, false);
    assert.match(res.error || '', /URL is required/);
  });

  await runTest('Rejects unsupported protocol schemes (file://, ftp://, javascript:)', () => {
    const res1 = validateFetchRenderRequest({ url: 'file:///etc/passwd' });
    assert.strictEqual(res1.isValid, false);

    const res2 = validateFetchRenderRequest({ url: 'ftp://example.com/file.zip' });
    assert.strictEqual(res2.isValid, false);

    const res3 = validateFetchRenderRequest({ url: 'javascript:alert(1)' });
    assert.strictEqual(res3.isValid, false);
  });

  await runTest('Detects and blocks localhost and loopback IPv4/IPv6', () => {
    assert.strictEqual(isBlockedHostname('localhost'), true);
    assert.strictEqual(isBlockedHostname('localhost.localdomain'), true);
    assert.strictEqual(isPrivateOrReservedIP('127.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('127.0.0.2'), true);
    assert.strictEqual(isPrivateOrReservedIP('::1'), true);
  });

  await runTest('Detects and blocks private IPv4 networks (RFC 1918)', () => {
    assert.strictEqual(isPrivateOrReservedIP('10.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('172.16.5.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('172.31.255.255'), true);
    assert.strictEqual(isPrivateOrReservedIP('192.168.1.1'), true);
  });

  await runTest('Detects and blocks cloud metadata endpoints (169.254.169.254 & Google metadata)', () => {
    assert.strictEqual(isPrivateOrReservedIP('169.254.169.254'), true);
    assert.strictEqual(isBlockedHostname('metadata.google.internal'), true);
    assert.strictEqual(isBlockedHostname('instance-data'), true);
  });

  await runTest('Detects and blocks internal domain extensions (.local, .internal, .corp)', () => {
    assert.strictEqual(isBlockedHostname('server.local'), true);
    assert.strictEqual(isBlockedHostname('backend.internal'), true);
    assert.strictEqual(isBlockedHostname('database.corp'), true);
  });

  console.log('\n2. User Agent Definitions & Simulation Integrity:');

  await runTest('Includes verified Googlebot Smartphone with mobile viewport', () => {
    const ua = getFetchRenderUserAgent('googlebot-smartphone');
    assert.strictEqual(ua.token, 'googlebot');
    assert.strictEqual(ua.viewport.isMobile, true);
    assert.strictEqual(ua.isGooglebot, true);
    assert.match(ua.disclaimer, /simulation/i);
  });

  await runTest('Includes verified Googlebot Desktop with desktop viewport', () => {
    const ua = getFetchRenderUserAgent('googlebot-desktop');
    assert.strictEqual(ua.token, 'googlebot');
    assert.strictEqual(ua.viewport.isMobile, false);
    assert.strictEqual(ua.viewport.width, 1920);
  });

  await runTest('Includes verified Bingbot and modern Chrome definitions', () => {
    const bing = getFetchRenderUserAgent('bingbot');
    assert.strictEqual(bing.token, 'bingbot');

    const chrome = getFetchRenderUserAgent('chrome-desktop');
    assert.strictEqual(chrome.category, 'browser');
    assert.match(chrome.fullUserAgent, /Chrome\//);
  });

  console.log('\n3. SEO Signal Extraction & Parity Comparison:');

  await runTest('Extracts title, meta description, robots, and canonical from HTML', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="Test description text">
          <meta name="robots" content="index, follow">
          <link rel="canonical" href="https://example.com/canonical-test">
          <link rel="alternate" hreflang="es" href="https://example.com/es/test">
        </head>
        <body>
          <h1>First H1 Heading</h1>
          <h1>Second H1 Heading</h1>
          <p>This is paragraph text with ten words for testing word count.</p>
          <a href="/internal-page">Internal Link</a>
          <a href="https://external.org/page">External Link</a>
          <img src="/img1.png" alt="Test Alt">
          <img src="/img2.png">
          <script type="application/ld+json">
            { "@context": "https://schema.org", "@type": "Article", "headline": "Test Headline" }
          </script>
        </body>
      </html>
    `;

    const signals = extractSeoSignals(sampleHtml, 'https://example.com/page');
    assert.strictEqual(signals.title, 'Test Page Title');
    assert.strictEqual(signals.metaDescription, 'Test description text');
    assert.strictEqual(signals.metaRobots, 'index, follow');
    assert.strictEqual(signals.canonicalUrl, 'https://example.com/canonical-test');
    assert.strictEqual(signals.h1Headings.length, 2);
    assert.strictEqual(signals.internalLinksCount, 1);
    assert.strictEqual(signals.externalLinksCount, 1);
    assert.strictEqual(signals.imagesCount, 2);
    assert.strictEqual(signals.imagesWithAltCount, 1);
    assert.strictEqual(signals.structuredDataTypes[0], 'Article');
    assert.strictEqual(signals.hreflangTags.length, 1);
    assert.ok(signals.wordCount >= 10);
  });

  await runTest('Detects SEO parity differences between initial and rendered versions', () => {
    const initialSignals = extractSeoSignals(
      '<html><head><title>Initial Title</title></head><body><h1>Old H1</h1><p>Three words here</p></body></html>',
      'https://example.com'
    );
    const renderedSignals = extractSeoSignals(
      '<html><head><title>New JS Title</title><link rel="canonical" href="https://example.com/new"></head><body><h1>New H1</h1><p>Many more words added dynamically by client side React hydration</p></body></html>',
      'https://example.com'
    );

    const diffs = compareSeoSignals(initialSignals, renderedSignals);

    const titleDiff = diffs.find(d => d.name === 'title');
    assert.strictEqual(titleDiff?.status, 'MODIFIED');

    const canonDiff = diffs.find(d => d.name === 'canonicalUrl');
    assert.strictEqual(canonDiff?.status, 'ADDED');

    const h1Diff = diffs.find(d => d.name === 'h1Headings');
    assert.strictEqual(h1Diff?.status, 'MODIFIED');

    const wordDiff = diffs.find(d => d.name === 'wordCount');
    assert.strictEqual(wordDiff?.status, 'ADDED');
  });

  console.log('\n4. robots.txt Rule Policy Enforcement:');

  await runTest('Correctly blocks disallowed subresources under applicable robots rules', () => {
    const robotsContent = `
      User-agent: Googlebot
      Disallow: /assets/private/
      Allow: /assets/private/public.js
    `;

    const res1 = checkSubresourceRobotsPolicy('https://example.com/assets/private/app.js', robotsContent, 'googlebot');
    assert.strictEqual(res1.isAllowed, false);
    assert.strictEqual(res1.status, 'DISALLOWED');

    const res2 = checkSubresourceRobotsPolicy('https://example.com/assets/private/public.js', robotsContent, 'googlebot');
    assert.strictEqual(res2.isAllowed, true);
    assert.strictEqual(res2.status, 'ALLOWED');
  });

  console.log('\n5. Real Playwright Chromium Browser Rendering & Isolation:');

  // Spin up a deterministic local test fixture server
  let fixtureServer!: http.Server;
  let fixturePort!: number;

  await new Promise<void>((resolve) => {
    fixtureServer = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/static') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Static Page</title></head>
            <body><h1>Pure Server HTML</h1><p>No JavaScript.</p></body>
          </html>
        `);
      } else if (url === '/dynamic-react') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Initial Pre-JS Title</title></head>
            <body>
              <div id="root">Loading application...</div>
              <script>
                // Simulate client-side React hydration
                document.title = "Client Rendered Dynamic Title";
                const root = document.getElementById("root");
                root.innerHTML = "<h1>Injected by Client JavaScript</h1><p>Client side paragraph text has rendered successfully.</p>";
                console.error("Test console error from client script");
              </script>
            </body>
          </html>
        `);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    fixtureServer.listen(0, '127.0.0.1', () => {
      const addr = fixtureServer.address() as any;
      fixturePort = addr.port;
      resolve();
    });
  });

  try {
    await runTest('Executes real Chromium browser, runs JavaScript, and captures rendered DOM', async () => {
      const ua = getFetchRenderUserAgent('googlebot-smartphone');
      const renderRes = await executeBrowserRender({
        url: `http://127.0.0.1:${fixturePort}/dynamic-react`,
        userAgent: ua,
        respectRobots: false,
        postLoadWaitMs: 300,
        timeoutMs: 10000,
        acceptLanguage: 'en-US,en;q=0.9',
        captureScreenshot: true,
        allowLocalhostForTesting: true
      });

      assert.strictEqual(renderRes.renderStatus, 'COMPLETED');
      assert.ok(renderRes.renderedHtml.includes('Client Rendered Dynamic Title'));
      assert.ok(renderRes.renderedHtml.includes('Injected by Client JavaScript'));

      // Verify screenshot generation
      assert.ok(typeof renderRes.screenshotBase64 === 'string');
      assert.ok(renderRes.screenshotBase64.length > 500);

      // Verify PNG magic header
      const pngBuffer = Buffer.from(renderRes.screenshotBase64, 'base64');
      assert.strictEqual(pngBuffer[0], 0x89);
      assert.strictEqual(pngBuffer[1], 0x50); // 'P'
      assert.strictEqual(pngBuffer[2], 0x4e); // 'N'
      assert.strictEqual(pngBuffer[3], 0x47); // 'G'

      // Verify console error was captured
      const errorMsg = renderRes.consoleMessages.find(m => m.text.includes('Test console error'));
      assert.ok(errorMsg !== undefined);
      assert.strictEqual(errorMsg?.type, 'error');
    });

    console.log('\n6. Bounded Storage & Download Token Management:');

    await runTest('Stores and retrieves downloads with cryptographically secure tokens', async () => {
      // Test the service end-to-end with the fixture URL
      const fullResult = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${fixturePort}/dynamic-react`,
          mode: 'fetch-and-render',
          postLoadWaitMs: 200,
          captureScreenshot: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.ok(fullResult.id);
      assert.strictEqual(fullResult.summary.httpStatus, 200);
      assert.strictEqual(fullResult.summary.renderingStatus, 'COMPLETED');

      // Verify initial title differs from rendered title
      assert.strictEqual(fullResult.seoSignals.initial.title, 'Initial Pre-JS Title');
      assert.strictEqual(fullResult.seoSignals.rendered?.title, 'Client Rendered Dynamic Title');

      // Verify downloads were generated
      assert.ok(fullResult.downloads.originalHtmlId);
      assert.ok(fullResult.downloads.renderedHtmlId);
      assert.ok(fullResult.downloads.screenshotId);
      assert.ok(fullResult.downloads.reportJsonId);
      assert.ok(fullResult.downloads.seoDiffCsvId);

      const htmlPayload = getDownloadPayload(fullResult.downloads.originalHtmlId);
      assert.ok(htmlPayload);
      assert.strictEqual(htmlPayload?.mimeType, 'text/html; charset=utf-8');

      const screenshotPayload = getDownloadPayload(fullResult.downloads.screenshotId!);
      assert.ok(screenshotPayload);
      assert.strictEqual(screenshotPayload?.mimeType, 'image/png');

      const csvPayload = getDownloadPayload(fullResult.downloads.seoDiffCsvId);
      assert.ok(csvPayload);
      assert.ok(csvPayload?.data.toString('utf-8').includes('Page Title'));

      // Verify stored result retrieval
      const retrieved = getStoredResult(fullResult.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved?.id, fullResult.id);
    });

  } finally {
    fixtureServer.close();
    await closeSharedBrowser();
  }

  console.log('\n=====================================================');
  console.log(`TOTAL TOOL 5 TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('=====================================================\n');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
