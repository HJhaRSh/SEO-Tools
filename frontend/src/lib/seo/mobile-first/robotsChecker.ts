import { safeFetch } from '../safeFetch';
import {
  parseRobotsTxt,
  selectRulesForUserAgent,
  evaluateCrawlability,
} from '../robotsParser';
import { RobotsTxtCheckResult } from './types';

/**
 * Evaluates robots.txt crawlability for a target URL and crawler token.
 * Standards-compliant (RFC 9309).
 */
export async function checkRobotsCrawlability(
  targetUrl: string,
  userAgentToken: string,
  userAgentName: string
): Promise<RobotsTxtCheckResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return {
      origin: '',
      fetched: false,
      status: 'UNKNOWN',
      matchedGroup: userAgentToken,
      explanation: `Could not parse target URL: ${targetUrl}`,
    };
  }

  const robotsUrl = `${parsedUrl.origin}/robots.txt`;

  try {
    const fetchRes = await safeFetch(robotsUrl, {
      timeoutMs: 5000,
      maxBytes: 256 * 1024,
      headers: {
        Accept: 'text/plain, */*;q=0.8',
      },
    });

    const statusCode = fetchRes.statusCode;

    // RFC 9309 Section 2.3.1.2: HTTP 404/410 means robots.txt is unavailable and all crawling is allowed
    if (statusCode === 404 || statusCode === 410) {
      return {
        origin: parsedUrl.origin,
        fetched: true,
        statusCode,
        status: 'ALLOWED',
        matchedGroup: '*',
        explanation: `robots.txt returned HTTP ${statusCode} (Not Found). Under RFC 9309, all crawling is allowed by default.`,
      };
    }

    // 5xx Server errors: search engines typically treat this as a temporary failure and halt crawling
    if (statusCode >= 500 && statusCode < 600) {
      return {
        origin: parsedUrl.origin,
        fetched: true,
        statusCode,
        status: 'UNKNOWN',
        matchedGroup: userAgentToken,
        explanation: `robots.txt returned HTTP ${statusCode} server error. Search crawlers generally postpone crawling until the error resolves.`,
      };
    }

    // 401/403: Forbidden / Unauthorized
    if (statusCode === 401 || statusCode === 403) {
      return {
        origin: parsedUrl.origin,
        fetched: true,
        statusCode,
        status: 'UNKNOWN',
        matchedGroup: userAgentToken,
        explanation: `robots.txt returned HTTP ${statusCode}. Access to robots.txt is restricted.`,
      };
    }

    // 200 OK: parse rules
    if (statusCode >= 200 && statusCode < 300) {
      const parsed = parseRobotsTxt(fetchRes.body);
      const selected = selectRulesForUserAgent(parsed.groups, userAgentToken, 'googlebot');
      const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
      const match = evaluateCrawlability(selected.rules, pathAndQuery, userAgentName, selected.matchedToken);

      return {
        origin: parsedUrl.origin,
        fetched: true,
        statusCode,
        status: match.status === 'ALLOWED' ? 'ALLOWED' : 'BLOCKED',
        appliedRule: match.appliedRule
          ? {
              type: match.appliedRule.type,
              pattern: match.appliedRule.pattern,
              lineNumber: match.appliedRule.lineNumber,
              originalText: match.appliedRule.originalText,
            }
          : null,
        matchedGroup: match.matchedGroup,
        explanation: match.explanation,
      };
    }

    return {
      origin: parsedUrl.origin,
      fetched: true,
      statusCode,
      status: 'UNKNOWN',
      matchedGroup: userAgentToken,
      explanation: `robots.txt returned unexpected HTTP ${statusCode}.`,
    };
  } catch (err: any) {
    return {
      origin: parsedUrl.origin,
      fetched: false,
      status: 'UNKNOWN',
      matchedGroup: userAgentToken,
      explanation: `Unable to retrieve robots.txt from ${robotsUrl}: ${err.message || 'Network error'}`,
    };
  }
}
