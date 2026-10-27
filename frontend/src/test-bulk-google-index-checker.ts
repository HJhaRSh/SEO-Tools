import assert from 'assert';
import {
  encryptSession,
  decryptSession,
  generatePkcePair,
  generateCsrfState,
  GscSessionData,
} from './lib/seo/bulk-google-index-checker/sessionUtils';
import {
  getGoogleConfig,
  buildGoogleAuthUrl,
  isUrlInProperty,
  mapIndexStatusResult,
  GSC_SCOPE,
} from './lib/seo/bulk-google-index-checker/gscService';
import {
  normalizeInputUrls,
  MAX_BATCH_CAPACITY,
} from './lib/seo/bulk-google-index-checker/urlUtils';
import {
  parseHtmlMetadata,
  cleanTextContent,
  runWithConcurrency,
} from './lib/seo/bulk-google-index-checker/metadataService';
import {
  sanitizeCsvField,
  generateInspectionCsv,
  formatTabularResults,
} from './lib/seo/bulk-google-index-checker/csvUtils';
import type { InspectionRowResult } from './lib/seo/bulk-google-index-checker/types';
import { validateUrl } from './lib/seo/safeFetch';

console.log('=====================================================');
console.log('TOOL 17: GOOGLE SEARCH CONSOLE BULK INDEX CHECKER QA');
console.log('=====================================================\n');

let totalTests = 0;
let passedTests = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      throw new Error(`Sync it() received promise for "${desc}". Use itAsync instead.`);
    }
    passedTests++;
    console.log(`  ✓ [PASS] ${desc}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${desc}: ${err.message}`);
    throw err;
  }
}

