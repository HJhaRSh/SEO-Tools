import { safeFetch } from './safeFetch';
import { parseRobotsTxt, selectRulesForUserAgent, evaluateCrawlability, ParsedRobotsTxt, MatchResult } from './robotsParser';
import { findUserAgent, UserAgentDefinition } from './userAgents';

export interface RobotsTxtCacheEntry {
  rawUrl: string;
  statusCode: number;
  statusText: string;
  content: string;
  parsed: ParsedRobotsTxt;
  fetchedAt: number;
  durationMs: number;
  redirectHistory: { from: string; to: string; statusCode: number }[];
}

// In-memory cache for robots.txt (TTL: 10 minutes)
const ROBOTS_CACHE = new Map<string, RobotsTxtCacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface TestRobotsOptions {
  websiteUrl: string;
  path: string;
  userAgent: string;
  mode?: 'live' | 'editor';
  customRobotsTxt?: string | null;
  forceRefresh?: boolean;
}

export interface RobotsTestResult {
  success: boolean;
  targetUrl: string;
  websiteOrigin: string;
  testPath: string;
  userAgent: {
    name: string;
    token: string;
    fullUserAgent: string;
  };
  source: 'LIVE_ROBOTS' | 'EDITOR_ROBOTS';
  robotsTxt: {
    url: string;
    statusCode: number | null;
    statusText: string;
    content: string;
    fetchStatus: 'SUCCESS' | 'NOT_FOUND' | 'SERVER_ERROR' | 'FETCH_ERROR' | 'CUSTOM' | 'TOO_MANY_REQUESTS';
    fetchDurationMs?: number;
    redirectHistory?: { from: string; to: string; statusCode: number }[];
    isTruncated?: boolean;
  };
  result: {
    status: 'ALLOWED' | 'BLOCKED' | 'UNKNOWN';
    allowed: boolean | null;
    matchedGroup: string;
    appliedRule: {
      type: 'allow' | 'disallow';
      pattern: string;
      lineNumber: number;
      originalText: string;
    } | null;
    explanation: string;
    crawlDelay?: number;
  };
  sitemaps: {
    url: string;
    lineNumber: number;
    originalText: string;
  }[];
  warnings: string[];
  errors: string[];
}

/**
 * Normalizes and resolves website URL and test path.
 * Ensures the origin matches and handles query strings and encoded paths.
 */
export function resolveTargetUrls(websiteInput: string, pathInput: string): {
  origin: string;
  robotsTxtUrl: string;
  targetUrl: string;
  cleanPathAndQuery: string;
} {
  let cleanWebsite = websiteInput.trim();
  if (!cleanWebsite.startsWith('http://') && !cleanWebsite.startsWith('https://')) {
    cleanWebsite = 'https://' + cleanWebsite;
  }

  let websiteUrlObj: URL;
  try {
    websiteUrlObj = new URL(cleanWebsite);
  } catch {
    throw new Error(`Invalid Website URL: "${websiteInput}"`);
  }

  const origin = websiteUrlObj.origin;
  const robotsTxtUrl = `${origin}/robots.txt`;

  let cleanPath = (pathInput || '/').trim();
  let fullTargetUrlObj: URL;

  // Check if user entered a full URL in the path field
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    try {
      fullTargetUrlObj = new URL(cleanPath);
      if (fullTargetUrlObj.origin.toLowerCase() !== origin.toLowerCase()) {
        throw new Error(
          `URL path origin ("${fullTargetUrlObj.origin}") does not match the Website URL origin ("${origin}"). Testing different hosts is not permitted.`
        );
      }
    } catch (err: any) {
      throw new Error(err.message || `Invalid URL in path input: "${cleanPath}"`);
    }
  } else {
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }
    fullTargetUrlObj = new URL(cleanPath, origin);
  }

  const cleanPathAndQuery = fullTargetUrlObj.pathname + fullTargetUrlObj.search;

  return {
    origin,
    robotsTxtUrl,
    targetUrl: fullTargetUrlObj.toString(),
    cleanPathAndQuery
  };
}

/**
 * Core engine to test robots.txt compliance.
 */
