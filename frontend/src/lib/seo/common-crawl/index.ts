/**
 * Common Crawl Visibility Checker — Master Audit Engine
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { CommonCrawlAuditReport, ScopeSetting } from './types';
import { normalizeTargetInput } from './commonCrawlClient';
import { getLatestCrawlCollections } from './collectionService';
import { analyzeDomainMonthlyVisibility, computeTrendSummary } from './domainAnalysisService';
import { analyzePageCaptureHistory } from './pageHistoryService';
import { analyzeHistoricalRobots } from './robotsHistoryService';
import { runLiveCrawlerProbes } from './liveProbeService';
import { detectBlockSource } from './blockSourceDetector';
import { computeOverallStatus, generateTechnicalRecommendations } from './diagnosticsEngine';
import { safeFetch } from '../safeFetch';
import { discoverSitemapUrl, compareSitemapWithCollection } from './sitemapService';

export interface AuditRunOptions {
  input: string;
  scope?: ScopeSetting;
  limitCollections?: number;
}

export async function runCommonCrawlAudit(options: AuditRunOptions): Promise<CommonCrawlAuditReport> {
  const { input, scope = 'include_www', limitCollections = 12 } = options;

  // 1. Normalize input
  const { normalized, hostname, isPage } = normalizeTargetInput(input);
  const mode = isPage ? 'page' : 'domain';

  // 2. Discover published collections
  const collections = await getLatestCrawlCollections(limitCollections);

  // 3. Run core audits: Monthly visibility & Live probes in parallel
  const [monthlyRecords, liveProbes] = await Promise.all([
    analyzeDomainMonthlyVisibility(collections, hostname, scope),
    runLiveCrawlerProbes(normalized)
  ]);

  // 4. Historical robots analysis (utilizing robots records identified during coverage)
  const robotsAudit = await analyzeHistoricalRobots(collections, hostname, monthlyRecords);

  // 4. Compute trend summary
  const trendSummary = computeTrendSummary(monthlyRecords);

  // 5. If page mode, run page capture history
  let pageHistoryResult = undefined;
  if (isPage) {
    pageHistoryResult = await analyzePageCaptureHistory(collections, normalized);
  }

  // 6. Fetch live robots.txt for block source attribution
  let liveRobotsTxt = '';
  let liveRobotsHeaders: Record<string, string> = {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const robotsRes = await fetch(`https://${hostname}/robots.txt`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);
    if (robotsRes.ok) {
      liveRobotsTxt = await robotsRes.text();
      robotsRes.headers.forEach((val, key) => {
        liveRobotsHeaders[key.toLowerCase()] = val;
      });
    }
  } catch {
    // If live fetch fails, fallback to most recent archived robots.txt
    const recentArchived = robotsAudit.records.find(r => r.rawExcerpt);
    liveRobotsTxt = recentArchived?.rawExcerpt || '';
  }

  // 7. Detect block source
  const blockSource = detectBlockSource(liveRobotsTxt, liveRobotsHeaders);

  // 8. Overall diagnostic status
  const overall = computeOverallStatus(monthlyRecords, robotsAudit.records, liveProbes);

  // 9. Auto-detect sitemap & run initial coverage against latest collection
  let sitemapCoverage = undefined;
  try {
    const discoveredSitemap = await discoverSitemapUrl(hostname);
    if (discoveredSitemap && collections.length > 0) {
      const latestCol = collections[0];
      const capturedUrls = monthlyRecords[0]?.urls?.map(u => u.url) || [];
      sitemapCoverage = await compareSitemapWithCollection(
        discoveredSitemap,
        latestCol.cdxApi,
        latestCol.id,
        capturedUrls
      );
    }
  } catch (sitemapErr: any) {
    console.warn('[Audit] Auto sitemap discovery failed or timed out:', sitemapErr.message);
  }

  // 10. Generate recommendations
  const recommendations = generateTechnicalRecommendations(
    monthlyRecords,
    robotsAudit.records,
    liveProbes,
    blockSource
  );

  // 10. Data transparency and limitations
  const limitations = [
    'Common Crawl is an open web dataset that samples web pages across crawl collections. Absence from Common Crawl does not imply absence from Google Search or other search engines.',
    'Common Crawl captures raw HTTP server responses without executing heavy client-side JavaScript.',
    'CCBot user-agent probes are served from our server network and do not guarantee identical results from authentic Common Crawl crawler IP addresses.',
    'Presence in Common Crawl records does not guarantee inclusion in any specific commercial AI model training dataset.'
  ];

  return {
    target: input,
    normalizedUrl: normalized,
    hostname,
    mode,
    scope,
    analyzedAt: new Date().toISOString(),
    overallStatus: overall.status,
    overallStatusLabel: overall.label,
    overallStatusSummary: overall.summary,
    monthlyTrend: monthlyRecords,
    trendSummary,
    robotsHistory: robotsAudit.records,
    historicalChangeObservation: robotsAudit.firstObservedChangeText,
    blockSource,
    liveProbes,
    sitemapCoverage,
    pageHistory: pageHistoryResult,
    recommendations,
    limitations
  };
}

