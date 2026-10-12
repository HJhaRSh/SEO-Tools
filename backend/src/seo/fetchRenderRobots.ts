import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from './robotsParser.js';
import { safeFetch } from './safeFetch.js';
import { FetchRenderRobotsInfo } from './fetchRenderTypes.js';

export interface CheckRobotsOptions {
  allowLocalhostForTesting?: boolean;
}

/**
 * Checks robots.txt crawlability for the main URL according to RFC 9309 rules.
 */
export async function checkRobotsTxtCrawlability(
  pageUrl: string,
  userAgentToken: string,
  respectRobots: boolean,
  allowLocalhostForTesting = false
): Promise<FetchRenderRobotsInfo & { robotsTxtContent?: string }> {
  try {
    const urlObj = new URL(pageUrl);
    const robotsTxtUrl = `${urlObj.origin}/robots.txt`;

    let fetchRes: any;
    try {
      fetchRes = await safeFetch(robotsTxtUrl, {
        userAgent: userAgentToken,
        timeoutMs: 5000,
        maxBytes: 512 * 1024,
        allowLocalhostForTesting
      });
    } catch (networkErr: any) {
      // Network failure, DNS failure, or timeout
      return {
        url: robotsTxtUrl,
        fetchStatus: 'TEMPORARY_UNAVAILABLE',
        crawlabilityStatus: 'UNKNOWN',
        explanation: `robots.txt could not be fetched due to network/timeout error: ${networkErr.message}. Crawlers treat this as temporary unavailable (RFC 9309).`,
        statusCode: null,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: false
      };
    }

    const statusCode = fetchRes.statusCode;

    // RFC 9309 Section 2.3.1.2: 404 / 410 -> Permanent Unavailable -> Content is Allowed
    if (statusCode === 404 || statusCode === 410) {
      return {
        url: robotsTxtUrl,
        fetchStatus: 'PERMANENT_UNAVAILABLE',
        crawlabilityStatus: 'ALLOWED',
        applicableRule: null,
        explanation: `robots.txt returned HTTP ${statusCode} (Not Found). RFC 9309 Section 2.3.1.2 defines that crawlers may assume all content on this site is accessible.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: false,
        robotsTxtContent: ''
      };
    }

    // RFC 9309 Section 2.3.1.1: 401 / 403 -> Unauthorized / Forbidden -> Content is Disallowed
    if (statusCode === 401 || statusCode === 403) {
      return {
        url: robotsTxtUrl,
        fetchStatus: 'DISALLOWED',
        crawlabilityStatus: 'DISALLOWED',
        applicableRule: null,
        explanation: `robots.txt returned HTTP ${statusCode} (Access Denied). RFC 9309 Section 2.3.1.1 specifies that if access to robots.txt is denied, crawlers must treat access to all resources as disallowed.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: respectRobots,
        robotsTxtContent: ''
      };
    }

    // RFC 9309 Section 2.3.1.3: 5xx -> Server Error -> Temporary Unavailable -> Fail-Closed / Unknown
    if (statusCode >= 500 && statusCode < 600) {
      return {
        url: robotsTxtUrl,
        fetchStatus: 'TEMPORARY_UNAVAILABLE',
        crawlabilityStatus: 'UNKNOWN',
        applicableRule: null,
        explanation: `robots.txt returned server error (HTTP ${statusCode}). RFC 9309 Section 2.3.1.3 states crawlers treat 5xx responses as temporary crawl delay or temporary halt.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: false,
        robotsTxtContent: fetchRes.body || ''
      };
    }

    // 2xx -> Parse and Evaluate
    const rawContent = fetchRes.body || '';
    const parsed = parseRobotsTxt(rawContent);
    const { rules, matchedToken } = selectRulesForUserAgent(parsed.groups, userAgentToken);
    const testPath = urlObj.pathname + urlObj.search;
    const match = evaluateCrawlability(rules, testPath, userAgentToken, matchedToken);

    let fetchStatus: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN' = 'ALLOWED';
    let blockedMainUrl = false;

    if (match.status === 'BLOCKED') {
      fetchStatus = 'DISALLOWED';
      if (respectRobots) {
        blockedMainUrl = true;
      }
    } else if (match.status === 'ALLOWED') {
      fetchStatus = 'ALLOWED';
    } else {
      fetchStatus = 'UNKNOWN';
    }

    return {
      url: robotsTxtUrl,
      fetchStatus,
      crawlabilityStatus: fetchStatus,
      applicableRule: match.appliedRule ? {
        type: match.appliedRule.type,
        pattern: match.appliedRule.pattern,
        lineNumber: match.appliedRule.lineNumber,
        originalText: match.appliedRule.originalText
      } : null,
      explanation: match.explanation,
      statusCode,
      respectRobotsEnabled: respectRobots,
      blockedMainUrl,
      robotsTxtContent: rawContent
    };
  } catch (err: any) {
    return {
      url: `${new URL(pageUrl).origin}/robots.txt`,
      fetchStatus: 'UNKNOWN',
      crawlabilityStatus: 'UNKNOWN',
      explanation: `Could not evaluate robots.txt: ${err.message}`,
      statusCode: null,
      respectRobotsEnabled: respectRobots,
      blockedMainUrl: false
    };
  }
}

/**
 * Manager to evaluate subresources across multiple origins with bounded caching (max 10 origins).
 */
export class SubresourceRobotsManager {
  private mainOrigin: string;
  private userAgentToken: string;
  private allowLocalhost: boolean;
  private originPolicies = new Map<string, {
    status: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN';
    rules: any[];
    matchedToken: string;
  }>();
  private originFetchCount = 0;
  private maxOrigins = 10;

  constructor(
    mainOrigin: string,
    mainRobotsContent: string | undefined,
    userAgentToken: string,
    allowLocalhost = false
  ) {
    this.mainOrigin = mainOrigin.toLowerCase();
    this.userAgentToken = userAgentToken;
    this.allowLocalhost = allowLocalhost;

    if (mainRobotsContent && mainRobotsContent.trim()) {
      try {
        const parsed = parseRobotsTxt(mainRobotsContent);
        const { rules, matchedToken } = selectRulesForUserAgent(parsed.groups, userAgentToken);
        this.originPolicies.set(this.mainOrigin, {
          status: 'ALLOWED',
          rules,
          matchedToken
        });
      } catch {
        this.originPolicies.set(this.mainOrigin, {
          status: 'ALLOWED',
          rules: [],
          matchedToken: '*'
        });
      }
    }
  }

  /**
   * Manually prime/cache an origin's policy (used by deterministic tests or known origins).
   */
  setOriginRobots(origin: string, robotsContent: string) {
    const cleanOrigin = origin.toLowerCase();
    try {
      const parsed = parseRobotsTxt(robotsContent);
      const { rules, matchedToken } = selectRulesForUserAgent(parsed.groups, this.userAgentToken);
      this.originPolicies.set(cleanOrigin, {
        status: 'ALLOWED',
        rules,
        matchedToken
      });
    } catch {
      this.originPolicies.set(cleanOrigin, {
        status: 'ALLOWED',
        rules: [],
        matchedToken: '*'
      });
    }
  }

  async checkSubresource(subresourceUrl: string): Promise<{
    isAllowed: boolean;
    status: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN';
    ruleSummary?: string;
  }> {
    try {
      const subUrlObj = new URL(subresourceUrl);
      const origin = subUrlObj.origin.toLowerCase();

      let cached = this.originPolicies.get(origin);
      if (!cached) {
        if (this.originFetchCount >= this.maxOrigins) {
          // Bounded origin limit reached: allow request rather than blocking
          return { isAllowed: true, status: 'ALLOWED', ruleSummary: 'Origin evaluation bound reached' };
        }

        this.originFetchCount++;
        try {
          const fetchRes = await safeFetch(`${origin}/robots.txt`, {
            userAgent: this.userAgentToken,
            timeoutMs: 3000,
            maxBytes: 128 * 1024,
            allowLocalhostForTesting: this.allowLocalhost
          });

          if (fetchRes.statusCode === 200 && fetchRes.body) {
            const parsed = parseRobotsTxt(fetchRes.body);
            const { rules, matchedToken } = selectRulesForUserAgent(parsed.groups, this.userAgentToken);
            cached = { status: 'ALLOWED', rules, matchedToken };
          } else {
            // 404 or other non-200 on cross-origin: allow subresource
            cached = { status: 'ALLOWED', rules: [], matchedToken: '*' };
          }
        } catch {
          // If cross-origin robots.txt fails or times out: allow subresource
          cached = { status: 'ALLOWED', rules: [], matchedToken: '*' };
        }
        this.originPolicies.set(origin, cached);
      }

      if (cached.rules && cached.rules.length > 0) {
        const pathAndQuery = subUrlObj.pathname + subUrlObj.search;
        const match = evaluateCrawlability(cached.rules, pathAndQuery, this.userAgentToken, cached.matchedToken);
        if (match.status === 'BLOCKED') {
          return {
            isAllowed: false,
            status: 'DISALLOWED',
            ruleSummary: match.appliedRule ? `Disallowed by rule: ${match.appliedRule.originalText}` : 'Disallowed by robots.txt'
          };
        }
      }

      return { isAllowed: true, status: 'ALLOWED', ruleSummary: 'Allowed by robots.txt' };
    } catch {
      return { isAllowed: true, status: 'UNKNOWN', ruleSummary: 'Evaluation error' };
    }
  }
}

/**
 * Directly evaluates a subresource URL against provided robots.txt content.
 */
export function checkSubresourceRobotsPolicy(
  subresourceUrl: string,
  robotsTxtContent: string,
  userAgentToken: string
): { isAllowed: boolean; status: 'ALLOWED' | 'DISALLOWED' | 'UNKNOWN'; ruleSummary?: string } {
  try {
    if (!robotsTxtContent || !robotsTxtContent.trim()) {
      return { isAllowed: true, status: 'ALLOWED', ruleSummary: 'No robots.txt restrictions' };
    }
    const subUrlObj = new URL(subresourceUrl);
    const parsed = parseRobotsTxt(robotsTxtContent);
    const { rules, matchedToken } = selectRulesForUserAgent(parsed.groups, userAgentToken);
    const pathAndQuery = subUrlObj.pathname + subUrlObj.search;
    const match = evaluateCrawlability(rules, pathAndQuery, userAgentToken, matchedToken);

    if (match.status === 'BLOCKED') {
      return {
        isAllowed: false,
        status: 'DISALLOWED',
        ruleSummary: match.appliedRule ? `Disallowed by rule: ${match.appliedRule.originalText}` : 'Disallowed by robots.txt'
      };
    }
    return { isAllowed: true, status: 'ALLOWED', ruleSummary: 'Allowed' };
  } catch {
    return { isAllowed: true, status: 'UNKNOWN', ruleSummary: 'Evaluation error' };
  }
}