async function itAsync(desc: string, fn: () => Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${desc}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${desc}: ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  // ----------------------------------------------------
  // 1. OAUTH & ENCRYPTED SESSION SECURITY
  // ----------------------------------------------------
  console.log('1. OAuth 2.0 Security & Encrypted Session Handling:');

  it('Generates cryptographically random PKCE code verifier and SHA-256 challenge', () => {
    const pair1 = generatePkcePair();
    const pair2 = generatePkcePair();
    assert.ok(pair1.verifier.length >= 43);
    assert.ok(pair1.challenge.length >= 43);
    assert.notStrictEqual(pair1.verifier, pair2.verifier);
    assert.notStrictEqual(pair1.challenge, pair2.challenge);
  });

  it('Generates high-entropy CSRF state token', () => {
    const state1 = generateCsrfState();
    const state2 = generateCsrfState();
    assert.strictEqual(state1.length, 48); // 24 bytes hex
    assert.notStrictEqual(state1, state2);
  });

  it('Encrypts session into authenticated AES-256-GCM format (iv.authTag.ciphertext)', () => {
    const sessionData: GscSessionData = {
      accessToken: 'ya29.test_token_12345',
      refreshToken: '1//refresh_token_abcde',
      expiresAt: Date.now() + 3600000,
      userEmail: 'seo-auditor@example.com',
    };
    const encrypted = encryptSession(sessionData);
    assert.strictEqual(typeof encrypted, 'string');
    const parts = encrypted.split('.');
    assert.strictEqual(parts.length, 3);
    // Ensure plaintext tokens never appear in ciphertext
    assert.strictEqual(encrypted.includes('ya29.test_token_12345'), false);
    assert.strictEqual(encrypted.includes('refresh_token_abcde'), false);
  });

  it('Decrypts valid AES-256-GCM session correctly', () => {
    const sessionData: GscSessionData = {
      accessToken: 'ya29.valid_access_token',
      refreshToken: '1//valid_refresh_token',
      expiresAt: 1750000000000,
      userEmail: 'user@indianmarketers.in',
    };
    const encrypted = encryptSession(sessionData);
    const decrypted = decryptSession(encrypted);
    assert.deepStrictEqual(decrypted, sessionData);
  });

  it('Rejects tampered or malformed session cookies', () => {
    const sessionData: GscSessionData = {
      accessToken: 'ya29.sample',
      expiresAt: Date.now() + 1000,
    };
    const valid = encryptSession(sessionData);
    const parts = valid.split('.');

    // Tampered authTag
    const tamperedTag = `${parts[0]}.AAAA${parts[1].slice(4)}.${parts[2]}`;
    assert.strictEqual(decryptSession(tamperedTag), null);

    // Tampered ciphertext
    const tamperedCipher = `${parts[0]}.${parts[1]}.BBBB${parts[2].slice(4)}`;
    assert.strictEqual(decryptSession(tamperedCipher), null);

    // Completely invalid string
    assert.strictEqual(decryptSession('invalid.cookie'), null);
    assert.strictEqual(decryptSession(undefined), null);
  });

  it('Builds Google OAuth URL with minimum read-only scope and PKCE challenge', () => {
    const dummyConfig = {
      clientId: 'dummy-client-id.apps.googleusercontent.com',
      clientSecret: 'dummy-secret',
      redirectUri: 'https://indianmarketers.in/api/seo/bulk-google-index-checker/auth/callback',
    };
    const state = 'csrf-test-state-token';
    const challenge = 'pkce-test-challenge-hash';

    const authUrl = buildGoogleAuthUrl(dummyConfig, state, challenge);
    assert.strictEqual(authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), true);
    assert.strictEqual(authUrl.includes(`client_id=${encodeURIComponent(dummyConfig.clientId)}`), true);
    assert.strictEqual(authUrl.includes(`redirect_uri=${encodeURIComponent(dummyConfig.redirectUri)}`), true);
    assert.strictEqual(authUrl.includes(`scope=${encodeURIComponent(GSC_SCOPE)}`), true);
    assert.strictEqual(authUrl.includes('code_challenge=pkce-test-challenge-hash'), true);
    assert.strictEqual(authUrl.includes('code_challenge_method=S256'), true);
    assert.strictEqual(authUrl.includes('state=csrf-test-state-token'), true);
    assert.strictEqual(authUrl.includes('access_type=offline'), true);
  });

  // ----------------------------------------------------
  // 2. SEARCH CONSOLE PROPERTY SCOPE & MATCHING
  // ----------------------------------------------------
  console.log('\n2. Search Console Property Scope & Security Validation:');

  it('Matches root domain and subdomains for sc-domain properties', () => {
    const property = 'sc-domain:example.com';
    assert.strictEqual(isUrlInProperty('https://example.com/', property), true);
    assert.strictEqual(isUrlInProperty('https://example.com/blog/article-1', property), true);
    assert.strictEqual(isUrlInProperty('https://sub.example.com/page', property), true);
    assert.strictEqual(isUrlInProperty('https://deep.nested.sub.example.com/item', property), true);
    assert.strictEqual(isUrlInProperty('http://example.com/plain-http', property), true);
  });

  it('Rejects URLs outside sc-domain properties', () => {
    const property = 'sc-domain:example.com';
    assert.strictEqual(isUrlInProperty('https://another-domain.com/', property), false);
    assert.strictEqual(isUrlInProperty('https://evil-example.com/page', property), false);
    assert.strictEqual(isUrlInProperty('https://example.org/', property), false);
    assert.strictEqual(isUrlInProperty('not-a-valid-url', property), false);
  });

  it('Matches exact prefix including trailing slash for URL-prefix properties', () => {
    const property = 'https://example.com/subfolder/';
    assert.strictEqual(isUrlInProperty('https://example.com/subfolder/page-1', property), true);
    assert.strictEqual(isUrlInProperty('https://example.com/subfolder/deep/item', property), true);
    // Reject outside URLs under same host
    assert.strictEqual(isUrlInProperty('https://example.com/other-folder/page', property), false);
    assert.strictEqual(isUrlInProperty('https://example.com/', property), false);
    assert.strictEqual(isUrlInProperty('http://example.com/subfolder/page-1', property), false);
  });

  // ----------------------------------------------------
  // 3. GOOGLE URL INSPECTION API STATUS MAPPING
  // ----------------------------------------------------
  console.log('\n3. Google URL Inspection API Status Mapping:');

  it('Maps PASS and Submitted and indexed to "indexed"', () => {
    const rawResult = {
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      indexingState: 'INDEXING_ALLOWED',
      pageFetchState: 'SUCCESSFUL',
      robotsTxtState: 'ALLOWED',
      crawledAs: 'MOBILE',
      lastCrawlTime: '2026-10-25T14:32:00Z',
      googleCanonical: 'https://example.com/page-1',
      userCanonical: 'https://example.com/page-1',
      sitemap: ['https://example.com/sitemap.xml'],
      referringUrls: ['https://example.com/'],
    };

    const mapped = mapIndexStatusResult(rawResult);
    assert.strictEqual(mapped.googleIndexStatus, 'indexed');
    assert.strictEqual(mapped.verdict, 'PASS');
    assert.strictEqual(mapped.coverageState, 'Submitted and indexed');
    assert.strictEqual(mapped.googleCanonical, 'https://example.com/page-1');
    assert.strictEqual(mapped.crawledAs, 'MOBILE');
    assert.strictEqual(mapped.lastGoogleCrawl, '2026-10-25T14:32:00Z');
  });

  it('Maps Indexed, not submitted in sitemap to "indexed"', () => {
    const rawResult = {
      verdict: 'PASS',
      coverageState: 'Indexed, not submitted in sitemap',
      indexingState: 'INDEXING_ALLOWED',
      pageFetchState: 'SUCCESSFUL',
    };
    const mapped = mapIndexStatusResult(rawResult);
    assert.strictEqual(mapped.googleIndexStatus, 'indexed');
  });

  it('Maps excluded / noindex / crawl states to "not_indexed"', () => {
    const rawResult1 = {
      verdict: 'FAIL',
      coverageState: 'Excluded by noindex tag',
      indexingState: 'INDEXING_DISALLOWED',
      pageFetchState: 'SUCCESSFUL',
    };
    const mapped1 = mapIndexStatusResult(rawResult1);
    assert.strictEqual(mapped1.googleIndexStatus, 'not_indexed');

    const rawResult2 = {
      verdict: 'NEUTRAL',
      coverageState: 'Crawled — currently not indexed',
      indexingState: 'INDEXING_ALLOWED',
      pageFetchState: 'SUCCESSFUL',
    };
    const mapped2 = mapIndexStatusResult(rawResult2);
    assert.strictEqual(mapped2.googleIndexStatus, 'not_indexed');

    const rawResult3 = {
      verdict: 'NEUTRAL',
      coverageState: 'Discovered — currently not indexed',
      indexingState: 'INDEXING_ALLOWED',
      pageFetchState: 'SUCCESSFUL',
    };
    const mapped3 = mapIndexStatusResult(rawResult3);
    assert.strictEqual(mapped3.googleIndexStatus, 'not_indexed');

    const rawResult4 = {
      verdict: 'FAIL',
      coverageState: 'Not found (404)',
      pageFetchState: 'NOT_FOUND',
    };
    const mapped4 = mapIndexStatusResult(rawResult4);
    assert.strictEqual(mapped4.googleIndexStatus, 'not_indexed');
  });

  it('Maps canonicalization / alternate states to "canonicalized"', () => {
    const rawResult = {
      verdict: 'NEUTRAL',
      coverageState: 'Duplicate, Google chose different canonical than user',
      indexingState: 'INDEXING_ALLOWED',
      googleCanonical: 'https://example.com/main-url',
      userCanonical: 'https://example.com/duplicate-url',
    };
    const mapped = mapIndexStatusResult(rawResult);
    assert.strictEqual(mapped.googleIndexStatus, 'canonicalized');
    assert.strictEqual(mapped.googleCanonical, 'https://example.com/main-url');
    assert.strictEqual(mapped.userCanonical, 'https://example.com/duplicate-url');
  });

  it('Maps missing or unknown API responses to "unknown"', () => {
    const mappedNull = mapIndexStatusResult(null);
    assert.strictEqual(mappedNull.googleIndexStatus, 'unknown');
    assert.strictEqual(mappedNull.verdict, null);

    const mappedEmpty = mapIndexStatusResult({});
    assert.strictEqual(mappedEmpty.googleIndexStatus, 'unknown');
  });

  // ----------------------------------------------------
  // 4. URL INPUT NORMALIZATION & BATCH CAP
  // ----------------------------------------------------
  console.log('\n4. URL Input Normalization & Batch Limits:');

  it('Normalizes single valid HTTPS URL', () => {
    const input = '  https://example.com/blog/article-1  ';
    const { validUrls, errors } = normalizeInputUrls(input);
    assert.strictEqual(validUrls.length, 1);
    assert.strictEqual(validUrls[0], 'https://example.com/blog/article-1');
    assert.strictEqual(errors.length, 0);
  });

  it('Accepts valid HTTP URL without altering protocol', () => {
    const input = 'http://example.com/plain-http-page';
    const { validUrls } = normalizeInputUrls(input);
    assert.strictEqual(validUrls.length, 1);
    assert.strictEqual(validUrls[0], 'http://example.com/plain-http-page');
  });

  it('Trims whitespace and discards empty lines', () => {
    const input = '\n   \nhttps://example.com/p1\n\n\nhttps://example.com/p2\n  ';
    const { validUrls } = normalizeInputUrls(input);
    assert.strictEqual(validUrls.length, 2);
    assert.strictEqual(validUrls[0], 'https://example.com/p1');
    assert.strictEqual(validUrls[1], 'https://example.com/p2');
  });

  it('Strips URL fragments while preserving path and query strings', () => {
    const input = 'https://example.com/shop/item?id=42&color=blue#reviews-section';
    const { validUrls } = normalizeInputUrls(input);
    assert.strictEqual(validUrls.length, 1);
    assert.strictEqual(validUrls[0], 'https://example.com/shop/item?id=42&color=blue');
  });

  it('Deduplicates identical URLs while preserving original order', () => {
    const input = [
      'https://example.com/alpha',
      'https://example.com/beta',
      'https://example.com/alpha',
      'https://example.com/gamma',
      'https://example.com/beta#heading',
    ];
    const { validUrls } = normalizeInputUrls(input);
    assert.deepStrictEqual(validUrls, [
      'https://example.com/alpha',
      'https://example.com/beta',
      'https://example.com/gamma',
    ]);
  });

  it('Rejects invalid URL formats and non-HTTP/HTTPS schemes', () => {
    const input = [
      'not-a-url',
      'ftp://example.com/file.zip',
      'javascript:alert(1)',
      'data:text/html,test',
      'file:///etc/passwd',
    ];
    const { validUrls, errors } = normalizeInputUrls(input);
    assert.strictEqual(validUrls.length, 0);
    assert.strictEqual(errors.length, 5);
  });

  it('Enforces maximum batch capacity limit of 100 URLs', () => {
    const urls = Array.from({ length: 110 }, (_, i) => `https://example.com/batch-page-${i + 1}`);
    const { validUrls, errors } = normalizeInputUrls(urls);
    assert.strictEqual(validUrls.length, 100);
    assert.strictEqual(errors.length, 10);
    assert.strictEqual(errors[0].error.includes('Exceeds maximum batch capacity of 100 URLs'), true);
  });

  // ----------------------------------------------------
  // 5. LIVE HTML METADATA EXTRACTION & SSRF
  // ----------------------------------------------------
  console.log('\n5. Live HTML Metadata Extraction & SSRF:');

  it('Extracts standard HTML <title> and calculates exact character length', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Best SEO Tools in 2026 | Indian Marketers</title>
        </head>
        <body><h1>Hello</h1></body>
      </html>
    `;
    const { metaTitle, titleLength } = parseHtmlMetadata(html);
    assert.strictEqual(metaTitle, 'Best SEO Tools in 2026 | Indian Marketers');
    assert.strictEqual(titleLength, 41);
  });

  it('Decodes HTML entities and normalizes whitespace in <title>', () => {
    const html = `
      <html>
        <head>
          <title>   Fast &amp; Accurate &quot;Index&quot; &#x27;Checker&#x27;   </title>
        </head>
      </html>
    `;
    const { metaTitle, titleLength } = parseHtmlMetadata(html);
    assert.strictEqual(metaTitle, 'Fast & Accurate "Index" \'Checker\'');
    assert.strictEqual(titleLength, 33);
  });

  it('Handles missing or empty <title> tag gracefully', () => {
    const html = `<html><head></head><body><h1>No Title</h1></body></html>`;
    const { metaTitle, titleLength } = parseHtmlMetadata(html);
    assert.strictEqual(metaTitle, null);
    assert.strictEqual(titleLength, 0);
  });

  it('Extracts meta description regardless of attribute ordering and casing', () => {
    const html1 = `<html><head><meta name="description" content="Technical SEO auditing guide."></head></html>`;
    const res1 = parseHtmlMetadata(html1);
    assert.strictEqual(res1.metaDescription, 'Technical SEO auditing guide.');
    assert.strictEqual(res1.descriptionLength, 29);

    const html2 = `<html><head><meta content="Reversed attributes test" name="description"></head></html>`;
    const res2 = parseHtmlMetadata(html2);
    assert.strictEqual(res2.metaDescription, 'Reversed attributes test');

    const html3 = `<html><head><meta name="Description" content="Uppercase attribute name test"></head></html>`;
    const res3 = parseHtmlMetadata(html3);
    assert.strictEqual(res3.metaDescription, 'Uppercase attribute name test');
  });

  it('Rejects SSRF unsafe URLs (credentials, unauthorized ports, non-http)', () => {
    assert.throws(() => {
      validateUrl('https://user:pass@example.com/secret');
    }, /User credentials in URLs are not permitted/);

    assert.throws(() => {
      validateUrl('https://example.com:8443/test');
    }, /Port "8443" is not allowed/);

    assert.throws(() => {
      validateUrl('gopher://example.com');
    }, /Unsupported URL protocol/);
  });

  // ----------------------------------------------------
  // 6. CSV EXPORT & SPREADSHEET FORMULA INJECTION
  // ----------------------------------------------------
  console.log('\n6. CSV Export & Spreadsheet Formula Injection Protection:');

  it('Sanitizes cells beginning with formula injection characters (=, +, -, @, \\t, \\r)', () => {
    assert.strictEqual(sanitizeCsvField('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.strictEqual(sanitizeCsvField('+cmd|/c calc'), "'+cmd|/c calc");
    assert.strictEqual(sanitizeCsvField('-5+2'), "'-5+2");
    assert.strictEqual(sanitizeCsvField('@import'), "'@import");
    assert.strictEqual(sanitizeCsvField('\tleadingTab'), "'\tleadingTab");
  });

  it('Escapes double quotes, commas, and line breaks in CSV fields', () => {
    const textWithComma = 'Search, Index & Crawl';
    assert.strictEqual(sanitizeCsvField(textWithComma), '"Search, Index & Crawl"');

    const textWithQuote = 'Google "Index" API';
    assert.strictEqual(sanitizeCsvField(textWithQuote), '"Google ""Index"" API"');

    const textWithNewline = 'Line 1\nLine 2';
    assert.strictEqual(sanitizeCsvField(textWithNewline), '"Line 1\nLine 2"');
  });

  it('Generates RFC 4180 CSV with UTF-8 BOM and required headers', () => {
    const testItems: InspectionRowResult[] = [
      {
        id: '1',
        url: 'https://example.com/page-1',
        googleIndexStatus: 'indexed',
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        indexingState: 'INDEXING_ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        robotsTxtState: 'ALLOWED',
        crawledAs: 'MOBILE',
        lastGoogleCrawl: '2026-10-25T12:00:00Z',
        googleCanonical: 'https://example.com/page-1',
        userCanonical: 'https://example.com/page-1',
        sitemap: ['https://example.com/sitemap.xml'],
        referringUrls: [],
        metaTitle: 'Example Title',
        titleLength: 13,
        metaDescription: 'Example Description',
        descriptionLength: 19,
        metadataStatus: 'success',
        checkedAt: '2026-10-27T10:00:00.000Z',
        inspectionCheckedAt: '2026-10-27T10:00:00.000Z',
        error: null,
      },
      {
        id: '2',
        url: 'https://example.com/page-2',
        googleIndexStatus: 'not_indexed',
        verdict: 'FAIL',
        coverageState: 'Crawled — currently not indexed',
        indexingState: 'INDEXING_ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        robotsTxtState: 'ALLOWED',
        crawledAs: 'MOBILE',
        lastGoogleCrawl: '2026-10-24T12:00:00Z',
        googleCanonical: null,
        userCanonical: null,
        sitemap: [],
        referringUrls: [],
        metaTitle: null,
        titleLength: 0,
        metaDescription: null,
        descriptionLength: 0,
        metadataStatus: 'missing',
        checkedAt: '2026-10-27T10:00:00.000Z',
        inspectionCheckedAt: '2026-10-27T10:00:00.000Z',
        error: null,
      },
    ];

    const csv = generateInspectionCsv(testItems);
    assert.strictEqual(csv.startsWith('\uFEFF'), true); // UTF-8 BOM
    assert.strictEqual(
      csv.includes('URL,Google Index Status,Coverage Reason,Meta Title,Title Length,Meta Description,Description Length,Last Google Crawl,Google Canonical,User Canonical,Checked At,Error'),
      true
    );
    assert.strictEqual(csv.includes('Indexed'), true);
    assert.strictEqual(csv.includes('Submitted and indexed'), true);
    assert.strictEqual(csv.includes('Not Indexed'), true);
    assert.strictEqual(csv.includes('Crawled — currently not indexed'), true);
  });

  it('Generates clean tab-separated format for clipboard copy', () => {
    const testItems: InspectionRowResult[] = [
      {
        id: '1',
        url: 'https://example.com/item',
        googleIndexStatus: 'not_indexed',
        verdict: 'FAIL',
        coverageState: 'Excluded by noindex',
        indexingState: 'INDEXING_DISALLOWED',
        pageFetchState: 'SUCCESSFUL',
        robotsTxtState: 'ALLOWED',
        crawledAs: null,
        lastGoogleCrawl: null,
        googleCanonical: null,
        userCanonical: null,
        sitemap: [],
        referringUrls: [],
        metaTitle: 'Item',
        titleLength: 4,
        metaDescription: 'Desc',
        descriptionLength: 4,
        metadataStatus: 'success',
        checkedAt: '2026-10-27T10:00:00.000Z',
        inspectionCheckedAt: '2026-10-27T10:00:00.000Z',
        error: null,
      },
    ];

    const tsv = formatTabularResults(testItems);
    assert.strictEqual(tsv.includes('\t'), true);
    assert.strictEqual(tsv.includes('https://example.com/item'), true);
    assert.strictEqual(tsv.includes('Not Indexed'), true);
    assert.strictEqual(tsv.includes('Excluded by noindex'), true);
  });

  // ----------------------------------------------------
  // 7. BOUNDED CONCURRENCY POOL
  // ----------------------------------------------------
  console.log('\n7. Concurrency Limiter:');

  await itAsync('Executes items within max concurrency bound', async () => {
    let active = 0;
    let maxObserved = 0;

    const tasks = Array.from({ length: 15 }, (_, i) => i);
    const results = await runWithConcurrency(tasks, 5, async (item) => {
      active++;
      maxObserved = Math.max(maxObserved, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return item * 2;
    });

    assert.strictEqual(results.length, 15);
    assert.strictEqual(maxObserved <= 5, true);
    assert.strictEqual(results[0], 0);
    assert.strictEqual(results[14], 28);
  });

  console.log('\n=====================================================');
  console.log(`TOTAL TOOL 17 TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('=====================================================\n');
}

runAllTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
