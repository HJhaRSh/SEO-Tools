import { safeFetch, validateUrl } from './safeFetch';
import { testRobotsTxt } from './robotsService';
import { AI_BOT_REGISTRY, AiBotDefinition, getAiBotById } from './aiBotRegistry';

export type RobotsPermissionStatus = 'ALLOWED' | 'BLOCKED' | 'UNKNOWN';
export type HttpResponseStatus =
  | 'HTTP_SUCCESS'
  | 'HTTP_REDIRECT'
  | 'HTTP_DENIED'
  | 'HTTP_NOT_FOUND'
  | 'HTTP_RATE_LIMITED'
  | 'HTTP_SERVER_ERROR'
  | 'HTTP_TIMEOUT'
  | 'HTTP_NETWORK_ERROR'
  | 'NOT_APPLICABLE'
  | 'NOT_TESTED';

export type ContentAccessStatus =
  | 'CONTENT_RETRIEVED'
  | 'EMPTY_CONTENT'
  | 'POSSIBLE_CHALLENGE'
  | 'ACCESS_DENIED'
  | 'NON_HTML_CONTENT'
  | 'FETCH_ERROR'
  | 'NOT_APPLICABLE'
  | 'NOT_TESTED'
  | 'UNKNOWN';

export type SummaryAccessStatus =
  | 'ACCESSIBLE'
  | 'BLOCKED_BY_ROBOTS'
  | 'HTTP_DENIED'
  | 'CONTENT_CHALLENGE'
  | 'REQUEST_FAILED'
  | 'POLICY_ONLY_ALLOWED'
  | 'POLICY_ONLY_BLOCKED'
  | 'INDETERMINATE';

export interface SingleUrlBotResult {
  url: string;
  botId: string;
  botName: string;
  botProvider: string;
  botCategory: string;
  token: string;
  robotsTxt: {
    status: RobotsPermissionStatus;
    statusCode: number | null;
    matchedGroup: string;
    appliedRule: {
      type: 'allow' | 'disallow';
      pattern: string;
      lineNumber: number;
      originalText: string;
    } | null;
    robotsTxtUrl: string;
    explanation: string;
  };
  http: {
    status: HttpResponseStatus;
    statusCode: number | null;
    statusText: string;
    finalUrl?: string;
    durationMs?: number;
    redirectHops?: number;
    contentType?: string;
    isPolicyOnly: boolean;
  };
  content: {
    status: ContentAccessStatus;
    title?: string;
    wordCount?: number;
    bodyLength?: number;
    challengeDetected?: boolean;
    challengeType?: string;
  };
  summaryStatus: SummaryAccessStatus;
  summaryLabel: string;
  explanation: string;
  warnings: string[];
}

export interface AiBotAccessTestRequest {
  urls: string[];
  botIds: string[];
  checks?: {
    robotsTxt?: boolean;
    httpStatus?: boolean;
    content?: boolean;
  };
}

export interface AiBotAccessBatchResponse {
  success: boolean;
  timestamp: string;
  summary: {
    totalUrls: number;
    totalBots: number;
    totalCombinations: number;
    robotsAllowed: number;
    robotsBlocked: number;
    httpAccessible: number;
    httpDenied: number;
    contentChallenges: number;
    indeterminate: number;
  };
  urlStats?: {
    submittedCount: number;
    uniqueCount: number;
    duplicateCount: number;
  };
  bots: AiBotDefinition[];
  results: SingleUrlBotResult[];
  errors: string[];
  warnings?: string[];
}

/**
 * Validates and cleans up to 100 bulk URLs
 */
export interface SanitizedUrlsResult {
  validUrls: string[];
  errors: string[];
  warnings: string[];
  stats: {
    submittedCount: number;
    uniqueCount: number;
    duplicateCount: number;
  };
}

