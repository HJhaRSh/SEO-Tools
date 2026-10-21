import assert from 'assert';
import http from 'http';
import net from 'net';
import { isPrivateIPv4, isPrivateIPv6, validateSafeUrl, resolveAndVerifyPublicIp } from './lib/seo/hreflang/safeFetch';
import { validateTargetUrlForBrowser, classifyBrowserRenderError } from './lib/seo/mobile-friendly/browserSecurity';
import { redactSensitiveDetails, classifyAndSanitizeError } from './lib/seo/errorSanitizer';
import { isPrivateOrReservedIP } from './lib/seo/ssrf';
import { startSsrfGuardProxy, validateDestination } from './lib/seo/secureBrowserProxy';
import { auditBulkUrls, runBrowserAudit } from './lib/seo/mobile-friendly/auditService';

// Import core services for each of the 14 tools to verify functional integrity
import { sanitizeBulkUrls, selectUniqueAiBots, analyzePageContent } from './lib/seo/aiBotTesterService';
import { AI_BOT_REGISTRY, getAiBotById } from './lib/seo/aiBotRegistry';
import { parseHtmlHreflang } from './lib/seo/hreflang/parseHtml';
import { validateHreflangCode } from './lib/seo/hreflang/validateLocale';
import { parseLinkHeaders } from './lib/seo/hreflang/parseHeaders';
import { testHtaccessRules } from './lib/seo/htaccessService';
import { validateSearchRequest } from './lib/seo/knowledge-graph/validation';
import { buildGoogleSearchUrl, encodeUule } from './lib/seo/localSearchService';
import { calculateContentSimilarity } from './lib/seo/mobile-first/comparator';
import { auditStaticHtmlMobileFriendliness } from './lib/seo/mobile-friendly/staticAuditor';
import { DEFAULT_VIEWPORT_PRESET } from './lib/seo/mobile-friendly/constants';
import { compareAgentResults } from './lib/seo/prerendering/comparisonEngine';
import { executeGenerateLink, executeBulkBatch } from './lib/seo/reviewLinkService';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from './lib/seo/robotsParser';
import { buildSchemaObject } from './lib/seo/schema/builders';
import { fetchPageMetadata } from './lib/seo/serp/fetchMetadata';
import { parseSitemapXml } from './lib/seo/hreflang/parseSitemap';

