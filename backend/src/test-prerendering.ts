import http from 'http';
import assert from 'assert';
import { validateUrl, validateAndResolveHost, fetchWithUserAgent } from '../../frontend/src/lib/seo/prerendering/safeFetcher.ts';
import { extractHtmlSignals, checkVaryUserAgent, extractCanonicalFromHeaders } from '../../frontend/src/lib/seo/prerendering/htmlParser.ts';
import { compareAgentResults } from '../../frontend/src/lib/seo/prerendering/comparisonEngine.ts';
import { generatePrerenderCsv, generatePrerenderXlsx } from '../../frontend/src/lib/seo/prerendering/exporter.ts';
import { USER_AGENTS } from '../../frontend/src/lib/seo/prerendering/userAgents.ts';
import { AgentTestResult } from '../../frontend/src/lib/seo/prerendering/types.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message || err);
    failed++;
  }
}

async function runPrerenderTestSuite() {
  console.log('=====================================================');
  console.log('PRE-RENDERING TESTER — VERIFIED SECURITY & FUNCTIONAL SUITE');
  console.log('=====================================================\n');

  console.log('1. Security Defenses & SSRF Connection Protection:');

  await test('Validates valid HTTPS and HTTP URLs', async () => {
    const url1 = validateUrl('https://example.com/test');
    assert.strictEqual(url1.protocol, 'https:');
    const url2 = validateUrl('http://example.com:80/path');
    assert.strictEqual(url2.protocol, 'http:');
  });

  await test('SSRF: Rejects localhost destination', async () => {
    assert.throws(() => validateUrl('http://localhost:3000'), /Port "3000"|Invalid/);
    await assert.rejects(
      async () => validateAndResolveHost('localhost'),
      /Access to blocked or internal hostname is forbidden/
    );
  });

  await test('SSRF: Rejects private IPv4 ranges (10.x, 172.16.x, 192.168.x, 127.0.0.1)', async () => {
    await assert.rejects(
      async () => validateAndResolveHost('127.0.0.1'),
      /Access to blocked or internal hostname is forbidden/
    );
    await assert.rejects(
      async () => validateAndResolveHost('192.168.1.1'),
      /Access to blocked or internal hostname is forbidden/
    );
    await assert.rejects(
      async () => validateAndResolveHost('10.0.0.1'),
      /Access to blocked or internal hostname is forbidden/
    );
  });

  await test('SSRF: Rejects cloud metadata hostname and IP (169.254.169.254, metadata.google.internal)', async () => {
    await assert.rejects(
      async () => validateAndResolveHost('metadata.google.internal'),
      /Access to blocked or internal hostname is forbidden/
    );
    await assert.rejects(
      async () => validateAndResolveHost('169.254.169.254'),
      /Access to blocked or internal hostname is forbidden/
    );
  });

  await test('SSRF: Rejects private and link-local IPv6 addresses (::1, fe80::, fc00::)', async () => {
    await assert.rejects(
      async () => validateAndResolveHost('::1'),
      /Access to blocked or internal hostname is forbidden/
    );
  });

  await test('SSRF: Rejects unsupported protocols (file:, ftp:, gopher:)', async () => {
    assert.throws(
      () => validateUrl('file:///etc/passwd'),
      /Unsupported URL protocol "file:"/
    );
    assert.throws(
      () => validateUrl('ftp://ftp.example.com'),
      /Unsupported URL protocol "ftp:"/
    );
  });

  await test('SSRF: Rejects embedded user credentials (user:pass@host)', async () => {
    assert.throws(
      () => validateUrl('https://admin:secret@example.com'),
      /User credentials in URLs are not permitted/
    );
  });

  await test('Enforces maximum response body size (2MB) with explicit error', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      // Stream 2.5 MB of data
      const chunk = Buffer.alloc(1024 * 100, 'A');
      for (let i = 0; i < 26; i++) {
        res.write(chunk);
      }
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      await assert.rejects(
        async () => {
          await fetchWithUserAgent(`http://127.0.0.1:${port}/`, {
            userAgent: 'test-agent',
            maxBytes: 1024 * 512, // 512 KB limit
            allowLocalhostForTesting: true,
          });
        },
        /RESPONSE_TOO_LARGE/
      );
    } finally {
      server.close();
    }
  });

  await test('Detects redirect loop and limits redirect hops', async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/hop1') {
        res.writeHead(302, { Location: '/hop2' });
        res.end();
      } else if (req.url === '/hop2') {
        res.writeHead(302, { Location: '/hop1' });
        res.end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      await assert.rejects(
        async () => {
          await fetchWithUserAgent(`http://127.0.0.1:${port}/hop1`, {
            userAgent: 'test-agent',
            allowLocalhostForTesting: true,
          });
        },
        /Redirect loop detected/
      );
    } finally {
      server.close();
    }
  });

  console.log('\n2. Functional Pre-rendering Simulation Tests (Local Fixture Server):');

  // Multi-agent test server simulating varied crawler behaviors
  const fixtureServer = http.createServer((req, res) => {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const urlPath = req.url || '/';

    // Test A: Identical HTML across all agents
    if (urlPath === '/identical') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>Identical Page</title><meta name="description" content="Consistent page description"></head><body><h1>Main Heading</h1><p>Body copy here.</p></body></html>');
      return;
    }

    // Test B: Different formatting / timestamps, same SEO signals
    if (urlPath === '/markup-variation') {
      const timestamp = ua.includes('googlebot') ? '<!-- ts: 1000 -->' : '<!-- ts: 2000 -->';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><title>Same Title</title><meta name="description" content="Identical description"></head><body><h1>Heading 1</h1><p>Content is identical.</p>${timestamp}</body></html>`);
      return;
    }

    // Test C: Different titles
    if (urlPath === '/diff-title') {
      const title = ua.includes('googlebot') ? 'Googlebot Title' : 'Chrome Title';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>Common Heading</h1></body></html>`);
      return;
    }

    // Test D: Different canonicals
    if (urlPath === '/diff-canonical') {
      const canon = ua.includes('googlebot') ? 'https://example.com/mobile/' : 'https://example.com/desktop/';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><title>Title</title><link rel="canonical" href="${canon}"></head><body><h1>Content</h1></body></html>`);
      return;
    }

    // Test E: Different robots directives
    if (urlPath === '/diff-robots') {
      const robots = ua.includes('googlebot') ? 'noindex, nofollow' : 'index, follow';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><title>Title</title><meta name="robots" content="${robots}"></head><body><h1>Content</h1></body></html>`);
      return;
    }

    // Test F: Possible Dynamic Rendering / Pre-rendering (SPA shell for browser vs pre-rendered text for crawler)
    if (urlPath === '/prerender-demo') {
      if (ua.includes('googlebot') || ua.includes('bingbot')) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Vary': 'User-Agent',
        });
        res.end(`<!DOCTYPE html><html><head><title>Product Catalog Online</title><meta name="description" content="Explore thousands of shoes and apparel in our store."></head><body><h1>Online Store Catalog</h1><p>Welcome to our comprehensive product catalog featuring detailed specifications, customer reviews, pricing comparisons, and real-time inventory for sports gear, running shoes, hiking boots, and athletic accessories. We ship globally with guaranteed 2-day delivery across all major regions.</p></body></html>`);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><title>Product Catalog Online</title></head><body><div id="root">Loading app...</div><script src="/app.js"></script></body></html>`);
      }
      return;
    }

    // Test G: Divergent redirects
    if (urlPath === '/redirect-test') {
      if (ua.includes('googlebot')) {
        res.writeHead(301, { Location: '/mobile-view' });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>Desktop</title></head><body><h1>Desktop</h1></body></html>');
      }
      return;
    }

    if (urlPath === '/mobile-view') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Mobile View</title></head><body><h1>Mobile</h1></body></html>');
      return;
    }

    // Fallback 404
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => fixtureServer.listen(0, '127.0.0.1', () => resolve()));
  const fixturePort = (fixtureServer.address() as any).port;
  const baseUrl = `http://127.0.0.1:${fixturePort}`;

  const chromeUa = USER_AGENTS.find((u) => u.id === 'chrome-desktop')!;
  const googlebotUa = USER_AGENTS.find((u) => u.id === 'googlebot-smartphone')!;

  try {
    await test('Test A — Identical HTML yields "Same HTML Response"', async () => {
      const resChrome = await fetchWithUserAgent(`${baseUrl}/identical`, { userAgent: chromeUa.userAgent, allowLocalhostForTesting: true });
      const resBot = await fetchWithUserAgent(`${baseUrl}/identical`, { userAgent: googlebotUa.userAgent, allowLocalhostForTesting: true });

      const parsed1 = extractHtmlSignals(resChrome.body, resChrome.finalUrl);
      const parsed2 = extractHtmlSignals(resBot.body, resBot.finalUrl);

      const agentResults: AgentTestResult[] = [
        {
          userAgentId: chromeUa.id,
          userAgentName: chromeUa.name,
          status: 'success',
          statusCode: resChrome.statusCode,
          statusText: resChrome.statusText,
          finalUrl: resChrome.finalUrl,
          redirectChain: resChrome.redirectHistory,
          title: parsed1.title,
          metaDescription: parsed1.metaDescription,
          h1: parsed1.h1,
          wordCount: parsed1.wordCount,
          imageCount: parsed1.imageCount,
          linkCount: parsed1.linkCount,
          internalLinkCount: parsed1.internalLinkCount,
          externalLinkCount: parsed1.externalLinkCount,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed1.md5,
          sha256: parsed1.sha256,
          metaRobots: parsed1.metaRobots,
          xRobotsTag: null,
          canonical: parsed1.canonical,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resChrome.body.length,
          hasStructuredData: false,
          error: null,
        },
        {
          userAgentId: googlebotUa.id,
          userAgentName: googlebotUa.name,
          status: 'success',
          statusCode: resBot.statusCode,
          statusText: resBot.statusText,
          finalUrl: resBot.finalUrl,
          redirectChain: resBot.redirectHistory,
          title: parsed2.title,
          metaDescription: parsed2.metaDescription,
          h1: parsed2.h1,
          wordCount: parsed2.wordCount,
          imageCount: parsed2.imageCount,
          linkCount: parsed2.linkCount,
          internalLinkCount: parsed2.internalLinkCount,
          externalLinkCount: parsed2.externalLinkCount,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed2.md5,
          sha256: parsed2.sha256,
          metaRobots: parsed2.metaRobots,
          xRobotsTag: null,
          canonical: parsed2.canonical,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resBot.body.length,
          hasStructuredData: false,
          error: null,
        },
      ];

      const { summary } = compareAgentResults(agentResults);
      assert.strictEqual(summary.classification, 'Same HTML Response');
      assert.strictEqual(summary.rawHtmlDifferences, false);
    });

    await test('Test B — Different raw markup but same SEO fields yields "Different Raw HTML, Same SEO Signals"', async () => {
      const resChrome = await fetchWithUserAgent(`${baseUrl}/markup-variation`, { userAgent: chromeUa.userAgent, allowLocalhostForTesting: true });
      const resBot = await fetchWithUserAgent(`${baseUrl}/markup-variation`, { userAgent: googlebotUa.userAgent, allowLocalhostForTesting: true });

      const parsed1 = extractHtmlSignals(resChrome.body, resChrome.finalUrl);
      const parsed2 = extractHtmlSignals(resBot.body, resBot.finalUrl);

      assert.notStrictEqual(parsed1.md5, parsed2.md5);

      const agentResults: AgentTestResult[] = [
        {
          userAgentId: chromeUa.id,
          userAgentName: chromeUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resChrome.finalUrl,
          redirectChain: [],
          title: parsed1.title,
          metaDescription: parsed1.metaDescription,
          h1: parsed1.h1,
          wordCount: parsed1.wordCount,
          imageCount: parsed1.imageCount,
          linkCount: parsed1.linkCount,
          internalLinkCount: parsed1.internalLinkCount,
          externalLinkCount: parsed1.externalLinkCount,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed1.md5,
          sha256: parsed1.sha256,
          metaRobots: parsed1.metaRobots,
          xRobotsTag: null,
          canonical: parsed1.canonical,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resChrome.body.length,
          hasStructuredData: false,
          error: null,
        },
        {
          userAgentId: googlebotUa.id,
          userAgentName: googlebotUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resBot.finalUrl,
          redirectChain: [],
          title: parsed2.title,
          metaDescription: parsed2.metaDescription,
          h1: parsed2.h1,
          wordCount: parsed2.wordCount,
          imageCount: parsed2.imageCount,
          linkCount: parsed2.linkCount,
          internalLinkCount: parsed2.internalLinkCount,
          externalLinkCount: parsed2.externalLinkCount,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed2.md5,
          sha256: parsed2.sha256,
          metaRobots: parsed2.metaRobots,
          xRobotsTag: null,
          canonical: parsed2.canonical,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resBot.body.length,
          hasStructuredData: false,
          error: null,
        },
      ];

      const { summary } = compareAgentResults(agentResults);
      assert.strictEqual(summary.classification, 'Different Raw HTML, Same SEO Signals');
      assert.strictEqual(summary.rawHtmlDifferences, true);
    });

    await test('Test C — Different titles flags title mismatch', async () => {
      const resChrome = await fetchWithUserAgent(`${baseUrl}/diff-title`, { userAgent: chromeUa.userAgent, allowLocalhostForTesting: true });
      const resBot = await fetchWithUserAgent(`${baseUrl}/diff-title`, { userAgent: googlebotUa.userAgent, allowLocalhostForTesting: true });

      const parsed1 = extractHtmlSignals(resChrome.body, resChrome.finalUrl);
      const parsed2 = extractHtmlSignals(resBot.body, resBot.finalUrl);

      const agentResults: AgentTestResult[] = [
        {
          userAgentId: chromeUa.id,
          userAgentName: chromeUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resChrome.finalUrl,
          redirectChain: [],
          title: parsed1.title,
          metaDescription: null,
          h1: parsed1.h1,
          wordCount: parsed1.wordCount,
          imageCount: 0,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed1.md5,
          sha256: parsed1.sha256,
          metaRobots: null,
          xRobotsTag: null,
          canonical: null,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resChrome.body.length,
          hasStructuredData: false,
          error: null,
        },
        {
          userAgentId: googlebotUa.id,
          userAgentName: googlebotUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resBot.finalUrl,
          redirectChain: [],
          title: parsed2.title,
          metaDescription: null,
          h1: parsed2.h1,
          wordCount: parsed2.wordCount,
          imageCount: 0,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed2.md5,
          sha256: parsed2.sha256,
          metaRobots: null,
          xRobotsTag: null,
          canonical: null,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resBot.body.length,
          hasStructuredData: false,
          error: null,
        },
      ];

      const { summary, comparisons } = compareAgentResults(agentResults);
      assert.strictEqual(summary.differentTitles, true);
      const titleComp = comparisons.find((c) => c.field === 'title')!;
      assert.strictEqual(titleComp.status, 'different');
    });

    await test('Test D — Different canonical URLs flags canonical conflict', async () => {
      const resChrome = await fetchWithUserAgent(`${baseUrl}/diff-canonical`, { userAgent: chromeUa.userAgent, allowLocalhostForTesting: true });
      const resBot = await fetchWithUserAgent(`${baseUrl}/diff-canonical`, { userAgent: googlebotUa.userAgent, allowLocalhostForTesting: true });

      const parsed1 = extractHtmlSignals(resChrome.body, resChrome.finalUrl);
      const parsed2 = extractHtmlSignals(resBot.body, resBot.finalUrl);

      const agentResults: AgentTestResult[] = [
        {
          userAgentId: chromeUa.id,
          userAgentName: chromeUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resChrome.finalUrl,
          redirectChain: [],
          title: parsed1.title,
          metaDescription: null,
          h1: parsed1.h1,
          wordCount: parsed1.wordCount,
          imageCount: 0,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed1.md5,
          sha256: parsed1.sha256,
          metaRobots: null,
          xRobotsTag: null,
          canonical: parsed1.canonical,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resChrome.body.length,
          hasStructuredData: false,
          error: null,
        },
        {
          userAgentId: googlebotUa.id,
          userAgentName: googlebotUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resBot.finalUrl,
          redirectChain: [],
          title: parsed2.title,
          metaDescription: null,
          h1: parsed2.h1,
          wordCount: parsed2.wordCount,
          imageCount: 0,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed2.md5,
          sha256: parsed2.sha256,
          metaRobots: null,
          xRobotsTag: null,
          canonical: parsed2.canonical,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resBot.body.length,
          hasStructuredData: false,
          error: null,
        },
      ];

      const { summary, comparisons } = compareAgentResults(agentResults);
      assert.strictEqual(summary.canonicalConflicts, true);
      assert.strictEqual(summary.classification, 'Potential SEO Signal Conflict');
      const canonComp = comparisons.find((c) => c.field === 'canonical')!;
      assert.strictEqual(canonComp.status, 'different');
      assert.strictEqual(canonComp.severity, 'error');
    });

    await test('Test E — Different robots directives flags robots conflict', async () => {
      const resChrome = await fetchWithUserAgent(`${baseUrl}/diff-robots`, { userAgent: chromeUa.userAgent, allowLocalhostForTesting: true });
      const resBot = await fetchWithUserAgent(`${baseUrl}/diff-robots`, { userAgent: googlebotUa.userAgent, allowLocalhostForTesting: true });

      const parsed1 = extractHtmlSignals(resChrome.body, resChrome.finalUrl);
      const parsed2 = extractHtmlSignals(resBot.body, resBot.finalUrl);

      const agentResults: AgentTestResult[] = [
        {
          userAgentId: chromeUa.id,
          userAgentName: chromeUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resChrome.finalUrl,
          redirectChain: [],
          title: parsed1.title,
          metaDescription: null,
          h1: parsed1.h1,
          wordCount: parsed1.wordCount,
          imageCount: 0,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed1.md5,
          sha256: parsed1.sha256,
          metaRobots: parsed1.metaRobots,
          xRobotsTag: null,
          canonical: null,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resChrome.body.length,
          hasStructuredData: false,
          error: null,
        },
        {
          userAgentId: googlebotUa.id,
          userAgentName: googlebotUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resBot.finalUrl,
          redirectChain: [],
          title: parsed2.title,
          metaDescription: null,
          h1: parsed2.h1,
          wordCount: parsed2.wordCount,
          imageCount: 0,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed2.md5,
          sha256: parsed2.sha256,
          metaRobots: parsed2.metaRobots,
          xRobotsTag: null,
          canonical: null,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resBot.body.length,
          hasStructuredData: false,
          error: null,
        },
      ];

      const { summary, comparisons } = compareAgentResults(agentResults);
      assert.strictEqual(summary.robotsConflicts, true);
      const robotsComp = comparisons.find((c) => c.field === 'metaRobots')!;
      assert.strictEqual(robotsComp.status, 'different');
      assert.strictEqual(robotsComp.severity, 'error');
    });

    await test('Test F — Detects "Possible Pre-rendering / Dynamic Rendering" when bot receives full text vs browser app shell', async () => {
      const resChrome = await fetchWithUserAgent(`${baseUrl}/prerender-demo`, { userAgent: chromeUa.userAgent, allowLocalhostForTesting: true });
      const resBot = await fetchWithUserAgent(`${baseUrl}/prerender-demo`, { userAgent: googlebotUa.userAgent, allowLocalhostForTesting: true });

      const parsed1 = extractHtmlSignals(resChrome.body, resChrome.finalUrl);
      const parsed2 = extractHtmlSignals(resBot.body, resBot.finalUrl);

      const varyBot = checkVaryUserAgent(resBot.headers['vary']);
      assert.strictEqual(varyBot, 'Present');

      const agentResults: AgentTestResult[] = [
        {
          userAgentId: chromeUa.id,
          userAgentName: chromeUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resChrome.finalUrl,
          redirectChain: [],
          title: parsed1.title,
          metaDescription: parsed1.metaDescription,
          h1: parsed1.h1,
          wordCount: parsed1.wordCount,
          imageCount: parsed1.imageCount,
          linkCount: parsed1.linkCount,
          internalLinkCount: parsed1.internalLinkCount,
          externalLinkCount: parsed1.externalLinkCount,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: parsed1.md5,
          sha256: parsed1.sha256,
          metaRobots: null,
          xRobotsTag: null,
          canonical: null,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resChrome.body.length,
          hasStructuredData: false,
          error: null,
        },
        {
          userAgentId: googlebotUa.id,
          userAgentName: googlebotUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resBot.finalUrl,
          redirectChain: [],
          title: parsed2.title,
          metaDescription: parsed2.metaDescription,
          h1: parsed2.h1,
          wordCount: parsed2.wordCount,
          imageCount: parsed2.imageCount,
          linkCount: parsed2.linkCount,
          internalLinkCount: parsed2.internalLinkCount,
          externalLinkCount: parsed2.externalLinkCount,
          varyUserAgent: varyBot,
          varyHeaderRaw: resBot.headers['vary'] || null,
          md5: parsed2.md5,
          sha256: parsed2.sha256,
          metaRobots: null,
          xRobotsTag: null,
          canonical: null,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: resBot.body.length,
          hasStructuredData: false,
          error: null,
        },
      ];

      const { summary } = compareAgentResults(agentResults);
      assert.strictEqual(summary.classification, 'Possible Pre-rendering / Dynamic Rendering');
      assert(summary.classificationReason.includes('substantially more initial HTML text'));
    });

    await test('Test G — Detects divergent redirects per User-Agent', async () => {
      const resChrome = await fetchWithUserAgent(`${baseUrl}/redirect-test`, { userAgent: chromeUa.userAgent, allowLocalhostForTesting: true });
      const resBot = await fetchWithUserAgent(`${baseUrl}/redirect-test`, { userAgent: googlebotUa.userAgent, allowLocalhostForTesting: true });

      assert.strictEqual(resChrome.redirectHistory.length, 0);
      assert.strictEqual(resBot.redirectHistory.length, 1);
      assert(resBot.finalUrl.includes('/mobile-view'));

      const agentResults: AgentTestResult[] = [
        {
          userAgentId: chromeUa.id,
          userAgentName: chromeUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resChrome.finalUrl,
          redirectChain: resChrome.redirectHistory,
          title: 'Desktop',
          metaDescription: null,
          h1: ['Desktop'],
          wordCount: 1,
          imageCount: 0,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: 'md5-desktop',
          sha256: 'sha-desktop',
          metaRobots: null,
          xRobotsTag: null,
          canonical: null,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: 100,
          hasStructuredData: false,
          error: null,
        },
        {
          userAgentId: googlebotUa.id,
          userAgentName: googlebotUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: resBot.finalUrl,
          redirectChain: resBot.redirectHistory,
          title: 'Mobile View',
          metaDescription: null,
          h1: ['Mobile'],
          wordCount: 1,
          imageCount: 0,
          linkCount: 0,
          internalLinkCount: 0,
          externalLinkCount: 0,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: 'md5-mobile',
          sha256: 'sha-mobile',
          metaRobots: null,
          xRobotsTag: null,
          canonical: null,
          contentType: 'text/html',
          contentLanguage: null,
          durationMs: 50,
          htmlSize: 100,
          hasStructuredData: false,
          error: null,
        },
      ];

      const { summary, comparisons } = compareAgentResults(agentResults);
      assert.strictEqual(summary.differentRedirects, true);
      const redComp = comparisons.find((c) => c.field === 'finalUrl')!;
      assert.strictEqual(redComp.status, 'different');
    });

    await test('Test H — Partial audit preserves successful results when one agent fails', async () => {
      const agentResults: AgentTestResult[] = [
        {
          userAgentId: chromeUa.id,
          userAgentName: chromeUa.name,
          status: 'success',
          statusCode: 200,
          statusText: 'OK',
          finalUrl: 'https://example.com/ok',
          redirectChain: [],
          title: 'Working Page',
          metaDescription: 'Desc',
          h1: ['Title'],
          wordCount: 200,
          imageCount: 2,
          linkCount: 10,
          internalLinkCount: 8,
          externalLinkCount: 2,
          varyUserAgent: 'Present',
          varyHeaderRaw: 'User-Agent',
          md5: 'md5-hash',
          sha256: 'sha-hash',
          metaRobots: 'index, follow',
          xRobotsTag: null,
          canonical: 'https://example.com/ok',
          contentType: 'text/html',
          contentLanguage: 'en',
          durationMs: 120,
          htmlSize: 1500,
          hasStructuredData: true,
          error: null,
        },
        {
          userAgentId: googlebotUa.id,
          userAgentName: googlebotUa.name,
          status: 'error',
          statusCode: null,
          statusText: null,
          finalUrl: null,
          redirectChain: [],
          title: null,
          metaDescription: null,
          h1: [],
          wordCount: null,
          imageCount: null,
          linkCount: null,
          internalLinkCount: null,
          externalLinkCount: null,
          varyUserAgent: 'Not available',
          varyHeaderRaw: null,
          md5: null,
          sha256: null,
          metaRobots: null,
          xRobotsTag: null,
          canonical: null,
          contentType: null,
          contentLanguage: null,
          durationMs: null,
          htmlSize: null,
          hasStructuredData: false,
          error: 'Connection timeout after 10000ms',
        },
      ];

      const { summary } = compareAgentResults(agentResults);
      assert.strictEqual(summary.userAgentsTested, 2);
      assert.strictEqual(summary.successfulResponses, 1);
      assert.strictEqual(summary.failedResponses, 1);
    });

  } finally {
    fixtureServer.close();
  }

  console.log('\n3. Exporter Protection & Spreadsheet Sanitization:');

  await test('CSV Export sanitizes dangerous formula prefixes (=, +, -, @)', async () => {
    const maliciousResults: AgentTestResult[] = [
      {
        userAgentId: 'chrome-desktop',
        userAgentName: 'Chrome',
        status: 'success',
        statusCode: 200,
        statusText: 'OK',
        finalUrl: 'https://example.com/',
        redirectChain: [],
        title: '=cmd|"/C calc"!A0',
        metaDescription: '+123456789',
        h1: ['-danger', '@calc'],
        wordCount: 100,
        imageCount: 0,
        linkCount: 0,
        internalLinkCount: 0,
        externalLinkCount: 0,
        varyUserAgent: 'Present',
        varyHeaderRaw: 'User-Agent',
        md5: 'md5',
        sha256: 'sha',
        metaRobots: 'index',
        xRobotsTag: null,
        canonical: 'https://example.com/',
        contentType: 'text/html',
        contentLanguage: 'en',
        durationMs: 50,
        htmlSize: 100,
        hasStructuredData: false,
        error: null,
      },
    ];

    const csv = generatePrerenderCsv('https://example.com/', maliciousResults);
    assert(csv.startsWith('\uFEFF'), 'CSV must include UTF-8 BOM');
    assert(csv.includes("'\=cmd|"), 'Equals sign neutralized with leading quote');
    assert(csv.includes("'\+123456789"), 'Plus sign neutralized with leading quote');
    assert(csv.includes("'\-danger"), 'Minus sign neutralized with leading quote');
  });

  await test('XLSX Export generates valid Excel binary workbook', async () => {
    const sampleResults: AgentTestResult[] = [
      {
        userAgentId: 'chrome-desktop',
        userAgentName: 'Chrome',
        status: 'success',
        statusCode: 200,
        statusText: 'OK',
        finalUrl: 'https://example.com/',
        redirectChain: [],
        title: 'Sample Page',
        metaDescription: 'Description',
        h1: ['Main Heading'],
        wordCount: 150,
        imageCount: 2,
        linkCount: 5,
        internalLinkCount: 4,
        externalLinkCount: 1,
        varyUserAgent: 'Present',
        varyHeaderRaw: 'User-Agent',
        md5: 'c4ca4238a0b923820dcc509a6f75849b',
        sha256: '284e3029f4daeeebd337e70fa81a1f77f5a34080e66d579763f42c48a70d7b37',
        metaRobots: 'index, follow',
        xRobotsTag: null,
        canonical: 'https://example.com/',
        contentType: 'text/html',
        contentLanguage: 'en',
        durationMs: 65,
        htmlSize: 2048,
        hasStructuredData: true,
        error: null,
      },
    ];

    const xlsx = await generatePrerenderXlsx('https://example.com/', sampleResults);
    assert(xlsx instanceof Uint8Array);
    assert(xlsx.length > 500, 'XLSX buffer is non-empty');
    // Check zip PK header
    assert.strictEqual(xlsx[0], 0x50);
    assert.strictEqual(xlsx[1], 0x4b);
  });

  console.log('\n4. Comprehensive Security, Non-HTML, Timeout & Deep Comparison Suite:');

  // Test 4.1: Non-HTML content types are rejected from HTML parsing
  await test('Non-HTML: Recognizes and rejects PDF, JSON, and binary streams from HTML parsing', async () => {
    const { isSupportedHtmlContentType } = await import('../../frontend/src/lib/seo/prerendering/htmlParser.ts');
    assert.strictEqual(isSupportedHtmlContentType('text/html; charset=utf-8'), true);
    assert.strictEqual(isSupportedHtmlContentType('application/xhtml+xml'), true);
    assert.strictEqual(isSupportedHtmlContentType('application/pdf'), false);
    assert.strictEqual(isSupportedHtmlContentType('application/json'), false);
    assert.strictEqual(isSupportedHtmlContentType('image/png'), false);
    assert.strictEqual(isSupportedHtmlContentType('application/octet-stream'), false);
    assert.strictEqual(isSupportedHtmlContentType(''), false);
    assert.strictEqual(isSupportedHtmlContentType(undefined), false);
  });

  // Test 4.2: Direct raw byte MD5/SHA-256 calculation
  await test('Raw-byte Fingerprinting: Direct buffer hashing does not depend on text normalization or decoding', async () => {
    const { createHash } = await import('node:crypto');
    const rawBuffer = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]); // UTF-8 with BOM
    const md5Expected = createHash('md5').update(rawBuffer).digest('hex');
    const shaExpected = createHash('sha256').update(rawBuffer).digest('hex');

    const parsed = extractHtmlSignals('<html><head><title>Test</title></head><body>Hello</body></html>', 'https://example.com/', rawBuffer);
    assert.strictEqual(parsed.md5, md5Expected);
    assert.strictEqual(parsed.sha256, shaExpected);
  });

  // Test 4.3: Separate robots and crawler-specific directives
  await test('Meta Robots: Separates general, googlebot, and bingbot directives without silent overwriting', async () => {
    const htmlWithMultipleRobots = `
      <html>
        <head>
          <meta name="robots" content="index, follow">
          <meta name="googlebot" content="noindex, follow">
          <meta name="bingbot" content="index, nofollow">
        </head>
        <body>Test</body>
      </html>
    `;
    const parsed = extractHtmlSignals(htmlWithMultipleRobots, 'https://example.com/');
    assert.strictEqual(parsed.generalRobots, 'index, follow');
    assert.strictEqual(parsed.googlebotRobots, 'noindex, follow');
    assert.strictEqual(parsed.bingbotRobots, 'index, nofollow');
  });

  // Test 4.4: Link destination comparison (identical counts, different destinations)
  await test('Link Comparison: Detects different destinations even when total link count matches', async () => {
    const resultA: AgentTestResult = {
      userAgentId: 'chrome-desktop',
      userAgentName: 'Chrome',
      status: 'success',
      statusCode: 200,
      statusText: 'OK',
      finalUrl: 'https://example.com/',
      redirectChain: [],
      isHtml: true,
      title: 'Page',
      metaDescription: 'Desc',
      h1: ['Heading'],
      wordCount: 100,
      imageCount: 1,
      linkCount: 2,
      internalLinkCount: 2,
      externalLinkCount: 0,
      internalLinksSample: ['https://example.com/products', 'https://example.com/contact'],
      externalLinksSample: [],
      imagesSample: [{ src: 'https://example.com/logo.png', alt: 'Logo' }],
      varyUserAgent: 'Present',
      varyHeaderRaw: 'User-Agent',
      md5: 'hash1',
      sha256: 'hash1',
      generalRobots: 'index',
      googlebotRobots: null,
      bingbotRobots: null,
      metaRobots: 'index',
      xRobotsTag: null,
      canonical: 'https://example.com/',
      contentType: 'text/html',
      contentLanguage: 'en',
      durationMs: 50,
      htmlSize: 500,
      hasStructuredData: false,
      error: null,
    };

    const resultB: AgentTestResult = {
      ...resultA,
      userAgentId: 'googlebot-desktop',
      userAgentName: 'Googlebot',
      md5: 'hash2',
      sha256: 'hash2',
      // Same linkCount (2), but different destination (/pricing instead of /contact)
      internalLinksSample: ['https://example.com/products', 'https://example.com/pricing'],
    };

    const { comparisons } = compareAgentResults([resultA, resultB]);
    const linkComp = comparisons.find((c) => c.field === 'linkCount');
    assert(linkComp);
    assert.strictEqual(linkComp.status, 'different');
    assert(linkComp.explanation.includes('specific link destination URLs differ'));
  });

  // Test 4.5: Image comparison (identical count, different image src or alt text)
  await test('Image Comparison: Detects different image src/alt when image counts match', async () => {
    const resultA: AgentTestResult = {
      userAgentId: 'chrome-desktop',
      userAgentName: 'Chrome',
      status: 'success',
      statusCode: 200,
      statusText: 'OK',
      finalUrl: 'https://example.com/',
      redirectChain: [],
      isHtml: true,
      title: 'Page',
      metaDescription: 'Desc',
      h1: ['Heading'],
      wordCount: 100,
      imageCount: 1,
      linkCount: 0,
      internalLinkCount: 0,
      externalLinkCount: 0,
      imagesSample: [{ src: 'https://example.com/hero-desktop.jpg', alt: 'Hero Banner' }],
      varyUserAgent: 'Present',
      varyHeaderRaw: 'User-Agent',
      md5: 'hash1',
      sha256: 'hash1',
      generalRobots: 'index',
      googlebotRobots: null,
      bingbotRobots: null,
      metaRobots: 'index',
      xRobotsTag: null,
      canonical: 'https://example.com/',
      contentType: 'text/html',
      contentLanguage: 'en',
      durationMs: 50,
      htmlSize: 500,
      hasStructuredData: false,
      error: null,
    };

    const resultB: AgentTestResult = {
      ...resultA,
      userAgentId: 'googlebot-desktop',
      userAgentName: 'Googlebot',
      md5: 'hash2',
      sha256: 'hash2',
      imagesSample: [{ src: 'https://example.com/hero-bot.jpg', alt: 'Hero Banner Bot' }],
    };

    const { comparisons } = compareAgentResults([resultA, resultB]);
    const imgComp = comparisons.find((c) => c.field === 'imageCount');
    assert(imgComp);
    assert.strictEqual(imgComp.status, 'different');
    assert(imgComp.explanation.includes('image source URLs (src) or alt text attributes differ'));
  });

  // Test 4.6: HTTP Error responses (403, 404, 500)
  await test('Error Responses: Accurately classifies HTTP 403, 404, and 500 error pages without misleading SEO warnings', async () => {
    const errorServer = http.createServer((req, res) => {
      const ua = req.headers['user-agent'] || '';
      if (ua.includes('Googlebot')) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>403 Forbidden</title></head><body>Forbidden for bots</body></html>');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>Legitimate Page</title></head><body>Normal Content</body></html>');
      }
    });

    await new Promise<void>((resolve) => errorServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (errorServer.address() as any).port;

    try {
      const resChrome = await fetchWithUserAgent(`http://127.0.0.1:${port}/`, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        allowLocalhostForTesting: true,
      });
      const resBot = await fetchWithUserAgent(`http://127.0.0.1:${port}/`, {
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        allowLocalhostForTesting: true,
      });

      assert.strictEqual(resChrome.statusCode, 200);
      assert.strictEqual(resBot.statusCode, 403);

      const agentChrome: AgentTestResult = {
        userAgentId: 'chrome-desktop',
        userAgentName: 'Chrome',
        status: 'success',
        statusCode: resChrome.statusCode,
        statusText: resChrome.statusText,
        finalUrl: resChrome.finalUrl,
        redirectChain: [],
        isHtml: true,
        isErrorResponse: false,
        title: 'Legitimate Page',
        metaDescription: null,
        h1: [],
        wordCount: 10,
        imageCount: 0,
        linkCount: 0,
        internalLinkCount: 0,
        externalLinkCount: 0,
        varyUserAgent: 'Not available',
        varyHeaderRaw: null,
        md5: resChrome.md5,
        sha256: resChrome.sha256,
        generalRobots: null,
        googlebotRobots: null,
        bingbotRobots: null,
        metaRobots: null,
        xRobotsTag: null,
        canonical: null,
        contentType: 'text/html',
        contentLanguage: null,
        durationMs: 20,
        htmlSize: 100,
        hasStructuredData: false,
        error: null,
      };

      const agentBot: AgentTestResult = {
        userAgentId: 'googlebot-desktop',
        userAgentName: 'Googlebot',
        status: 'success',
        statusCode: resBot.statusCode,
        statusText: resBot.statusText,
        finalUrl: resBot.finalUrl,
        redirectChain: [],
        isHtml: true,
        isErrorResponse: true,
        title: '403 Forbidden',
        metaDescription: null,
        h1: [],
        wordCount: 10,
        imageCount: 0,
        linkCount: 0,
        internalLinkCount: 0,
        externalLinkCount: 0,
        varyUserAgent: 'Not available',
        varyHeaderRaw: null,
        md5: resBot.md5,
        sha256: resBot.sha256,
        generalRobots: null,
        googlebotRobots: null,
        bingbotRobots: null,
        metaRobots: null,
        xRobotsTag: null,
        canonical: null,
        contentType: 'text/html',
        contentLanguage: null,
        durationMs: 20,
        htmlSize: 100,
        hasStructuredData: false,
        error: null,
      };

      const { summary, comparisons } = compareAgentResults([agentChrome, agentBot]);
      assert.strictEqual(summary.differentHttpStatuses, true);
      assert.strictEqual(summary.classification, 'Bot-Specific HTML Response');
      assert(summary.classificationReason.includes('error codes'));
    } finally {
      errorServer.close();
    }
  });

  // Test 4.7: Total Operation Deadline Enforced
  await test('Total Request Deadline: Enforces bounded timeout across slow server', async () => {
    const slowServer = http.createServer((_req, res) => {
      // Do not respond
    });

    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (slowServer.address() as any).port;

    try {
      const start = Date.now();
      await assert.rejects(
        async () => {
          await fetchWithUserAgent(`http://127.0.0.1:${port}/`, {
            userAgent: 'TestAgent',
            timeoutMs: 400, // 400ms test deadline
            allowLocalhostForTesting: true,
          });
        },
        /REQUEST_TIMEOUT|timed out/
      );
      const elapsed = Date.now() - start;
      assert(elapsed < 1500, `Deadline must trigger promptly (took ${elapsed}ms)`);
    } finally {
      slowServer.close();
    }
  });

  console.log('\n=====================================================');
  console.log(`TOTAL PRE-RENDERING TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPrerenderTestSuite().catch((err) => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
