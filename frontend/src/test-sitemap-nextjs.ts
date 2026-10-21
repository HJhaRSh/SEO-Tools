import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { POST as parsePost } from './app/api/seo/sitemap/parse/route';
import { POST as generatePost } from './app/api/seo/sitemap/generate/route';
import { GET as templateGet } from './app/api/seo/sitemap/templates/[type]/route';
import { GET as downloadGet } from './app/api/seo/sitemap/download/[downloadId]/route';
import { MAX_ALLOWED_ROWS } from './lib/seo/sitemap/sitemapParser';
import { validateSitemapInputLimit } from './lib/seo/sitemap/sitemapValidation';
import { storeDownload } from './lib/seo/sitemap/sitemapExport';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${msg}`);
    failed++;
  }
}

async function run() {
  console.log('=====================================================');
  console.log('NEXT.JS SITEMAP API ROUTE HANDLERS VERIFICATION');
  console.log('=====================================================\n');

  // 1. Template test
  const tplReq = new NextRequest('http://localhost:3000/api/seo/sitemap/templates/simple');
  const tplRes = await templateGet(tplReq, { params: Promise.resolve({ type: 'simple' }) });
  assert(tplRes.status === 200, 'GET /api/seo/sitemap/templates/simple returns 200');
  const tplText = await tplRes.text();
  assert(tplText.includes('loc,lastmod'), 'Simple template contains standard loc,lastmod headers');

  // 2. Parse CSV test
  const csvReq = new NextRequest('http://localhost:3000/api/seo/sitemap/parse', {
    method: 'POST',
    body: JSON.stringify({
      format: 'csv',
      content: 'url,lastmod\nhttps://example.com/one,2026-10-19\nhttps://example.com/two,2026-10-18'
    })
  });
  const parseRes = await parsePost(csvReq);
  assert(parseRes.status === 200, 'POST /api/seo/sitemap/parse returns 200');
  const parseJson = await parseRes.json();
  assert(parseJson.success === true, 'Parse reports success');
  assert(parseJson.totalRows === 2, 'Total rows is 2');

  // 3. Generate test (manual)
  const genReq = new NextRequest('http://localhost:3000/api/seo/sitemap/generate', {
    method: 'POST',
    body: JSON.stringify({
      manualUrls: 'https://example.com/page-1\nhttps://example.com/page-2'
    })
  });
  const genRes = await generatePost(genReq);
  assert(genRes.status === 200, 'POST /api/seo/sitemap/generate returns 200');
  const genJson = await genRes.json();
  assert(genJson.success === true, 'Generation reports success');
  assert(genJson.summary.validUrls === 2, 'Valid URLs is 2');
  assert(typeof genJson.zipBase64 === 'string', 'zipBase64 returned for serverless durability');
  assert(genJson.files[0].content.includes('https://example.com/page-1'), 'file.content contains generated XML');

  // 4. Download test (Buffer-backed)
  const dlId = genJson.zipDownloadId;
  const dlReq = new NextRequest(`http://localhost:3000/api/seo/sitemap/download/${dlId}`);
  const dlRes = await downloadGet(dlReq, { params: Promise.resolve({ downloadId: dlId }) });
  assert(dlRes.status === 200, 'Buffer download: GET returns 200');
  assert(dlRes.headers.get('content-type') === 'application/zip', 'Buffer download: Content-Type is application/zip');
  assert(Boolean(dlRes.headers.get('content-disposition')?.includes('attachment')), 'Buffer download: Content-Disposition is attachment');
  assert(Boolean(dlRes.headers.get('cache-control')?.includes('no-store')), 'Buffer download: Cache-Control is no-store');
  const dlBuf = await dlRes.arrayBuffer();
  assert(dlBuf.byteLength > 0, 'Buffer download: ZIP package has non-zero size');

  // 5. Download test (File-backed streaming via Readable.toWeb)
  const tempFilePath = path.join(os.tmpdir(), `test-sitemap-stream-${Date.now()}.xml`);
  const sampleXmlContent = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/streamed</loc></url></urlset>';
  fs.writeFileSync(tempFilePath, sampleXmlContent, 'utf-8');

  try {
    const fileDlToken = storeDownload(
      'sitemap-streamed.xml',
      'application/xml; charset=utf-8',
      { filePath: tempFilePath, byteSize: Buffer.byteLength(sampleXmlContent, 'utf-8') }
    );
    const fileDlReq = new NextRequest(`http://localhost:3000/api/seo/sitemap/download/${fileDlToken}`);
    const fileDlRes = await downloadGet(fileDlReq, { params: Promise.resolve({ downloadId: fileDlToken }) });
    assert(fileDlRes.status === 200, 'Streamed download: GET returns 200');
    assert(fileDlRes.headers.get('content-type') === 'application/xml; charset=utf-8', 'Streamed download: Content-Type preserved');
    assert(fileDlRes.headers.get('content-disposition') === 'attachment; filename="sitemap-streamed.xml"', 'Streamed download: Content-Disposition preserved');
    assert(fileDlRes.headers.get('cache-control') === 'no-store, max-age=0', 'Streamed download: Cache-Control preserved');
    const streamedBody = await fileDlRes.text();
    assert(streamedBody === sampleXmlContent, 'Streamed download: Stream body matches file content exactly');
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }

  // 6. Download test: missing file handling
  const nonExistentPath = path.join(os.tmpdir(), 'non-existent-sitemap-file.xml');
  const missingFileToken = storeDownload(
    'missing.xml',
    'application/xml',
    { filePath: nonExistentPath, byteSize: 100 }
  );
  const missingFileReq = new NextRequest(`http://localhost:3000/api/seo/sitemap/download/${missingFileToken}`);
  const missingFileRes = await downloadGet(missingFileReq, { params: Promise.resolve({ downloadId: missingFileToken }) });
  assert(missingFileRes.status === 404, 'Missing file download returns 404');
  const missingFileText = await missingFileRes.text();
  assert(missingFileText.includes('No file payload found'), 'Missing file returns accurate explanation');

  // 7. Download test: missing / expired downloadId
  const missingTokenReq = new NextRequest('http://localhost:3000/api/seo/sitemap/download/dl_00000000000000000000000000000000');
  const missingTokenRes = await downloadGet(missingTokenReq, { params: Promise.resolve({ downloadId: 'dl_00000000000000000000000000000000' }) });
  assert(missingTokenRes.status === 404, 'Non-existent download ID returns 404');

  // 8. Row limit boundary: validateSitemapInputLimit unit tests
  console.log('\nTesting sitemap input limits (MAX_ALLOWED_ROWS boundary):');
  const maxRowsInput = { rows: { length: MAX_ALLOWED_ROWS } };
  const maxRowsCheck = validateSitemapInputLimit(maxRowsInput);
  assert(maxRowsCheck.isValid === true, `Structured rows: exactly MAX_ALLOWED_ROWS (${MAX_ALLOWED_ROWS}) is accepted`);

  const overRowsInput = { rows: { length: MAX_ALLOWED_ROWS + 1 } };
  const overRowsCheck = validateSitemapInputLimit(overRowsInput);
  assert(overRowsCheck.isValid === false, `Structured rows: MAX_ALLOWED_ROWS + 1 (${MAX_ALLOWED_ROWS + 1}) is rejected`);
  assert(Boolean(overRowsCheck.error?.includes('Maximum URL limit exceeded')), 'Structured rows: rejection message specifies limit exceeded');

  const maxManualInput = { manualUrls: 'https://example.com/p\n'.repeat(MAX_ALLOWED_ROWS) };
  const maxManualCheck = validateSitemapInputLimit(maxManualInput);
  assert(maxManualCheck.isValid === true, `Manual URLs: exactly MAX_ALLOWED_ROWS (${MAX_ALLOWED_ROWS}) is accepted`);

  const overManualInput = { manualUrls: 'https://example.com/p\n'.repeat(MAX_ALLOWED_ROWS + 1) };
  const overManualCheck = validateSitemapInputLimit(overManualInput);
  assert(overManualCheck.isValid === false, `Manual URLs: MAX_ALLOWED_ROWS + 1 (${MAX_ALLOWED_ROWS + 1}) is rejected`);
  assert(Boolean(overManualCheck.error?.includes('Maximum URL limit exceeded')), 'Manual URLs: rejection message specifies limit exceeded');

  // 9. Row limit boundary: API route rejection before expensive generation
  const apiOverRowsReq = new NextRequest('http://localhost:3000/api/seo/sitemap/generate', {
    method: 'POST',
    body: JSON.stringify({ rows: new Array(MAX_ALLOWED_ROWS + 1) })
  });
  const apiOverRowsRes = await generatePost(apiOverRowsReq);
  assert(apiOverRowsRes.status === 400, 'POST /api/seo/sitemap/generate rejects rows > MAX_ALLOWED_ROWS with 400');
  const apiOverRowsJson = await apiOverRowsRes.json();
  assert(apiOverRowsJson.success === false, 'API rejects rows > MAX_ALLOWED_ROWS with success: false');
  assert(apiOverRowsJson.error?.includes('Maximum URL limit exceeded'), 'API rejection mentions Maximum URL limit exceeded');

  const apiOverManualReq = new NextRequest('http://localhost:3000/api/seo/sitemap/generate', {
    method: 'POST',
    body: JSON.stringify({ manualUrls: 'https://example.com/p\n'.repeat(MAX_ALLOWED_ROWS + 1) })
  });
  const apiOverManualRes = await generatePost(apiOverManualReq);
  assert(apiOverManualRes.status === 400, 'POST /api/seo/sitemap/generate rejects manual URLs > MAX_ALLOWED_ROWS with 400');
  const apiOverManualJson = await apiOverManualRes.json();
  assert(apiOverManualJson.success === false, 'API rejects manual URLs > MAX_ALLOWED_ROWS with success: false');
  assert(apiOverManualJson.error?.includes('Maximum URL limit exceeded'), 'API rejection mentions Maximum URL limit exceeded');

  console.log('\n=====================================================');
  console.log(`TOTAL NEXT.JS ROUTE TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
