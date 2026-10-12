import { testRobotsTxt, RobotsTestResult } from './robotsService.js';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from './robotsParser.js';
import { FetchRenderRobotsInfo } from './fetchRenderTypes.js';

export async function checkRobotsTxtCrawlability(
  pageUrl: string,
  userAgentToken: string,
  respectRobots: boolean
): Promise<FetchRenderRobotsInfo> {
  try {
    const urlObj = new URL(pageUrl);
    const testRes: RobotsTestResult = await testRobotsTxt({
      websiteUrl: urlObj.origin,
      path: urlObj.pathname + urlObj.search,
      userAgent: userAgentToken,
      mode: 'live'
    });

    let fetchStatus: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN' | 'ERROR' = 'UNKNOWN';
    let blockedMainUrl = false;

    if (testRes.robotsTxt.fetchStatus === 'NOT_FOUND') {
      // RFC 9309 Section 2.3.1.2: A 404 response means no restrictions apply (Allowed)
      fetchStatus = 'ALLOWED';
    } else if (testRes.robotsTxt.fetchStatus === 'SERVER_ERROR' || testRes.robotsTxt.fetchStatus === 'FETCH_ERROR') {
      // 5xx or fetch failure: Search engines treat server errors on robots.txt as fail-closed or temporary halt
      fetchStatus = 'UNKNOWN';
    } else if (testRes.result.status === 'ALLOWED') {
      fetchStatus = 'ALLOWED';
    } else if (testRes.result.status === 'BLOCKED') {
      fetchStatus = 'DISALLOWED';
      if (respectRobots) {
        blockedMainUrl = true;
      }
    } else {
      fetchStatus = 'UNKNOWN';
    }

    return {
      url: testRes.robotsTxt.url,
      fetchStatus,
      applicableRule: testRes.result.appliedRule,
      explanation: testRes.result.explanation,
      statusCode: testRes.robotsTxt.statusCode,
      respectRobotsEnabled: respectRobots,
      blockedMainUrl
    };
  } catch (err: any) {
    return {
      url: `${new URL(pageUrl).origin}/robots.txt`,
      fetchStatus: 'UNKNOWN',
      explanation: `Could not retrieve or evaluate robots.txt: ${err.message}`,
      statusCode: null,
      respectRobotsEnabled: respectRobots,
      blockedMainUrl: false
    };
  }
}

/**
 * Checks a specific subresource URL against robots.txt rules.
 */
export function checkSubresourceRobotsPolicy(
  subresourceUrl: string,
  robotsTxtContent: string,
  userAgentToken: string
): { isAllowed: boolean; status: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN'; ruleSummary?: string } {
  try {
    if (!robotsTxtContent) {
      return { isAllowed: true, status: 'ALLOWED', ruleSummary: 'No robots.txt restrictions' };
    }

    const subUrlObj = new URL(subresourceUrl);
    const parsed = parseRobotsTxt(robotsTxtContent);
    const { rules, matchedToken } = selectRulesForUserAgent(parsed.groups, userAgentToken);
    const match = evaluateCrawlability(rules, subUrlObj.pathname + subUrlObj.search, userAgentToken, matchedToken);

    if (match.status === 'BLOCKED') {
      return {
        isAllowed: false,
        status: 'DISALLOWED',
        ruleSummary: match.appliedRule ? `Disallowed by rule: ${match.appliedRule.originalText}` : 'Disallowed'
      };
    }

    if (match.status === 'ALLOWED') {
      return {
        isAllowed: true,
        status: 'ALLOWED',
        ruleSummary: match.appliedRule ? `Allowed by rule: ${match.appliedRule.originalText}` : 'Allowed'
      };
    }

    return { isAllowed: false, status: 'UNKNOWN', ruleSummary: 'Unknown crawlability' };
  } catch {
    return { isAllowed: true, status: 'UNKNOWN', ruleSummary: 'Evaluation error' };
  }
}
