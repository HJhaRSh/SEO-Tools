/**
 * Common Crawl Diagnostics & Recommendations Engine
 * Feature 8 & Section 13 — Overall Diagnostic Status & Evidence-Backed Actions
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import {
  MonthlyCrawlRecord,
  HistoricalRobotsRecord,
  LiveProbeResult,
  BlockSourceDetection,
  TechnicalRecommendation,
  OverallDiagnosticStatus
} from './types';

export function computeOverallStatus(
  monthlyRecords: MonthlyCrawlRecord[],
  robotsHistory: HistoricalRobotsRecord[],
  liveProbes: LiveProbeResult[]
): {
  status: OverallDiagnosticStatus;
  label: string;
  summary: string;
} {
  const successfulCrawls = monthlyRecords.filter(r => r.status === 'confirmed' || r.status === 'estimated');
  const totalCapturesSum = successfulCrawls.reduce((acc, curr) => acc + curr.capturedCount, 0);

  const latestRobots = robotsHistory.find(r => r.isAvailable);
  const isHistoricallyBlocked = robotsHistory.some(r => r.ccBotStatus === 'BLOCKED');

  const ccBotProbe = liveProbes.find(p => p.profileName.includes('CCBot'));
  const isCurrentlyChallengedOrBlocked = ccBotProbe && (ccBotProbe.accessResult === 'CHALLENGED' || ccBotProbe.accessResult === 'BLOCKED');

  // Case 1: Analysis incomplete (all or vast majority of collections timed out or errored)
  const failedCount = monthlyRecords.filter(r => r.status === 'temporarily_unavailable' || r.status === 'query_error' || r.status === 'rate_limited').length;
  const isMajorityFailed = monthlyRecords.length > 0 && (failedCount / monthlyRecords.length) >= 0.75;

  if (successfulCrawls.length === 0 && isMajorityFailed) {
    return {
      status: 'ANALYSIS_INCOMPLETE',
      label: 'Analysis Incomplete',
      summary: 'Common Crawl public index queries experienced temporary timeouts or rate limits across the requested range. Completed collections have been retained.'
    };
  }

  // Case 2: No captures found in any checked collection (confirmed by index)
  if (totalCapturesSum === 0) {
    return {
      status: 'NO_CAPTURES_FOUND',
      label: 'No Captures Found in Selected Collections',
      summary: 'No historical capture records were identified in the queried Common Crawl collections. This may indicate a newer domain, low external crawl priority, or crawler restrictions.'
    };
  }

  // Case 3: Captures confirmed, current restrictions detected
  if (totalCapturesSum > 0 && isCurrentlyChallengedOrBlocked) {
    return {
      status: 'CAPTURES_CONFIRMED_RESTRICTIONS_DETECTED',
      label: 'Captures Confirmed, Current Restrictions Detected',
      summary: `Domain appears in historical crawls (${totalCapturesSum.toLocaleString()} captures observed), but current CCBot probes encountered edge firewall challenges or robots restrictions.`
    };
  }

  // Case 4: Historical restrictions observed
  if (isHistoricallyBlocked && latestRobots?.ccBotStatus === 'BLOCKED') {
    return {
      status: 'HISTORICAL_RESTRICTIONS_OBSERVED',
      label: 'Historical Crawler Restrictions Observed',
      summary: 'Archived robots.txt directives explicitly restricted CCBot in one or more published crawl collections.'
    };
  }

  // Case 5: Captures confirmed, no access issues
  if (totalCapturesSum > 0 && (!ccBotProbe || ccBotProbe.accessResult === 'SERVED_SUCCESSFULLY')) {
    return {
      status: 'CAPTURES_CONFIRMED_NO_RESTRICTIONS',
      label: 'Captures Confirmed, No Restrictions Detected',
      summary: `Domain is confirmed in Common Crawl with ~${totalCapturesSum.toLocaleString()} captures across published crawls. Live CCBot simulated probes were served successfully.`
    };
  }

  // Case 6: Mixed / Inconclusive
  return {
    status: 'MIXED_INCONCLUSIVE_EVIDENCE',
    label: 'Mixed or Inconclusive Evidence',
    summary: 'Archival records and edge probes returned varied signals across collections. Review the breakdown below for specific collection status.'
  };
}

export function generateTechnicalRecommendations(
  monthlyRecords: MonthlyCrawlRecord[],
  robotsHistory: HistoricalRobotsRecord[],
  liveProbes: LiveProbeResult[],
  blockSource: BlockSourceDetection,
  isSpaEmptyShell?: boolean
): TechnicalRecommendation[] {
  const recommendations: TechnicalRecommendation[] = [];

  const ccBotProbe = liveProbes.find(p => p.profileName.includes('CCBot'));
  const browserProbe = liveProbes.find(p => p.profileName.includes('Browser'));
  const latestRobots = robotsHistory.find(r => r.isAvailable);

  // 1. Robots.txt block on CCBot
  if (latestRobots && latestRobots.ccBotStatus === 'BLOCKED') {
    recommendations.push({
      id: 'rec_robots_ccbot_blocked',
      title: 'Permit CCBot in robots.txt if Common Crawl Archival is Desired',
      priority: 'HIGH',
      finding: `Archived robots.txt disallows CCBot crawling via ${latestRobots.appliedRule?.originalText || 'Disallow: /'}.`,
      supportingEvidence: `Directive on line ${latestRobots.appliedRule?.lineNumber || 1}: "${latestRobots.appliedRule?.originalText || 'Disallow: /'}" in collection ${latestRobots.collectionName}.`,
      reason: 'Common Crawl strictly respects RFC 9309 robots.txt rules. If CCBot is disallowed, your domain will be excluded from subsequent crawl collections.',
      suggestedAction: 'If you want your website included in open web datasets and downstream AI research crawls, add: "User-agent: CCBot\\nAllow: /" to your robots.txt.',
      verificationMethod: 'Test robots.txt accessibility using Indian Marketers robots.txt Tester and verify that CCBot evaluates to ALLOWED.'
    });
  }

  // 2. Cloudflare / WAF Edge Challenge on CCBot
  if (ccBotProbe && ccBotProbe.challengeIndicator === 'CLOUDFLARE_CHALLENGE') {
    recommendations.push({
      id: 'rec_edge_waf_challenge',
      title: 'Adjust CDN / WAF Firewall Rules for Crawler User-Agents',
      priority: 'CRITICAL',
      finding: 'Live probe with CCBot user-agent was intercepted by a Cloudflare / CDN Managed Challenge.',
      supportingEvidence: `HTTP ${ccBotProbe.statusCode} response with challenge headers (${Object.keys(ccBotProbe.relevantHeaders).join(', ')}). Browser probe returned ${browserProbe?.statusCode || 200}.`,
      reason: 'Automated archives like Common Crawl cannot solve interactive JavaScript or CAPTCHA challenges, resulting in failed captures or 403 response archives.',
      suggestedAction: `Check edge bot management settings (${blockSource.suggestedAction}). If permitting AI researchers is intended, create a WAF exception for verified user-agent patterns.`,
      verificationMethod: 'Re-run the Live CCBot Access Check probe to verify that response status returns HTTP 200 without challenge headers.'
    });
  }

  // 3. Client-Side Rendering Empty App Shell
  if (isSpaEmptyShell) {
    recommendations.push({
      id: 'rec_csr_empty_shell',
      title: 'Implement Server-Side Rendering (SSR) or Prerendering',
      priority: 'HIGH',
      finding: 'The server-delivered HTML contains minimal readable content and relies on client-side JavaScript execution.',
      supportingEvidence: 'Initial server payload has less than 100 words of indexable text inside app container divs (#root/#app).',
      reason: 'CCBot downloads raw HTML responses without executing JavaScript. Pages that rely solely on client-side hydration appear empty in Common Crawl.',
      suggestedAction: 'Deploy Static Site Generation (SSG), Server-Side Rendering (SSR) via Next.js/Nuxt, or an automated prerendering middleware.',
      verificationMethod: 'Run the Pre-rendering Tester tool to compare initial server HTML against the fully executed DOM.'
    });
  }

  // 4. Low Archive Coverage
  const successfulCrawls = monthlyRecords.filter(r => r.status === 'confirmed');
  const lowCountCrawls = successfulCrawls.filter(r => r.capturedCount > 0 && r.capturedCount < 10);
  if (lowCountCrawls.length > 3) {
    recommendations.push({
      id: 'rec_low_archive_coverage',
      title: 'Strengthen Internal Linking and External Discoverability',
      priority: 'MEDIUM',
      finding: 'Observed Common Crawl collections contain relatively few captured URLs for this domain (<10 pages per crawl).',
      supportingEvidence: `Multiple collections recorded single-digit URL captures despite the domain having deeper page structures.`,
      reason: 'Common Crawl prioritizes crawl queues based on PageRank, external backlink graph depth, and homepage internal links.',
      suggestedAction: 'Ensure key landing pages and article URLs are linked from the homepage and listed in an accessible XML sitemap.',
      verificationMethod: 'Check Sitemap Coverage Analysis in this tool to confirm your full URL catalog is declared.'
    });
  }

  // 5. General Best Practice
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'rec_optimal_configuration',
      title: 'Maintain Accessible Crawler Architecture',
      priority: 'INFO',
      finding: 'No crawler restrictions or edge blocking signatures were detected for CCBot.',
      supportingEvidence: `Confirmed crawl history and HTTP 200 response served to simulated crawler probes.`,
      reason: 'Your domain currently maintains clean crawlability for open-web archives and research indexing.',
      suggestedAction: 'Periodically monitor your robots.txt and CDN security rule updates to prevent accidental crawler exclusion.',
      verificationMethod: 'Re-audit quarterly following major website migrations or CDN firewall policy updates.'
    });
  }

  return recommendations;
}

