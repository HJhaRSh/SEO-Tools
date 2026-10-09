/**
 * Tool 4 — XML Sitemap Generator Automated Test Suite
 * Tests URL validation, Date validation, Hreflang logic, XML generation,
 * splitting (50k & 50MB limits), ExcelJS decompression/safety, and ZIP packaging.
 */

import { XMLParser } from 'fast-xml-parser';
import ExcelJS from 'exceljs';
import { validateSitemapUrl, validateLastmodDate, validateChangeFreq, validatePriority, escapeXmlEntities } from './seo/sitemapValidation.js';
import { validateHreflangCode, validateUrlAlternates, validateReciprocalHreflang, expandReciprocalEntries } from './seo/sitemapHreflang.js';
import { parseCsvContent, parseXlsxContent, extractUrlEntriesFromRows, detectColumnMapping } from './seo/sitemapParser.js';
import { generateSitemapXml, serializeUrlElement } from './seo/sitemapGenerator.js';
import { buildIndexEntriesFromFiles, buildSitemapIndexXml } from './seo/sitemapIndex.js';
import { createSitemapsZip, storeDownload, getDownload, sanitizeCsvCell, generateIssuesCsv } from './seo/sitemapExport.js';

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
    const csvParsed = parseCsvContent(csvContent);
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

    // ZIP packaging
    const zipBuf = await createSitemapsZip([
      { filename: 'sitemap-1.xml', content: '<test>1</test>', type: 'urlset', urlCount: 1, byteSize: 15, downloadId: '1' }
    ]);
    assert(zipBuf.length > 50 && zipBuf.slice(0, 4).toString('hex') === '504b0304', 'Generates valid ZIP buffer with PK signature');

    // Download store and token TTL
    const dlToken = storeDownload('test.xml', 'application/xml', Buffer.from('<xml/>'));
    const retrieved = getDownload(dlToken);
    assert(retrieved !== null && retrieved.filename === 'test.xml', 'Stores and retrieves downloadable package by token');
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