export async function testRobotsTxt(options: TestRobotsOptions): Promise<RobotsTestResult> {
  const { websiteUrl, path, userAgent, mode = 'live', customRobotsTxt, forceRefresh = false } = options;

  const { origin, robotsTxtUrl, targetUrl, cleanPathAndQuery } = resolveTargetUrls(websiteUrl, path);
  const uaDef: UserAgentDefinition = findUserAgent(userAgent);

  const warnings: string[] = [];
  const errors: string[] = [];

  // Handle EDITOR mode (custom robots.txt simulation)
  if (mode === 'editor') {
    const content = customRobotsTxt ?? '';
    const parsed = parseRobotsTxt(content);
    const { rules, matchedToken, crawlDelay } = selectRulesForUserAgent(
      parsed.groups,
      uaDef.token,
      uaDef.fallbackToken
    );

    const match = evaluateCrawlability(rules, cleanPathAndQuery, uaDef.name, matchedToken);

    return {
      success: true,
      targetUrl,
      websiteOrigin: origin,
      testPath: cleanPathAndQuery,
      userAgent: {
        name: uaDef.name,
        token: uaDef.token,
        fullUserAgent: uaDef.fullUserAgent
      },
      source: 'EDITOR_ROBOTS',
      robotsTxt: {
        url: robotsTxtUrl,
        statusCode: 200,
        statusText: 'Custom Editor Simulation',
        content,
        fetchStatus: 'CUSTOM'
      },
      result: {
        status: match.status,
        allowed: match.allowed,
        matchedGroup: match.matchedGroup,
        appliedRule: match.appliedRule ? {
          type: match.appliedRule.type,
          pattern: match.appliedRule.pattern,
          lineNumber: match.appliedRule.lineNumber,
          originalText: match.appliedRule.originalText
        } : null,
        explanation: `${match.explanation} (Evaluated via Live Editor content)`,
        crawlDelay
      },
      sitemaps: parsed.sitemaps,
      warnings: [...warnings, ...parsed.warnings],
      errors
    };
  }

  // Handle LIVE mode
  let cached = ROBOTS_CACHE.get(origin);
  if (forceRefresh || !cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    try {
      const fetchRes = await safeFetch(robotsTxtUrl);
      const parsed = parseRobotsTxt(fetchRes.body);

      cached = {
        rawUrl: robotsTxtUrl,
        statusCode: fetchRes.statusCode,
        statusText: fetchRes.statusText,
        content: fetchRes.body,
        parsed,
        fetchedAt: Date.now(),
        durationMs: fetchRes.durationMs,
        redirectHistory: fetchRes.redirectHistory
      };

      ROBOTS_CACHE.set(origin, cached);
    } catch (err: any) {
      // Network, DNS, timeout, or SSRF block error
      return {
        success: false,
        targetUrl,
        websiteOrigin: origin,
        testPath: cleanPathAndQuery,
        userAgent: {
          name: uaDef.name,
          token: uaDef.token,
          fullUserAgent: uaDef.fullUserAgent
        },
        source: 'LIVE_ROBOTS',
        robotsTxt: {
          url: robotsTxtUrl,
          statusCode: null,
          statusText: err.message || 'Fetch Failed',
          content: '',
          fetchStatus: 'FETCH_ERROR'
        },
        result: {
          status: 'UNKNOWN',
          allowed: null,
          matchedGroup: 'none',
          appliedRule: null,
          explanation: `Could not fetch robots.txt due to network, DNS, or security error: ${err.message}. Crawlability is indeterminate.`
        },
        sitemaps: [],
        warnings,
        errors: [err.message || 'Unknown network error']
      };
    }
  }

  // Analyze HTTP Status Code per Google guidelines and RFC 9309:
  const statusCode = cached.statusCode;

  // 1. HTTP 404 or 410: Not Found -> Crawling is completely allowed
  if (statusCode === 404 || statusCode === 410) {
    return {
      success: true,
      targetUrl,
      websiteOrigin: origin,
      testPath: cleanPathAndQuery,
      userAgent: {
        name: uaDef.name,
        token: uaDef.token,
        fullUserAgent: uaDef.fullUserAgent
      },
      source: 'LIVE_ROBOTS',
      robotsTxt: {
        url: cached.rawUrl,
        statusCode,
        statusText: cached.statusText,
        content: cached.content,
        fetchStatus: 'NOT_FOUND',
        fetchDurationMs: cached.durationMs,
        redirectHistory: cached.redirectHistory
      },
      result: {
        status: 'ALLOWED',
        allowed: true,
        matchedGroup: 'none',
        appliedRule: null,
        explanation: 'robots.txt was not found (HTTP ' + statusCode + '). Under standard crawler guidelines, crawling is not restricted by robots.txt.'
      },
      sitemaps: [],
      warnings: ['robots.txt returned HTTP ' + statusCode + ' (Not Found). No restrictions apply.'],
      errors: []
    };
  }

  // 2. HTTP 429: Too Many Requests -> Warning, rate-limited
  if (statusCode === 429) {
    return {
      success: true,
      targetUrl,
      websiteOrigin: origin,
      testPath: cleanPathAndQuery,
      userAgent: {
        name: uaDef.name,
        token: uaDef.token,
        fullUserAgent: uaDef.fullUserAgent
      },
      source: 'LIVE_ROBOTS',
      robotsTxt: {
        url: cached.rawUrl,
        statusCode,
        statusText: cached.statusText,
        content: cached.content,
        fetchStatus: 'TOO_MANY_REQUESTS',
        fetchDurationMs: cached.durationMs,
        redirectHistory: cached.redirectHistory
      },
      result: {
        status: 'UNKNOWN',
        allowed: null,
        matchedGroup: 'none',
        appliedRule: null,
        explanation: 'The server responded with HTTP 429 (Too Many Requests). Crawlers treat this as a temporary server block or rate limit.'
      },
      sitemaps: [],
      warnings: ['Server returned HTTP 429 (Too Many Requests). Crawlers typically back off.'],
      errors: []
    };
  }

  // 3. HTTP 5xx: Server Errors -> Temporary unavailability, crawl restricted/indeterminate
  if (statusCode >= 500 && statusCode <= 599) {
    return {
      success: true,
      targetUrl,
      websiteOrigin: origin,
      testPath: cleanPathAndQuery,
      userAgent: {
        name: uaDef.name,
        token: uaDef.token,
        fullUserAgent: uaDef.fullUserAgent
      },
      source: 'LIVE_ROBOTS',
      robotsTxt: {
        url: cached.rawUrl,
        statusCode,
        statusText: cached.statusText,
        content: cached.content,
        fetchStatus: 'SERVER_ERROR',
        fetchDurationMs: cached.durationMs,
        redirectHistory: cached.redirectHistory
      },
      result: {
        status: 'BLOCKED',
        allowed: false,
        matchedGroup: 'none',
        appliedRule: null,
        explanation: `Server responded with HTTP ${statusCode} (${cached.statusText}). Under Google guidelines, a 5xx error on robots.txt causes crawlers to halt crawling temporarily to avoid accessing restricted pages.`
      },
      sitemaps: [],
      warnings: [`Server returned 5xx error (${statusCode}). Crawlers treat 5xx on robots.txt as a temporary full disallow.`],
      errors: []
    };
  }

  // 4. HTTP 2xx: Success -> Parse & match
  if (statusCode >= 200 && statusCode <= 299) {
    const { rules, matchedToken, crawlDelay } = selectRulesForUserAgent(
      cached.parsed.groups,
      uaDef.token,
      uaDef.fallbackToken
    );

    const match = evaluateCrawlability(rules, cleanPathAndQuery, uaDef.name, matchedToken);

    return {
      success: true,
      targetUrl,
      websiteOrigin: origin,
      testPath: cleanPathAndQuery,
      userAgent: {
        name: uaDef.name,
        token: uaDef.token,
        fullUserAgent: uaDef.fullUserAgent
      },
      source: 'LIVE_ROBOTS',
      robotsTxt: {
        url: cached.rawUrl,
        statusCode,
        statusText: cached.statusText,
        content: cached.content,
        fetchStatus: 'SUCCESS',
        fetchDurationMs: cached.durationMs,
        redirectHistory: cached.redirectHistory
      },
      result: {
        status: match.status,
        allowed: match.allowed,
        matchedGroup: match.matchedGroup,
        appliedRule: match.appliedRule ? {
          type: match.appliedRule.type,
          pattern: match.appliedRule.pattern,
          lineNumber: match.appliedRule.lineNumber,
          originalText: match.appliedRule.originalText
        } : null,
        explanation: match.explanation,
        crawlDelay
      },
      sitemaps: cached.parsed.sitemaps,
      warnings: [...warnings, ...cached.parsed.warnings],
      errors: []
    };
  }

  // Other 4xx or unexpected code
  return {
    success: true,
    targetUrl,
    websiteOrigin: origin,
    testPath: cleanPathAndQuery,
    userAgent: {
      name: uaDef.name,
      token: uaDef.token,
      fullUserAgent: uaDef.fullUserAgent
    },
    source: 'LIVE_ROBOTS',
    robotsTxt: {
      url: cached.rawUrl,
      statusCode,
      statusText: cached.statusText,
      content: cached.content,
      fetchStatus: 'FETCH_ERROR',
      fetchDurationMs: cached.durationMs,
      redirectHistory: cached.redirectHistory
    },
    result: {
      status: 'UNKNOWN',
      allowed: null,
      matchedGroup: 'none',
      appliedRule: null,
      explanation: `Received unexpected HTTP status ${statusCode} when fetching robots.txt.`
    },
    sitemaps: [],
    warnings: [`Unusual HTTP status code received: ${statusCode}`],
    errors: []
  };
}
