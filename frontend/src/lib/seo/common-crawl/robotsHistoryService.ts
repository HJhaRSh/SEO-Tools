/**
 * Common Crawl Historical Robots.txt Analysis Service
 * Feature 2 — Historical Robots.txt Retrieval & RFC 9309 Policy Evaluation
 * Tool #19 — Indian Marketers SEO Toolkit
 *
 * Fetches and decompresses historical robots.txt directly from official Common Crawl
 * WARC archives on data.commoncrawl.org and evaluates CCBot permissions on relevant paths.
 */

import { CrawlCollection, HistoricalRobotsRecord } from './types';
import { queryCdxIndex } from './commonCrawlClient';
import { fetchWarcRecord } from './warcReader';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from '../robotsParser';
import { formatCdxTimestamp } from './domainAnalysisService';

/**
 * Evaluates robots.txt content for CCBot and wildcard crawler against a specific URL path
 */
export function evaluateRobotsContentForCCBot(
  content: string,
  targetPath: string = '/'
): {
  ccBotStatus: 'ALLOWED' | 'BLOCKED';
  wildcardStatus: 'ALLOWED' | 'BLOCKED';
  appliedRule?: {
    type: 'allow' | 'disallow';
    pattern: string;
    lineNumber: number;
    originalText: string;
  } | null;
  crawlDelay?: number;
  sitemapsCount: number;
  rawExcerpt?: string;
} {
  const parsed = parseRobotsTxt(content);
  const evalPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  
  // 1. Evaluate CCBot specifically
  const ccBotRules = selectRulesForUserAgent(parsed.groups, 'ccbot');
  const ccBotMatch = evaluateCrawlability(ccBotRules.rules, evalPath, 'CCBot', ccBotRules.matchedToken);

  // 2. Evaluate Wildcard '*'
  const wildcardRules = selectRulesForUserAgent(parsed.groups, '*');
  const wildcardMatch = evaluateCrawlability(wildcardRules.rules, evalPath, '*', '*');

  const ccBotStatus = ccBotMatch.status === 'BLOCKED' ? 'BLOCKED' : 'ALLOWED';
  const wildcardStatus = wildcardMatch.status === 'BLOCKED' ? 'BLOCKED' : 'ALLOWED';

  // Extract brief excerpt (up to first 8 lines)
  const lines = content.split(/\r?\n/).slice(0, 8);
  const rawExcerpt = lines.join('\n').trim();

  return {
    ccBotStatus,
    wildcardStatus,
    appliedRule: ccBotMatch.appliedRule ? {
      type: ccBotMatch.appliedRule.type,
      pattern: ccBotMatch.appliedRule.pattern,
      lineNumber: ccBotMatch.appliedRule.lineNumber,
      originalText: ccBotMatch.appliedRule.originalText
    } : null,
    crawlDelay: ccBotRules.crawlDelay,
    sitemapsCount: parsed.sitemaps.length,
    rawExcerpt
  };
}

/**
 * Analyzes historical robots.txt across collections directly from official WARC records
 */