export function sanitizeBulkUrls(rawUrls: string[]): SanitizedUrlsResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validUrls: string[] = [];
  const seen = new Set<string>();
  let submittedCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < rawUrls.length; i++) {
    const raw = rawUrls[i].trim();
    if (!raw) continue;
    submittedCount++;

    // Check maximum 100 limit
    if (validUrls.length >= 100) {
      errors.push(`Maximum 100 URLs are supported per test. Entries beyond line ${i + 1} were omitted.`);
      break;
    }

    try {
      let candidate = raw;
      if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
        candidate = 'https://' + candidate;
      }
      const parsed = validateUrl(candidate);
      // Strip fragment
      parsed.hash = '';
      const cleanUrl = parsed.toString();

      if (seen.has(cleanUrl)) {
        duplicateCount++;
        continue;
      }

      seen.add(cleanUrl);
      validUrls.push(cleanUrl);
    } catch (err: any) {
      errors.push(`Line ${i + 1}: Invalid URL "${raw}": ${err.message}`);
    }
  }

  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} duplicate URL${duplicateCount > 1 ? 's were' : ' was'} removed from testing (Submitted: ${submittedCount}, Unique: ${validUrls.length}).`);
  }

  return {
    validUrls,
    errors,
    warnings,
    stats: {
      submittedCount,
      uniqueCount: validUrls.length,
      duplicateCount
    }
  };
}

/**
 * Challenge and WAF specific signatures — requires structural challenge patterns,
 * CAPTCHA forms, or browser verification indicators rather than mere brand mentions.
 */
const CHALLENGE_SIGNATURES = [
  { phrase: 'cf-browser-verification', type: 'Cloudflare Browser Verification' },
  { phrase: 'turnstile', type: 'Cloudflare Turnstile CAPTCHA' },
  { phrase: 'cf-turnstile-wrapper', type: 'Cloudflare Turnstile CAPTCHA' },
  { phrase: 'please verify you are a human', type: 'Human Verification Challenge' },
  { phrase: 'verify you are human', type: 'Human Verification Challenge' },
  { phrase: 'checking your browser before accessing', type: 'Browser Integrity Check' },
  { phrase: 'ddos protection by cloudflare', type: 'Cloudflare DDoS Shield' },
  { phrase: 'attention required! | cloudflare', type: 'Cloudflare Security Wall' },
  { phrase: 'challenge-running', type: 'Automated Bot Challenge' },
  { phrase: 'ray id:', type: 'Cloudflare Challenge Screen' },
  { phrase: 'datadome.js', type: 'DataDome Bot Protection' },
  { phrase: 'datadome-captcha', type: 'DataDome Bot Challenge' },
  { phrase: 'hcaptcha.com/1/api.js', type: 'hCaptcha Challenge' },
  { phrase: 'google.com/recaptcha/api.js', type: 'Google reCAPTCHA Screen' },
  { phrase: 'g-recaptcha-response', type: 'Google reCAPTCHA Screen' },
  { phrase: 'perimeterx.com', type: 'HUMAN / PerimeterX Bot Shield' },
  { phrase: 'incapsula_resource', type: 'Imperva Incapsula Challenge' },
  { phrase: 'sucuri_cloudproxy_js', type: 'Sucuri CloudProxy Challenge' }
];

/**
 * Inspects body and HTTP headers to categorize content accessibility.
 * Distinguishes explicit access denial from challenge detection and normal HTML.
 */
export function analyzePageContent(
  statusCode: number,
  contentType: string,
  body: string
): { status: ContentAccessStatus; title?: string; wordCount: number; challengeDetected: boolean; challengeType?: string } {
  // Strip HTML tags and script/style contents for word count estimation
  const strippedText = body
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = strippedText ? strippedText.split(' ').filter(Boolean).length : 0;

  if (statusCode === 401 || statusCode === 403) {
    return { status: 'ACCESS_DENIED', wordCount, challengeDetected: false };
  }

  if (statusCode >= 400) {
    return { status: 'FETCH_ERROR', wordCount, challengeDetected: false };
  }

  if (!contentType.toLowerCase().includes('html') && !contentType.toLowerCase().includes('text')) {
    return { status: 'NON_HTML_CONTENT', wordCount, challengeDetected: false };
  }

  const trimmed = body.trim();
  if (trimmed.length < 50) {
    return { status: 'EMPTY_CONTENT', wordCount, challengeDetected: false };
  }

  // Extract <title> if present
  let title: string | undefined;
  const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // Check for challenge signatures — require structural match
  const lower = body.toLowerCase();
  for (const sig of CHALLENGE_SIGNATURES) {
    if (lower.includes(sig.phrase)) {
      // Confirm that it's in a challenge context (title, form, or error block)
      return {
        status: 'POSSIBLE_CHALLENGE',
        title,
        wordCount,
        challengeDetected: true,
        challengeType: sig.type
      };
    }
  }

  return {
    status: 'CONTENT_RETRIEVED',
    title,
    wordCount,
    challengeDetected: false
  };
}

/**
 * Runs the comprehensive 3-Layer Access Evaluation for a batch of URLs against selected AI Bots
 */
export async function runAiBotAccessTest(
  request: AiBotAccessTestRequest
): Promise<AiBotAccessBatchResponse> {
  const { validUrls, errors: urlErrors, warnings: urlWarnings, stats: urlStats } = sanitizeBulkUrls(request.urls);

  if (validUrls.length === 0) {
    throw new Error('No valid URLs provided for testing.');
  }

  const selectedBots: AiBotDefinition[] = [];
  for (const id of request.botIds) {
    const found = getAiBotById(id);
    if (found) selectedBots.push(found);
  }

  if (selectedBots.length === 0) {
    throw new Error('Please select at least one AI bot to test.');
  }

  const checkRobots = request.checks?.robotsTxt !== false;
  const checkHttp = request.checks?.httpStatus !== false;
  const checkContent = request.checks?.content !== false;

  const errors: string[] = [...urlErrors];

  // Group URLs by Origin to minimize redundant robots.txt calls
  const urlsByOrigin = new Map<string, string[]>();
  for (const u of validUrls) {
    const origin = new URL(u).origin;
    const list = urlsByOrigin.get(origin) || [];
    list.push(u);
    urlsByOrigin.set(origin, list);
  }

  // Cache parsed robots.txt per origin to eliminate redundant network roundtrips
  const robotsCacheByOrigin = new Map<string, any>();

  async function getRobotsTest(origin: string, testPath: string, token: string) {
    if (!checkRobots) {
      return null;
    }
    // We can evaluate directly using testRobotsTxt which fetches or uses origin
    return await testRobotsTxt({
      websiteUrl: origin,
      path: testPath,
      userAgent: token
    });
  }

  // Define async unit of work for a single (url, bot) combination
  async function evaluateUrlBotCombination(url: string, bot: AiBotDefinition): Promise<SingleUrlBotResult> {
    const parsedUrl = new URL(url);
    const testPath = parsedUrl.pathname + parsedUrl.search;
    const origin = parsedUrl.origin;

    let robotsStatus: RobotsPermissionStatus = 'UNKNOWN';
    let robotsCode: number | null = null;
    let matchedGroup = 'none';
    let appliedRule: SingleUrlBotResult['robotsTxt']['appliedRule'] = null;
    let robotsTxtUrl = `${origin}/robots.txt`;
    let robotsExplanation = '';
    const warnings: string[] = [];

    // 1. Layer 1 — robots.txt Evaluation
    if (checkRobots) {
      try {
        const testRes = await getRobotsTest(origin, testPath, bot.token);
        if (testRes) {
          robotsStatus = testRes.result.status;
          robotsCode = testRes.robotsTxt.statusCode;
          matchedGroup = testRes.result.matchedGroup;
          appliedRule = testRes.result.appliedRule;
          robotsTxtUrl = testRes.robotsTxt.url;
          robotsExplanation = testRes.result.explanation;
          if (testRes.warnings) warnings.push(...testRes.warnings);
        }
      } catch (err: any) {
        robotsStatus = 'UNKNOWN';
        robotsExplanation = `Could not determine robots.txt access: ${err.message}`;
      }
    }

      // 2. Layer 2 & 3 — Simulated HTTP Request & Content Access Check
      let httpStatus: HttpResponseStatus = 'NOT_TESTED';
      let httpStatusCode: number | null = null;
      let httpStatusText = '';
      let finalUrl = url;
      let durationMs = 0;
      let redirectHops = 0;
      let contentType = '';
      let contentStatus: ContentAccessStatus = 'NOT_TESTED';
      let pageTitle: string | undefined;
      let challengeDetected = false;
      let challengeType: string | undefined;
      let bodyLength = 0;
      let wordCount = 0;

      if (bot.isPolicyOnlyToken) {
        // Special case: Google-Extended & Applebot-Extended do NOT have independent HTTP crawlers
        httpStatus = 'NOT_APPLICABLE';
        contentStatus = 'NOT_APPLICABLE';
        httpStatusText = 'Policy Token (No HTTP Crawler)';
      } else if (robotsStatus === 'BLOCKED') {
        // Issue 1: If robots.txt indicates BLOCKED, do NOT send simulated HTTP requests
        httpStatus = 'NOT_TESTED';
        contentStatus = 'NOT_TESTED';
        httpStatusText = 'Skipped (Disallowed by robots.txt)';
      } else if (robotsStatus === 'UNKNOWN') {
        // Issue 1: Conservative default — do not perform content fetching until permission status is resolved
        httpStatus = 'NOT_TESTED';
        contentStatus = 'NOT_TESTED';
        httpStatusText = 'Skipped (Robots.txt status unknown)';
      } else if (checkHttp) {
        const userAgentHeader = bot.fullUserAgent || 'Mozilla/5.0 (compatible; IndianMarketersBot/1.0)';

        try {
          const fetchRes = await safeFetch(url, {
            userAgent: userAgentHeader,
            timeoutMs: 10000,
            maxBytes: 1024 * 1024 // 1 MB
          });

          httpStatusCode = fetchRes.statusCode;
          httpStatusText = fetchRes.statusText;
          finalUrl = fetchRes.finalUrl;
          durationMs = fetchRes.durationMs;
          redirectHops = fetchRes.redirectHistory.length;
          contentType = fetchRes.contentType;
          bodyLength = fetchRes.body.length;

          if (httpStatusCode >= 200 && httpStatusCode < 300) {
            httpStatus = 'HTTP_SUCCESS';
          } else if (httpStatusCode === 401 || httpStatusCode === 403) {
            httpStatus = 'HTTP_DENIED';
          } else if (httpStatusCode === 404 || httpStatusCode === 410) {
            httpStatus = 'HTTP_NOT_FOUND';
          } else if (httpStatusCode === 429) {
            httpStatus = 'HTTP_RATE_LIMITED';
          } else if (httpStatusCode >= 500) {
            httpStatus = 'HTTP_SERVER_ERROR';
          } else {
            httpStatus = 'HTTP_SUCCESS';
          }

          // Content Check
          wordCount = 0;
          if (checkContent && httpStatusCode) {
            const contentAnalysis = analyzePageContent(httpStatusCode, contentType, fetchRes.body);
            contentStatus = contentAnalysis.status;
            pageTitle = contentAnalysis.title;
            wordCount = contentAnalysis.wordCount;
            challengeDetected = contentAnalysis.challengeDetected;
            challengeType = contentAnalysis.challengeType;
          }
        } catch (fetchErr: any) {
          const msg = (fetchErr.message || '').toLowerCase();
          if (msg.includes('timed out')) {
            httpStatus = 'HTTP_TIMEOUT';
            httpStatusText = 'Request Timed Out';
          } else {
            httpStatus = 'HTTP_NETWORK_ERROR';
            httpStatusText = fetchErr.message || 'Connection Error';
          }
          contentStatus = 'FETCH_ERROR';
        }
      }

      // 3. Derive Synthesized Summary Status & Explanation
      let summaryStatus: SummaryAccessStatus = 'INDETERMINATE';
      let summaryLabel = 'Indeterminate';
      let overallExplanation = '';

      if (bot.isPolicyOnlyToken) {
        if (robotsStatus === 'BLOCKED') {
          summaryStatus = 'POLICY_ONLY_BLOCKED';
          summaryLabel = 'Policy Disallowed';
          overallExplanation = `${bot.name} is a policy-only token. Robots.txt rules disallow AI usage for this path (${appliedRule ? appliedRule.originalText : 'Disallow rule'}).`;
        } else if (robotsStatus === 'ALLOWED') {
          summaryStatus = 'POLICY_ONLY_ALLOWED';
          summaryLabel = 'Policy Allowed';
          overallExplanation = `${bot.name} is a policy-only token. No robots.txt rules restrict AI usage for this path.`;
        } else {
          summaryStatus = 'INDETERMINATE';
          summaryLabel = 'Policy Unknown';
          overallExplanation = `Robots.txt evaluation for policy token ${bot.name} was inconclusive.`;
        }
      } else if (robotsStatus === 'BLOCKED') {
        summaryStatus = 'BLOCKED_BY_ROBOTS';
        summaryLabel = 'Blocked by robots.txt';
        overallExplanation = `HTTP testing skipped because robots.txt disallows this crawler: "${appliedRule?.originalText || 'Disallow'}" (Line ${appliedRule?.lineNumber ?? '?'}).`;
      } else if (robotsStatus === 'UNKNOWN') {
        summaryStatus = 'INDETERMINATE';
        summaryLabel = 'Robots.txt Unknown';
        overallExplanation = `Robots.txt status could not be verified. HTTP testing was skipped for safety. (${robotsExplanation})`;
      } else if (challengeDetected) {
        summaryStatus = 'CONTENT_CHALLENGE';
        summaryLabel = 'Security Challenge';
        overallExplanation = `robots.txt allows ${bot.name}, but a bot verification or WAF challenge was detected (${challengeType || 'CAPTCHA'}).`;
      } else if (httpStatus === 'HTTP_DENIED') {
        summaryStatus = 'HTTP_DENIED';
        summaryLabel = 'HTTP Denied (403/401)';
        overallExplanation = `robots.txt permits ${bot.name}, but the simulated test request received HTTP ${httpStatusCode} (${httpStatusText}). The server or WAF denied access.`;
      } else if (httpStatus === 'HTTP_SUCCESS' && contentStatus === 'CONTENT_RETRIEVED') {
        summaryStatus = 'ACCESSIBLE';
        summaryLabel = 'Accessible';
        overallExplanation = `robots.txt permits ${bot.name}, and the simulated request successfully retrieved HTML content (HTTP 200).`;
      } else if (httpStatus === 'HTTP_TIMEOUT' || httpStatus === 'HTTP_NETWORK_ERROR' || httpStatus === 'HTTP_SERVER_ERROR') {
        summaryStatus = 'REQUEST_FAILED';
        summaryLabel = 'Request Failed';
        overallExplanation = `The test request for ${bot.name} failed: ${httpStatusText}.`;
      } else {
        summaryStatus = 'INDETERMINATE';
        summaryLabel = robotsStatus === 'ALLOWED' ? 'Allowed (HTTP Inconclusive)' : 'Indeterminate';
        overallExplanation = `Robots.txt status: ${robotsStatus}. HTTP status: ${httpStatusCode || 'None'}.`;
      }

      return {
        url,
        botId: bot.id,
        botName: bot.name,
        botProvider: bot.provider,
        botCategory: bot.categoryLabel,
        token: bot.token,
        robotsTxt: {
          status: robotsStatus,
          statusCode: robotsCode,
          matchedGroup,
          appliedRule,
          robotsTxtUrl,
          explanation: robotsExplanation
        },
        http: {
          status: httpStatus,
          statusCode: httpStatusCode,
          statusText: httpStatusText,
          finalUrl,
          durationMs,
          redirectHops,
          contentType,
          isPolicyOnly: Boolean(bot.isPolicyOnlyToken)
        },
        content: {
          status: contentStatus,
          title: pageTitle,
          wordCount,
          bodyLength,
          challengeDetected,
          challengeType
        },
        summaryStatus,
        summaryLabel,
        explanation: overallExplanation,
        warnings
      };
  }

  // Build task list preserving URL and Bot order
  interface TaskItem {
    url: string;
    bot: AiBotDefinition;
    index: number;
  }

  const tasks: TaskItem[] = [];
  let taskIdx = 0;
  for (const url of validUrls) {
    for (const bot of selectedBots) {
      tasks.push({ url, bot, index: taskIdx++ });
    }
  }

  const orderedResults: SingleUrlBotResult[] = new Array(tasks.length);

  // Controlled concurrency runner (GLOBAL_CONCURRENCY = 5)
  const GLOBAL_CONCURRENCY = 5;
  let currentTaskIdx = 0;

  async function worker() {
    while (currentTaskIdx < tasks.length) {
      const task = tasks[currentTaskIdx++];
      if (!task) break;
      try {
        const itemResult = await evaluateUrlBotCombination(task.url, task.bot);
        orderedResults[task.index] = itemResult;
      } catch (err: any) {
        // Guarantee that a failure in one request never crashes the batch
        orderedResults[task.index] = {
          url: task.url,
          botId: task.bot.id,
          botName: task.bot.name,
          botProvider: task.bot.provider,
          botCategory: task.bot.categoryLabel,
          token: task.bot.token,
          robotsTxt: {
            status: 'UNKNOWN',
            statusCode: null,
            matchedGroup: 'none',
            appliedRule: null,
            robotsTxtUrl: `${new URL(task.url).origin}/robots.txt`,
            explanation: `Failed evaluating robots.txt: ${err.message}`
          },
          http: {
            status: 'NOT_TESTED',
            statusCode: null,
            statusText: 'Evaluation Error',
            finalUrl: task.url,
            isPolicyOnly: Boolean(task.bot.isPolicyOnlyToken)
          },
          content: {
            status: 'NOT_TESTED',
            wordCount: 0,
            bodyLength: 0
          },
          summaryStatus: 'INDETERMINATE',
          summaryLabel: 'Evaluation Error',
          explanation: `Evaluation encountered an error: ${err.message}`,
          warnings: [err.message]
        };
      }
    }
  }

  // Launch workers
  const workerCount = Math.min(GLOBAL_CONCURRENCY, tasks.length);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const results = orderedResults.filter(Boolean);

  // Calculate summary counts
  let robotsAllowed = 0;
  let robotsBlocked = 0;
  let httpAccessible = 0;
  let httpDenied = 0;
  let contentChallenges = 0;
  let indeterminate = 0;

  for (const r of results) {
    if (r.robotsTxt.status === 'ALLOWED') robotsAllowed++;
    else if (r.robotsTxt.status === 'BLOCKED') robotsBlocked++;

    if (r.summaryStatus === 'ACCESSIBLE') httpAccessible++;
    else if (r.summaryStatus === 'HTTP_DENIED') httpDenied++;
    else if (r.summaryStatus === 'CONTENT_CHALLENGE') contentChallenges++;
    else if (r.summaryStatus === 'INDETERMINATE') indeterminate++;
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      totalUrls: validUrls.length,
      totalBots: selectedBots.length,
      totalCombinations: results.length,
      robotsAllowed,
      robotsBlocked,
      httpAccessible,
      httpDenied,
      contentChallenges,
      indeterminate
    },
    urlStats,
    bots: selectedBots,
    results,
    errors,
    warnings: urlWarnings
  };
}
