/**
 * Common Crawl Historical Robots.txt Analysis Service
 * Feature 2 — Historical Robots.txt Retrieval & RFC 9309 Policy Evaluation
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { CrawlCollection, HistoricalRobotsRecord } from './types';
import { queryCdxIndex } from './commonCrawlClient';
import { fetchWarcRecord } from './warcReader';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from '../robotsParser';
import { formatCdxTimestamp } from './domainAnalysisService';

/**
 * Evaluates robots.txt content for CCBot and wildcard crawler
 */
export function evaluateRobotsContentForCCBot(content: string): {
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
  
  // 1. Evaluate CCBot specifically
  const ccBotRules = selectRulesForUserAgent(parsed.groups, 'ccbot');
  const ccBotMatch = evaluateCrawlability(ccBotRules.rules, '/', 'CCBot', ccBotRules.matchedToken);

  // 2. Evaluate Wildcard '*'
  const wildcardRules = selectRulesForUserAgent(parsed.groups, '*');
  const wildcardMatch = evaluateCrawlability(wildcardRules.rules, '/', '*', '*');

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

const HA_ROBOTS_ENDPOINT = 'https://cc-visibility.suganmn.workers.dev/api/robots';

/**
 * Analyzes historical robots.txt across collections
 */
export async function analyzeHistoricalRobots(
  collections: CrawlCollection[],
  hostname: string,
  monthlyRecords?: Array<{ collectionId: string; robots?: any[] }>
): Promise<{
  records: HistoricalRobotsRecord[];
  firstObservedChangeText?: string;
}> {
  const records: HistoricalRobotsRecord[] = [];
  const cleanHost = hostname.toLowerCase().replace(/^www\./, '');

  // 1. Try High-Availability Robots Decoding If Coverage Already Identified Robots Pointers
  try {
    const needFetches: any[] = [];
    const crawlByDigest = new Map<string, { colId: string; colName: string; ts?: string }>();

    if (monthlyRecords && monthlyRecords.length > 0) {
      for (const mr of monthlyRecords) {
        if (Array.isArray(mr.robots) && mr.robots.length > 0) {
          const col = collections.find(c => c.id === mr.collectionId);
          // Pick the best robots record for this crawl
          const r = mr.robots[0];
          if (r && r.digest) {
            needFetches.push(r);
            crawlByDigest.set(r.digest, {
              colId: mr.collectionId,
              colName: col?.name || mr.collectionId,
              ts: r.ts
            });
          }
        }
      }
    }

    if (needFetches.length > 0) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(HA_ROBOTS_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          domain: cleanHost,
          fetches: needFetches
        })
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const results: any[] = data.results || [];
        const digestMap = new Map<string, any>();
        for (const item of results) {
          if (item && item.digest) {
            digestMap.set(item.digest, item);
          }
        }

        // Map for each collection
        for (const col of collections) {
          const mr = monthlyRecords?.find(m => m.collectionId === col.id);
          const r = mr?.robots?.[0];
          const decoded = r && r.digest ? digestMap.get(r.digest) : undefined;

          if (decoded && decoded.status === 200) {
            const ccBotAllowed = decoded.tokens?.CCBot !== false;
            const starAllowed = decoded.starAllowed !== false;

            records.push({
              collectionId: col.id,
              collectionName: col.name,
              captureDate: formatCdxTimestamp(r?.ts),
              isAvailable: true,
              ccBotStatus: ccBotAllowed ? 'ALLOWED' : 'BLOCKED',
              wildcardStatus: starAllowed ? 'ALLOWED' : 'BLOCKED',
              appliedRule: decoded.rules?.CCBot ? {
                type: decoded.rules.CCBot.toLowerCase().includes('disallow') ? 'disallow' : 'allow',
                pattern: decoded.rules.CCBot,
                lineNumber: 1,
                originalText: decoded.rules.CCBot
              } : null,
              sitemapsCount: decoded.tokens ? 1 : 0,
              rawExcerpt: decoded.excerpt || undefined
            });
          } else {
            records.push({
              collectionId: col.id,
              collectionName: col.name,
              isAvailable: false,
              ccBotStatus: 'UNAVAILABLE',
              wildcardStatus: 'UNAVAILABLE',
              sitemapsCount: 0
            });
          }
        }

        if (records.length > 0) {
          // Detect first observed policy change
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
      }
    }
  } catch (err: any) {
    console.warn('[CommonCrawl] HA robots fetch warning, falling back to direct CDX:', err.message);
  }

  // 2. Fallback to Direct CDX Index Queries
  const robotsQueryUrl = `${cleanHost}/robots.txt`;

  // Query collections in batches of 2
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

            // Fetch actual archived content from WARC
            let robotsContent = '';
            try {
              if (rec.filename && offset >= 0 && length > 0) {
                const warc = await fetchWarcRecord(rec.filename, offset, length, 6000);
                robotsContent = warc.payloadText;
              }
            } catch {
              // If WARC retrieval fails, use index status info
            }

            if (robotsContent) {
              const evalResult = evaluateRobotsContentForCCBot(robotsContent);
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

          // If no captures found or index query was empty
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