export async function analyzeHistoricalRobots(
  collections: CrawlCollection[],
  hostname: string,
  monthlyRecords?: Array<{ collectionId: string; robots?: any[] }>,
  targetPath: string = '/'
): Promise<{
  records: HistoricalRobotsRecord[];
  firstObservedChangeText?: string;
}> {
  const records: HistoricalRobotsRecord[] = [];
  const cleanHost = hostname.toLowerCase().replace(/^www\./, '');

  // 1. If monthlyRecords identified authentic robots WARC pointers, fetch and decompress from data.commoncrawl.org
  if (monthlyRecords && monthlyRecords.length > 0) {
    for (const col of collections) {
      const mr = monthlyRecords.find(m => m.collectionId === col.id);
      const robotPointer = mr?.robots?.[0];

      if (robotPointer && robotPointer.filename && typeof robotPointer.offset === 'number' && typeof robotPointer.length === 'number') {
        try {
          const warc = await fetchWarcRecord(robotPointer.filename, robotPointer.offset, robotPointer.length, 5000);
          if (warc && warc.payloadText) {
            const evalResult = evaluateRobotsContentForCCBot(warc.payloadText, targetPath);
            records.push({
              collectionId: col.id,
              collectionName: col.name,
              captureDate: formatCdxTimestamp(robotPointer.ts),
              isAvailable: true,
              ccBotStatus: evalResult.ccBotStatus,
              wildcardStatus: evalResult.wildcardStatus,
              appliedRule: evalResult.appliedRule,
              crawlDelay: evalResult.crawlDelay,
              sitemapsCount: evalResult.sitemapsCount,
              rawExcerpt: evalResult.rawExcerpt
            });
            continue;
          }
        } catch {
          // Fall through to unavailable or CDX check
        }
      }

      // If no valid robots pointer or fetch failed
      records.push({
        collectionId: col.id,
        collectionName: col.name,
        isAvailable: false,
        ccBotStatus: 'UNAVAILABLE',
        wildcardStatus: 'UNAVAILABLE',
        sitemapsCount: 0
      });
    }

    // Detect first observed policy change across available historical records
    let firstObservedChangeText: string | undefined = undefined;
    const availableRecords = [...records].filter(r => r.isAvailable).reverse();

    if (availableRecords.length > 1) {
      for (let k = 1; k < availableRecords.length; k++) {
        const prev = availableRecords[k - 1];
        const curr = availableRecords[k];
        if (curr.ccBotStatus !== prev.ccBotStatus) {
          curr.firstObservedChange = true;
          firstObservedChangeText = `First observed change in available records: CCBot status changed from ${prev.ccBotStatus} to ${curr.ccBotStatus} between ${prev.collectionName} (${prev.captureDate || 'undated'}) and ${curr.collectionName} (${curr.captureDate || 'undated'}).`;
          break;
        }
      }
    }

    return { records, firstObservedChangeText };
  }

  // 2. Direct CDX fallback query if monthlyRecords was omitted
  const robotsQueryUrl = `${cleanHost}/robots.txt`;

  for (let i = 0; i < collections.length; i += 2) {
    const chunk = collections.slice(i, i + 2);
    await Promise.all(
      chunk.map(async (col) => {
        try {
          const cdxRes = await queryCdxIndex(col.cdxApi, {
            url: robotsQueryUrl,
            matchType: 'exact',
            fl: 'url,timestamp,status,mime,length,offset,filename',
            limit: 1,
            timeoutMs: 6500
          });

          if (cdxRes.status === 'confirmed' && cdxRes.records.length > 0) {
            const rec = cdxRes.records[0];
            const offset = parseInt(rec.offset, 10);
            const length = parseInt(rec.length, 10);

            let robotsContent = '';
            try {
              if (rec.filename && offset >= 0 && length > 0) {
                const warc = await fetchWarcRecord(rec.filename, offset, length, 6000);
                robotsContent = warc.payloadText;
              }
            } catch {
              // Ignore
            }

            if (robotsContent) {
              const evalResult = evaluateRobotsContentForCCBot(robotsContent, targetPath);
              records.push({
                collectionId: col.id,
                collectionName: col.name,
                captureDate: formatCdxTimestamp(rec.timestamp),
                isAvailable: true,
                ccBotStatus: evalResult.ccBotStatus,
                wildcardStatus: evalResult.wildcardStatus,
                appliedRule: evalResult.appliedRule,
                crawlDelay: evalResult.crawlDelay,
                sitemapsCount: evalResult.sitemapsCount,
                rawExcerpt: evalResult.rawExcerpt
              });
              return;
            }
          }

          records.push({
            collectionId: col.id,
            collectionName: col.name,
            isAvailable: false,
            ccBotStatus: 'UNAVAILABLE',
            wildcardStatus: 'UNAVAILABLE',
            sitemapsCount: 0
          });
        } catch {
          records.push({
            collectionId: col.id,
            collectionName: col.name,
            isAvailable: false,
            ccBotStatus: 'UNAVAILABLE',
            wildcardStatus: 'UNAVAILABLE',
            sitemapsCount: 0
          });
        }
      })
    );
  }

  // Sort chronological order matching collection order
  const collectionOrderMap = new Map(collections.map((c, idx) => [c.id, idx]));
  records.sort((a, b) => (collectionOrderMap.get(a.collectionId) ?? 0) - (collectionOrderMap.get(b.collectionId) ?? 0));

  // Detect first observed policy change in available records
  // Compare chronologically from oldest available to newest available
  let firstObservedChangeText: string | undefined = undefined;
  const availableRecords = [...records].filter(r => r.isAvailable).reverse(); // oldest first

  if (availableRecords.length > 1) {
    for (let k = 1; k < availableRecords.length; k++) {
      const prev = availableRecords[k - 1];
      const curr = availableRecords[k];
      if (curr.ccBotStatus !== prev.ccBotStatus) {
        curr.firstObservedChange = true;
        firstObservedChangeText = `First observed change in available records: CCBot status changed from ${prev.ccBotStatus} to ${curr.ccBotStatus} between ${prev.collectionName} (${prev.captureDate || 'undated'}) and ${curr.collectionName} (${curr.captureDate || 'undated'}).`;
        break;
      }
    }
  }

  return {
    records,
    firstObservedChangeText
  };
}

