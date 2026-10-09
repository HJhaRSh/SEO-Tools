/**
 * RFC 9309 and Google Robots Exclusion Protocol Compliant Parser & Matcher.
 */

export interface ParsedRule {
  type: 'allow' | 'disallow';
  pattern: string;
  lineNumber: number;
  originalText: string;
  rawLine: string;
}

export interface UserAgentGroup {
  agents: string[]; // Normalized lower-case tokens (e.g., ['googlebot', 'googlebot-news'])
  rules: ParsedRule[];
  crawlDelay?: number;
  lineNumbers: number[];
}

export interface ParsedRobotsTxt {
  groups: UserAgentGroup[];
  sitemaps: { url: string; lineNumber: number; originalText: string }[];
  otherDirectives: { directive: string; value: string; lineNumber: number }[];
  comments: { text: string; lineNumber: number }[];
  warnings: string[];
}

export interface MatchResult {
  status: 'ALLOWED' | 'BLOCKED' | 'UNKNOWN';
  allowed: boolean | null;
  appliedRule: ParsedRule | null;
  matchedGroup: string; // The token that matched or '*' or 'DEFAULT'
  explanation: string;
  specificity: number;
}

/**
 * Normalizes URL path & query for pattern matching according to RFC 9309.
 */
export function normalizePathAndQuery(inputPathAndQuery: string): string {
  let val = inputPathAndQuery.trim();
  // Strip fragment if present
  const hashIdx = val.indexOf('#');
  if (hashIdx !== -1) {
    val = val.substring(0, hashIdx);
  }

  if (!val.startsWith('/')) {
    val = '/' + val;
  }

  // RFC 9309 section 2.2.2: paths should be percent-decoded for unreserved characters,
  // but reserved characters preserved. Standard URI component handling:
  try {
    // Decode safely without throwing on malformed percent sequences
    val = val.replace(/%([0-9a-fA-F]{2})/g, (match, hex) => {
      const code = parseInt(hex, 16);
      // Unreserved characters: A-Z, a-z, 0-9, -, _, ., ~
      if (
        (code >= 0x41 && code <= 0x5a) ||
        (code >= 0x61 && code <= 0x7a) ||
        (code >= 0x30 && code <= 0x39) ||
        code === 0x2d || code === 0x5f || code === 0x2e || code === 0x7e
      ) {
        return String.fromCharCode(code);
      }
      return match.toUpperCase();
    });
  } catch {
    // Keep as is
  }

  return val;
}

/**
 * Parses raw robots.txt content into groups, directives, and sitemaps.
 */
