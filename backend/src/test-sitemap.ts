/**
 * Tool 4 — XML Sitemap Generator Automated Test Suite
 * Tests URL validation, Date validation, Hreflang logic, XML generation,
 * splitting (50k & 50MB limits), ExcelJS decompression/safety, and ZIP packaging.
 */

import * as fs from 'fs';
import unzipper from 'unzipper';
import { XMLParser } from 'fast-xml-parser';
import ExcelJS from 'exceljs';
import { validateSitemapUrl, validateLastmodDate, validateChangeFreq, validatePriority, escapeXmlEntities, validatePublicSitemapOptions } from './seo/sitemapValidation.js';
import { validateHreflangCode, validateUrlAlternates, validateReciprocalHreflang, expandReciprocalEntries } from './seo/sitemapHreflang.js';
import { parseCsvContent, parseXlsxContent, extractUrlEntriesFromRows, detectColumnMapping } from './seo/sitemapParser.js';
import { generateSitemapXml, serializeUrlElement } from './seo/sitemapGenerator.js';
import { buildIndexEntriesFromFiles, buildSitemapIndexXml } from './seo/sitemapIndex.js';
import { createSitemapsZip, storeDownload, getDownload, sanitizeCsvCell, generateIssuesCsv, pruneExpiredDownloads } from './seo/sitemapExport.js';

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

