import assert from 'assert';
import http from 'http';
import { validateFetchRenderRequest } from './seo/fetchRenderValidation.js';
import { extractSeoSignals, compareSeoSignals, generateDiagnostics } from './seo/fetchRenderAnalysis.js';
import { FETCH_RENDER_USER_AGENTS, getFetchRenderUserAgent, findFetchRenderUserAgent } from './seo/fetchRenderUserAgents.js';
import { checkSubresourceRobotsPolicy, checkRobotsTxtCrawlability } from './seo/fetchRenderRobots.js';
import { executeBrowserRender, closeSharedBrowser } from './seo/fetchRenderBrowser.js';
import {
  runFetchAndRenderTest,
  getStoredResult,
  getDownloadPayload,
  storeDownloadPayload,
  evictStoreEntries,
  getStoreMetrics,
  clearStoresForTesting,
  MAX_STORED_RESULTS,
  MAX_BYTES_PER_RESULT,
  MAX_TOTAL_RESULT_BYTES,
  MAX_DOWNLOAD_ITEM_BYTES,
  MAX_TOTAL_DOWNLOAD_BYTES
} from './seo/fetchRenderService.js';
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
  console.log('TOOL 5 — FETCH & RENDER EXPANDED AUTOMATED QA SUITE');
  console.log('=====================================================\n');

  // =========================================================
  // GROUP 1: URL VALIDATION & SSRF NETWORK DEFENSE
  // =========================================================
  console.log('1. URL Validation & SSRF Security Defenses:');

  await runTest('Accepts valid HTTPS and HTTP URLs', () => {
    const res1 = validateFetchRenderRequest({ url: 'https://example.com/page/' });
    assert.strictEqual(res1.isValid, true);
    const res2 = validateFetchRenderRequest({ url: 'http://example.com/blog' });
    assert.strictEqual(res2.isValid, true);
  });

  await runTest('Rejects missing, blank, or invalid scheme URLs', () => {
    assert.strictEqual(validateFetchRenderRequest({ url: '' }).isValid, false);
    assert.strictEqual(validateFetchRenderRequest({ url: 'file:///etc/passwd' }).isValid, false);
    assert.strictEqual(validateFetchRenderRequest({ url: 'ftp://files.org/data' }).isValid, false);
    assert.strictEqual(validateFetchRenderRequest({ url: 'javascript:alert(1)' }).isValid, false);
  });

  await runTest('SSRF Guard: Detects and blocks loopback and localhost destinations', () => {
    assert.strictEqual(isBlockedHostname('localhost'), true);
    assert.strictEqual(isBlockedHostname('localhost.localdomain'), true);
    assert.strictEqual(isPrivateOrReservedIP('127.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('127.0.0.2'), true);
    assert.strictEqual(isPrivateOrReservedIP('::1'), true);
  });

  await runTest('SSRF Guard: Detects and blocks private IPv4 ranges (RFC 1918)', () => {
    assert.strictEqual(isPrivateOrReservedIP('10.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('172.16.5.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('172.31.255.255'), true);
    assert.strictEqual(isPrivateOrReservedIP('192.168.1.1'), true);
    assert.strictEqual(isPrivateOrReservedIP('192.168.0.100'), true);
  });

  await runTest('SSRF Guard: Detects and blocks cloud metadata endpoints', () => {
    assert.strictEqual(isPrivateOrReservedIP('169.254.169.254'), true);
    assert.strictEqual(isBlockedHostname('metadata.google.internal'), true);
    assert.strictEqual(isBlockedHostname('instance-data'), true);
  });

  await runTest('SSRF Guard: Detects and blocks internal domain extensions (.internal, .local, .corp)', () => {
    assert.strictEqual(isBlockedHostname('app.local'), true);
    assert.strictEqual(isBlockedHostname('db.internal'), true);
    assert.strictEqual(isBlockedHostname('corp.intranet'), true);
  });

  // =========================================================
  // GROUP 2: USER-AGENT SPECIFICATION & STRICT REJECTION
  // =========================================================
  console.log('\n2. User-Agent Specification & Strict Rejection:');

  await runTest('Supports Googlebot Smartphone with mobile emulation', () => {
    const ua = getFetchRenderUserAgent('googlebot-smartphone');
    assert.strictEqual(ua.token, 'googlebot');
    assert.strictEqual(ua.viewport.isMobile, true);
    assert.strictEqual(ua.viewport.width, 412);
    assert.strictEqual(ua.isGooglebot, true);
    assert.match(ua.disclaimer, /simulation/i);
  });

  await runTest('Supports Googlebot Desktop with desktop viewport', () => {
    const ua = getFetchRenderUserAgent('googlebot-desktop');
    assert.strictEqual(ua.token, 'googlebot');
    assert.strictEqual(ua.viewport.isMobile, false);
    assert.strictEqual(ua.viewport.width, 1920);
  });

  await runTest('Supports Bingbot, Chrome Desktop, and Chrome Mobile', () => {
    const bing = getFetchRenderUserAgent('bingbot');
    assert.strictEqual(bing.token, 'bingbot');

    const chromeD = getFetchRenderUserAgent('chrome-desktop');
    assert.strictEqual(chromeD.category, 'browser');

    const chromeM = getFetchRenderUserAgent('chrome-mobile');
    assert.strictEqual(chromeM.viewport.isMobile, true);
  });

  await runTest('Rejects unknown User-Agent ID with explicit error (No silent Googlebot fallback)', () => {
    const res = validateFetchRenderRequest({
      url: 'https://example.com',
      userAgent: 'unknown-spoofed-crawler-xyz'
    });
    assert.strictEqual(res.isValid, false);
    assert.match(res.error || '', /Unknown User-Agent ID/);

    // Verify getFetchRenderUserAgent throws on unknown ID
    assert.throws(() => {
      getFetchRenderUserAgent('unknown-spoofed-crawler-xyz');
    }, /Unknown User-Agent ID/);
  });

  await runTest('Defaults to Googlebot Smartphone when User-Agent is omitted', () => {
    const res = validateFetchRenderRequest({ url: 'https://example.com' });
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.userAgentId, 'googlebot-smartphone');
  });

  // =========================================================
  // GROUP 3: MEMORY BOUNDS, BYTE LIMITS & EVICITON
  // =========================================================
  console.log('\n3. Strict Storage Bounds, Byte Caps & Eviction:');

  await runTest('Rejects individual download payloads exceeding max item byte size (5 MiB)', () => {
    const oversizedPayload = Buffer.alloc(MAX_DOWNLOAD_ITEM_BYTES + 1024);
    assert.throws(() => {
      storeDownloadPayload('oversized.dat', 'application/octet-stream', oversizedPayload);
    }, /exceeds maximum permitted size/);
  });

  await runTest('Enforces aggregate download storage cap via full eviction loop', () => {
    clearStoresForTesting();
    // Add multiple valid payloads
    const chunkSize = 1 * 1024 * 1024; // 1 MiB each
    const tokens: string[] = [];
    for (let i = 0; i < 55; i++) {
      const token = storeDownloadPayload(`chunk-${i}.bin`, 'application/octet-stream', Buffer.alloc(chunkSize));
      tokens.push(token);
    }

    const metrics = getStoreMetrics();
    // Verify total bytes is strictly <= MAX_TOTAL_DOWNLOAD_BYTES (50 MiB)
    assert.ok(metrics.totalDownloadBytes <= MAX_TOTAL_DOWNLOAD_BYTES, `Total bytes ${metrics.totalDownloadBytes} exceeded max ${MAX_TOTAL_DOWNLOAD_BYTES}`);
    assert.ok(metrics.downloadsCount <= 50);

    // First tokens should have been evicted
    assert.strictEqual(getDownloadPayload(tokens[0]), undefined);
    // Recent tokens should still be retrievable
    assert.ok(getDownloadPayload(tokens[tokens.length - 1]));
  });

  // =========================================================
  // GROUP 4: DETERMINISTIC LOCAL HTTP FIXTURE SERVER
  // =========================================================
  console.log('\n4. Deterministic robots.txt & Chromium Browser Integration QA:');

  let fixtureServer!: http.Server;
  let fixturePort!: number;
  let multiStatusCounter = 0;

  await new Promise<void>((resolve) => {
    fixtureServer = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`User-agent: *\nDisallow: /private/\nDisallow: /sub-blocked.js\nAllow: /public/\n`);
      } else if (url === '/private/test-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><head><title>Private Area</title></head><body><h1>Private Page</h1></body></html>`);
      } else if (url === '/public/test-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><head><title>Public Area</title></head><body><h1>Public Page</h1></body></html>`);
      } else if (url === '/multi-status') {
        multiStatusCounter++;
        if (multiStatusCounter === 1) {
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          res.end('Service Unavailable');
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', counter: multiStatusCounter }));
        }
      } else if (url === '/sub-blocked.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end('window.subBlockedLoaded = true;');
      } else if (url === '/controlled-render') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Original Server Title</title>
              <script src="/sub-blocked.js"></script>
            </head>
            <body>
              <div id="static-content">Server Static Text</div>
              <img src="/missing-asset-404.jpg" alt="Missing Test Image" />
              <script>
                // 1. Modify title dynamically
                document.title = "Rendered Dynamic Title";

                // 2. Inject canonical dynamically
                const can = document.createElement('link');
                can.rel = 'canonical';
                can.href = 'https://example.com/dynamically-injected-canonical';
                document.head.appendChild(can);

                // 3. Inject dynamic content
                const div = document.createElement('div');
                div.id = 'dynamic-content';
                div.innerText = 'Rendered Dynamic Content By JavaScript';
                document.body.appendChild(div);

                // 4. Intentional console error
                console.error('Intentional Client QA Console Error');

                // 5. Fire repeated requests to /multi-status (first 503, then 200)
                fetch('/multi-status').then(() => {
                  fetch('/multi-status');
                });
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
    // TEST: Main URL Disallowed Pre-Fetch Enforcement
    await runTest('FIX 1: When respectRobots=true, disallows main URL without fetching or rendering', async () => {
      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${fixturePort}/private/test-page`,
          mode: 'fetch-and-render',
          respectRobots: true
        },
        { allowLocalhostForTesting: true }
      );

      // Verify crawl disallowed status
      assert.strictEqual(result.summary.crawlability, 'DISALLOWED');
      assert.strictEqual(result.summary.httpStatus, 0);
      assert.strictEqual(result.summary.renderingStatus, 'FETCH_ONLY');
      assert.strictEqual(result.robotsInfo.blockedMainUrl, true);

      // Verify rawHtml is empty and rendering was SKIPPED
      assert.strictEqual(result.initialFetch.rawHtml, '');
      assert.strictEqual(result.renderResult?.renderStatus, 'SKIPPED');

      // Verify diagnostic is present
      const disallowDiag = result.diagnostics.find(d => d.id === 'diag_robots_disallowed');
      assert.ok(disallowDiag !== undefined);
      assert.strictEqual(disallowDiag?.severity, 'ERROR');
    });

    // TEST: Main URL Allowed Post-Robots Evaluation
    await runTest('FIX 1: Allows allowed URL under robots.txt policy', async () => {
      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${fixturePort}/public/test-page`,
          mode: 'fetch-only',
          respectRobots: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(result.summary.crawlability, 'ALLOWED');
      assert.strictEqual(result.summary.httpStatus, 200);
      assert.ok(result.initialFetch.rawHtml.includes('Public Page'));
    });

    // TEST: robots.txt Override when respectRobots=false
    await runTest('FIX 1: When respectRobots=false, allows crawl but flags warning diagnostic', async () => {
      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${fixturePort}/private/test-page`,
          mode: 'fetch-only',
          respectRobots: false
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(result.summary.httpStatus, 200);
      assert.ok(result.initialFetch.rawHtml.includes('Private Page'));

      const overrideDiag = result.diagnostics.find(d => d.id === 'diag_robots_override');
      assert.ok(overrideDiag !== undefined);
      assert.strictEqual(overrideDiag?.severity, 'WARNING');
    });

    // TEST: Real Chromium Execution, Subresource Robots Blocking, Resource Identity & Parity
    await runTest('FIX 4 & FIX 7: Real Chromium execution with subresource robots blocking, multi-request tracking, and DOM diffing', async () => {
      multiStatusCounter = 0; // reset counter

      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${fixturePort}/controlled-render`,
          mode: 'fetch-and-render',
          respectRobots: true,
          postLoadWaitMs: 600,
          captureScreenshot: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(result.summary.renderingStatus, 'COMPLETED');
      assert.strictEqual(result.initialFetch.statusCode, 200);

      // Verify DOM diffing
      assert.strictEqual(result.seoSignals.initial.title, 'Original Server Title');
      assert.strictEqual(result.seoSignals.rendered?.title, 'Rendered Dynamic Title');
      assert.strictEqual(result.seoSignals.initial.canonicalUrl, null);
      assert.strictEqual(result.seoSignals.rendered?.canonicalUrl, 'https://example.com/dynamically-injected-canonical');

      // Check comparison items
      const titleDiff = result.seoSignals.comparison.find(c => c.name === 'title');
      assert.strictEqual(titleDiff?.status, 'MODIFIED');

      const canonDiff = result.seoSignals.comparison.find(c => c.name === 'canonicalUrl');
      assert.strictEqual(canonDiff?.status, 'ADDED');

      // Verify Screenshot
      assert.ok(result.renderResult?.screenshotBase64);
      const pngBuf = Buffer.from(result.renderResult!.screenshotBase64!, 'base64');
      assert.strictEqual(pngBuf[0], 0x89); // PNG magic bytes
      assert.strictEqual(pngBuf[1], 0x50);

      // Verify Subresource robots.txt blocking
      const blockedRes = result.renderResult?.resources.find(r => r.url.includes('/sub-blocked.js'));
      assert.ok(blockedRes !== undefined, 'Subresource /sub-blocked.js should be tracked');
      assert.strictEqual(blockedRes?.loadStatus, 'BLOCKED_ROBOTS');
      assert.strictEqual(blockedRes?.robotsStatus, 'DISALLOWED');

      // Verify Missing Asset (404)
      const missingRes = result.renderResult?.resources.find(r => r.url.includes('/missing-asset-404.jpg'));
      assert.ok(missingRes !== undefined, 'Missing asset should be tracked');
      assert.strictEqual(missingRes?.httpStatus, 404);
      assert.strictEqual(missingRes?.loadStatus, 'FAILED');

      // Verify Repeated requests to same URL have distinct entries and statuses (503 and 200)
      const multiRequests = result.renderResult?.resources.filter(r => r.url.includes('/multi-status')) || [];
      assert.ok(multiRequests.length >= 2, `Expected at least 2 requests to /multi-status, got ${multiRequests.length}`);
      const has503 = multiRequests.some(r => r.httpStatus === 503);
      const has200 = multiRequests.some(r => r.httpStatus === 200);
      assert.ok(has503, 'Should track 503 status for first request');
      assert.ok(has200, 'Should track 200 status for second request');
      // Each request should have an internally assigned unique requestId
      assert.notStrictEqual(multiRequests[0].requestId, multiRequests[1].requestId);

      // Verify Console Errors
      const consoleErr = result.renderResult?.consoleMessages.find(c => c.text.includes('Intentional Client QA Console Error'));
      assert.ok(consoleErr !== undefined);
      assert.strictEqual(consoleErr?.type, 'error');
    });

  } finally {
    fixtureServer.close();
    await closeSharedBrowser();
  }

  // =========================================================
  // GROUP 5: RFC 9309 STATUS HANDLING
  // =========================================================
  console.log('\n5. RFC 9309 Robots.txt Failure & Status Code Tests:');

  await runTest('RFC 9309: Subresource direct evaluation returns ALLOWED when allowed', () => {
    const policy = checkSubresourceRobotsPolicy('https://example.com/assets/app.js', 'User-agent: *\nAllow: /assets/\n', 'googlebot');
    assert.strictEqual(policy.status, 'ALLOWED');
    assert.strictEqual(policy.isAllowed, true);
  });

  await runTest('RFC 9309: Subresource direct evaluation returns DISALLOWED when blocked', () => {
    const policy = checkSubresourceRobotsPolicy('https://example.com/secret/bundle.js', 'User-agent: *\nDisallow: /secret/\n', 'googlebot');
    assert.strictEqual(policy.status, 'DISALLOWED');
    assert.strictEqual(policy.isAllowed, false);
  });

  console.log('\n=====================================================');
  console.log(`TOTAL TOOL 5 TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('=====================================================\n');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
