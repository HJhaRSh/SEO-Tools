import { parseSitemapXml } from '../../frontend/src/lib/seo/hreflang/parseSitemap';
import { isPrivateIPv4, isPrivateIPv6, validateSafeUrl, resolveAndVerifyPublicIp } from '../../frontend/src/lib/seo/hreflang/safeFetch';

async function runTests() {
  console.log('=====================================================');
  console.log('FOCUSED AUTOMATED TEST SUITE: SEO TOOLS V7');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean) {
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 1: safeFetch Connection-Level & IP Enforcement
  // --------------------------------------------------------------------------
  console.log('1. Connection-Level IP & SSRF Enforcement:');

  assert('isPrivateIPv4 blocks loopback 127.0.0.1', isPrivateIPv4('127.0.0.1') === true);
  assert('isPrivateIPv4 blocks 10.0.0.1 (RFC 1918)', isPrivateIPv4('10.0.0.1') === true);
  assert('isPrivateIPv4 blocks 172.16.0.1 (RFC 1918)', isPrivateIPv4('172.16.0.1') === true);
  assert('isPrivateIPv4 blocks 192.168.1.1 (RFC 1918)', isPrivateIPv4('192.168.1.1') === true);
  assert('isPrivateIPv4 blocks 169.254.169.254 (Cloud metadata / Link-local)', isPrivateIPv4('169.254.169.254') === true);
  assert('isPrivateIPv4 allows public IP 8.8.8.8', isPrivateIPv4('8.8.8.8') === false);
  assert('isPrivateIPv4 allows public IP 93.184.216.34', isPrivateIPv4('93.184.216.34') === false);

  assert('isPrivateIPv6 blocks ::1', isPrivateIPv6('::1') === true);
  assert('isPrivateIPv6 blocks ::', isPrivateIPv6('::') === true);
  assert('isPrivateIPv6 blocks unique local fc00::1', isPrivateIPv6('fc00::1') === true);
  assert('isPrivateIPv6 blocks link-local fe80::1', isPrivateIPv6('fe80::1') === true);
  assert('isPrivateIPv6 blocks IPv4-mapped loopback ::ffff:127.0.0.1', isPrivateIPv6('::ffff:127.0.0.1') === true);
  assert('isPrivateIPv6 allows public 2606:4700:4700::1111', isPrivateIPv6('2606:4700:4700::1111') === false);

  try {
    await validateSafeUrl('http://127.0.0.1:8080');
    assert('validateSafeUrl blocks 127.0.0.1', false);
  } catch (err: any) {
    assert('validateSafeUrl blocks 127.0.0.1', err.message.includes('private or reserved IP'));
  }

  try {
    await validateSafeUrl('http://localhost:3000');
    assert('validateSafeUrl blocks localhost', false);
  } catch (err: any) {
    assert('validateSafeUrl blocks localhost', err.message.includes('localhost or internal network'));
  }

  try {
    await resolveAndVerifyPublicIp('127.0.0.1');
    assert('resolveAndVerifyPublicIp blocks 127.0.0.1', false);
  } catch (err: any) {
    assert('resolveAndVerifyPublicIp blocks 127.0.0.1', err.code === 'BLOCKED_DESTINATION');
  }

  try {
    await resolveAndVerifyPublicIp('localhost');
    assert('resolveAndVerifyPublicIp blocks localhost at connection level', false);
  } catch (err: any) {
    assert('resolveAndVerifyPublicIp blocks localhost at connection level', err.code === 'BLOCKED_DESTINATION');
  }

  try {
    const verifiedIp = await resolveAndVerifyPublicIp('example.com');
    assert('resolveAndVerifyPublicIp resolves public domain to valid public IP', !isPrivateIPv4(verifiedIp) && !isPrivateIPv6(verifiedIp));
  } catch (err: any) {
    assert('resolveAndVerifyPublicIp resolves public domain to valid public IP', false);
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: fast-xml-parser Sitemap Parsing, Namespaces, Security & Rejection
  // --------------------------------------------------------------------------
  console.log('\n2. Secure XML Sitemap Parsing & fast-xml-parser:');

  const validSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.com/en</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en" />
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/" />
  </url>
  <url>
    <loc>https://example.com/fr</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en" />
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr" />
  </url>
</urlset>`;

  const parsedValid = parseSitemapXml(validSitemap, 'https://example.com/sitemap.xml');
  assert('Parses valid standard XML sitemap without errors', parsedValid.issues.filter(i => i.severity === 'error').length === 0);
  assert('Discovers 2 URL entries', parsedValid.totalUrls === 2);
  assert('Discovers 5 hreflang annotations across entries', parsedValid.annotations.length === 5);
  assert('Detects self-reference on /en', parsedValid.annotations.some(a => a.isSelfReference && a.href === 'https://example.com/en'));
  assert('Normalizes x-default correctly', parsedValid.annotations.some(a => a.normalizedHreflang === 'x-default'));

  // Sitemap Index
  const validIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-2.xml</loc>
  </sitemap>
</sitemapindex>`;

  const parsedIndex = parseSitemapXml(validIndex, 'https://example.com/sitemap_index.xml');
  assert('Identifies sitemap index document', parsedIndex.isSitemapIndex === true);
  assert('Extracts 2 child sitemap URLs', parsedIndex.sitemapIndexUrls.length === 2);
  assert('Child sitemap 1 matches loc', parsedIndex.sitemapIndexUrls[0] === 'https://example.com/sitemap-1.xml');

  // Security: XXE / DTD Rejection
  const xxeXml = `<?xml version="1.0"?>
<!DOCTYPE foo SYSTEM "http://127.0.0.1/evil.dtd">
<urlset><url><loc>https://example.com</loc></url></urlset>`;
  const parsedXxe = parseSitemapXml(xxeXml, 'https://example.com/sitemap.xml');
  assert('Rejects DTD/XXE construct with UNSAFE_XML_DOCTYPE', parsedXxe.issues.some(i => i.code === 'UNSAFE_XML_DOCTYPE'));

  // Malformed XML Rejection
  const malformedXml = `<urlset><url><loc>https://example.com<unclosed></url></urlset>`;
  const parsedMalformed = parseSitemapXml(malformedXml, 'https://example.com/sitemap.xml');
  assert('Rejects malformed XML structure with MALFORMED_XML', parsedMalformed.issues.some(i => i.code === 'MALFORMED_XML'));

  // Encoded Entities in URLs
  const entityXml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.com/search?q=test&amp;lang=en</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/search?q=test&amp;lang=en" />
  </url>
</urlset>`;
  const parsedEntities = parseSitemapXml(entityXml, 'https://example.com/sitemap.xml');
  assert('Decodes XML entities in URL values', parsedEntities.annotations[0]?.href === 'https://example.com/search?q=test&lang=en');

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Reciprocal Hreflang Validation Logic & Edge Cases
  // --------------------------------------------------------------------------
  console.log('\n3. Reciprocal Hreflang Validation Rules:');

  // Scenario 3.1: Correct reciprocal mapping
  // A (https://example.com/en/) declares self en, and fr -> B (https://example.com/fr/)
  // B (https://example.com/fr/) declares self fr, and en -> A (https://example.com/en/)
  const clusterXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.com/en/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/" />
  </url>
  <url>
    <loc>https://example.com/fr/</loc>
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />
  </url>
</urlset>`;
  const parsedCluster = parseSitemapXml(clusterXml, 'https://example.com/sitemap.xml');
  assert('Cluster XML parses with 4 annotations', parsedCluster.annotations.length === 4);

  // Scenario 3.2: Wrong return language (German 'de' instead of English 'en')
  const wrongLangXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.com/en/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/" />
  </url>
  <url>
    <loc>https://example.com/fr/</loc>
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/" />
    <xhtml:link rel="alternate" hreflang="de" href="https://example.com/en/" />
  </url>
</urlset>`;
  const parsedWrongLang = parseSitemapXml(wrongLangXml, 'https://example.com/sitemap.xml');
  assert('Parsed wrong language sitemap', parsedWrongLang.annotations.length === 4);

  // Scenario 3.3: Trailing slash mismatch (/en vs /en/)
  const slashMismatchXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.com/en</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en" />
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr" />
  </url>
  <url>
    <loc>https://example.com/fr</loc>
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr" />
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />
  </url>
</urlset>`;
  const parsedSlash = parseSitemapXml(slashMismatchXml, 'https://example.com/sitemap.xml');
  const enAnn = parsedSlash.annotations.find(a => a.sourceUrl === 'https://example.com/fr' && a.hreflang === 'en');
  assert('Preserves exact trailing slash in parsed href (https://example.com/en/ vs https://example.com/en)', enAnn?.href === 'https://example.com/en/');

  // Scenario 3.4: Ambiguous mapping (sourceUrl has no self-referencing tag)
  const ambiguousXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.com/page-a</loc>
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/page-b" />
  </url>
  <url>
    <loc>https://example.com/page-b</loc>
    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/page-b" />
    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/page-a" />
  </url>
</urlset>`;
  const parsedAmbiguous = parseSitemapXml(ambiguousXml, 'https://example.com/sitemap.xml');
  assert('Parsed ambiguous sitemap dataset', parsedAmbiguous.annotations.length === 3);

  console.log('\n=====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