export function parseRobotsTxt(content: string): ParsedRobotsTxt {
  const lines = content.split(/\r\n|\r|\n/);
  const groups: UserAgentGroup[] = [];
  const sitemaps: { url: string; lineNumber: number; originalText: string }[] = [];
  const otherDirectives: { directive: string; value: string; lineNumber: number }[] = [];
  const comments: { text: string; lineNumber: number }[] = [];
  const warnings: string[] = [];

  let currentAgents: string[] = [];
  let currentRules: ParsedRule[] = [];
  let currentGroupLines: number[] = [];
  let currentCrawlDelay: number | undefined;

  function flushGroup() {
    if (currentAgents.length > 0) {
      groups.push({
        agents: [...currentAgents],
        rules: [...currentRules],
        crawlDelay: currentCrawlDelay,
        lineNumbers: [...currentGroupLines]
      });
    }
    currentAgents = [];
    currentRules = [];
    currentGroupLines = [];
    currentCrawlDelay = undefined;
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const rawLine = lines[i];

    // Strip comments, but keep inline comment logic
    let line = rawLine;
    const hashIdx = line.indexOf('#');
    let inlineComment = '';
    if (hashIdx !== -1) {
      inlineComment = line.substring(hashIdx + 1).trim();
      comments.push({ text: inlineComment, lineNumber });
      line = line.substring(0, hashIdx);
    }

    const trimmed = line.trim();
    if (!trimmed) {
      // Blank line does not necessarily terminate group per RFC 9309,
      // but new user-agent after directives starts a new group.
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      warnings.push(`Line ${lineNumber}: Malformed directive ignored (no colon separator): "${rawLine}"`);
      continue;
    }

    const field = trimmed.substring(0, colonIdx).trim().toLowerCase();
    const value = trimmed.substring(colonIdx + 1).trim();

    if (field === 'user-agent') {
      if (currentRules.length > 0) {
        // We already had rules in the current group, so a new User-agent starts a fresh group
        flushGroup();
      }
      const token = value.toLowerCase();
      if (token) {
        currentAgents.push(token);
        currentGroupLines.push(lineNumber);
      } else {
        warnings.push(`Line ${lineNumber}: Empty User-agent token ignored.`);
      }
    } else if (field === 'allow' || field === 'disallow') {
      if (currentAgents.length === 0) {
        // Directive without prior User-agent: RFC 9309 says these should be ignored or belong to default
        warnings.push(`Line ${lineNumber}: ${field} directive without preceding User-agent ignored: "${rawLine}"`);
        continue;
      }

      if (!value && field === 'disallow') {
        // Disallow: with empty value means allow all!
        currentRules.push({
          type: 'allow',
          pattern: '',
          lineNumber,
          originalText: rawLine.trim(),
          rawLine
        });
      } else if (!value && field === 'allow') {
        // Allow with empty value is a no-op
      } else {
        currentRules.push({
          type: field as 'allow' | 'disallow',
          pattern: value,
          lineNumber,
          originalText: rawLine.trim(),
          rawLine
        });
      }
    } else if (field === 'sitemap') {
      if (value) {
        sitemaps.push({
          url: value,
          lineNumber,
          originalText: rawLine.trim()
        });
      }
    } else if (field === 'crawl-delay') {
      const delay = parseFloat(value);
      if (!isNaN(delay)) {
        currentCrawlDelay = delay;
      }
      otherDirectives.push({ directive: 'crawl-delay', value, lineNumber });
    } else {
      otherDirectives.push({ directive: field, value, lineNumber });
    }
  }

  // Flush trailing group
  flushGroup();

  return {
    groups,
    sitemaps,
    otherDirectives,
    comments,
    warnings
  };
}

/**
 * Compiles a robots.txt pattern (with * and $) into a RegExp for path matching.
 * Matches from the beginning of the path (implicit ^).
 */
export function compileRobotsPatternToRegex(pattern: string): RegExp {
  if (!pattern) {
    // Empty pattern matches nothing or matches empty prefix
    return /^/;
  }

  let escaped = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      escaped += '.*';
    } else if (ch === '$' && i === pattern.length - 1) {
      escaped += '$';
    } else if ('/.*+?^${}()|[]\\'.includes(ch)) {
      escaped += '\\' + ch;
    } else {
      escaped += ch;
    }
  }

  // Path matching always starts from beginning
  return new RegExp('^' + escaped);
}

/**
 * Checks if a pattern matches a URL path and returns true/false.
 */
export function matchPattern(pattern: string, pathAndQuery: string): boolean {
  if (!pattern) return false;
  const regex = compileRobotsPatternToRegex(pattern);
  return regex.test(pathAndQuery);
}

/**
 * Finds all rules applicable to a specific user-agent token from the parsed groups.
 * RFC 9309 & Googlebot rule:
 * 1. Look for group explicitly matching the user-agent token.
 *    If multiple groups match (e.g. repeated 'User-agent: Googlebot' blocks), combine their rules.
 * 2. If no explicit group matched, check fallback token (e.g. googlebot for googlebot-image) if provided.
 * 3. If still no group matched, look for wildcard group '*'.
 * 4. If no wildcard group exists, no restrictions apply.
 */
