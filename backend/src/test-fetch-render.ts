import assert from 'assert';
import http from 'http';
import { validateFetchRenderRequest } from './seo/fetchRenderValidation.js';
import { extractSeoSignals, compareSeoSignals, generateDiagnostics } from './seo/fetchRenderAnalysis.js';
import { FETCH_RENDER_USER_AGENTS, getFetchRenderUserAgent, findFetchRenderUserAgent } from './seo/fetchRenderUserAgents.js';
import { checkSubresourceRobotsPolicy, checkRobotsTxtCrawlability, SubresourceRobotsManager } from './seo/fetchRenderRobots.js';
import { executeBrowserRender, closeSharedBrowser } from './seo/fetchRenderBrowser.js';
import {
  runFetchAndRenderTest,
  getStoredResult,
  getDownloadPayload,
  storeDownloadPayload,
  storeResult,
  evictStoreEntries,
  getStoreMetrics,
  clearStoresForTesting,
  calculateResultRetainedBytes,
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
  console.log('TOOL 5 — FETCH & RENDER VERIFIED QA & SECURITY SUITE');
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

  await runTest('SSRF Guard: Detects and blocks internal domain extensions (.internal, .local, .corp, .intranet, .lan)', () => {
    assert.strictEqual(isBlockedHostname('app.local'), true);
    assert.strictEqual(isBlockedHostname('db.internal'), true);
    assert.strictEqual(isBlockedHostname('corp.intranet'), true);
    assert.strictEqual(isBlockedHostname('gateway.lan'), true);
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
  // GROUP 3: MEMORY BOUNDS, RECALCULATION & EVICTION
  // =========================================================
  console.log('\n3. Strict Storage Bounds, Size Recalculation & Eviction:');

  await runTest('Rejects individual download payloads exceeding max item byte size (5 MiB)', () => {
    const oversizedPayload = Buffer.alloc(MAX_DOWNLOAD_ITEM_BYTES + 1024);
    assert.throws(() => {
      storeDownloadPayload('oversized.dat', 'application/octet-stream', oversizedPayload);
    }, /exceeds maximum permitted size/);
  });

  await runTest('Enforces aggregate download storage cap via full eviction loop', () => {
    clearStoresForTesting();
    const chunkSize = 1 * 1024 * 1024; // 1 MiB each
    const tokens: string[] = [];
    for (let i = 0; i < 55; i++) {
      const token = storeDownloadPayload(`chunk-${i}.bin`, 'application/octet-stream', Buffer.alloc(chunkSize));
      tokens.push(token);
    }

    const metrics = getStoreMetrics();
    assert.ok(metrics.totalDownloadBytes <= MAX_TOTAL_DOWNLOAD_BYTES, `Total bytes ${metrics.totalDownloadBytes} exceeded max ${MAX_TOTAL_DOWNLOAD_BYTES}`);
    assert.ok(metrics.downloadsCount <= 50);
    assert.strictEqual(getDownloadPayload(tokens[0]), undefined);
    assert.ok(getDownloadPayload(tokens[tokens.length - 1]));
  });

  await runTest('FIX 3: Retained size recalculation drops screenshot and updates byte accounting', () => {
    clearStoresForTesting();
    const ua = getFetchRenderUserAgent('googlebot-desktop');

    // Create a result with 3.5 MB screenshot + 1 MB html = 4.5 MB (exceeds 4 MiB)
    const largeScreenshot = Buffer.alloc(3.5 * 1024 * 1024, 'a').toString('base64');
    const mockResult: any = {
      id: 'test-mem-recalc-1',
      timestamp: new Date().toISOString(),
      requestedUrl: 'https://example.com/mem-test',
      finalUrl: 'https://example.com/mem-test',
      mode: 'fetch-and-render',
      userAgent: ua,
      summary: {
        httpStatus: 200,
        httpStatusText: 'OK',
        crawlability: 'ALLOWED',
        renderingStatus: 'COMPLETED',
        indexabilitySignal: 'NO_BLOCKING_SIGNAL',
        totalDurationMs: 500,
        totalIssuesCount: { errors: 0, warnings: 0, notices: 0 }
      },
      initialFetch: {
        requestedUrl: 'https://example.com/mem-test',
        finalUrl: 'https://example.com/mem-test',
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        rawHtml: '<html><body>Short initial</body></html>',
        byteSize: 35,
        durationMs: 50,
        redirectHistory: [],
        contentType: 'text/html',
        isTruncated: false
      },
      renderResult: {
        renderedHtml: '<html><body>' + 'x'.repeat(500 * 1024) + '</body></html>', // 500 KB
        byteSize: 500 * 1024,
        renderDurationMs: 300,
        screenshotBase64: largeScreenshot, // ~4.6 MB base64
        resources: [],
        consoleMessages: [],
        totalResourcesLoaded: 1,
        totalResourcesFailed: 0,
        totalResourcesBlocked: 0,
        isTruncated: false,
        renderStatus: 'COMPLETED'
      },
      robotsInfo: {
        url: 'https://example.com/robots.txt',
        fetchStatus: 'ALLOWED',
        explanation: 'Allowed',
        statusCode: 200,
        respectRobotsEnabled: true,
        blockedMainUrl: false
      },
      seoSignals: {
        initial: { title: 'Test', metaDescription: null, metaRobots: null, canonicalUrl: null, h1Headings: [], internalLinksCount: 0, externalLinksCount: 0, imagesCount: 0, imagesWithAltCount: 0, wordCount: 0, structuredDataTypes: [], structuredDataCount: 0, hreflangTags: [] },
        comparison: []
      },
      diagnostics: [],
      downloads: { originalHtmlId: '1', reportJsonId: '2', seoDiffCsvId: '3' }
    };

    const initialEstimated = calculateResultRetainedBytes(mockResult);
    assert.ok(initialEstimated > MAX_BYTES_PER_RESULT, `Estimated ${initialEstimated} should exceed ${MAX_BYTES_PER_RESULT}`);

    // Store the result
    const storeRes = storeResult(mockResult);
    assert.strictEqual(storeRes.stored, true);

    // Verify screenshot was stripped
    assert.strictEqual(mockResult.renderResult.screenshotBase64, undefined);
    assert.ok(mockResult.renderResult.errorMessage.includes('Screenshot omitted'));

    // Verify size was recalculated and stored bytes is strictly <= 4 MiB
    assert.ok(storeRes.sizeBytes <= MAX_BYTES_PER_RESULT, `Recalculated size ${storeRes.sizeBytes} should be <= ${MAX_BYTES_PER_RESULT}`);
  });

  await runTest('FIX 3: Hard limit rejects result that exceeds 4 MiB even without screenshot', () => {
    clearStoresForTesting();
    const ua = getFetchRenderUserAgent('googlebot-desktop');

    // Create a result with 4.5 MB of pure HTML text (cannot fit under 4 MiB)
    const massiveHtml = '<html><body>' + 'A'.repeat(4.5 * 1024 * 1024) + '</body></html>';
    const oversizedResult: any = {
      id: 'test-mem-reject-1',
      timestamp: new Date().toISOString(),
      requestedUrl: 'https://example.com/massive',
      finalUrl: 'https://example.com/massive',
      mode: 'fetch-only',
      userAgent: ua,
      summary: {
        httpStatus: 200,
        httpStatusText: 'OK',
        crawlability: 'ALLOWED',
        renderingStatus: 'FETCH_ONLY',
        indexabilitySignal: 'NO_BLOCKING_SIGNAL',
        totalDurationMs: 500,
        totalIssuesCount: { errors: 0, warnings: 0, notices: 0 }
      },
      initialFetch: {
        requestedUrl: 'https://example.com/massive',
        finalUrl: 'https://example.com/massive',
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        rawHtml: massiveHtml,
        byteSize: Buffer.byteLength(massiveHtml, 'utf-8'),
        durationMs: 50,
        redirectHistory: [],
        contentType: 'text/html',
        isTruncated: false
      },
      robotsInfo: {
        url: 'https://example.com/robots.txt',
        fetchStatus: 'ALLOWED',
        explanation: 'Allowed',
        statusCode: 200,
        respectRobotsEnabled: true,
        blockedMainUrl: false
      },
      seoSignals: {
        initial: { title: 'Massive', metaDescription: null, metaRobots: null, canonicalUrl: null, h1Headings: [], internalLinksCount: 0, externalLinksCount: 0, imagesCount: 0, imagesWithAltCount: 0, wordCount: 0, structuredDataTypes: [], structuredDataCount: 0, hreflangTags: [] },
        comparison: []
      },
      diagnostics: [],
      downloads: { originalHtmlId: '1', reportJsonId: '2', seoDiffCsvId: '3' }
    };

    const storeRes = storeResult(oversizedResult);
    // Must be rejected because even without screenshot it exceeds 4 MiB
    assert.strictEqual(storeRes.stored, false);
    assert.match(storeRes.reason || '', /exceeds maximum allowable limit of 4 MiB/);
    assert.strictEqual(getStoredResult('test-mem-reject-1'), undefined);
  });

  // =========================================================
  // GROUP 4: DETERMINISTIC LOCAL HTTP FIXTURE SERVER
  // =========================================================
  console.log('\n4. Deterministic robots.txt & Chromium Browser Integration QA:');

  let fixtureServer!: http.Server;
  let fixturePort!: number;
  let multiStatusCounter = 0;
  let target503HitCount = 0;

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
      } else if (url === '/robots-503/robots.txt') {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('503 Service Unavailable');
      } else if (url === '/robots-503/target') {
        target503HitCount++;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><head><title>503 Target</title></head><body><h1>Should Not Be Hit</h1></body></html>');
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
                document.title = "Rendered Dynamic Title";
                const can = document.createElement('link');
                can.rel = 'canonical';
                can.href = 'https://example.com/dynamically-injected-canonical';
                document.head.appendChild(can);
                const div = document.createElement('div');
                div.id = 'dynamic-content';
                div.innerText = 'Rendered Dynamic Content By JavaScript';
                document.body.appendChild(div);
                console.error('Intentional Client QA Console Error');
                fetch('/multi-status').then(() => { fetch('/multi-status'); });
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
    // TEST 1: Main URL Disallowed Pre-Fetch Enforcement
    await runTest('FIX 1: When respectRobots=true, disallows main URL without fetching or rendering', async () => {
      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${fixturePort}/private/test-page`,
          mode: 'fetch-and-render',
          respectRobots: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(result.summary.crawlability, 'DISALLOWED');
      assert.strictEqual(result.summary.httpStatus, 0);
      assert.strictEqual(result.summary.renderingStatus, 'FETCH_ONLY');
      assert.strictEqual(result.robotsInfo.blockedMainUrl, true);
      assert.strictEqual(result.robotsInfo.explicitlyDisallowed, true);
      assert.strictEqual(result.robotsInfo.classification, 'DISALLOWED');
      assert.strictEqual(result.initialFetch.rawHtml, '');
      assert.strictEqual(result.renderResult?.renderStatus, 'SKIPPED');

      const disallowDiag = result.diagnostics.find(d => d.id === 'diag_robots_disallowed');
      assert.ok(disallowDiag !== undefined);
      assert.strictEqual(disallowDiag?.severity, 'ERROR');
    });

    // TEST 2: Main URL Allowed Post-Robots Evaluation
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

    // Dedicated server whose root /robots.txt returns 503 Service Unavailable
    let server503!: http.Server;
    let port503!: number;
    let target503HitCount = 0;

    await new Promise<void>((resolve) => {
      server503 = http.createServer((req, res) => {
        const url = req.url || '/';
        if (url === '/robots.txt') {
          res.writeHead(503, { 'Content-Type': 'text/plain' });
          res.end('503 Service Unavailable');
        } else {
          target503HitCount++;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<!DOCTYPE html><html><body><h1>Should Not Be Hit</h1></body></html>');
        }
      });
      server503.listen(0, '127.0.0.1', () => {
        port503 = (server503.address() as any).port;
        resolve();
      });
    });

    try {
      // TEST 3: Temporary robots.txt 503 error halts fetching when respectRobots=true
      await runTest('FIX 1: robots.txt 503 halts fetch under conservative policy (target URL is never called)', async () => {
        target503HitCount = 0;
        const result = await runFetchAndRenderTest(
          {
            url: `http://127.0.0.1:${port503}/target`,
            mode: 'fetch-and-render',
            respectRobots: true
          },
          { allowLocalhostForTesting: true }
        );

        // Verify the target URL was NEVER fetched!
        assert.strictEqual(target503HitCount, 0, 'Target URL should not be requested when robots.txt returns 503');
        assert.strictEqual(result.summary.crawlability, 'UNKNOWN');
        assert.strictEqual(result.summary.httpStatus, 0);
        assert.strictEqual(result.summary.httpStatusText, 'Robots.txt Temporarily Unavailable');
        assert.strictEqual(result.initialFetch.rawHtml, '');
        assert.strictEqual(result.renderResult?.renderStatus, 'SKIPPED');

        const tempDiag = result.diagnostics.find(d => d.id === 'diag_robots_temp_unavailable');
        assert.ok(tempDiag !== undefined);
        assert.strictEqual(tempDiag?.severity, 'WARNING');
      });

      // TEST 4: Temporary robots.txt 503 error allows fetch when respectRobots=false with override warning
      await runTest('FIX 1: When respectRobots=false, allows crawl despite robots.txt 503 but flags warning', async () => {
        target503HitCount = 0;
        const result = await runFetchAndRenderTest(
          {
            url: `http://127.0.0.1:${port503}/target`,
            mode: 'fetch-only',
            respectRobots: false
          },
          { allowLocalhostForTesting: true }
        );

        // Verify target was fetched due to user override
        assert.strictEqual(target503HitCount, 1);
        assert.strictEqual(result.summary.httpStatus, 200);
        assert.ok(result.initialFetch.rawHtml.includes('Should Not Be Hit'));

        const overrideDiag = result.diagnostics.find(d => d.id === 'diag_robots_temp_override');
        assert.ok(overrideDiag !== undefined);
        assert.strictEqual(overrideDiag?.severity, 'WARNING');
      });
    } finally {
      server503.close();
    }

    // TEST 5: robots.txt Override when respectRobots=false on Disallowed URL
    await runTest('FIX 1: When respectRobots=false on disallowed URL, allows crawl but flags warning diagnostic', async () => {
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

    // TEST 6: FIX 2 — Cross-Origin origin limit returns UNKNOWN, never ALLOWED
    await runTest('FIX 2: Exceeding origin evaluation limit returns UNKNOWN and blocks under conservative policy', async () => {
      const manager = new SubresourceRobotsManager('http://main-site.test', '', 'googlebot', true);

      // Manually set or simulate up to limit
      for (let i = 1; i <= 10; i++) {
        manager.setOriginRobots(`http://sub-origin-${i}.test`, 'User-agent: *\nAllow: /\n');
      }

      // Check subresource within configured origin (returns ALLOWED)
      const allowedRes = await manager.checkSubresource('http://sub-origin-1.test/app.js');
      assert.strictEqual(allowedRes.status, 'ALLOWED');
      assert.strictEqual(allowedRes.isAllowed, true);

      // Query 11th distinct un-cached origin (exceeds origin fetch bound)
      const exceededRes = await manager.checkSubresource('http://sub-origin-11.test/widget.js');
      assert.strictEqual(exceededRes.status, 'UNKNOWN');
      assert.strictEqual(exceededRes.isAllowed, false);
      assert.match(exceededRes.ruleSummary || '', /evaluation limit exceeded/i);
    });

    // TEST 7: Real Chromium Execution, Subresource Robots Blocking, Resource Identity & Parity
    await runTest('FIX 4 & FIX 7: Real Chromium execution with subresource robots blocking, multi-request tracking, and DOM diffing', async () => {
      multiStatusCounter = 0;

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

      const titleDiff = result.seoSignals.comparison.find(c => c.name === 'title');
      assert.strictEqual(titleDiff?.status, 'MODIFIED');

      const canonDiff = result.seoSignals.comparison.find(c => c.name === 'canonicalUrl');
      assert.strictEqual(canonDiff?.status, 'ADDED');

      // Verify Screenshot
      assert.ok(result.renderResult?.screenshotBase64);
      const pngBuf = Buffer.from(result.renderResult!.screenshotBase64!, 'base64');
      assert.strictEqual(pngBuf[0], 0x89);
      assert.strictEqual(pngBuf[1], 0x50);

      // Verify Subresource robots.txt blocking
      const blockedRes = result.renderResult?.resources.find(r => r.url.includes('/sub-blocked.js'));
      assert.ok(blockedRes !== undefined, 'Subresource /sub-blocked.js should be tracked');
      assert.strictEqual(blockedRes?.loadStatus, 'BLOCKED_ROBOTS');
      assert.strictEqual(blockedRes?.robotsStatus, 'DISALLOWED');

      // Verify Missing Asset (404)
      const missingRes = result.renderResult?.resources.find(r => r.url.includes('/missing-asset-404.jpg'));
      assert.ok(missingRes !== undefined);
      assert.strictEqual(missingRes?.httpStatus, 404);
      assert.strictEqual(missingRes?.loadStatus, 'FAILED');

      // Verify Repeated requests to same URL have distinct entries and statuses (503 and 200)
      const multiRequests = result.renderResult?.resources.filter(r => r.url.includes('/multi-status')) || [];
      assert.ok(multiRequests.length >= 2, `Expected at least 2 requests to /multi-status, got ${multiRequests.length}`);
      const has503 = multiRequests.some(r => r.httpStatus === 503);
      const has200 = multiRequests.some(r => r.httpStatus === 200);
      assert.ok(has503, 'Should track 503 status for first request');
      assert.ok(has200, 'Should track 200 status for second request');
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
  // GROUP 5: RFC 9309 STATUS HANDLING & DECISION SEPARATION
  // =========================================================
  console.log('\n5. RFC 9309 Robots.txt Classification & Decision Separation QA:');

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

  // Dedicated test server for status codes: 401, 403, 404, 429
  let statusServer!: http.Server;
  let statusPort!: number;
  let currentRobotsStatus = 401;
  let targetRequestedPaths: string[] = [];

  await new Promise<void>((resolve) => {
    statusServer = http.createServer((req, res) => {
      const url = req.url || '/';
      if (url === '/robots.txt') {
        res.writeHead(currentRobotsStatus, { 'Content-Type': 'text/plain' });
        res.end(`${currentRobotsStatus} Response`);
      } else if (url.includes('/target') || url.includes('/widget.js') || url.includes('/style.css')) {
        targetRequestedPaths.push(url);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><head><title>Target Content</title></head><body><h1>Target Content Served</h1></body></html>');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    statusServer.listen(0, '127.0.0.1', () => {
      statusPort = (statusServer.address() as any).port;
      resolve();
    });
  });

  try {
    // TEST 5.1: HTTP 401 Classification & Tool Conservative Policy Separation
    await runTest('FIX 1 & FIX 2: robots.txt HTTP 401 classifies as UNAVAILABLE (not Disallow rule) and halts under conservative policy', async () => {
      currentRobotsStatus = 401;
      targetRequestedPaths = [];
      const info = await checkRobotsTxtCrawlability(
        `http://127.0.0.1:${statusPort}/target`,
        'googlebot',
        true,
        true
      );

      assert.strictEqual(info.classification, 'UNAVAILABLE');
      assert.strictEqual(info.explicitlyDisallowed, false, 'HTTP 401 must not be reported as explicit Disallow rule');
      assert.strictEqual(info.applicableRule, null);
      assert.strictEqual(info.statusCode, 401);
      assert.strictEqual(info.fetchPermittedByToolPolicy, false);
      assert.ok(info.explanation.includes('conservative fetch policy'));

      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${statusPort}/target`,
          mode: 'fetch-only',
          respectRobots: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(targetRequestedPaths.length, 0, 'Target URL must NOT be fetched when robots.txt returns 401 under conservative policy');
      assert.strictEqual(result.summary.crawlability, 'UNKNOWN');
      assert.strictEqual(result.summary.httpStatus, 0);
      assert.strictEqual(result.robotsInfo.explicitlyDisallowed, false);

      const policyDiag = result.diagnostics.find(d => d.id === 'diag_robots_unauthorized_policy');
      assert.ok(policyDiag !== undefined);
      assert.strictEqual(policyDiag?.severity, 'WARNING');
      assert.ok(policyDiag?.description.includes('No explicit Disallow directive was evaluated'));
    });

    // TEST 5.2: HTTP 401 User Override when respectRobots=false
    await runTest('FIX 1 & FIX 2: robots.txt HTTP 401 permits crawling when respectRobots=false with explicit override notice', async () => {
      currentRobotsStatus = 401;
      targetRequestedPaths = [];
      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${statusPort}/target`,
          mode: 'fetch-only',
          respectRobots: false
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(targetRequestedPaths.length, 1);
      assert.strictEqual(result.summary.httpStatus, 200);
      assert.ok(result.initialFetch.rawHtml.includes('Target Content Served'));

      const overrideDiag = result.diagnostics.find(d => d.id === 'diag_robots_auth_override');
      assert.ok(overrideDiag !== undefined);
      assert.strictEqual(overrideDiag?.severity, 'WARNING');
    });

    // TEST 5.3: HTTP 403 Classification & Tool Conservative Policy Separation
    await runTest('FIX 1 & FIX 2: robots.txt HTTP 403 classifies as UNAVAILABLE (not Disallow rule) and halts under conservative policy', async () => {
      currentRobotsStatus = 403;
      targetRequestedPaths = [];
      const info = await checkRobotsTxtCrawlability(
        `http://127.0.0.1:${statusPort}/target`,
        'googlebot',
        true,
        true
      );

      assert.strictEqual(info.classification, 'UNAVAILABLE');
      assert.strictEqual(info.explicitlyDisallowed, false, 'HTTP 403 must not be reported as explicit Disallow rule');
      assert.strictEqual(info.applicableRule, null);
      assert.strictEqual(info.statusCode, 403);
      assert.strictEqual(info.fetchPermittedByToolPolicy, false);
      assert.ok(info.explanation.includes('conservative fetch policy'));

      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${statusPort}/target`,
          mode: 'fetch-only',
          respectRobots: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(targetRequestedPaths.length, 0);
      assert.strictEqual(result.summary.crawlability, 'UNKNOWN');
      assert.strictEqual(result.robotsInfo.explicitlyDisallowed, false);

      const policyDiag = result.diagnostics.find(d => d.id === 'diag_robots_unauthorized_policy');
      assert.ok(policyDiag !== undefined);
      assert.strictEqual(policyDiag?.severity, 'WARNING');
    });

    // TEST 5.4: HTTP 404 Classification under RFC 9309 Section 2.3.1.2 -> ALLOWED
    await runTest('FIX 1: robots.txt HTTP 404 classifies as UNAVAILABLE and allows crawl under RFC 9309 Section 2.3.1.2', async () => {
      currentRobotsStatus = 404;
      targetRequestedPaths = [];
      const info = await checkRobotsTxtCrawlability(
        `http://127.0.0.1:${statusPort}/target`,
        'googlebot',
        true,
        true
      );

      assert.strictEqual(info.classification, 'UNAVAILABLE');
      assert.strictEqual(info.explicitlyDisallowed, false);
      assert.strictEqual(info.fetchPermittedByToolPolicy, true);
      assert.strictEqual(info.crawlabilityStatus, 'ALLOWED');
      assert.strictEqual(info.statusCode, 404);

      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${statusPort}/target`,
          mode: 'fetch-only',
          respectRobots: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(targetRequestedPaths.length, 1);
      assert.strictEqual(result.summary.crawlability, 'ALLOWED');
      assert.strictEqual(result.summary.httpStatus, 200);
      assert.ok(result.initialFetch.rawHtml.includes('Target Content Served'));
    });

    // TEST 5.5: HTTP 429 Classification -> RATE_LIMITED
    await runTest('FIX 1: robots.txt HTTP 429 classifies as RATE_LIMITED and defers crawl under conservative policy', async () => {
      currentRobotsStatus = 429;
      targetRequestedPaths = [];
      const info = await checkRobotsTxtCrawlability(
        `http://127.0.0.1:${statusPort}/target`,
        'googlebot',
        true,
        true
      );

      assert.strictEqual(info.classification, 'RATE_LIMITED');
      assert.strictEqual(info.explicitlyDisallowed, false);
      assert.strictEqual(info.fetchPermittedByToolPolicy, false);
      assert.strictEqual(info.statusCode, 429);

      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${statusPort}/target`,
          mode: 'fetch-only',
          respectRobots: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(targetRequestedPaths.length, 0);
      assert.strictEqual(result.summary.crawlability, 'UNKNOWN');
      assert.strictEqual(result.summary.httpStatus, 0);

      const rateDiag = result.diagnostics.find(d => d.id === 'diag_robots_rate_limited');
      assert.ok(rateDiag !== undefined);
      assert.strictEqual(rateDiag?.severity, 'WARNING');
    });

    // TEST 5.6: Network Failure (Connection Refused) Classification
    await runTest('FIX 1: Network failure (closed port) classifies as NETWORK_ERROR / CONNECTION_REFUSED and halts crawl', async () => {
      // Use closed port
      const closedPort = 59999;
      const info = await checkRobotsTxtCrawlability(
        `http://127.0.0.1:${closedPort}/target`,
        'googlebot',
        true,
        true
      );

      assert.strictEqual(info.classification, 'NETWORK_ERROR');
      assert.strictEqual(info.failureType, 'CONNECTION_REFUSED');
      assert.strictEqual(info.explicitlyDisallowed, false);
      assert.strictEqual(info.fetchPermittedByToolPolicy, false);
      assert.strictEqual(info.statusCode, null);

      const result = await runFetchAndRenderTest(
        {
          url: `http://127.0.0.1:${closedPort}/target`,
          mode: 'fetch-only',
          respectRobots: true
        },
        { allowLocalhostForTesting: true }
      );

      assert.strictEqual(result.summary.crawlability, 'UNKNOWN');
      assert.strictEqual(result.summary.httpStatus, 0);

      const netDiag = result.diagnostics.find(d => d.id === 'diag_robots_network_failure');
      assert.ok(netDiag !== undefined);
      assert.strictEqual(netDiag?.severity, 'WARNING');
    });

    // TEST 5.7: SubresourceRobotsManager classifies 401/403 as UNKNOWN (not synthetic disallow rule)
    await runTest('FIX 2: Subresource manager treats 401/403 origin as UNKNOWN policy, not synthetic Disallow directive', async () => {
      currentRobotsStatus = 403;
      const manager = new SubresourceRobotsManager('http://main-site.test', '', 'googlebot', true);

      // Subresource from 403 origin
      const sub403 = await manager.checkSubresource(`http://127.0.0.1:${statusPort}/widget.js`);
      assert.strictEqual(sub403.status, 'UNKNOWN');
      assert.strictEqual(sub403.isAllowed, false);
      assert.ok(sub403.ruleSummary?.includes('403'));
      assert.ok(!sub403.ruleSummary?.includes('Disallowed by rule'));

      // Subresource from 404 origin on another port
      currentRobotsStatus = 404;
      const manager404 = new SubresourceRobotsManager('http://main-site.test', '', 'googlebot', true);
      const sub404 = await manager404.checkSubresource(`http://127.0.0.1:${statusPort}/style.css`);
      assert.strictEqual(sub404.status, 'ALLOWED');
      assert.strictEqual(sub404.isAllowed, true);
    });

  } finally {
    statusServer.close();
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
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
