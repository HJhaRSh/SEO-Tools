import { NextRequest } from 'next/server';
import { POST as parsePost } from './app/api/seo/sitemap/parse/route';
import { POST as generatePost } from './app/api/seo/sitemap/generate/route';
import { GET as templateGet } from './app/api/seo/sitemap/templates/[type]/route';
import { GET as downloadGet } from './app/api/seo/sitemap/download/[downloadId]/route';

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

  // 4. Download test
  const dlId = genJson.zipDownloadId;
  const dlReq = new NextRequest(`http://localhost:3000/api/seo/sitemap/download/${dlId}`);
  const dlRes = await downloadGet(dlReq, { params: Promise.resolve({ downloadId: dlId }) });
  assert(dlRes.status === 200, 'GET /api/seo/sitemap/download/:downloadId returns 200');
  const dlBuf = await dlRes.arrayBuffer();
  assert(dlBuf.byteLength > 0, 'Downloaded ZIP package has non-zero size');

  console.log('\n=====================================================');
  console.log(`TOTAL NEXT.JS ROUTE TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
