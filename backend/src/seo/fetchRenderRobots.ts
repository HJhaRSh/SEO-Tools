import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability } from './robotsParser.js';
import { safeFetch } from './safeFetch.js';
import { FetchRenderRobotsInfo, RobotsClassification, RobotsFailureType } from './fetchRenderTypes.js';

export interface CheckRobotsOptions {
  allowLocalhostForTesting?: boolean;
}

/**
 * Categorizes network and protocol failures into standard diagnostics.
 */
function categorizeRobotsNetworkFailure(err: any): RobotsFailureType {
  const msg = (err?.message || '').toLowerCase();
  const code = (err?.code || '').toLowerCase();
  if (msg.includes('dns') || msg.includes('enotfound') || code === 'enotfound') {
    return 'DNS_FAILURE';
  }
  if (msg.includes('econnrefused') || code === 'econnrefused' || msg.includes('connection refused')) {
    return 'CONNECTION_REFUSED';
  }
  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('etimedout') || code === 'etimedout' || msg.includes('esockettimedout')) {
    return 'TIMEOUT';
  }
  if (msg.includes('tls') || msg.includes('ssl') || msg.includes('cert_') || msg.includes('depth_zero') || msg.includes('handshake')) {
    return 'TLS_ERROR';
  }
  if (msg.includes('redirect') || msg.includes('exceeded maximum redirect')) {
    return 'REDIRECT_ERROR';
  }
  return 'NETWORK_ERROR';
}

