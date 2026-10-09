import { isPrivateOrReservedIP, isBlockedHostname } from './seo/ssrf.js';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability, normalizePathAndQuery } from './seo/robotsParser.js';
import assert from 'assert';

console.log('Running Robots.txt Backend Unit Tests...\n');

// 1. SSRF Tests
console.log('1. Testing SSRF & IP filters...');
assert.strictEqual(isPrivateOrReservedIP('127.0.0.1'), true, '127.0.0.1 should be private');
assert.strictEqual(isPrivateOrReservedIP('10.0.1.5'), true, '10.x should be private');
assert.strictEqual(isPrivateOrReservedIP('192.168.1.1'), true, '192.168.x should be private');
assert.strictEqual(isPrivateOrReservedIP('169.254.169.254'), true, 'AWS metadata should be private');
assert.strictEqual(isPrivateOrReservedIP('8.8.8.8'), false, '8.8.8.8 should NOT be private');
assert.strictEqual(isBlockedHostname('localhost'), true, 'localhost should be blocked');
assert.strictEqual(isBlockedHostname('metadata.google.internal'), true, 'metadata.google.internal should be blocked');
assert.strictEqual(isBlockedHostname('google.com'), false, 'google.com should not be blocked');
console.log('   ✓ SSRF tests passed.');

// 2. Parser & Group Matching Tests
console.log('2. Testing parser & group matching...');
const sampleRobots = `
# Comment at top
User-agent: Googlebot
Disallow: /admin/
Allow: /admin/public/
Allow: /admin/login$

User-agent: Bingbot
Disallow: /bing-block/

User-agent: *
Disallow: /private/
Disallow: /secret.html$
Disallow: /wild/*/data
Allow: /wild/test/data

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap-news.xml
`;

const parsed = parseRobotsTxt(sampleRobots);
assert.strictEqual(parsed.groups.length, 3, 'Should parse 3 user-agent groups');
assert.strictEqual(parsed.sitemaps.length, 2, 'Should parse 2 sitemaps');
assert.strictEqual(parsed.sitemaps[0].url, 'https://example.com/sitemap.xml');

// Googlebot group check
const googleRules = selectRulesForUserAgent(parsed.groups, 'googlebot');
assert.strictEqual(googleRules.matchedToken, 'googlebot');
assert.strictEqual(googleRules.rules.length, 3);

// Fallback check: Googlebot-News falling back to Googlebot
const newsRules = selectRulesForUserAgent(parsed.groups, 'googlebot-news', 'googlebot');
assert.strictEqual(newsRules.matchedToken, 'googlebot');

// Wildcard fallback: DuckDuckBot falling back to *
const duckRules = selectRulesForUserAgent(parsed.groups, 'duckduckbot');
assert.strictEqual(duckRules.matchedToken, '*');
console.log('   ✓ Parser & group tests passed.');

// 3. Rule Evaluation & Specificity Tests
console.log('3. Testing RFC 9309 rule matching & specificity...');

// A. Allow takes precedence over Disallow if more specific
const res1 = evaluateCrawlability(googleRules.rules, '/admin/public/index.html', 'Googlebot', 'googlebot');
assert.strictEqual(res1.status, 'ALLOWED', '/admin/public/index.html should be allowed');
assert.strictEqual(res1.appliedRule?.type, 'allow');

// B. Blocked by Disallow
const res2 = evaluateCrawlability(googleRules.rules, '/admin/settings', 'Googlebot', 'googlebot');
assert.strictEqual(res2.status, 'BLOCKED', '/admin/settings should be blocked');
assert.strictEqual(res2.appliedRule?.type, 'disallow');

// C. End of URL $ matching
const res3 = evaluateCrawlability(googleRules.rules, '/admin/login', 'Googlebot', 'googlebot');
assert.strictEqual(res3.status, 'ALLOWED', '/admin/login exact match $ should be allowed');
const res4 = evaluateCrawlability(googleRules.rules, '/admin/login/more', 'Googlebot', 'googlebot');
assert.strictEqual(res4.status, 'BLOCKED', '/admin/login/more should NOT match $ rule, falls back to /admin/');

// D. Wildcard * matching
const wildRobots = `
User-agent: *
Disallow: /*.php$
Disallow: /folder/*/test
Allow: /folder/fixed/test
`;
const wildParsed = parseRobotsTxt(wildRobots);
const wildRules = selectRulesForUserAgent(wildParsed.groups, '*');

