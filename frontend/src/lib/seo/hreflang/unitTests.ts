import { validateHreflangCode } from './validateLocale';
import { parseHtmlHreflang } from './parseHtml';
import { parseLinkHeaders } from './parseHeaders';
import { parseSitemapXml } from './parseSitemap';
import { isPrivateIPv4, isPrivateIPv6 } from './safeFetch';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

export function runHreflangUnitTests() {
  console.log('--- Running Hreflang Test Suite ---');

  // Test 1: Valid language only
  const t1 = validateHreflangCode('en');
  assert(t1.isValid === true && t1.language === 'en', 'Test 1 Failed: en should be valid');

  // Test 2: Valid language + region
  const t2 = validateHreflangCode('en-US');
  assert(t2.isValid === true && t2.language === 'en' && t2.region === 'US', 'Test 2 Failed: en-US');

  // Test 3: Invalid en-UK (should flag en-GB recommendation)
  const t3 = validateHreflangCode('en-UK');
  assert(t3.isValid === false && t3.issues.some(i => i.code === 'INVALID_UK_REGION'), 'Test 3 Failed: en-UK should flag INVALID_UK_REGION');

  // Test 4: x-default
  const t4 = validateHreflangCode('x-default');
  assert(t4.isValid === true && t4.isXDefault === true, 'Test 4 Failed: x-default');

  // Test 5: Script code support (e.g. zh-Hans)
  const t5 = validateHreflangCode('zh-Hans');
  assert(t5.isValid === true && t5.script === 'Hans', 'Test 5 Failed: zh-Hans script');

  // Test 6: Underscore delimiter
  const t6 = validateHreflangCode('en_US');
  assert(t6.issues.some(i => i.code === 'INVALID_DELIMITER'), 'Test 6 Failed: en_US underscore check');

  // Test 7: SSRF Private IP blocking
  assert(isPrivateIPv4('127.0.0.1') === true, 'Test 7a Failed: 127.0.0.1 must be private');
  assert(isPrivateIPv4('10.0.0.1') === true, 'Test 7b Failed: 10.0.0.1 must be private');
  assert(isPrivateIPv4('169.254.169.254') === true, 'Test 7c Failed: 169.254.169.254 must be private');
  assert(isPrivateIPv4('192.168.1.1') === true, 'Test 7d Failed: 192.168.1.1 must be private');
  assert(isPrivateIPv4('8.8.8.8') === false, 'Test 7e Failed: 8.8.8.8 should be public');
  assert(isPrivateIPv6('::1') === true, 'Test 7f Failed: ::1 must be private');

  // Test 8: HTML parsing & head extraction
  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Test Page</title>
      <link rel="canonical" href="https://example.com/en/" />
      <link rel="alternate" hreflang="en" href="https://example.com/en/" />
      <link rel="alternate" hreflang="fr" href="https://example.com/fr/" />
      <link rel="alternate" hreflang="x-default" href="https://example.com/" />
    </head>
    <body><h1>Hello</h1></body>
    </html>
  `;
  const parsedHtml = parseHtmlHreflang(sampleHtml, 'https://example.com/en/');
  assert(parsedHtml.annotations.length === 3, `Test 8 Failed: Expected 3 annotations, got ${parsedHtml.annotations.length}`);
  assert(parsedHtml.canonicalUrl === 'https://example.com/en/', 'Test 8 Failed: canonical mismatch');
  assert(parsedHtml.title === 'Test Page', 'Test 8 Failed: title mismatch');

  // Test 9: HTTP Link header parsing
  const linkHeader = '<https://example.com/en/>; rel="alternate"; hreflang="en", <https://example.com/es/>; rel="alternate"; hreflang="es"';
  const parsedHeader = parseLinkHeaders(linkHeader, 'https://example.com/en/');
  assert(parsedHeader.annotations.length === 2, `Test 9 Failed: Expected 2 Link header annotations, got ${parsedHeader.annotations.length}`);

  // Test 10: XML Sitemap parsing
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
      <url>
        <loc>https://example.com/en/</loc>
        <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/" />
        <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/" />
      </url>
    </urlset>`;
  const parsedSitemap = parseSitemapXml(sitemapXml, 'https://example.com/sitemap.xml');
  assert(parsedSitemap.annotations.length === 2, `Test 10 Failed: Expected 2 sitemap annotations, got ${parsedSitemap.annotations.length}`);

  console.log('✓ All 10 Hreflang Test Cases Passed Successfully!');
  return true;
}

if (typeof require !== 'undefined' && require.main === module) {
  runHreflangUnitTests();
}