/**
 * Checks robots.txt crawlability for the main URL according to RFC 9309 rules.
 * Strictly separates:
 * A. robots.txt HTTP response classification (what the server returned)
 * B. Crawler-specific behavior (what standard crawlers do)
 * C. Tool enforcement policy (whether this tool proceeds when respectRobots=true)
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
      const failureType = categorizeRobotsNetworkFailure(networkErr);
      const isRedirect = failureType === 'REDIRECT_ERROR';
      const classification: RobotsClassification = isRedirect ? 'REDIRECT_ERROR' : 'NETWORK_ERROR';
      const policyReason = respectRobots
        ? `robots.txt could not be retrieved due to ${failureType}: ${networkErr.message}. Crawling halted under conservative crawl policy.`
        : `robots.txt retrieval failed (${failureType}), but Respect robots.txt is disabled (User Override).`;

      return {
        url: robotsTxtUrl,
        classification,
        explicitlyDisallowed: false,
        applicableRule: null,
        crawlerBehavior: 'Crawlers defer crawling during unresolved network, DNS, or redirect failures.',
        fetchPermittedByToolPolicy: !respectRobots,
        policyReason,
        fetchStatus: 'TEMPORARY_UNAVAILABLE',
        crawlabilityStatus: 'UNKNOWN',
        explanation: `robots.txt could not be retrieved due to ${failureType}: ${networkErr.message}. No explicit Disallow directive was evaluated.`,
        statusCode: null,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: respectRobots,
        failureType
      };
    }

    const statusCode = fetchRes.statusCode;

    // HTTP 404 / 410 -> Permanent Unavailable -> Content is Allowed under RFC 9309 Section 2.3.1.2
    if (statusCode === 404 || statusCode === 410) {
      return {
        url: robotsTxtUrl,
        classification: 'UNAVAILABLE',
        explicitlyDisallowed: false,
        applicableRule: null,
        crawlerBehavior: 'RFC 9309 Section 2.3.1.2 defines that crawlers MUST assume robots.txt does not exist and MAY access resources on the site.',
        fetchPermittedByToolPolicy: true,
        policyReason: `robots.txt does not exist (HTTP ${statusCode}). All site resources are accessible.`,
        fetchStatus: 'ALLOWED',
        crawlabilityStatus: 'ALLOWED',
        explanation: `robots.txt returned HTTP ${statusCode} (${statusCode === 404 ? 'Not Found' : 'Gone'}). RFC 9309 Section 2.3.1.2 defines that crawlers may assume all content on this site is accessible without restriction.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: false,
        robotsTxtContent: ''
      };
    }

    // HTTP 401 / 403 -> Client Error / Access Denied
    // RFC 9309 Section 2.3.1.2: 4xx indicates unavailable status.
    // IMPORTANT: It is NOT an RFC 9309 Disallow rule!
    // The tool halts fetching when respectRobots=true under its own conservative policy.
    if (statusCode === 401 || statusCode === 403) {
      const statusLabel = statusCode === 401 ? 'Unauthorized' : 'Forbidden';
      const policyReason = respectRobots
        ? `robots.txt returned HTTP ${statusCode} (${statusLabel}). No explicit Disallow directive was evaluated. This tool did not continue because of its conservative fetch policy.`
        : `robots.txt returned HTTP ${statusCode} (${statusLabel}), but Respect robots.txt is disabled (User Override).`;

      return {
        url: robotsTxtUrl,
        classification: 'UNAVAILABLE',
        explicitlyDisallowed: false,
        applicableRule: null,
        crawlerBehavior: `RFC 9309 Section 2.3.1.2 classifies HTTP ${statusCode} as unavailable status. Crawlers may access resources subject to their own policies (though sites requiring authentication typically block crawler access sitewide).`,
        fetchPermittedByToolPolicy: !respectRobots,
        policyReason,
        fetchStatus: 'UNAVAILABLE',
        crawlabilityStatus: 'UNKNOWN',
        explanation: `robots.txt returned HTTP ${statusCode} (${statusLabel}). RFC 9309 Section 2.3.1.2 treats 4xx responses as unavailable status. No explicit Disallow directive was evaluated. This tool did not continue because of its conservative fetch policy, not because of an RFC 9309 disallow directive.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: respectRobots,
        robotsTxtContent: ''
      };
    }

    // HTTP 429 -> Too Many Requests / Rate Limited
    if (statusCode === 429) {
      const policyReason = respectRobots
        ? `robots.txt returned HTTP 429 (Too Many Requests). Crawlers treat rate limiting as temporary back-off and halt crawling to protect origin server capacity.`
        : `robots.txt returned HTTP 429 (Too Many Requests), but Respect robots.txt is disabled (User Override).`;

      return {
        url: robotsTxtUrl,
        classification: 'RATE_LIMITED',
        explicitlyDisallowed: false,
        applicableRule: null,
        crawlerBehavior: 'RFC 9309 Section 2.3.1.2 explicitly excludes 429 from ordinary 4xx unavailable handling. Major search engines (including Google) treat HTTP 429 as a crawl delay or temporary halt.',
        fetchPermittedByToolPolicy: !respectRobots,
        policyReason,
        fetchStatus: 'TEMPORARY_UNAVAILABLE',
        crawlabilityStatus: 'UNKNOWN',
        explanation: `robots.txt returned HTTP 429 (Too Many Requests). Crawlers treat rate limiting as a temporary crawl delay/unreachable state rather than an ordinary 4xx missing file.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: respectRobots,
        robotsTxtContent: fetchRes.body || ''
      };
    }

    // Other 4xx client errors (400, 405, 418, etc.)
    if (statusCode >= 400 && statusCode < 500) {
      return {
        url: robotsTxtUrl,
        classification: 'UNAVAILABLE',
        explicitlyDisallowed: false,
        applicableRule: null,
        crawlerBehavior: 'RFC 9309 Section 2.3.1.2 specifies crawlers assume robots.txt does not exist on 4xx responses (other than 429) and access resources under crawler policy.',
        fetchPermittedByToolPolicy: true,
        policyReason: `robots.txt returned client error HTTP ${statusCode}. No explicit Disallow directive was evaluated.`,
        fetchStatus: 'ALLOWED',
        crawlabilityStatus: 'ALLOWED',
        explanation: `robots.txt returned HTTP ${statusCode}. Under RFC 9309 Section 2.3.1.2, crawlers treat 4xx status codes as unavailable and assume no robots.txt file exists.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: false,
        robotsTxtContent: ''
      };
    }

    // HTTP 5xx -> Server Error -> RFC 9309 Section 2.3.1.3: Temporarily Unreachable
    if (statusCode >= 500 && statusCode < 600) {
      const policyReason = respectRobots
        ? `robots.txt returned server error (HTTP ${statusCode}). RFC 9309 Section 2.3.1.3 states crawlers treat 5xx responses as temporarily unreachable and halt crawling until resolved.`
        : `robots.txt returned HTTP ${statusCode}, but Respect robots.txt is disabled (User Override).`;

      return {
        url: robotsTxtUrl,
        classification: 'UNREACHABLE',
        explicitlyDisallowed: false,
        applicableRule: null,
        crawlerBehavior: 'RFC 9309 Section 2.3.1.3 specifies crawlers MUST NOT access resources on the site until the condition is resolved or cached.',
        fetchPermittedByToolPolicy: !respectRobots,
        policyReason,
        fetchStatus: 'TEMPORARY_UNAVAILABLE',
        crawlabilityStatus: 'UNKNOWN',
        explanation: `robots.txt returned server error (HTTP ${statusCode}). RFC 9309 Section 2.3.1.3 classifies 5xx responses as temporarily unreachable. Crawlers must assume complete disallow while this condition applies.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: respectRobots,
        robotsTxtContent: fetchRes.body || ''
      };
    }

    // Unexpected / unsupported status codes (e.g. 1xx, 3xx that did not redirect, or >= 600)
    if (statusCode < 200 || statusCode >= 300) {
      const policyReason = respectRobots
        ? `robots.txt returned unexpected HTTP status ${statusCode}. Crawl halted under conservative tool policy.`
        : `robots.txt returned unexpected HTTP ${statusCode}, but Respect robots.txt is disabled (User Override).`;

      return {
        url: robotsTxtUrl,
        classification: 'UNKNOWN',
        explicitlyDisallowed: false,
        applicableRule: null,
        crawlerBehavior: 'Unexpected or non-standard status code; crawlers treat permission as unresolved.',
        fetchPermittedByToolPolicy: !respectRobots,
        policyReason,
        fetchStatus: 'UNKNOWN',
        crawlabilityStatus: 'UNKNOWN',
        explanation: `robots.txt returned unexpected HTTP status ${statusCode}. Permission could not be established.`,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: respectRobots,
        robotsTxtContent: fetchRes.body || ''
      };
    }

    // 2xx -> Check representation, Parse and Evaluate
    const rawContent = fetchRes.body || '';
    const contentType = (fetchRes.contentType || '').toLowerCase();

    // Check if HTML redirect landing page or invalid format
    const isHtml = contentType.includes('text/html') && (
      rawContent.trim().toLowerCase().startsWith('<!doctype') ||
      rawContent.trim().toLowerCase().startsWith('<html')
    );

    if (isHtml) {
      return {
        url: robotsTxtUrl,
        classification: 'UNKNOWN',
        explicitlyDisallowed: false,
        applicableRule: null,
        crawlerBehavior: 'RFC 9309 Section 2.2 requires robots.txt to be plain text UTF-8 format. HTML landing pages are treated as invalid representations.',
        fetchPermittedByToolPolicy: true,
        policyReason: 'robots.txt returned HTML document instead of plain text directives.',
        fetchStatus: 'ALLOWED',
        crawlabilityStatus: 'ALLOWED',
        explanation: 'Server returned an HTML document at /robots.txt rather than a valid plain text robots.txt file. Under RFC 9309 Section 2.2, crawlers treat invalid representations as having no restricting directives.',
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: false,
        robotsTxtContent: rawContent
      };
    }

    const parsed = parseRobotsTxt(rawContent);
    const { rules, matchedToken } = selectRulesForUserAgent(parsed.groups, userAgentToken);
    const testPath = urlObj.pathname + urlObj.search;
    const match = evaluateCrawlability(rules, testPath, userAgentToken, matchedToken);

    if (match.status === 'BLOCKED') {
      return {
        url: robotsTxtUrl,
        classification: 'DISALLOWED',
        explicitlyDisallowed: true,
        applicableRule: match.appliedRule ? {
          type: match.appliedRule.type,
          pattern: match.appliedRule.pattern,
          lineNumber: match.appliedRule.lineNumber,
          originalText: match.appliedRule.originalText
        } : null,
        crawlerBehavior: 'Crawlers must not access resources that match explicit Disallow directives.',
        fetchPermittedByToolPolicy: !respectRobots,
        policyReason: respectRobots
          ? `Blocked by explicit Disallow rule: ${match.appliedRule?.originalText || 'Disallow'}`
          : 'Blocked by Disallow rule, but Respect robots.txt is disabled (User Override).',
        fetchStatus: 'DISALLOWED',
        crawlabilityStatus: 'DISALLOWED',
        explanation: match.explanation,
        statusCode,
        respectRobotsEnabled: respectRobots,
        blockedMainUrl: respectRobots,
        robotsTxtContent: rawContent
      };
    }

    return {
      url: robotsTxtUrl,
      classification: 'ALLOWED',
      explicitlyDisallowed: false,
      applicableRule: match.appliedRule ? {
        type: match.appliedRule.type,
        pattern: match.appliedRule.pattern,
        lineNumber: match.appliedRule.lineNumber,
        originalText: match.appliedRule.originalText
      } : null,
      crawlerBehavior: 'Crawlers are permitted to crawl the resource.',
      fetchPermittedByToolPolicy: true,
      policyReason: match.appliedRule
        ? `Explicitly allowed by rule: ${match.appliedRule.originalText}`
        : 'Permitted (no matching Disallow rule found).',
      fetchStatus: 'ALLOWED',
      crawlabilityStatus: 'ALLOWED',
      explanation: match.explanation,
      statusCode,
      respectRobotsEnabled: respectRobots,
      blockedMainUrl: false,
      robotsTxtContent: rawContent
    };
  } catch (err: any) {
    const failureType = categorizeRobotsNetworkFailure(err);
    return {
      url: `${new URL(pageUrl).origin}/robots.txt`,
      classification: 'UNKNOWN',
      explicitlyDisallowed: false,
      applicableRule: null,
      crawlerBehavior: 'Crawl permission could not be resolved.',
      fetchPermittedByToolPolicy: !respectRobots,
      policyReason: `Could not evaluate robots.txt: ${err.message}`,
      fetchStatus: 'UNKNOWN',
      crawlabilityStatus: 'UNKNOWN',
      explanation: `Could not evaluate robots.txt: ${err.message}`,
      statusCode: null,
      respectRobotsEnabled: respectRobots,
      blockedMainUrl: respectRobots,
      failureType
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
    explanation?: string;
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
        // FIX 2: When origin evaluation limit is reached, return UNKNOWN (never falsely report ALLOWED)
        if (this.originPolicies.size >= this.maxOrigins || this.originFetchCount >= this.maxOrigins) {
          return {
            isAllowed: false,
            status: 'UNKNOWN',
            ruleSummary: 'Origin robots.txt evaluation limit exceeded (maximum 10 distinct origins evaluated); origin crawlability unresolved'
          };
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
          } else if (fetchRes.statusCode === 404 || fetchRes.statusCode === 410) {
            // Permanent Unavailable -> No restrictions apply
            cached = { status: 'ALLOWED', rules: [], matchedToken: '*' };
          } else if (fetchRes.statusCode === 401 || fetchRes.statusCode === 403) {
            // Under RFC 9309 Section 2.3.1.2: 4xx indicates unavailable status, NOT an explicit Disallow rule.
            // Conservative tool policy treats unresolved origin status as UNKNOWN (fail-closed)
            cached = {
              status: 'UNKNOWN',
              rules: [],
              matchedToken: '*',
              explanation: `Robots.txt access denied (HTTP ${fetchRes.statusCode}); policy unresolved under conservative crawl policy`
            };
          } else if (fetchRes.statusCode === 429) {
            cached = {
              status: 'UNKNOWN',
              rules: [],
              matchedToken: '*',
              explanation: `Robots.txt rate-limited (HTTP 429); crawl deferred`
            };
          } else if (fetchRes.statusCode >= 500 && fetchRes.statusCode < 600) {
            // Server Error -> Temporary Unavailable
            cached = {
              status: 'UNKNOWN',
              rules: [],
              matchedToken: '*',
              explanation: `Robots.txt server error (HTTP ${fetchRes.statusCode})`
            };
          } else {
            cached = { status: 'UNKNOWN', rules: [], matchedToken: '*' };
          }
        } catch (subErr: any) {
          // If cross-origin robots.txt fails or times out: classify as UNKNOWN
          cached = {
            status: 'UNKNOWN',
            rules: [],
            matchedToken: '*',
            explanation: `Robots.txt retrieval error: ${subErr.message}`
          };
        }
        this.originPolicies.set(origin, cached);
      }

      if (cached.status === 'UNKNOWN') {
        return {
          isAllowed: false,
          status: 'UNKNOWN',
          ruleSummary: cached.explanation || 'Origin robots.txt temporarily unavailable (unresolved policy)'
        };
      }

      if (cached.status === 'DISALLOWED') {
        return {
          isAllowed: false,
          status: 'DISALLOWED',
          ruleSummary: cached.explanation || 'Disallowed by origin robots.txt policy'
        };
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
      return { isAllowed: false, status: 'UNKNOWN', ruleSummary: 'Subresource evaluation error' };
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
    return { isAllowed: false, status: 'UNKNOWN', ruleSummary: 'Evaluation error' };
  }
}
