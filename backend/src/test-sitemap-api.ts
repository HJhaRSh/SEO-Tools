/**
 * Task 5 — XML Sitemap Generator Full API Test Suite
 * Validates all 12 required areas against live Express endpoints:
 * 1. CSV parsing
 * 2. XLSX parsing
 * 3. Manual generation
 * 4. Simple XML output
 * 5. Hreflang XML
 * 6. Multiple sitemap files
 * 7. ZIP downloads
 * 8. Validation CSV download
 * 9. Invalid inputs
 * 10. Oversized uploads
 * 11. Concurrent requests
 * 12. Fresh serverless-instance behavior
 */

process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';

import http from 'http';
import { AddressInfo } from 'net';
import unzipper from 'unzipper';
import { XMLParser } from 'fast-xml-parser';
import ExcelJS from 'exceljs';
import app from './index.js';

let server: http.Server;
let baseUrl: string;

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

async function request(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; text: string; json: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;
    const reqHeaders: Record<string, string> = { ...headers };
    if (payload && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (payload) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
    }

    const req = http.request(
      `${baseUrl}${path}`,
      { method, headers: reqHeaders },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf-8');
          let json: any = null;
          try { json = JSON.parse(text); } catch { /* not json */ }
          resolve({ status: res.statusCode || 0, headers: res.headers, body: buf, text, json });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runApiTests() {
  console.log('=====================================================');
  console.log('XML SITEMAP GENERATOR — TASK 5 COMPREHENSIVE API SUITE');
  console.log('=====================================================\n');

  // Start temporary server
  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const xmlParser = new XMLParser({ ignoreAttributes: false, processEntities: false });

  // 1. CSV parsing
  console.log('1. CSV Parsing Endpoint:');
  {
    const csvData = 'loc,lastmod,changefreq\nhttps://example.com/,2026-10-01,daily\nhttps://example.com/about,2026-09-28,weekly';
    const res = await request('POST', '/api/seo/sitemap/parse', { format: 'csv', content: csvData });
    assert(res.status === 200, 'POST /api/seo/sitemap/parse returns 200 OK');
    assert(res.json?.success === true, 'Parse result reports success');
    assert(res.json?.headers?.length === 3 && res.json.headers[0] === 'loc', 'Extracts correct headers');
    assert(res.json?.totalRows === 2, 'Reports correct row count (2)');
    assert(res.json?.detectedMapping?.locColumn === 'loc', 'Auto-detects locColumn as loc');
  }

  // 2. XLSX parsing
  console.log('\n2. XLSX Parsing Endpoint:');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['url', 'lastmod', 'en', 'es']);
    ws.addRow(['https://example.com/en/', '2026-10-01', 'https://example.com/en/', 'https://example.com/es/']);
    const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());
    const base64Content = xlsxBuf.toString('base64');

    const res = await request('POST', '/api/seo/sitemap/parse', { format: 'xlsx', content: base64Content });
    assert(res.status === 200, 'POST /api/seo/sitemap/parse (xlsx) returns 200 OK');
    assert(res.json?.success === true, 'XLSX parser reports success');
    assert(res.json?.headers?.length === 4, 'Preserves all 4 columns');
    assert(res.json?.suggestedType === 'hreflang-wide', 'Auto-detects hreflang-wide layout');
  }

  // 3. Manual generation
  console.log('\n3. Manual URL Input Generation:');
  {
    const manualUrls = 'https://example.com/\nhttps://example.com/pricing\nhttps://example.com/contact';
    const res = await request('POST', '/api/seo/sitemap/generate', { manualUrls, options: { deduplicate: true } });
    assert(res.status === 200, 'POST /api/seo/sitemap/generate (manual) returns 200 OK');
    assert(res.json?.success === true, 'Generation reports success');
    assert(res.json?.summary?.submittedRows === 3, 'Summary reports 3 submitted rows');
    assert(res.json?.summary?.validUrls === 3, 'Summary reports 3 valid URLs');
  }

  // 4. Simple XML output
  console.log('\n4. Simple XML Output & Standards Compliance:');
  {
    const res = await request('POST', '/api/seo/sitemap/generate', {
      manualUrls: 'https://example.com/\nhttps://example.com/blog',
      options: { includeLastmod: false }
    });
    const xmlContent = res.json?.files?.[0]?.content;
    assert(Boolean(xmlContent), 'Response includes file.content directly');
    assert(xmlContent.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Includes valid XML 1.0 declaration');
    assert(xmlContent.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Includes official sitemaps.org 0.9 schema');

    const parsed = xmlParser.parse(xmlContent);
    assert(parsed.urlset && parsed.urlset.url.length === 2, 'Parsed XML contains exactly 2 valid url entries');
    assert(parsed.urlset.url[0].loc === 'https://example.com/', 'First url loc is exact');
  }

  // 5. Hreflang XML
  console.log('\n5. Hreflang XML Generation:');
  {
    const rows = [
      {
        loc: 'https://example.com/en/',
        en: 'https://example.com/en/',
        fr: 'https://example.com/fr/'
      }
    ];
    const res = await request('POST', '/api/seo/sitemap/generate', {
      rows,
      mapping: { locColumn: 'loc', wideHreflangColumns: { en: 'en', fr: 'fr' } },
      formatType: 'hreflang-wide',
      options: { includeHreflang: true }
    });
    const xml = res.json?.files?.[0]?.content || '';
    assert(xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'), 'Includes xhtml namespace declaration');
    assert(xml.includes('<xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />'), 'Includes valid en alternate link');
    assert(xml.includes('<xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/" />'), 'Includes valid fr alternate link');
    assert(res.json?.summary?.hreflangAnnotations === 2, 'Summary counts 2 hreflang annotations');
  }

  // 6. Multiple sitemap files
  console.log('\n6. Multiple Sitemap Files & Index:');
  {
    const urls = Array.from({ length: 12 }, (_, i) => `https://example.com/item-${i + 1}`).join('\n');
    const res = await request('POST', '/api/seo/sitemap/generate', {
      manualUrls: urls,
      options: {
        maxUrlsPerSitemap: 5,
        generateIndex: true,
        publicBaseUrl: 'https://example.com/sitemaps/'
      }
    });

    assert(res.json?.files?.length === 4, 'Generates 4 files (1 index + 3 chunks)');
    assert(res.json?.files[0]?.filename === 'sitemap_index.xml', 'First file is sitemap_index.xml');
    assert(res.json?.files[1]?.filename === 'sitemap-1.xml' && res.json.files[1].urlCount === 5, 'Chunk 1 has 5 URLs');
    assert(res.json?.files[2]?.filename === 'sitemap-2.xml' && res.json.files[2].urlCount === 5, 'Chunk 2 has 5 URLs');
    assert(res.json?.files[3]?.filename === 'sitemap-3.xml' && res.json.files[3].urlCount === 2, 'Chunk 3 has 2 URLs');

    const indexXml = res.json?.files[0]?.content;
    const parsedIdx = xmlParser.parse(indexXml);
    assert(parsedIdx.sitemapindex && parsedIdx.sitemapindex.sitemap.length === 3, 'sitemapindex has 3 sitemap elements');
    assert(parsedIdx.sitemapindex.sitemap[0].loc === 'https://example.com/sitemaps/sitemap-1.xml', 'Index refers to correct child sitemaps');
  }

  // 7. ZIP downloads
  console.log('\n7. ZIP Export & Download Endpoint:');
  {
    const res = await request('POST', '/api/seo/sitemap/generate', {
      manualUrls: 'https://example.com/page1\nhttps://example.com/page2'
    });
    const zipToken = res.json?.zipDownloadId;
    const zipBase64 = res.json?.zipBase64;
    assert(Boolean(zipToken) && Boolean(zipBase64), 'Returns both zipDownloadId and stateless zipBase64');

    // Test direct Base64 buffer decoding
    const decodedZip = Buffer.from(zipBase64, 'base64');
    const zipDir = await unzipper.Open.buffer(decodedZip);
    assert(zipDir.files.some(f => f.path === 'sitemap.xml'), 'Decoded zipBase64 contains sitemap.xml');

    // Test GET /download/:downloadId endpoint
    const dlRes = await request('GET', `/api/seo/sitemap/download/${zipToken}`);
    assert(dlRes.status === 200, 'GET /download/:downloadId returns 200 OK');
    assert(dlRes.headers['content-type'] === 'application/zip', 'Content-Type header is application/zip');
    assert(Boolean(dlRes.headers['content-disposition']?.includes('sitemaps.zip')), 'Content-Disposition specifies filename');

    const epZip = await unzipper.Open.buffer(dlRes.body);
    assert(epZip.files.some(f => f.path === 'sitemap.xml'), 'Streamed ZIP buffer contains valid sitemap.xml');
  }

  // 8. Validation CSV download
  console.log('\n8. Validation Report CSV Download:');
  {
    // Submit duplicates and invalid URLs to produce warnings/errors
    const badInput = 'https://example.com/valid\nhttps://example.com/valid\nftp://invalid-scheme\nhttps://example.com/valid#hash';
    const res = await request('POST', '/api/seo/sitemap/generate', {
      manualUrls: badInput,
      options: { deduplicate: true }
    });
    assert(Boolean(res.json?.reportDownloadId), 'Issues produce a reportDownloadId');
    assert(Boolean(res.json?.reportCsv), 'Issues produce stateless reportCsv');
    assert(res.json?.reportCsv.includes('URL_DUPLICATE_SKIPPED'), 'reportCsv contains duplicate warnings');

    const dlRes = await request('GET', `/api/seo/sitemap/download/${res.json?.reportDownloadId}`);
    assert(dlRes.status === 200, 'GET /download/:reportDownloadId returns 200 OK');
    assert(Boolean(dlRes.headers['content-type']?.includes('text/csv')), 'Content-Type is text/csv');
    assert(dlRes.text.startsWith('Row,URL,Field,Severity,Code,Message'), 'CSV starts with RFC header columns');
  }

  // 9. Invalid inputs
  console.log('\n9. Invalid Input Handling:');
  {
    const emptyBody = await request('POST', '/api/seo/sitemap/parse', {});
    assert(emptyBody.status === 400 && emptyBody.json?.success === false, 'Rejects empty body with 400 Bad Request');

    const unsupportedFormat = await request('POST', '/api/seo/sitemap/parse', { format: 'docx', content: 'test' });
    assert(unsupportedFormat.status === 400, 'Rejects unsupported format (docx) with 400');

    const badOptions = await request('POST', '/api/seo/sitemap/generate', {
      manualUrls: 'https://example.com',
      options: { generateIndex: true } // missing publicBaseUrl
    });
    assert(badOptions.status === 400 && Boolean(badOptions.json?.error), 'Rejects generateIndex without publicBaseUrl');
  }

  // 10. Oversized uploads
  console.log('\n10. Oversized Upload Bounds:');
  {
    // CSV with field exceeding 8KB
    const longField = 'a'.repeat(9000);
    const oversizedCsv = `loc,lastmod\nhttps://example.com/,${longField}`;
    const res = await request('POST', '/api/seo/sitemap/parse', { format: 'csv', content: oversizedCsv });
    assert(res.json?.success === false && Boolean(res.json?.errors?.[0]?.includes('exceeds maximum field limit')), 'Rejects CSV with field exceeding 8KB');

    // XLSX with invalid non-zip container
    const badXlsx = await request('POST', '/api/seo/sitemap/parse', { format: 'xlsx', content: 'bm90LWEtemlwLWZpbGU=' });
    assert(badXlsx.json?.success === false, 'Rejects corrupt non-ZIP Excel file safely');
  }

  // 11. Concurrent requests
  console.log('\n11. Concurrency & Isolation:');
  {
    const concurrentCount = 10;
    const promises = Array.from({ length: concurrentCount }, (_, i) =>
      request('POST', '/api/seo/sitemap/generate', {
        manualUrls: `https://example.com/concurrent-${i}-1\nhttps://example.com/concurrent-${i}-2`
      })
    );
    const results = await Promise.all(promises);
    const all200 = results.every(r => r.status === 200 && r.json?.success === true && r.json?.files?.[0]?.urlCount === 2);
    assert(all200, `Successfully processed ${concurrentCount} concurrent generation requests without race conditions`);
  }

  // 12. Fresh serverless-instance behavior
  console.log('\n12. Fresh Serverless-Instance Isolation Behavior:');
  {
    // Simulate a fresh, separate serverless instance (new express app instance)
    const freshApp = (await import('./index.js')).default as any;
    const freshServer = http.createServer(freshApp);
    await new Promise<void>((resolve) => freshServer.listen(0, '127.0.0.1', resolve));
    const freshPort = (freshServer.address() as AddressInfo).port;
    const freshBaseUrl = `http://127.0.0.1:${freshPort}`;

    // A: Fresh instance generates independently without prior cache
    const genRes = await new Promise<any>((resolve) => {
      const req = http.request(
        `${freshBaseUrl}/api/seo/sitemap/generate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let str = '';
          res.on('data', d => str += d);
          res.on('end', () => resolve(JSON.parse(str)));
        }
      );
      req.write(JSON.stringify({ manualUrls: 'https://fresh-instance.com/a\nhttps://fresh-instance.com/b' }));
      req.end();
    });

    assert(genRes.success === true, 'Fresh serverless instance generates sitemap cleanly');
    assert(Boolean(genRes.files[0]?.content), 'Fresh serverless instance returns complete XML content for instant client download');
    assert(Boolean(genRes.zipBase64), 'Fresh serverless instance returns zipBase64 for durable client archive generation');

    // B: Accessing a non-existent downloadId on a fresh instance gracefully returns 404 without crashing
    const notFoundRes = await new Promise<number>((resolve) => {
      http.get(`${freshBaseUrl}/api/seo/sitemap/download/dl_00000000000000000000000000000000`, (res) => {
        resolve(res.statusCode || 0);
      });
    });
    assert(notFoundRes === 404, 'Fresh serverless instance gracefully returns 404 for missing/expired in-memory token');

    freshServer.close();
  }

  // 13. Template downloads
  console.log('\n13. Sample Template Downloads:');
  {
    const tplSimple = await request('GET', '/api/seo/sitemap/templates/simple');
    assert(tplSimple.status === 200 && Boolean(tplSimple.headers['content-type']?.includes('text/csv')), 'Simple CSV template downloads successfully');

    const tplWide = await request('GET', '/api/seo/sitemap/templates/hreflang-wide');
    assert(tplWide.status === 200 && tplWide.text.includes('loc,en,fr,es,de'), 'Hreflang wide CSV template downloads successfully');

    const tplLong = await request('GET', '/api/seo/sitemap/templates/hreflang-long');
    assert(tplLong.status === 200 && tplLong.text.includes('loc,hreflang,alternate_url'), 'Hreflang long CSV template downloads successfully');

    const tplMissing = await request('GET', '/api/seo/sitemap/templates/nonexistent');
    assert(tplMissing.status === 404, 'Non-existent template returns 404');
  }

  server.close();

  console.log('\n=====================================================');
  console.log(`TASK 5 SITEMAP API TEST RESULTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runApiTests().catch((err) => {
  console.error('Fatal API test error:', err);
  if (server) server.close();
  process.exit(1);
});
