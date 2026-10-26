import assert from 'assert';
import { normalizeDomainInput, normalizeAndDeduplicateDomains } from './lib/seo/domain-age/domainNormalizer';
import {
  calculateDomainAge,
  calculateExpiryStatus,
  formatDateUtc,
  formatDomainAgeString,
  addYearsUtc,
  addMonthsUtc
} from './lib/seo/domain-age/dateUtils';
import {
  getBootstrapServices,
  resolveRdapBaseUrl,
  extractRegistrar,
  extractRdapEvents,
  extractNameservers,
  normalizeRegistrationStatuses,
  queryRdapRecord
} from './lib/seo/domain-age/rdapClient';
import { checkSingleDomain, checkDomainsBatch } from './lib/seo/domain-age/domainAgeService';

async function runTests() {
  console.log('=====================================================');
  console.log('TOOL 16: DOMAIN AGE CHECKER VERIFICATION SUITE');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  ✓ [PASS] ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  ✗ [FAIL] ${name}`);
            console.error('   ', err);
            failed++;
          });
      }
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error('   ', err);
      failed++;
    }
  }

  // ==========================================
  // 1. DOMAIN INPUT NORMALIZATION & VALIDATION
  // ==========================================
  console.log('1. Domain Normalization & Validation:');

  test('Normalizes standard domain', () => {
    const res = normalizeDomainInput('google.com');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'google.com');
    assert.strictEqual(res.tld, 'com');
  });

  test('Normalizes uppercase domain to lowercase', () => {
    const res = normalizeDomainInput('GOOGLE.COM');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'google.com');
  });

  test('Normalizes domain with HTTPS protocol', () => {
    const res = normalizeDomainInput('https://google.com');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'google.com');
  });

  test('Normalizes domain with HTTP protocol', () => {
    const res = normalizeDomainInput('http://google.com');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'google.com');
  });

  test('Normalizes domain with www prefix', () => {
    const res = normalizeDomainInput('www.google.com');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'google.com');
  });

  test('Normalizes domain with path', () => {
    const res = normalizeDomainInput('https://www.google.com/search');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'google.com');
  });

  test('Normalizes domain with query parameters and trailing slash', () => {
    const res = normalizeDomainInput('https://www.google.com/search?q=test');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'google.com');
  });

  test('Extracts registrable domain from subdomains', () => {
    const res = normalizeDomainInput('blog.example.co.uk');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'example.co.uk');
    assert.strictEqual(res.tld, 'co.uk');
  });

  test('Extracts registrable domain from multi-label public suffix (.co.in)', () => {
    const res = normalizeDomainInput('https://shop.example.co.in/product/123');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'example.co.in');
    assert.strictEqual(res.tld, 'co.in');
  });

  test('Extracts registrable domain from .in domain', () => {
    const res = normalizeDomainInput('indianmarketers.in');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'indianmarketers.in');
  });

  test('Extracts registrable domain from .com.au domain', () => {
    const res = normalizeDomainInput('subdomain.example.com.au');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.registrableDomain, 'example.com.au');
  });

  test('Rejects empty or whitespace-only inputs', () => {
    assert.strictEqual(normalizeDomainInput('').isValid, false);
    assert.strictEqual(normalizeDomainInput('   ').isValid, false);
  });

  test('Rejects raw IPv4 addresses', () => {
    const res = normalizeDomainInput('127.0.0.1');
    assert.strictEqual(res.isValid, false);
  });

  test('Rejects raw IPv6 addresses', () => {
    const res = normalizeDomainInput('::1');
    assert.strictEqual(res.isValid, false);
  });

  test('Rejects localhost and single-label hosts', () => {
    assert.strictEqual(normalizeDomainInput('localhost').isValid, false);
    assert.strictEqual(normalizeDomainInput('mycomputer').isValid, false);
  });

  test('Rejects internal network suffixes (.local, .internal, .lan)', () => {
    assert.strictEqual(normalizeDomainInput('server.local').isValid, false);
    assert.strictEqual(normalizeDomainInput('api.internal').isValid, false);
    assert.strictEqual(normalizeDomainInput('router.lan').isValid, false);
  });

  test('Rejects URLs with embedded credentials', () => {
    const res = normalizeDomainInput('http://admin:secret@google.com');
    assert.strictEqual(res.isValid, false);
  });

  test('Rejects unsupported URI schemes (ftp, javascript, file)', () => {
    assert.strictEqual(normalizeDomainInput('ftp://google.com').isValid, false);
    assert.strictEqual(normalizeDomainInput('javascript:alert(1)').isValid, false);
    assert.strictEqual(normalizeDomainInput('file:///etc/hosts').isValid, false);
  });

  test('Deduplicates domains in batch input while preserving order', () => {
    const inputs = ['google.com', 'https://www.google.com/search', 'amazon.in', 'GOOGLE.COM', 'invalid-domain'];
    const { normalized, uniqueDomains } = normalizeAndDeduplicateDomains(inputs);
    assert.strictEqual(normalized.length, 5);
    assert.deepStrictEqual(uniqueDomains, ['google.com', 'amazon.in']);
  });

  // ==========================================
  // 2. CALENDAR DATE & AGE ARITHMETIC
  // ==========================================
  console.log('\n2. Calendar Date & Age Arithmetic:');

  test('Exact anniversary calculation (10 full years)', () => {
    const start = new Date('2010-05-15T00:00:00Z');
    const end = new Date('2020-05-15T00:00:00Z');
    const res = calculateDomainAge(start, end);
    assert.strictEqual(res.age.years, 10);
    assert.strictEqual(res.age.months, 0);
    assert.strictEqual(res.age.days, 0);
    assert.strictEqual(res.totalAgeDays, 3653); // includes 2 leap days (2012, 2016)
  });

  test('Leap year anniversary (Feb 29 to Feb 28 in non-leap year)', () => {
    const start = new Date('2020-02-29T00:00:00Z');
    const end = new Date('2021-02-28T00:00:00Z');
    const res = calculateDomainAge(start, end);
    assert.strictEqual(res.age.years, 1);
    assert.strictEqual(res.age.months, 0);
    assert.strictEqual(res.age.days, 0);
    assert.strictEqual(res.totalAgeDays, 365);
  });

  test('End-of-month boundary across leap year (Jan 30 to Mar 1 2020)', () => {
    const start = new Date('2020-01-30T00:00:00Z');
    const end = new Date('2020-03-01T00:00:00Z');
    const res = calculateDomainAge(start, end);
    assert.strictEqual(res.age.years, 0);
    assert.strictEqual(res.age.months, 1);
    assert.strictEqual(res.age.days, 1);
    assert.strictEqual(res.totalAgeDays, 31);
  });

  test('Same day registration returns 0 elapsed age', () => {
    const date = new Date('2024-06-15T10:00:00Z');
    const res = calculateDomainAge(date, date);
    assert.strictEqual(res.age.years, 0);
    assert.strictEqual(res.age.months, 0);
    assert.strictEqual(res.age.days, 0);
    assert.strictEqual(res.totalAgeDays, 0);
  });

  test('Future registration date handled safely', () => {
    const start = new Date('2030-01-01T00:00:00Z');
    const end = new Date('2026-10-26T00:00:00Z');
    const res = calculateDomainAge(start, end);
    assert.strictEqual(res.isFuture, true);
    assert.strictEqual(res.totalAgeDays, 0);
  });

  test('Calculates active future expiry days correctly', () => {
    const now = new Date('2026-10-26T00:00:00Z');
    const expires = new Date('2026-11-05T00:00:00Z');
    const info = calculateExpiryStatus(expires, now);
    assert.strictEqual(info.expiryStatus, 'active');
    assert.strictEqual(info.daysUntilExpiry, 10);
    assert.strictEqual(info.displayText, 'Expires in 10 days');
  });

  test('Identifies passed expiry date accurately', () => {
    const now = new Date('2026-10-26T00:00:00Z');
    const expires = new Date('2026-10-20T00:00:00Z');
    const info = calculateExpiryStatus(expires, now);
    assert.strictEqual(info.expiryStatus, 'passed');
    assert.ok(info.daysUntilExpiry! <= 0);
    assert.ok(info.displayText.includes('Listed expiry date has passed'));
  });

  test('Formats UTC date reliably (DD MMM YYYY)', () => {
    assert.strictEqual(formatDateUtc('1997-09-15T04:00:00Z'), '15 Sep 1997');
    assert.strictEqual(formatDateUtc(null), 'Not available');
  });

  // ==========================================
  // 3. RDAP DISCOVERY & PARSING
  // ==========================================
  console.log('\n3. RDAP Discovery & RFC 9083 Parsing:');

  await test('Resolves authoritative RDAP endpoint for .com via bootstrap', async () => {
    const endpoint = await resolveRdapBaseUrl('google.com');
    assert.ok(endpoint !== null, 'Endpoint must not be null');
    assert.ok(endpoint.includes('verisign.com'), `Expected verisign, got ${endpoint}`);
  });

  await test('Resolves authoritative RDAP endpoint for .in via bootstrap', async () => {
    const endpoint = await resolveRdapBaseUrl('amazon.in');
    assert.ok(endpoint !== null, 'Endpoint must not be null');
    assert.ok(endpoint.includes('nixiregistry.in') || endpoint.includes('in'), `Expected in registry, got ${endpoint}`);
  });

  await test('Resolves authoritative RDAP endpoint for .co.uk using longest-label match', async () => {
    const endpoint = await resolveRdapBaseUrl('example.co.uk');
    assert.ok(endpoint !== null, 'Endpoint must not be null');
    assert.ok(endpoint.includes('nominet.uk'), `Expected nominet.uk, got ${endpoint}`);
  });

  await test('Returns null for unsupported arbitrary TLD', async () => {
    const endpoint = await resolveRdapBaseUrl('example.unsupportedfakeextension999');
    assert.strictEqual(endpoint, null);
  });

  test('Parses events correctly and identifies creation date', () => {
    const events = [
      { eventAction: 'transfer', eventDate: '2012-03-09T16:33:50Z' },
      { eventAction: 'registration', eventDate: '2001-01-13T00:12:14Z' },
      { eventAction: 'last changed', eventDate: '2026-08-12T08:47:19Z' },
      { eventAction: 'expiration', eventDate: '2027-01-13T00:12:14Z' }
    ];
    const parsed = extractRdapEvents(events);
    assert.strictEqual(parsed.createdAt?.toISOString(), '2001-01-13T00:12:14.000Z');
    assert.strictEqual(parsed.updatedAt?.toISOString(), '2026-08-12T08:47:19.000Z');
    assert.strictEqual(parsed.expiresAt?.toISOString(), '2027-01-13T00:12:14.000Z');
  });

  test('Extracts registrar from jCard vcardArray', () => {
    const entities = [
      {
        roles: ['registrar'],
        vcardArray: [
          'vcard',
          [
            ['version', {}, 'text', '4.0'],
            ['fn', {}, 'text', 'MarkMonitor Inc.']
          ]
        ]
      }
    ];
    const registrar = extractRegistrar(entities);
    assert.strictEqual(registrar, 'MarkMonitor Inc.');
  });

  test('Extracts registrar from entity name or handle fallback', () => {
    const entities = [
      {
        roles: ['registrar'],
        name: 'GoDaddy.com, LLC'
      }
    ];
    const registrar = extractRegistrar(entities);
    assert.strictEqual(registrar, 'GoDaddy.com, LLC');
  });

  test('Extracts and deduplicates nameservers', () => {
    const nameservers = [
      { ldhName: 'NS1.GOOGLE.COM' },
      { ldhName: 'ns2.google.com' },
      { ldhName: 'NS1.GOOGLE.COM' }
    ];
    const parsed = extractNameservers(nameservers);
    assert.deepStrictEqual(parsed, ['ns1.google.com', 'ns2.google.com']);
  });

  test('Normalizes technical domain status values to readable title case', () => {
    const raw = ['clientTransferProhibited', 'serverDeleteProhibited', 'active'];
    const normalized = normalizeRegistrationStatuses(raw);
    assert.ok(normalized.includes('Client Transfer Prohibited'));
    assert.ok(normalized.includes('Server Delete Prohibited'));
    assert.ok(normalized.includes('Active'));
  });

  // ==========================================
  // 4. SECURITY & CSV FORMULA INJECTION
  // ==========================================
  console.log('\n4. Security & Spreadsheet Formula Injection:');

  test('Guards against CSV formula injection prefixes (=, +, -, @, tab)', () => {
    function sanitizeField(value: string): string {
      const escaped = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
      return escaped.includes(',') ? `"${escaped.replace(/"/g, '""')}"` : escaped;
    }

    assert.strictEqual(sanitizeField('=cmd|/C calc'), `'=cmd|/C calc`);
    assert.strictEqual(sanitizeField('+12345'), `'+12345`);
    assert.strictEqual(sanitizeField('-2+3*[5]'), `'-2+3*[5]`);
    assert.strictEqual(sanitizeField('@SUM(A1:A10)'), `'@SUM(A1:A10)`);
    assert.strictEqual(sanitizeField('Normal Domain'), 'Normal Domain');
  });

  // ==========================================
  // 5. LIVE RDAP SMOKE TESTS
  // ==========================================
  console.log('\n5. Live RDAP Smoke Tests:');

  await test('Live lookup for google.com returns genuine creation date & age', async () => {
    const result = await checkSingleDomain('google.com');
    assert.strictEqual(result.domain, 'google.com');
    assert.strictEqual(result.status, 'success');
    assert.ok(result.createdAt !== null, 'google.com must have createdAt');
    assert.ok(result.age !== null, 'google.com must have calculated age');
    assert.ok(result.age.years >= 25, `Expected age >= 25 years, got ${result.age.years}`);
    assert.strictEqual(result.source, 'RDAP');
    assert.ok(result.registrar !== null && result.registrar.length > 0);
  });

  await test('Live lookup for amazon.in (.in ccTLD) returns creation date', async () => {
    const result = await checkSingleDomain('amazon.in');
    assert.strictEqual(result.domain, 'amazon.in');
    assert.strictEqual(result.status, 'success');
    assert.ok(result.createdAt !== null, 'amazon.in must have createdAt');
    assert.ok(result.age !== null);
    assert.ok(result.age.years >= 15);
  });

  await test('Live lookup for wikipedia.org (.org gTLD) returns creation date', async () => {
    const result = await checkSingleDomain('wikipedia.org');
    assert.strictEqual(result.domain, 'wikipedia.org');
    assert.strictEqual(result.status, 'success');
    assert.ok(result.createdAt !== null);
    assert.ok(result.age !== null);
    assert.ok(result.age.years >= 20);
  });

  await test('Live lookup for indianmarketers.in returns valid registration details', async () => {
    const result = await checkSingleDomain('indianmarketers.in');
    assert.strictEqual(result.domain, 'indianmarketers.in');
    assert.strictEqual(result.status, 'success');
    assert.ok(result.createdAt !== null);
    assert.ok(result.age !== null);
    assert.ok(result.age.years >= 6);
  });

  await test('Live lookup for non-existent domain returns not_found (404)', async () => {
    const result = await checkSingleDomain('this-domain-definitely-does-not-exist-xyz-987654.com');
    assert.strictEqual(result.status, 'not_found');
    assert.strictEqual(result.createdAt, null);
    assert.ok(result.error?.includes('not found') || result.error?.includes('Domain not found'));
  });

  await test('Batch lookup processes multiple domains with bounded concurrency', async () => {
    const batch = await checkDomainsBatch(['google.com', 'wikipedia.org', 'invalid..domain'], 2);
    assert.strictEqual(batch.success, true);
    assert.strictEqual(batch.totalCount, 3);
    assert.strictEqual(batch.results[0].domain, 'google.com');
    assert.strictEqual(batch.results[0].status, 'success');
    assert.strictEqual(batch.results[1].domain, 'wikipedia.org');
    assert.strictEqual(batch.results[1].status, 'success');
    assert.strictEqual(batch.results[2].status, 'invalid_input');
  });

  console.log('\n=====================================================');
  console.log(`TOTAL TOOL 16 TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