async function runTests() {
  console.log('=====================================================');
  console.log('TOOL 4 — XML SITEMAP GENERATOR AUTOMATED TEST SUITE');
  console.log('=====================================================\n');

  // Group 1: URL & Metadata Validation
  console.log('1. URL & Metadata Validation:');
  {
    const validHttp = validateSitemapUrl('http://example.com/page?ref=seo');
    assert(validHttp.isValid && validHttp.sanitizedUrl === 'http://example.com/page?ref=seo', 'Accepts valid HTTP URL with query params');

    const validHttps = validateSitemapUrl('https://example.com/sub/dir/');
    assert(validHttps.isValid && validHttps.sanitizedUrl === 'https://example.com/sub/dir/', 'Preserves trailing slashes and path case');

    const fragmentUrl = validateSitemapUrl('https://example.com/page#section');
    assert(fragmentUrl.isValid && fragmentUrl.sanitizedUrl === 'https://example.com/page' && fragmentUrl.issues.some(i => i.code === 'URL_FRAGMENT_REMOVED'), 'Strips hash fragment and issues warning');

    const ftpUrl = validateSitemapUrl('ftp://example.com/file');
    assert(!ftpUrl.isValid && ftpUrl.issues.some(i => i.code === 'URL_UNSUPPORTED_SCHEME'), 'Rejects non-HTTP/HTTPS protocols');

    const emptyUrl = validateSitemapUrl('   ');
    assert(!emptyUrl.isValid && emptyUrl.issues.some(i => i.code === 'URL_EMPTY'), 'Rejects empty / whitespace URL');

    const entityEsc = escapeXmlEntities('https://example.com/test?a=1&b=2<test>"quote"\'apostrophe\'');
    assert(entityEsc === 'https://example.com/test?a=1&amp;b=2&lt;test&gt;&quot;quote&quot;&apos;apostrophe&apos;', 'Strictly escapes all 5 XML entity characters');

    // Date validations
    const validDate = validateLastmodDate('2026-10-01');
    assert(validDate.isValid && validDate.formattedDate === '2026-10-01', 'Accepts valid W3C YYYY-MM-DD');

    const validDatetime = validateLastmodDate('2026-10-01T14:30:00+05:30');
    assert(validDatetime.isValid && validDatetime.formattedDate === '2026-10-01T14:30:00+05:30', 'Accepts valid W3C DateTime with timezone offset');

    const invalidDateMonth = validateLastmodDate('2026-14-01');
    assert(!invalidDateMonth.isValid && invalidDateMonth.issues.some(i => i.code === 'DATE_INVALID_MONTH'), 'Rejects invalid month');

    const invalidDateDay = validateLastmodDate('2026-02-30');
    assert(!invalidDateDay.isValid && invalidDateDay.issues.some(i => i.code === 'DATE_INVALID_DAY'), 'Rejects invalid calendar day (Feb 30)');

    // Priority & Changefreq
    const validFreq = validateChangeFreq('weekly');
    assert(validFreq.isValid && validFreq.value === 'weekly', 'Accepts valid changefreq');

    const invalidFreq = validateChangeFreq('sometimes');
    assert(!invalidFreq.isValid, 'Rejects invalid changefreq');

    const validPrio = validatePriority(0.8);
    assert(validPrio.isValid && validPrio.value === '0.8', 'Accepts valid priority 0.8');

    const invalidPrio = validatePriority(1.5);
    assert(!invalidPrio.isValid, 'Rejects out-of-range priority 1.5');
  }

  // Group 2: Hreflang Validation & Clusters
  console.log('\n2. Hreflang Validation & Clusters:');
  {
    assert(validateHreflangCode('en').isValid && validateHreflangCode('en').normalizedCode === 'en', 'Validates ISO 639-1 language code');
    assert(validateHreflangCode('en-US').isValid && validateHreflangCode('en-US').normalizedCode === 'en-US', 'Validates language-region subtag');
    assert(validateHreflangCode('zh-Hans').isValid && validateHreflangCode('zh-Hans').normalizedCode === 'zh-Hans', 'Validates language-script subtag');
    assert(validateHreflangCode('x-default').isValid && validateHreflangCode('x-default').normalizedCode === 'x-default', 'Validates x-default');
    assert(!validateHreflangCode('fake-XYZ').isValid, 'Rejects unknown language subtag');

    // Duplicate hreflang code on same URL
    const altCheck = validateUrlAlternates('https://example.com/en/', [
      { hreflang: 'fr', href: 'https://example.com/fr-1/' },
      { hreflang: 'fr', href: 'https://example.com/fr-2/' }
    ]);
    assert(altCheck.issues.some(i => i.code === 'HREFLANG_DUPLICATE_CODE'), 'Flags duplicate hreflang language code on same entry');

    // Self-reference check
    const altSelf = validateUrlAlternates('https://example.com/en/', [
      { hreflang: 'en', href: 'https://example.com/en/' },
      { hreflang: 'fr', href: 'https://example.com/fr/' }
    ]);
    assert(altSelf.hasSelfReference === true, 'Recognizes self-referencing hreflang tag');

    const altNoSelf = validateUrlAlternates('https://example.com/en/', [
      { hreflang: 'fr', href: 'https://example.com/fr/' }
    ]);
    assert(altNoSelf.issues.some(i => i.code === 'HREFLANG_MISSING_SELF_REFERENCE'), 'Warns if self-referencing alternate link is omitted');

    // Reciprocal checks
    const recipTest = validateReciprocalHreflang([
      {
        loc: 'https://example.com/en/',
        alternates: [
          { hreflang: 'en', href: 'https://example.com/en/' },
          { hreflang: 'fr', href: 'https://example.com/fr/' }
        ]
      },
      {
        loc: 'https://example.com/fr/',
        alternates: [
          { hreflang: 'fr', href: 'https://example.com/fr/' }
          // Missing en return tag!
        ]
      }
    ]);
    assert(recipTest.missingReciprocalCount === 1 && recipTest.issues.some(i => i.code === 'HREFLANG_NO_RECIPROCAL_LINK'), 'Detects missing reciprocal hreflang return link');

    // Auto-expansion test
    const expansion = expandReciprocalEntries([
      {
        loc: 'https://example.com/en/',
        alternates: [
          { hreflang: 'en', href: 'https://example.com/en/' },
          { hreflang: 'fr', href: 'https://example.com/fr/' }
        ]
      }
    ]);
    assert(expansion.addedCount === 1 && expansion.expandedEntries.some(e => e.loc === 'https://example.com/fr/'), 'Optional auto-expansion creates reciprocal entry for alternate URL');
  }

  // Group 3: CSV & XLSX Parsing
  console.log('\n3. CSV & XLSX Parsing:');
  {
    // CSV with BOM and quoted fields
    const csvContent = '\uFEFF"loc","lastmod"\n"https://example.com/","2026-10-01"\n"https://example.com/about/","2026-09-28"';
    const csvParsed = await parseCsvContent(csvContent);
    assert(csvParsed.success && csvParsed.totalRows === 2 && csvParsed.headers[0] === 'loc', 'Parses CSV with UTF-8 BOM and quoted fields');

    // XLSX Generation & Parsing via ExcelJS
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sitemap URLs');
    sheet.addRow(['loc', 'lastmod', 'en', 'fr']);
    sheet.addRow(['https://example.com/en/', '2026-10-01', 'https://example.com/en/', 'https://example.com/fr/']);
    const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const xlsxParsed = await parseXlsxContent(xlsxBuffer);
    assert(xlsxParsed.success && xlsxParsed.totalRows === 1 && xlsxParsed.suggestedType === 'hreflang-wide', 'Parses XLSX workbook and auto-detects hreflang-wide mapping');

    // Long format detection
    const longMapping = detectColumnMapping(['loc', 'hreflang', 'alternate_url']);
    assert(longMapping.suggestedType === 'hreflang-long', 'Detects hreflang long-format columns');
  }

  // Group 4: XML Generation & Standards Compliance
  console.log('\n4. XML Generation & Standards Compliance:');
  {
    const entries = [
      {
        loc: 'https://example.com/en/',
        lastmod: '2026-10-01',
        alternates: [
          { hreflang: 'en', href: 'https://example.com/en/' },
          { hreflang: 'fr', href: 'https://example.com/fr/' }
        ]
      },
      {
        loc: 'https://example.com/fr/',
        lastmod: '2026-10-01',
        alternates: [
          { hreflang: 'en', href: 'https://example.com/en/' },
          { hreflang: 'fr', href: 'https://example.com/fr/' }
        ]
      }
    ];

    const gen = generateSitemapXml(entries);
    assert(gen.success && gen.files.length === 1, 'Generates sitemap without errors');

    const xml = gen.files[0].content;
    assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Includes valid XML 1.0 declaration');
    assert(xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'), 'Includes xhtml namespace when hreflang is present');

    // Verify XML validity using real fast-xml-parser
    const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
    let parsedXml: any;
    let xmlValid = true;
    try {
      parsedXml = parser.parse(xml);
    } catch {
      xmlValid = false;
    }
    assert(xmlValid && parsedXml.urlset && parsedXml.urlset.url.length === 2, 'Generated XML parses cleanly as valid XML with 2 url entries');
  }

  // Group 5: Large Sitemap Splitting & Sitemap Index
  console.log('\n5. Large Sitemap Splitting & Sitemap Index:');
  {
    // Test splitting with lowered limits
    const manyEntries = [];
    for (let i = 1; i <= 25; i++) {
      manyEntries.push({
        loc: `https://example.com/page-${i}/`,
        lastmod: '2026-10-01'
      });
    }

    // Split with maxUrlsPerSitemap = 10
    const splitGen = generateSitemapXml(manyEntries, {
      maxUrlsPerSitemap: 10,
      publicBaseUrl: 'https://example.com/sitemaps/'
    });

    assert(splitGen.files.length === 4, 'Splits 25 URLs into 3 sitemap chunks + 1 sitemap_index.xml');
    assert(splitGen.files[0].filename === 'sitemap_index.xml', 'Includes sitemap_index.xml as first file');
    assert(splitGen.files[1].filename === 'sitemap-1.xml' && splitGen.files[1].urlCount === 10, 'sitemap-1.xml contains 10 URLs');
    assert(splitGen.files[2].filename === 'sitemap-2.xml' && splitGen.files[2].urlCount === 10, 'sitemap-2.xml contains 10 URLs');
    assert(splitGen.files[3].filename === 'sitemap-3.xml' && splitGen.files[3].urlCount === 5, 'sitemap-3.xml contains 5 URLs');

    // Verify sitemapindex XML structure
    const indexXml = splitGen.files[0].content;
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsedIndex = parser.parse(indexXml);
    assert(parsedIndex.sitemapindex && parsedIndex.sitemapindex.sitemap.length === 3, 'sitemapindex contains 3 valid <sitemap> entries');
    assert(parsedIndex.sitemapindex.sitemap[0].loc === 'https://example.com/sitemaps/sitemap-1.xml', 'Correctly constructs public sitemap URLs without inventing URLs');

    // Missing publicBaseUrl test
    const noBaseUrlGen = generateSitemapXml(manyEntries, { maxUrlsPerSitemap: 10 });
    assert(noBaseUrlGen.warnings.some(w => w.code === 'SITEMAP_INDEX_SKIPPED_NO_BASE_URL'), 'Warns and omits sitemap_index if user-specified public base URL is missing');
  }

  // Group 6: 50MB Byte Limit & Security Controls
  console.log('\n6. 50MB Byte Limit & Security Controls:');
  {
    // Set maxBytesPerSitemap artificially low (e.g. 500 bytes to trigger byte splitting with 10% safety buffer)
    const largeEntries = [
      {
        loc: 'https://example.com/large-entry-1/',
        alternates: [
          { hreflang: 'en', href: 'https://example.com/large-entry-1/' },
          { hreflang: 'fr', href: 'https://example.com/large-entry-1/fr/' },
          { hreflang: 'de', href: 'https://example.com/large-entry-1/de/' }
        ]
      },
      {
        loc: 'https://example.com/large-entry-2/',
        alternates: [
          { hreflang: 'en', href: 'https://example.com/large-entry-2/' },
          { hreflang: 'fr', href: 'https://example.com/large-entry-2/fr/' },
          { hreflang: 'de', href: 'https://example.com/large-entry-2/de/' }
        ]
      }
    ];

    const byteSplit = generateSitemapXml(largeEntries, {
      maxBytesPerSitemap: 550, // very small byte budget
      publicBaseUrl: 'https://example.com/sitemaps/'
    });
    assert(byteSplit.files.length > 1, 'Splits sitemaps when byte limit is reached, independent of URL count');

    // Formula injection sanitization in CSV export
    const cellSanitized = sanitizeCsvCell('=cmd|"/C calc"!A0');
    assert(cellSanitized === '"\'=cmd|""/C calc""!A0"', 'Sanitizes dangerous spreadsheet formula prefixes (=, +, -, @)');

    // ZIP packaging (streamed directly to disk)
    const zipPkg = await createSitemapsZip([
      { filename: 'sitemap-1.xml', content: '<test>1</test>', type: 'urlset', urlCount: 1, byteSize: 15, downloadId: '1' }
    ]);
    assert(fs.existsSync(zipPkg.filePath) && zipPkg.byteSize > 50, 'Generates valid streaming ZIP temp file');
    const zipHeader = fs.readFileSync(zipPkg.filePath).slice(0, 4).toString('hex');
    assert(zipHeader === '504b0304', 'ZIP file on disk starts with PK signature (504b0304)');

    // Verify ZIP can be opened and parsed
    const zipDir = await unzipper.Open.file(zipPkg.filePath);
    assert(zipDir.files.some(f => f.path === 'sitemap-1.xml'), 'ZIP archive contains sitemap-1.xml');

    // Download store, LRU eviction, and secure tokens
    const dlToken = storeDownload('sitemaps.zip', 'application/zip', zipPkg);
    const retrieved = getDownload(dlToken);
    assert(retrieved !== null && retrieved.filePath === zipPkg.filePath, 'Stores and retrieves downloadable package referencing temp file');
    assert(dlToken.startsWith('dl_') && dlToken.length === 35, 'Generates cryptographically random 32-hex token without path traversal risk');

    // Reject malformed or path traversal tokens
    assert(getDownload('../etc/passwd') === null, 'Rejects directory traversal token attempt');
    assert(getDownload('invalid-token') === null, 'Rejects malformed token');
  }

  // Group 7: Public API Options Boundary Validation (FIX 7)
  console.log('\n7. Public API Options Boundary Validation:');
  {
    // Valid options
    const valid = validatePublicSitemapOptions({
      includeLastmod: true,
      includeHreflang: false,
      deduplicate: true
    });
    assert(valid.isValid && valid.options.includeLastmod === true && valid.options.includeHreflang === false, 'Validates and sanitizes standard options');

    // Strict protocol ceiling: client cannot override maxUrlsPerSitemap to 999999
    const overrideAttempt = validatePublicSitemapOptions({
      maxUrlsPerSitemap: 999999,
      maxBytesPerSitemap: 1000 * 1024 * 1024
    });
    assert(overrideAttempt.options.maxUrlsPerSitemap === 50000, 'Prevents client override of 50,000 URL limit');
    assert(overrideAttempt.options.maxBytesPerSitemap === 50 * 1024 * 1024, 'Prevents client override of 50 MB byte limit');

    // String coercion for booleans
    const coerced = validatePublicSitemapOptions({
      includeLastmod: 'false',
      generateIndex: 'false'
    });
    assert(coerced.options.includeLastmod === false, 'Coerces string booleans safely');

    // Missing publicBaseUrl when generateIndex is true
    const missingBase = validatePublicSitemapOptions({
      generateIndex: true
    });
    assert(!missingBase.isValid && Boolean(missingBase.error?.includes('publicBaseUrl is required')), 'Rejects generateIndex without publicBaseUrl');

    // Valid publicBaseUrl with trailing slash enforcement
    const validBase = validatePublicSitemapOptions({
      generateIndex: true,
      publicBaseUrl: 'https://example.com/sitemaps'
    });
    assert(validBase.isValid && validBase.options.publicBaseUrl === 'https://example.com/sitemaps/', 'Enforces trailing slash on publicBaseUrl');

    // Invalid publicBaseUrl scheme (e.g. ftp or malformed)
    const invalidBase = validatePublicSitemapOptions({
      publicBaseUrl: 'ftp://invalidscheme.com'
    });
    assert(!invalidBase.isValid, 'Rejects non-HTTP/HTTPS publicBaseUrl');
  }

  // Group 8: Physical Column Alignment & Blank Header Preservation (FIX 6)
  console.log('\n8. Spreadsheet Column Alignment & Blank Headers:');
  {
    // Excel workbook with: Col A = 'loc', Col B = blank, Col C = 'lastmod'
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    const headerRow = ws.getRow(1);
    headerRow.getCell(1).value = 'loc';
    headerRow.getCell(2).value = ''; // BLANK COLUMN B
    headerRow.getCell(3).value = 'lastmod'; // COLUMN C

    const dataRow = ws.getRow(2);
    dataRow.getCell(1).value = 'https://example.com/page-1';
    dataRow.getCell(2).value = 'ignored-middle-data';
    dataRow.getCell(3).value = '2026-10-09';

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const parsedXlsx = await parseXlsxContent(buf);

    assert(parsedXlsx.success, 'Parses workbook with blank header column');
    assert(parsedXlsx.headers.length === 3, 'Preserves all 3 physical columns including blank Col B');
    assert(parsedXlsx.headers[0] === 'loc', 'Column 1 is loc');
    assert(parsedXlsx.headers[1] === 'Column_2', 'Column 2 placeholder preserves physical column B');
    assert(parsedXlsx.headers[2] === 'lastmod', 'Column 3 remains lastmod (does not shift into Col B)');

    const rowObj = parsedXlsx.rows?.[0];
    assert(rowObj?.loc === 'https://example.com/page-1', 'Row loc matches Column 1 value');
    assert(rowObj?.lastmod === '2026-10-09', 'Row lastmod matches Column 3 value without column shift');

    // CSV with duplicate headers
    const dupCsv = 'loc,lastmod,lastmod\nhttps://example.com/,2026-10-01,2026-10-02';
    const parsedDup = await parseCsvContent(dupCsv);
    assert(parsedDup.success, 'Parses CSV with duplicate headers');
    assert(parsedDup.headers[1] === 'lastmod', 'First header retains original name');
    assert(parsedDup.headers[2] === 'lastmod (2)', 'Duplicate header is disambiguated with suffix');
    assert(Boolean(parsedDup.warnings && parsedDup.warnings.length > 0), 'Flags duplicate header warning');
    assert(parsedDup.rows?.[0]?.['lastmod'] === '2026-10-01', 'First duplicate column value preserved');
    assert(parsedDup.rows?.[0]?.['lastmod (2)'] === '2026-10-02', 'Second duplicate column value preserved without overwrite');
  }

  // Group 9: Resource Limits & Protections (FIX 1 & FIX 2)
  console.log('\n9. Streaming CSV & XLSX Resource Protections:');
  {
    // CSV with oversized field (> 8192 chars)
    const longField = 'a'.repeat(9000);
    const oversizedFieldCsv = `loc,lastmod\nhttps://example.com/,${longField}`;
    const fieldRes = await parseCsvContent(oversizedFieldCsv);
    assert(!fieldRes.success && Boolean(fieldRes.errors?.[0]?.includes('exceeds maximum field limit')), 'Rejects CSV containing an oversized field (> 8KB)');

    // CSV exceeding column limit (> 100 cols)
    const manyColsHeaders = Array.from({ length: 105 }, (_, i) => `col_${i + 1}`).join(',');
    const manyColsRow = Array.from({ length: 105 }, (_, i) => `val_${i + 1}`).join(',');
    const manyColsCsv = `${manyColsHeaders}\n${manyColsRow}`;
    const colsRes = await parseCsvContent(manyColsCsv);
    assert(!colsRes.success && Boolean(colsRes.errors?.[0]?.includes('exceeding the maximum limit of 100')), 'Rejects CSV with > 100 columns');

    // XLSX with invalid/corrupt archive
    const corruptBuffer = Buffer.from('corrupt_binary_not_a_zip');
    const corruptRes = await parseXlsxContent(corruptBuffer);
    assert(!corruptRes.success && Boolean(corruptRes.errors?.[0]?.includes('archive')), 'Rejects malformed XLSX archive early before materialization');

    // Peak memory measurement during large ZIP generation
    const initialMem = process.memoryUsage().heapUsed;
    const testFiles = Array.from({ length: 5 }, (_, idx) => ({
      filename: `sitemap-${idx + 1}.xml`,
      content: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${'<url><loc>https://example.com/' + idx + '</loc></url>'.repeat(5000)}</urlset>`,
      type: 'urlset' as const,
      urlCount: 5000,
      byteSize: 300000,
      downloadId: `id_${idx}`
    }));
    const largeZip = await createSitemapsZip(testFiles);
    const postMem = process.memoryUsage().heapUsed;
    const diffMb = (postMem - initialMem) / 1024 / 1024;
    assert(fs.existsSync(largeZip.filePath) && largeZip.byteSize > 1000, `Streams large ZIP archive to disk (file size: ${(largeZip.byteSize / 1024).toFixed(1)} KB, memory delta: ${diffMb.toFixed(2)} MB)`);
    try { fs.unlinkSync(largeZip.filePath); } catch { /* cleanup */ }
  }

  console.log('\n=====================================================');
  console.log(`TOTAL TOOL 4 SITEMAP TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