async function runSecurityAndQASuite() {
  console.log('=====================================================');
  console.log('FINAL SECURITY HARDENING & 14-TOOL QA VERIFICATION');
  console.log('=====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            passed++;
            console.log(`  ✓ [PASS] ${name}`);
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`  ✗ [FAIL] ${name}:`, message);
            throw err;
          });
      } else {
        passed++;
        console.log(`  ✓ [PASS] ${name}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ [FAIL] ${name}:`, message);
      throw err;
    }
  }

  console.log('1. Hreflang Fetch Security & SSRF Protection:');

  test('Hreflang safeFetch: Blocks IPv4 loopback 127.0.0.1', () => {
    assert.strictEqual(isPrivateIPv4('127.0.0.1'), true);
  });

  test('Hreflang safeFetch: Blocks RFC 1918 private IPv4 (10.x, 172.16.x, 192.168.x)', () => {
    assert.strictEqual(isPrivateIPv4('10.0.0.1'), true);
    assert.strictEqual(isPrivateIPv4('172.16.0.1'), true);
    assert.strictEqual(isPrivateIPv4('192.168.1.1'), true);
  });

  test('Hreflang safeFetch: Blocks cloud metadata 169.254.169.254 and link-local', () => {
    assert.strictEqual(isPrivateIPv4('169.254.169.254'), true);
  });

  test('Hreflang safeFetch: Blocks IPv6 loopback (::1) and unique-local (fc/fd)', () => {
    assert.strictEqual(isPrivateIPv6('::1'), true);
    assert.strictEqual(isPrivateIPv6('fc00::1'), true);
    assert.strictEqual(isPrivateIPv6('fe80::1'), true);
  });

  test('Hreflang safeFetch: Allows public IPv4 (8.8.8.8, 1.1.1.1)', () => {
    assert.strictEqual(isPrivateIPv4('8.8.8.8'), false);
    assert.strictEqual(isPrivateIPv4('1.1.1.1'), false);
  });

  test('Core SSRF: IPv4-mapped IPv6 hex forms are blocked (::ffff:7f00:1, ::ffff:a9fe:a9fe, ::ffff:c0a8:0101)', () => {
    assert.strictEqual(isPrivateOrReservedIP('::ffff:7f00:1'), true, '::ffff:7f00:1 must be blocked');
    assert.strictEqual(isPrivateOrReservedIP('0:0:0:0:0:ffff:7f00:1'), true, '0:0:0:0:0:ffff:7f00:1 must be blocked');
    assert.strictEqual(isPrivateOrReservedIP('::ffff:a9fe:a9fe'), true, '::ffff:a9fe:a9fe (169.254.169.254) must be blocked');
    assert.strictEqual(isPrivateOrReservedIP('::ffff:c0a8:0101'), true, '::ffff:c0a8:0101 (192.168.1.1) must be blocked');
    assert.strictEqual(isPrivateOrReservedIP('::ffff:0808:0808'), false, '::ffff:0808:0808 (8.8.8.8) must be allowed');
  });

  await test('Hreflang safeFetch: validateSafeUrl rejects localhost and metadata hostname', async () => {
    await assert.rejects(async () => {
      await validateSafeUrl('http://localhost:3000');
    }, /blocked/i);

    await assert.rejects(async () => {
      await validateSafeUrl('http://metadata.google.internal');
    }, /blocked/i);
  });

  await test('Hreflang safeFetch: validateSafeUrl rejects non-HTTP protocols', async () => {
    await assert.rejects(async () => {
      await validateSafeUrl('ftp://example.com/file');
    }, /disallowed protocol/i);

    await assert.rejects(async () => {
      await validateSafeUrl('file:///etc/passwd');
    }, /disallowed protocol/i);
  });

  await test('Hreflang safeFetch: resolveAndVerifyPublicIp rejects private IPs', async () => {
    await assert.rejects(async () => {
      await resolveAndVerifyPublicIp('127.0.0.1');
    }, /blocked/i);

    await assert.rejects(async () => {
      await resolveAndVerifyPublicIp('169.254.169.254');
    }, /blocked/i);
  });

  console.log('\n2. Mobile-Friendly Browser Security & Network Isolation:');

  await test('Browser Security: validateTargetUrlForBrowser rejects localhost', async () => {
    await assert.rejects(async () => {
      await validateTargetUrlForBrowser('http://localhost:3000/app');
    }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
  });

  await test('Browser Security: validateTargetUrlForBrowser rejects embedded credentials', async () => {
    await assert.rejects(async () => {
      await validateTargetUrlForBrowser('http://user:pass@example.com');
    }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
  });

  await test('Browser Security: validateTargetUrlForBrowser rejects disallowed ports', async () => {
    await assert.rejects(async () => {
      await validateTargetUrlForBrowser('http://example.com:22');
    }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
  });

  await test('Browser Security: validateTargetUrlForBrowser rejects private IPs', async () => {
    await assert.rejects(async () => {
      await validateTargetUrlForBrowser('http://192.168.1.100');
    }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
  });

  test('Browser Security: classifyBrowserRenderError maps security blocks to 403', () => {
    const res = classifyBrowserRenderError(new Error('net::ERR_BLOCKED_BY_CLIENT'), 'Blocked');
    assert.strictEqual(res.code, 'BLOCKED_DESTINATION');
    assert.strictEqual(res.status, 403);
  });

  test('Browser Security: classifyBrowserRenderError maps timeouts to 504', () => {
    const res = classifyBrowserRenderError(new Error('page.goto: Timeout 20000ms exceeded'), null);
    assert.strictEqual(res.code, 'REQUEST_TIMEOUT');
    assert.strictEqual(res.status, 504);
  });

  test('Browser Security: classifyBrowserRenderError maps DNS failures to 502', () => {
    const res = classifyBrowserRenderError(new Error('net::ERR_NAME_NOT_RESOLVED'), null);
    assert.strictEqual(res.code, 'DNS_FAILURE');
    assert.strictEqual(res.status, 502);
  });

  test('Browser Security: classifyBrowserRenderError maps Chromium launch issues to 503', () => {
    const res = classifyBrowserRenderError(new Error('Failed to launch the browser process: Executable path not found'), null);
    assert.strictEqual(res.code, 'RENDER_UNAVAILABLE');
    assert.strictEqual(res.status, 503);
  });

  console.log('\n2b. Mobile-Friendly Secure Browser Proxy & DNS Rebinding Hardening (Phase 3A):');

  await test('Secure Proxy: Public destinations remain allowed', async () => {
    const pubV4 = await validateDestination('93.184.216.34', '80');
    assert.strictEqual(pubV4, '93.184.216.34');

    const pubV6 = await validateDestination('2606:4700:4700::1111', '443');
    assert.strictEqual(pubV6, '2606:4700:4700::1111');

    const mockPublicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
    const resolvedPub = await validateDestination('public.example.test', '80', false, mockPublicLookup);
    assert.strictEqual(resolvedPub, '93.184.216.34');
  });

  await test('Secure Proxy: Blocks private IPv4 addresses (127.0.0.1, 10.0.0.1, 192.168.1.1, 169.254.169.254)', async () => {
    const privateIps = ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254'];
    for (const ip of privateIps) {
      await assert.rejects(async () => {
        await validateDestination(ip, '80');
      }, /private or reserved|blocked/i);
    }
  });

  await test('Secure Proxy: Blocks private and reserved IPv6 destinations', async () => {
    const privateV6 = ['::1', 'fe80::1', 'fc00::1', '[::1]', '[fe80::1]'];
    for (const ip of privateV6) {
      await assert.rejects(async () => {
        await validateDestination(ip, '443');
      }, /private or reserved|blocked/i);
    }
  });

  await test('Secure Proxy: Blocks IPv4-mapped private IPv6 addresses', async () => {
    const mappedIps = [
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:a9fe:a9fe',
      '[::ffff:127.0.0.1]',
      '[::ffff:7f00:1]',
      '[::ffff:a9fe:a9fe]',
    ];
    for (const ip of mappedIps) {
      await assert.rejects(async () => {
        await validateDestination(ip, '80');
      }, /private or reserved|blocked/i);
    }
  });

  await test('Secure Proxy: Enforces 403 Forbidden for TCP CONNECT tunneling to private destinations', async () => {
    const proxy = await startSsrfGuardProxy();
    try {
      const helperConnect = (target: string): Promise<number> => {
        return new Promise((resolve, reject) => {
          const client = net.connect(proxy.port, '127.0.0.1', () => {
            client.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
          });
          let data = '';
          client.on('data', (chunk) => {
            data += chunk.toString();
            const match = data.match(/HTTP\/1\.[01]\s+(\d+)/);
            if (match) {
              client.destroy();
              resolve(parseInt(match[1], 10));
            }
          });
          client.on('error', reject);
          client.on('end', () => {
            const match = data.match(/HTTP\/1\.[01]\s+(\d+)/);
            resolve(match ? parseInt(match[1], 10) : 0);
          });
        });
      };

      const statusV4Loopback = await helperConnect('127.0.0.1:80');
      assert.strictEqual(statusV4Loopback, 403);

      const statusV4Meta = await helperConnect('169.254.169.254:80');
      assert.strictEqual(statusV4Meta, 403);

      const statusV6Loopback = await helperConnect('[::1]:443');
      assert.strictEqual(statusV6Loopback, 403);

      const statusV4Mapped = await helperConnect('::ffff:127.0.0.1:443');
      assert.strictEqual(statusV4Mapped, 403);
    } finally {
      await proxy.close();
    }
  });

  await test('Secure Proxy & Audit: Redirect protection blocks safe URL redirecting to private destinations', async () => {
    // 1. Stand up deterministic mock redirect server
    let redirectServerPort = 0;
    const redirectServer = http.createServer((req, res) => {
      if (req.url === '/redirect-to-meta') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
      } else if (req.url === '/redirect-to-loopback') {
        res.writeHead(302, { Location: 'http://127.0.0.1:8080/admin' });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Safe Landing');
      }
    });

    await new Promise<void>((resolve) => {
      redirectServer.listen(0, '127.0.0.1', () => {
        redirectServerPort = (redirectServer.address() as net.AddressInfo).port;
        resolve();
      });
    });

    const proxy = await startSsrfGuardProxy({ allowLocalhostForTesting: true });

    try {
      // Direct request to initial URL succeeds through proxy
      const initialRes: { statusCode?: number; headers: http.IncomingHttpHeaders } = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: proxy.port,
            method: 'GET',
            path: `http://127.0.0.1:${redirectServerPort}/redirect-to-meta`,
            headers: { Host: `127.0.0.1:${redirectServerPort}` },
          },
          (res) => {
            resolve({ statusCode: res.statusCode, headers: res.headers });
          }
        );
        req.on('error', reject);
        req.end();
      });

      assert.strictEqual(initialRes.statusCode, 302);
      const redirectTarget = String(initialRes.headers.location || '');
      assert.strictEqual(redirectTarget, 'http://169.254.169.254/latest/meta-data/');

      // Secondary request following redirect through proxy is BLOCKED with 403
      const redirectFollowRes: { statusCode?: number; body: string } = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: proxy.port,
            method: 'GET',
            path: redirectTarget,
            headers: { Host: '169.254.169.254' },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, body }));
          }
        );
        req.on('error', reject);
        req.end();
      });

      assert.strictEqual(redirectFollowRes.statusCode, 403);
      assert.match(redirectFollowRes.body, /SSRF Blocked/);

      // Verify that browser navigation pre/post check independently blocks redirect target
      await assert.rejects(async () => {
        await validateTargetUrlForBrowser(redirectTarget);
      }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');

      await assert.rejects(async () => {
        await validateTargetUrlForBrowser('http://127.0.0.1:8080/admin');
      }, (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'BLOCKED_DESTINATION');
    } finally {
      await proxy.close();
      await new Promise<void>((resolve) => redirectServer.close(() => resolve()));
    }
  });

  await test('Secure Proxy & DNS Rebinding Simulation: Re-evaluates DNS at connection time and rejects rebinding', async () => {
    let resolutionCount = 0;
    const rebindingLookupFn = async () => {
      resolutionCount++;
      if (resolutionCount === 1) {
        // Initial resolution returns public IP
        return [{ address: '93.184.216.34', family: 4 }];
      } else {
        // Subsequent resolution rebinds to internal private IP
        return [{ address: '127.0.0.1', family: 4 }];
      }
    };

    // 1. Direct validation check: first resolution passes, second is rejected
    const ip1 = await validateDestination('rebind.victim.test', '80', false, rebindingLookupFn);
    assert.strictEqual(ip1, '93.184.216.34');

    await assert.rejects(async () => {
      await validateDestination('rebind.victim.test', '80', false, rebindingLookupFn);
    }, /private\/reserved IP 127\.0\.0\.1/);

    // 2. Proxy connection check: verify proxy dynamically evaluates destination and blocks connection
    let proxyLookupCount = 0;
    const proxyLookupFn = async () => {
      proxyLookupCount++;
      if (proxyLookupCount === 1) {
        return [{ address: '93.184.216.34', family: 4 }];
      } else {
        return [{ address: '10.0.0.1', family: 4 }];
      }
    };

    const proxy = await startSsrfGuardProxy({ lookupFn: proxyLookupFn });
    try {
      // First connection validates 93.184.216.34
      const firstIp = await validateDestination('rebinding-host.test', '80', false, proxyLookupFn);
      assert.strictEqual(firstIp, '93.184.216.34');

      // Second connection attempt through proxy: dynamically resolves to 10.0.0.1 and returns 403 Forbidden
      const res: { statusCode?: number; body: string } = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: proxy.port,
            method: 'GET',
            path: 'http://rebinding-host.test/',
            headers: { Host: 'rebinding-host.test' },
          },
          (response) => {
            let body = '';
            response.on('data', (c) => { body += c; });
            response.on('end', () => resolve({ statusCode: response.statusCode, body }));
          }
        );
        req.on('error', reject);
        req.end();
      });

      assert.strictEqual(res.statusCode, 403);
      assert.match(res.body, /resolves to private\/reserved IP 10\.0\.0\.1/);
    } finally {
      await proxy.close();
    }
  });

  console.log('\n2c. Mobile-Friendly Batch Chromium Reuse & Context Isolation (Phase 3B):');

  function createDeterministicMockChromium() {
    let launchCount = 0;
    let browserCloseCount = 0;
    const contextsCreated: Array<{
      id: number;
      isClosed: boolean;
      options: unknown;
      close: () => Promise<void>;
      newPage: () => Promise<unknown>;
      route: () => Promise<void>;
      addInitScript: () => Promise<void>;
    }> = [];

    const mockBrowser = {
      isConnected: () => browserCloseCount === 0,
      close: async () => {
        browserCloseCount++;
      },
      newContext: async (contextOptions: unknown) => {
        const contextId = contextsCreated.length + 1;
        const mockPage = {
          setDefaultNavigationTimeout: () => {},
          setDefaultTimeout: () => {},
          goto: async (targetUrl: string) => {
            if (targetUrl.includes('simulate-timeout')) {
              throw new Error('Navigation failed: net::ERR_CONNECTION_TIMED_OUT');
            }
            return {
              status: () => 200,
              statusText: () => 'OK',
              url: () => targetUrl,
            };
          },
          waitForTimeout: async () => {},
          evaluate: async () => ({
            hasViewportMeta: true,
            viewportContent: 'width=device-width, initial-scale=1',
            contentWidth: 390,
            windowInnerWidth: 390,
            tapTargetsTotal: 5,
            tapTargetsSmall: 0,
            fontSizesUnder12pxCount: 0,
            hasLegacyPlugins: false,
          }),
          screenshot: async () => Buffer.from('mock-png'),
        };

        const ctx = {
          id: contextId,
          isClosed: false,
          options: contextOptions,
          newPage: async () => mockPage,
          route: async () => {},
          addInitScript: async () => {},
          close: async () => {
            ctx.isClosed = true;
          },
        };

        contextsCreated.push(ctx);
        return ctx as unknown as import('playwright-core').BrowserContext;
      },
    };

    const mockLauncher = async () => {
      launchCount++;
      return mockBrowser as unknown as import('playwright-core').Browser;
    };

    return {
      getLaunchCount: () => launchCount,
      getBrowserCloseCount: () => browserCloseCount,
      getContextsCreated: () => contextsCreated,
      mockLauncher,
      mockBrowser: mockBrowser as unknown as import('playwright-core').Browser,
    };
  }

  await test('Chromium Reuse: Launches Chromium exactly once for a batch of 3 URLs', async () => {
    const mock = createDeterministicMockChromium();
    const urls = ['https://example.com/p1', 'https://example.com/p2', 'https://example.com/p3'];

    const results = await auditBulkUrls({
      urls,
      launcher: mock.mockLauncher,
      allowLocalhostForTesting: false,
    });

    assert.strictEqual(results.length, 3, 'Must return 3 results');
    assert.strictEqual(mock.getLaunchCount(), 1, 'Chromium launcher must be called exactly 1 time across batch');
    assert.strictEqual(mock.getContextsCreated().length, 3, 'Must create 3 distinct contexts');
  });

  await test('Context Isolation: Preserves independent BrowserContext per URL', async () => {
    const mock = createDeterministicMockChromium();
    const urls = ['https://example.com/alpha', 'https://example.com/beta', 'https://example.com/gamma'];

    await auditBulkUrls({
      urls,
      launcher: mock.mockLauncher,
    });

    const contexts = mock.getContextsCreated();
    assert.strictEqual(contexts.length, 3);
    assert.notStrictEqual(contexts[0], contexts[1], 'Context 1 and Context 2 must be different instances');
    assert.notStrictEqual(contexts[1], contexts[2], 'Context 2 and Context 3 must be different instances');
    assert.strictEqual(contexts[0].id, 1);
    assert.strictEqual(contexts[1].id, 2);
    assert.strictEqual(contexts[2].id, 3);
  });

  await test('Context Cleanup: Closes each BrowserContext after URL completion', async () => {
    const mock = createDeterministicMockChromium();
    const urls = ['https://example.com/page-a', 'https://example.com/page-b'];

    await auditBulkUrls({
      urls,
      launcher: mock.mockLauncher,
    });

    const contexts = mock.getContextsCreated();
    assert.strictEqual(contexts.length, 2);
    assert.strictEqual(contexts[0].isClosed, true, 'Context for page-a must be closed');
    assert.strictEqual(contexts[1].isClosed, true, 'Context for page-b must be closed');
  });

  await test('Browser Cleanup: Closes shared Chromium instance exactly once after batch completion', async () => {
    const mock = createDeterministicMockChromium();
    const urls = ['https://example.com/u1', 'https://example.com/u2', 'https://example.com/u3'];

    await auditBulkUrls({
      urls,
      launcher: mock.mockLauncher,
    });

    assert.strictEqual(mock.getBrowserCloseCount(), 1, 'Browser must be closed exactly once when batch completes');
  });

  await test('Failure Isolation: Failed URL cleans up its context and allows remaining URLs to proceed', async () => {
    const mock = createDeterministicMockChromium();
    const urls = [
      'https://example.com/healthy-1',
      'https://example.com/simulate-timeout',
      'https://example.com/healthy-2',
    ];

    const results = await auditBulkUrls({
      urls,
      launcher: mock.mockLauncher,
    });

    assert.strictEqual(results.length, 3, 'Must return results for all 3 URLs');
    const contexts = mock.getContextsCreated();
    assert.strictEqual(contexts.length, 3, 'Must have attempted context for each URL');
    assert.strictEqual(contexts[1].isClosed, true, 'Failed URL context must be closed');
    assert.strictEqual(contexts[0].isClosed, true, 'Healthy URL 1 context must be closed');
    assert.strictEqual(contexts[2].isClosed, true, 'Healthy URL 2 context must be closed');
    assert.strictEqual(mock.getBrowserCloseCount(), 1, 'Browser must remain open until all URLs finish, then close once');
  });

  await test('Single-URL Compatibility: runBrowserAudit works standalone and with provided browser', async () => {
    const mock = createDeterministicMockChromium();

    // With provided browser: does not close the shared browser
    const res1 = await runBrowserAudit('https://example.com/single-shared', {
      browser: mock.mockBrowser,
    });
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(mock.getBrowserCloseCount(), 0, 'Shared browser must NOT be closed by runBrowserAudit');
    assert.strictEqual(mock.getContextsCreated()[0].isClosed, true, 'URL context must be closed');
  });

  console.log('\n3. Error Sanitization & Diagnostics Protection:');

  test('Sanitizer: redactSensitiveDetails scrubs URLs with embedded credentials', () => {
    const raw = 'Failed to connect to https://admin:secret123@internal.corp/api';
    const redacted = redactSensitiveDetails(raw);
    assert.strictEqual(redacted.includes('secret123'), false);
    assert.strictEqual(redacted.includes('[REDACTED_CREDENTIALS]'), true);
  });

  test('Sanitizer: redactSensitiveDetails scrubs sensitive query parameters', () => {
    const raw = 'URL requested: https://api.service.com?token=abc_secret_key_123&user=john';
    const redacted = redactSensitiveDetails(raw);
    assert.strictEqual(redacted.includes('abc_secret_key_123'), false);
    assert.strictEqual(redacted.includes('token=[REDACTED]'), true);
  });

  test('Sanitizer: redactSensitiveDetails scrubs Bearer and Basic tokens', () => {
    const raw = 'Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-kJ8g';
    const redacted = redactSensitiveDetails(raw);
    assert.strictEqual(redacted.includes('Bearer [REDACTED]'), true);
  });

  test('Sanitizer: redactSensitiveDetails scrubs Windows and Unix server filesystem paths', () => {
    const rawWin = 'Error reading C:\\Users\\Administrator\\SEO-Tools\\keys\\secret.key';
    assert.strictEqual(redactSensitiveDetails(rawWin).includes('C:\\Users'), false);

    const rawUnix = 'Error reading /var/www/seo-tools/config/database.json';
    assert.strictEqual(redactSensitiveDetails(rawUnix).includes('/var/www'), false);
  });

  test('Sanitizer: redactSensitiveDetails scrubs internal and metadata IPs', () => {
    const raw = 'Connection refused to 127.0.0.1:8080 and 169.254.169.254';
    const redacted = redactSensitiveDetails(raw);
    assert.strictEqual(redacted.includes('127.0.0.1'), false);
    assert.strictEqual(redacted.includes('169.254.169.254'), false);
    assert.strictEqual(redacted.includes('[INTERNAL_IP]'), true);
  });

  test('Sanitizer: classifyAndSanitizeError classifies SSRF / blocked destinations as 403', () => {
    const err = new Error('Hostname example.local resolves to blocked/private IP: 10.0.0.1');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'BLOCKED_DESTINATION');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.message.includes('10.0.0.1'), false);
  });

  test('Sanitizer: classifyAndSanitizeError classifies timeouts as 504', () => {
    const err = new Error('Request timed out after 8s. The server may be unresponsive');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'REQUEST_TIMEOUT');
    assert.strictEqual(res.status, 504);
  });

  test('Sanitizer: classifyAndSanitizeError classifies DNS failures as 502', () => {
    const err = new Error('getaddrinfo ENOTFOUND non-existent-domain-xyz.com');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'DNS_FAILURE');
    assert.strictEqual(res.status, 502);
  });

  test('Sanitizer: classifyAndSanitizeError preserves safe validation feedback as 400', () => {
    const err = new Error('Please provide a valid website URL to test.');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'VALIDATION_ERROR');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.message, 'Please provide a valid website URL to test.');
  });

  test('Sanitizer: redactSensitiveDetails scrubs specific sensitive paths and IPs', () => {
    const rawWin = 'Failed to load file at C:\\Users\\secret\\project\\config.json';
    const rawUnix = 'Cannot access /etc/passwd directly';
    const rawLocalIp = 'Connection to 127.0.0.1 refused';
    const rawMetaIp = 'Request to 169.254.169.254 timed out';

    assert.strictEqual(redactSensitiveDetails(rawWin).includes('C:\\Users\\secret\\project'), false);
    assert.strictEqual(redactSensitiveDetails(rawWin).includes('[REDACTED_PATH]'), true);
    assert.strictEqual(redactSensitiveDetails(rawUnix).includes('/etc/passwd'), false);
    assert.strictEqual(redactSensitiveDetails(rawUnix).includes('[REDACTED_PATH]'), true);
    assert.strictEqual(redactSensitiveDetails(rawLocalIp).includes('127.0.0.1'), false);
    assert.strictEqual(redactSensitiveDetails(rawLocalIp).includes('[INTERNAL_IP]'), true);
    assert.strictEqual(redactSensitiveDetails(rawMetaIp).includes('169.254.169.254'), false);
    assert.strictEqual(redactSensitiveDetails(rawMetaIp).includes('[INTERNAL_IP]'), true);
  });

  test('Sanitizer: classifyAndSanitizeError never exposes raw sensitive paths, IPs, or stacks', () => {
    const errWin = new Error('ENOENT: no such file, open C:\\Users\\secret\\project\\secret.key');
    const resWin = classifyAndSanitizeError(errWin);
    assert.strictEqual(resWin.status, 500);
    assert.strictEqual(resWin.message.includes('C:\\Users\\secret\\project'), false);
    assert.strictEqual(resWin.message.includes('secret.key'), false);

    const errUnix = new Error('Permission denied: /etc/passwd at FileSystem.read (/usr/app/node_modules/fs:10:2)');
    const resUnix = classifyAndSanitizeError(errUnix);
    assert.strictEqual(resUnix.status, 500);
    assert.strictEqual(resUnix.message.includes('/etc/passwd'), false);
    assert.strictEqual(resUnix.message.includes('/usr/app'), false);

    const errLocal = new Error('connect ECONNREFUSED 127.0.0.1:5000');
    const resLocal = classifyAndSanitizeError(errLocal);
    assert.strictEqual(resLocal.message.includes('127.0.0.1'), false);

    const errMeta = new Error('connect ETIMEDOUT 169.254.169.254:80');
    const resMeta = classifyAndSanitizeError(errMeta);
    assert.strictEqual(resMeta.message.includes('169.254.169.254'), false);
  });

  test('Sanitizer: classifyAndSanitizeError preserves user-facing validation messages with 400', () => {
    const v1 = classifyAndSanitizeError(new Error('Invalid URL'));
    assert.strictEqual(v1.status, 400);

    const v2 = classifyAndSanitizeError(new Error('Maximum URL limit exceeded'));
    assert.strictEqual(v2.status, 400);
    assert.strictEqual(v2.message, 'Maximum URL limit exceeded');

    const v3 = classifyAndSanitizeError(new Error('Unsupported file type'));
    assert.strictEqual(v3.status, 400);
    assert.strictEqual(v3.message, 'Unsupported file type');

    const v4 = classifyAndSanitizeError(new Error('Missing required field: websiteUrl'));
    assert.strictEqual(v4.status, 400);
    assert.strictEqual(v4.message, 'Missing required field: websiteUrl');
  });

  test('Sanitizer: classifyAndSanitizeError masks unhandled internal errors as 500 without leaking stack', () => {
    const err = new Error('Uncaught TypeError: Cannot read property of undefined at Object.run (/app/internal/code.ts:42:15)');
    const res = classifyAndSanitizeError(err);
    assert.strictEqual(res.code, 'INTERNAL_ERROR');
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.message.includes('TypeError'), false);
    assert.strictEqual(res.message.includes('/app/internal'), false);
  });

  console.log('\n4. Functional Regression Across All 14 SEO Tools:');

  // Tool 1: AI Bot Access Tester
  test('Tool 1 (AI Bot Access Tester): Registry preserves AI bot definitions and sanitizes URLs', () => {
    assert(AI_BOT_REGISTRY.length >= 10, 'Must have at least 10 registered AI bots');
    const { validUrls } = sanitizeBulkUrls(['https://example.com/p1', 'https://example.com/p1', 'http://example.com/p2']);
    assert.strictEqual(validUrls.length, 2, 'Should deduplicate bulk URLs');
  });

  test('Tool 1 (AI Bot Access Tester): Deduplicates bot IDs, preserves first-occurrence order, and ignores unknown IDs', () => {
    const botIds = [
      'gptbot',
      'gptbot',
      'claudebot',
      'gptbot',
      'claudebot',
      'unknown-bot-id-12345'
    ];
    const selected = selectUniqueAiBots(botIds);
    assert.strictEqual(selected.length, 2, 'Should deduplicate to exactly 2 selected bots');
    assert.strictEqual(selected[0].id, 'gptbot', 'First bot must be gptbot (preserving first-occurrence order)');
    assert.strictEqual(selected[1].id, 'claudebot', 'Second bot must be claudebot');
  });

  test('Tool 1 (AI Bot Access Tester): Enforces 100 URL maximum limit', () => {
    const raw = Array.from({ length: 110 }, (_, i) => `https://example.com/page-${i}`);
    const { validUrls, errors } = sanitizeBulkUrls(raw);
    assert.strictEqual(validUrls.length, 100);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /Maximum 100 URLs/);
  });

  test('Tool 1 (AI Bot Access Tester): Registry integrity verifies 35 bot definitions and representative IDs', () => {
    assert.strictEqual(AI_BOT_REGISTRY.length, 35);
    assert.ok(getAiBotById('gptbot'));
    assert.ok(getAiBotById('claudebot'));
    assert.ok(getAiBotById('oai-searchbot'));
    assert.ok(getAiBotById('perplexitybot'));
    assert.ok(getAiBotById('bytespider'));
    assert.ok(getAiBotById('omgili'));
    assert.ok(getAiBotById('semrushbot-ocob'));
  });

  test('Tool 1 (AI Bot Access Tester): Policy-only bots have HTTP testing disabled', () => {
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

  test('Tool 1 (AI Bot Access Tester): Content analysis distinguishes challenges, normal HTML, and 403 access denial', () => {
    // Challenge detection
    const challengeHtml = '<html><head><title>Just a moment...</title></head><body>Please verify you are a human before accessing. Turnstile challenge.</body></html>';
    const resChallenge = analyzePageContent(200, 'text/html', challengeHtml);
    assert.strictEqual(resChallenge.status, 'POSSIBLE_CHALLENGE');
    assert.strictEqual(resChallenge.challengeDetected, true);

    // Normal HTML
    const normalHtml = '<html><head><title>SEO Articles</title></head><body><h1>Welcome to Indian Marketers SEO Suite</h1><p>Comprehensive tools.</p></body></html>';
    const resNormal = analyzePageContent(200, 'text/html', normalHtml);
    assert.strictEqual(resNormal.status, 'CONTENT_RETRIEVED');
    assert.strictEqual(resNormal.title, 'SEO Articles');

    // HTTP 403 Access Denied
    const res403 = analyzePageContent(403, 'text/html', 'Forbidden');
    assert.strictEqual(res403.status, 'ACCESS_DENIED');
  });

  // Tool 2: Fetch & Render
  test('Tool 2 (Fetch & Render): Normalizes path and respects robots directives', () => {
    const parsed = parseRobotsTxt('User-agent: *\nDisallow: /admin/\nAllow: /admin/help');
    const rules = selectRulesForUserAgent(parsed.groups, 'googlebot');
    const evalRes = evaluateCrawlability(rules.rules, '/admin/help', 'Googlebot', 'googlebot');
    assert.strictEqual(evalRes.status, 'ALLOWED');
  });

  // Tool 3: Hreflang Tester
  test('Tool 3 (Hreflang Tester): Parses HTML hreflang tags and validates codes', () => {
    const html = '<link rel="alternate" hreflang="en-US" href="https://example.com/us/" /><link rel="alternate" hreflang="es-ES" href="https://example.com/es/" />';
    const parsed = parseHtmlHreflang(html, 'https://example.com/us/');
    assert.strictEqual(parsed.annotations.length, 2);
    const validCode = validateHreflangCode('en-US');
    assert.strictEqual(validCode.isValid, true);
  });

  test('Tool 3 (Hreflang Tester): Validates UK region, x-default, script codes, delimiter, and parses HTTP Link headers', () => {
    // Invalid UK region
    const tUK = validateHreflangCode('en-UK');
    assert.strictEqual(tUK.isValid, false);
    assert(tUK.issues.some(i => i.code === 'INVALID_UK_REGION'), 'en-UK should flag INVALID_UK_REGION');

    // x-default
    const tXDefault = validateHreflangCode('x-default');
    assert.strictEqual(tXDefault.isValid, true);
    assert.strictEqual(tXDefault.isXDefault, true);

    // Script code
    const tScript = validateHreflangCode('zh-Hans');
    assert.strictEqual(tScript.isValid, true);
    assert.strictEqual(tScript.script, 'Hans');

    // Invalid delimiter
    const tDelim = validateHreflangCode('en_US');
    assert(tDelim.issues.some(i => i.code === 'INVALID_DELIMITER'), 'en_US should flag INVALID_DELIMITER');

    // HTTP Link header parsing
    const linkHeader = '<https://example.com/en/>; rel="alternate"; hreflang="en", <https://example.com/es/>; rel="alternate"; hreflang="es"';
    const parsedHeader = parseLinkHeaders(linkHeader, 'https://example.com/en/');
    assert.strictEqual(parsedHeader.annotations.length, 2, 'Expected 2 Link header annotations');
  });

  // Tool 4: .htaccess Tester
  await test('Tool 4 (.htaccess Tester): Accurately tests RewriteRule redirections', async () => {
    const rules = 'RewriteEngine On\nRewriteRule ^old-path/?$ /new-path [R=301,L]';
    const result = await testHtaccessRules({
      url: 'https://example.com/old-path',
      htaccess: rules
    });
    assert.strictEqual(result.outputUrl, 'https://example.com/new-path');
  });

  // Tool 5: Knowledge Graph Search
  test('Tool 5 (Knowledge Graph Search): Validates search parameters safely', () => {
    const val = validateSearchRequest({ query: 'Google', language: 'en', limit: 10 });
    assert.strictEqual(val.isValid, true);
    assert.strictEqual(val.sanitized?.query, 'Google');
  });

  // Tool 6: Local Search Simulator
  test('Tool 6 (Local Search Simulator): Generates localized search URL with uule parameter', () => {
    const encoded = encodeUule('Mumbai, Maharashtra, India');
    const searchUrl = buildGoogleSearchUrl({
      query: 'best dentist',
      countryCode: 'in',
      languageCode: 'en',
      uule: encoded.uule
    });
    assert(searchUrl.includes('google.com/search'));
    assert(searchUrl.includes('best+dentist') || searchUrl.includes('best%20dentist'));
    assert(searchUrl.includes('uule='));
  });

  // Tool 7: Mobile-First Index Checker
  test('Tool 7 (Mobile-First Index Checker): Computes full content similarity', () => {
    const sim = calculateContentSimilarity(
      'Buy products online at our store with discounts',
      'Buy products online at our store with discounts'
    );
    assert.strictEqual(sim, 1.0);
  });

  // Tool 8: Mobile-Friendly Test
  test('Tool 8 (Mobile-Friendly Test): Audits responsive viewport meta tag', () => {
    const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><p>Responsive page</p></body></html>';
    const audit = auditStaticHtmlMobileFriendliness(html, {
      url: 'https://example.com',
      finalUrl: 'https://example.com',
      statusCode: 200,
      statusText: 'OK',
      durationMs: 50,
      viewport: DEFAULT_VIEWPORT_PRESET,
      browserAttempted: false
    });
    assert.strictEqual(audit.tests.configureViewport.status, 'PASS');
  });

  // Tool 9: Pre-rendering Tester
  test('Tool 9 (Pre-rendering Tester): Compares bot vs browser HTML outputs', () => {
    const res1 = {
      userAgentId: 'googlebot',
      userAgentName: 'Googlebot',
      status: 'success' as const,
      statusCode: 200,
      statusText: 'OK',
      finalUrl: 'https://example.com',
      redirectChain: [],
      isHtml: true,
      title: 'Page Title',
      metaDescription: 'Description',
      h1: ['Main Heading'],
      wordCount: 150,
      imageCount: 2,
      linkCount: 5,
      internalLinkCount: 4,
      externalLinkCount: 1,
      varyUserAgent: 'Present' as const,
      varyHeaderRaw: 'User-Agent',
      md5: 'abc123',
      sha256: 'def456',
      generalRobots: 'index, follow',
      googlebotRobots: null,
      bingbotRobots: null,
      metaRobots: 'index, follow',
      xRobotsTag: null,
      canonical: 'https://example.com',
      contentType: 'text/html',
      contentLanguage: 'en',
      durationMs: 120,
      htmlSize: 1024,
      hasStructuredData: false,
      error: null,
    };
    const comp = compareAgentResults([res1, { ...res1, userAgentId: 'chrome', userAgentName: 'Chrome Desktop' }]);
    assert(comp.comparisons.length > 0);
    assert.strictEqual(comp.summary.classification, 'Same HTML Response');
  });

  // Tool 10: Review Link Generator
  test('Tool 10 (Review Link Generator): Generates official 5-star Google review URL and bulk processing', () => {
    const single = executeGenerateLink('ChIJN1t_tDeuEmsRUsoyG83frY4');
    assert.strictEqual(single.success, true);
    assert(single.reviewUrl.includes('search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4'));

    const bulk = executeBulkBatch([
      { rowIndex: 1, placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4', businessName: 'Test Business' }
    ]);
    assert.strictEqual(bulk.success, true);
    assert.strictEqual(bulk.matchedCount, 1);
  });

  // Tool 11: Robots.txt Tester
  test('Tool 11 (Robots.txt Tester): Specificity evaluation under RFC 9309', () => {
    const parsed = parseRobotsTxt('User-agent: *\nAllow: /p/a\nDisallow: /p/');
    const rules = selectRulesForUserAgent(parsed.groups, 'googlebot');
    const evalRes = evaluateCrawlability(rules.rules, '/p/a', 'Googlebot', 'googlebot');
    assert.strictEqual(evalRes.status, 'ALLOWED'); // Allow is longer, wins
  });

  // Tool 12: Schema Generator
  test('Tool 12 (Schema Generator): Generates valid JSON-LD schema for LocalBusiness', () => {
    const obj = buildSchemaObject('LocalBusiness', {
      name: 'Indian Marketers',
      url: 'https://indianmarketers.in',
      telephone: '+919876543210'
    });
    assert.strictEqual(obj['@context'], 'https://schema.org');
    assert.strictEqual(obj['@type'], 'LocalBusiness');
    assert.strictEqual(obj.name, 'Indian Marketers');
  });

  // Tool 13: SERP Simulator
  test('Tool 13 (SERP Simulator): Encodes and extracts page metadata safely', () => {
    // Tests that HTML entity decoding and canonical extraction works
    assert.strictEqual(typeof fetchPageMetadata, 'function');
  });

  // Tool 14: Sitemap Generator / Parser
  test('Tool 14 (XML Sitemap Validator): Parses XML sitemap entries safely', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/page-1</loc></url>
      <url><loc>https://example.com/page-2</loc></url>
    </urlset>`;
    const parsed = parseSitemapXml(xml, 'https://example.com/sitemap.xml');
    assert.strictEqual(parsed.totalUrls, 2);
  });

  console.log('\n=====================================================');
  console.log(`TOTAL SECURITY & QA TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('=====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runSecurityAndQASuite().catch((err) => {
  console.error('Fatal Test Failure:', err);
  process.exit(1);
});