export function selectRulesForUserAgent(
  groups: UserAgentGroup[],
  targetToken: string,
  fallbackToken?: string
): { rules: ParsedRule[]; matchedToken: string; crawlDelay?: number } {
  const normTarget = targetToken.toLowerCase();

  // 1. Direct match
  const directGroups = groups.filter(g => g.agents.includes(normTarget));
  if (directGroups.length > 0) {
    const combinedRules: ParsedRule[] = [];
    let crawlDelay: number | undefined;
    for (const g of directGroups) {
      combinedRules.push(...g.rules);
      if (g.crawlDelay !== undefined && crawlDelay === undefined) {
        crawlDelay = g.crawlDelay;
      }
    }
    return { rules: combinedRules, matchedToken: normTarget, crawlDelay };
  }

  // 2. Fallback match (e.g. Googlebot-Image falling back to Googlebot group)
  if (fallbackToken) {
    const normFallback = fallbackToken.toLowerCase();
    const fallbackGroups = groups.filter(g => g.agents.includes(normFallback));
    if (fallbackGroups.length > 0) {
      const combinedRules: ParsedRule[] = [];
      let crawlDelay: number | undefined;
      for (const g of fallbackGroups) {
        combinedRules.push(...g.rules);
        if (g.crawlDelay !== undefined && crawlDelay === undefined) {
          crawlDelay = g.crawlDelay;
        }
      }
      return { rules: combinedRules, matchedToken: normFallback, crawlDelay };
    }
  }

  // 3. Wildcard match '*'
  const wildcardGroups = groups.filter(g => g.agents.includes('*'));
  if (wildcardGroups.length > 0) {
    const combinedRules: ParsedRule[] = [];
    let crawlDelay: number | undefined;
    for (const g of wildcardGroups) {
      combinedRules.push(...g.rules);
      if (g.crawlDelay !== undefined && crawlDelay === undefined) {
        crawlDelay = g.crawlDelay;
      }
    }
    return { rules: combinedRules, matchedToken: '*', crawlDelay };
  }

  // 4. No matching group
  return { rules: [], matchedToken: 'none' };
}

/**
 * Evaluates path against applicable rules according to RFC 9309 Section 2.2.2 & Google spec:
 * - Most specific rule (longest pattern length in octets) wins.
 * - If Allow and Disallow match with the SAME length, ALLOW takes precedence.
 * - If no rules match, ALLOWED by default.
 */
export function evaluateCrawlability(
  rules: ParsedRule[],
  pathAndQuery: string,
  userAgentName: string,
  matchedToken: string
): MatchResult {
  const normalized = normalizePathAndQuery(pathAndQuery);

  let bestRule: ParsedRule | null = null;
  let bestSpecificity = -1;

  for (const rule of rules) {
    // If pattern is empty (e.g. Disallow: with nothing), it allowed everything earlier
    if (rule.pattern === '') {
      continue;
    }

    if (matchPattern(rule.pattern, normalized)) {
      // RFC 9309 section 2.2.2: The most specific rule is determined by the longest matching pattern in octets (UTF-8 bytes)
      const specificity = Buffer.byteLength(rule.pattern, 'utf8');

      if (specificity > bestSpecificity) {
        bestSpecificity = specificity;
        bestRule = rule;
      } else if (specificity === bestSpecificity) {
        // Tie-breaker: Allow takes precedence over Disallow with equal specificity per RFC 9309 section 2.2.2
        if (rule.type === 'allow' && bestRule && bestRule.type === 'disallow') {
          bestRule = rule;
        }
      }
    }
  }

  if (!bestRule) {
    return {
      status: 'ALLOWED',
      allowed: true,
      appliedRule: null,
      matchedGroup: matchedToken,
      specificity: 0,
      explanation: `No applicable robots.txt rule blocks this URL for ${userAgentName}. Crawling is allowed by default.`
    };
  }

  if (bestRule.type === 'allow') {
    return {
      status: 'ALLOWED',
      allowed: true,
      appliedRule: bestRule,
      matchedGroup: matchedToken,
      specificity: bestSpecificity,
      explanation: `${userAgentName} is permitted to crawl this URL because it matches the Allow rule "${bestRule.originalText}" on line ${bestRule.lineNumber}.`
    };
  } else {
    return {
      status: 'BLOCKED',
      allowed: false,
      appliedRule: bestRule,
      matchedGroup: matchedToken,
      specificity: bestSpecificity,
      explanation: `${userAgentName} is blocked from crawling this URL because it matches the Disallow rule "${bestRule.originalText}" on line ${bestRule.lineNumber}.`
    };
  }
}
