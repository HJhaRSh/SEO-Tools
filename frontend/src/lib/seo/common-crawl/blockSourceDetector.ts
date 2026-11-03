/**
 * Common Crawl Block Source Detection Service
 * Feature 3 — Block Source Detection & Origin Attribution
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { BlockSourceDetection } from './types';

export function detectBlockSource(
  robotsTxtContent: string = '',
  headers: Record<string, string> = {}
): BlockSourceDetection {
  const evidence: string[] = [];
  const lowerRobots = robotsTxtContent.toLowerCase();
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), (v || '').toLowerCase()])
  );

  // 1. Check Cloudflare-managed signatures
  const isCloudflareServer = lowerHeaders['server']?.includes('cloudflare') || lowerHeaders['cf-ray'] !== undefined;
  const hasCloudflareMitigated = lowerHeaders['cf-mitigated'] !== undefined;
  const hasCfChallenge = lowerHeaders['cf-chl-bypass'] !== undefined || lowerRobots.includes('cloudflare');

  // Cloudflare automated AI crawl block feature creates a distinct block section
  const hasCloudflareBotSection = lowerRobots.includes('# cloudflare') ||
    (isCloudflareServer && lowerRobots.includes('user-agent: ccbot') && lowerRobots.includes('user-agent: gptbot'));

  if (hasCloudflareMitigated || (isCloudflareServer && hasCloudflareBotSection)) {
    if (hasCloudflareMitigated) evidence.push('Detected Cloudflare WAF mitigation header (cf-mitigated: challenge).');
    if (isCloudflareServer) evidence.push('Edge response is served through Cloudflare proxy network.');
    if (hasCloudflareBotSection) evidence.push('Robots.txt contains AI crawler clustering characteristic of Cloudflare AI Scrape Shield.');

    return {
      detectedPattern: 'Cloudflare AI Scrape Shield / Managed Bot Rule',
      likelyOrigin: 'Cloudflare',
      confidence: hasCloudflareMitigated ? 'HIGH' : 'MEDIUM',
      evidence,
      suggestedAction: 'Check Cloudflare Dashboard > Security > Bots > "Block AI Scrapers and Crawlers" toggle or WAF Custom Rules.'
    };
  }

  // 2. Check Squarespace signatures
  const isSquarespace = lowerRobots.includes('squarespace') || 
    lowerHeaders['server']?.includes('squarespace') ||
    (lowerRobots.includes('disallow: /config') && lowerRobots.includes('disallow: /search') && lowerRobots.includes('/*?author='));

  if (isSquarespace) {
    if (lowerRobots.includes('squarespace')) evidence.push('Explicit Squarespace identification comment found in robots.txt.');
    if (lowerHeaders['server']?.includes('squarespace')) evidence.push('Server response header identifies Squarespace infrastructure.');
    if (lowerRobots.includes('disallow: /config')) evidence.push('Standard Squarespace system paths (/config, /search) present.');

    return {
      detectedPattern: 'Squarespace Native Crawl Directive Template',
      likelyOrigin: 'Squarespace',
      confidence: (lowerRobots.includes('squarespace') || lowerHeaders['server']?.includes('squarespace')) ? 'HIGH' : 'MEDIUM',
      evidence,
      suggestedAction: 'Review Squarespace Settings > Crawlers or Advanced SEO settings to verify CCBot access preferences.'
    };
  }

  // 3. Check WordPress / Yoast / Rank Math / AIOSEO signatures
  const isYoast = lowerRobots.includes('yoast seo') || lowerRobots.includes('yoast.com');
  const isRankMath = lowerRobots.includes('rank math') || lowerRobots.includes('rankmath');
  const isWp = lowerRobots.includes('/wp-admin/') || lowerRobots.includes('/wp-includes/');

  if (isYoast || isRankMath || isWp) {
    if (isYoast) evidence.push('Robots.txt header indicates Yoast SEO WordPress plugin generator.');
    if (isRankMath) evidence.push('Robots.txt header indicates Rank Math SEO WordPress plugin generator.');
    if (isWp) evidence.push('WordPress administrative path directives (/wp-admin/) detected.');

    return {
      detectedPattern: 'WordPress CMS / SEO Plugin Configuration',
      likelyOrigin: 'WordPress/CMS',
      confidence: (isYoast || isRankMath) ? 'HIGH' : 'MEDIUM',
      evidence,
      suggestedAction: 'Review WordPress SEO plugin settings (Yoast, Rank Math, or robots.txt file editor) or root robots.txt.'
    };
  }

  // 4. Check Known Community AI Blocklists (e.g. Dark Visitors, ai.robots.txt)
  const isDarkVisitors = lowerRobots.includes('dark visitors') || lowerRobots.includes('darkvisitors.com');
  const isAiRobotsTxt = lowerRobots.includes('ai.robots.txt') || lowerRobots.includes('ai-robots');
  const isBulkAiList = (
    lowerRobots.includes('user-agent: ccbot') &&
    lowerRobots.includes('user-agent: gptbot') &&
    lowerRobots.includes('user-agent: claudebot') &&
    lowerRobots.includes('user-agent: anthropic-ai') &&
    lowerRobots.includes('user-agent: bytepider')
  );

  if (isDarkVisitors || isAiRobotsTxt || isBulkAiList) {
    if (isDarkVisitors) evidence.push('Direct Dark Visitors signature block identified in robots.txt.');
    if (isAiRobotsTxt) evidence.push('Community ai.robots.txt header comment present.');
    if (isBulkAiList) evidence.push('Bulk AI crawler blocklist pattern matching Dark Visitors / community template.');

    return {
      detectedPattern: 'Standardized Community AI Crawler Blocklist',
      likelyOrigin: 'Known Blocklist',
      confidence: (isDarkVisitors || isAiRobotsTxt) ? 'HIGH' : 'MEDIUM',
      evidence,
      suggestedAction: 'Inspect web server or CMS integration for automated blocklist syndication scripts like Dark Visitors.'
    };
  }

  // 5. Custom directive present
  if (lowerRobots.includes('user-agent: ccbot') || lowerRobots.includes('disallow: /')) {
    evidence.push('Custom Disallow rule matching CCBot or wildcard user-agent found in robots.txt.');
    return {
      detectedPattern: 'Custom Webmaster Robots Directive',
      likelyOrigin: 'Custom Rule',
      confidence: 'MEDIUM',
      evidence,
      suggestedAction: 'Review custom server configuration or manual robots.txt edits deployed to website root.'
    };
  }

  // 6. No conclusive attribution
  return {
    detectedPattern: 'Block source could not be determined.',
    likelyOrigin: 'Undetermined',
    confidence: 'LOW',
    evidence: ['No recognized CDN, CMS plugin, or community blocklist signatures matched the observed records.'],
    suggestedAction: 'Investigate web server configuration files (nginx.conf, .htaccess) or edge CDN rules manually.'
  };
}