const res5 = evaluateCrawlability(wildRules.rules, '/page.php', 'Generic', '*');
assert.strictEqual(res5.status, 'BLOCKED', '/*.php$ should block /page.php');

const res6 = evaluateCrawlability(wildRules.rules, '/page.php?param=1', 'Generic', '*');
assert.strictEqual(res6.status, 'ALLOWED', '/*.php$ should not match when query string follows unless regex handles');

const res7 = evaluateCrawlability(wildRules.rules, '/folder/123/test', 'Generic', '*');
assert.strictEqual(res7.status, 'BLOCKED', '/folder/*/test matches');

const res8 = evaluateCrawlability(wildRules.rules, '/folder/fixed/test', 'Generic', '*');
assert.strictEqual(res8.status, 'ALLOWED', 'More specific or equal allow should win');

// E. Equal length Allow and Disallow -> Allow wins per RFC 9309
const tieRobots = `
User-agent: *
Disallow: /page
Allow: /page
`;
const tieParsed = parseRobotsTxt(tieRobots);
const tieRules = selectRulesForUserAgent(tieParsed.groups, '*');
const tieRes = evaluateCrawlability(tieRules.rules, '/page', 'Generic', '*');
assert.strictEqual(tieRes.status, 'ALLOWED', 'Equal length Allow and Disallow must resolve to ALLOWED');

// F. Empty Disallow means allow all
const emptyDisallow = `
User-agent: *
Disallow:
`;
const emptyParsed = parseRobotsTxt(emptyDisallow);
const emptyRules = selectRulesForUserAgent(emptyParsed.groups, '*');
const emptyRes = evaluateCrawlability(emptyRules.rules, '/anything', 'Generic', '*');
assert.strictEqual(emptyRes.status, 'ALLOWED', 'Empty Disallow should allow all');

// G. Issue 5 Required Specification Test:
// User-agent: * Disallow: /admin/ Allow: /admin/public/
const adminRobots = `
User-agent: *
Disallow: /admin/
Allow: /admin/public/
`;
const adminParsed = parseRobotsTxt(adminRobots);
const adminRules = selectRulesForUserAgent(adminParsed.groups, '*');
const adminDashboard = evaluateCrawlability(adminRules.rules, '/admin/dashboard', 'Googlebot', '*');
const adminPublicHelp = evaluateCrawlability(adminRules.rules, '/admin/public/help', 'Googlebot', '*');
assert.strictEqual(adminDashboard.status, 'BLOCKED', '/admin/dashboard should be BLOCKED');
assert.strictEqual(adminPublicHelp.status, 'ALLOWED', '/admin/public/help should be ALLOWED');

// H. UTF-8 multi-byte specificity test per RFC 9309
const unicodeRobots = `
User-agent: *
Disallow: /café/
Allow: /café/menu
`;
const unicodeParsed = parseRobotsTxt(unicodeRobots);
const unicodeRules = selectRulesForUserAgent(unicodeParsed.groups, '*');
const uniRes = evaluateCrawlability(unicodeRules.rules, '/café/menu', 'Googlebot', '*');
assert.strictEqual(uniRes.status, 'ALLOWED', 'Longer octet rule /café/menu must take precedence');
assert.strictEqual(uniRes.specificity, Buffer.byteLength('/café/menu', 'utf8'));

console.log('   ✓ Rule evaluation & RFC 9309 specificity tests passed.');

// 4. Repeated User-Agent group combination test
console.log('4. Testing repeated User-Agent groups...');
const repeatedRobots = `
User-agent: Googlebot
Disallow: /part1/

User-agent: Bingbot
Disallow: /bing/

User-agent: Googlebot
Disallow: /part2/
`;
const repeatedParsed = parseRobotsTxt(repeatedRobots);
const repeatedGoogle = selectRulesForUserAgent(repeatedParsed.groups, 'googlebot');
assert.strictEqual(repeatedGoogle.rules.length, 2, 'Should combine rules from repeated Googlebot blocks');
const repRes1 = evaluateCrawlability(repeatedGoogle.rules, '/part1/file', 'Googlebot', 'googlebot');
const repRes2 = evaluateCrawlability(repeatedGoogle.rules, '/part2/file', 'Googlebot', 'googlebot');
assert.strictEqual(repRes1.status, 'BLOCKED');
assert.strictEqual(repRes2.status, 'BLOCKED');
console.log('   ✓ Repeated user-agent groups combined successfully.');

console.log('\nALL UNIT TESTS PASSED SUCCESSFULLY! 🚀');
