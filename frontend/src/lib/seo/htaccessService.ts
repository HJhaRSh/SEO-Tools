import https from 'https';
import {
  HtaccessTestRequest,
  HtaccessTestResult,
  HtaccessServerVariables,
  HtaccessTraceLine,
  TransformationType
} from './htaccessTypes';
import { validateHtaccessInput } from './htaccessValidation';

const REMOTE_API_TIMEOUT_MS = 8000;
const PRIVACY_NOTICE_API = 'Simulation processed via external Apache rule engine (htaccess.madewithlove.com). Submitted rules are securely transmitted to the testing provider for evaluation.';
const PRIVACY_NOTICE_LOCAL = 'Simulation processed via Indian Marketers deterministic local rule engine. All rules were evaluated entirely within our secure backend.';

/**
 * Derives default Apache server variables from an input URL.
 */
export function deriveServerVariables(urlObj: URL, overrides: HtaccessServerVariables = {}): HtaccessServerVariables {
  const isHttps = urlObj.protocol === 'https:';
  const defaultPort = isHttps ? '443' : '80';
  const port = urlObj.port || defaultPort;

  const defaults: HtaccessServerVariables = {
    HTTP_HOST: urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : ''),
    HTTPS: isHttps ? 'on' : 'off',
    REQUEST_URI: urlObj.pathname + urlObj.search,
    QUERY_STRING: urlObj.search.startsWith('?') ? urlObj.search.substring(1) : '',
    SERVER_NAME: urlObj.hostname,
    SERVER_PORT: port,
    REQUEST_METHOD: 'GET',
    HTTP_USER_AGENT: 'Mozilla/5.0 (compatible; IndianMarketersBot/1.0; +https://indianmarketers.in)'
  };

  return { ...defaults, ...overrides };
}

/**
 * Evaluates rules via the primary madewithlove Apache testing engine.
 */
async function callPrimaryApi(
  url: string,
  htaccess: string,
  serverVars: HtaccessServerVariables
): Promise<any> {
  const payload = JSON.stringify({
    url,
    htaccess,
    serverVariables: serverVars
  });

  return new Promise((resolve, reject) => {
    let timedOut = false;

    const req = https.request('https://htaccess.madewithlove.com/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'IndianMarketers-SeoTools/1.0 (+https://indianmarketers.in)'
      },
      timeout: REMOTE_API_TIMEOUT_MS
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e: any) {
            reject(new Error(`Invalid JSON received from primary API: ${e.message}`));
          }
        } else {
          reject(new Error(`Primary testing API returned HTTP status ${res.statusCode}: ${body.substring(0, 200)}`));
        }
      });
    });

    req.on('timeout', () => {
      timedOut = true;
      req.destroy();
      reject(new Error(`Primary testing API request timed out after ${REMOTE_API_TIMEOUT_MS}ms`));
    });

    req.on('error', (err) => {
      if (!timedOut) reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Local Fallback Simulator.
 * Deterministically evaluates common SEO rewrite & redirect directives
 * (RewriteEngine, RewriteCond, RewriteRule, Redirect, RedirectMatch).
 * For unsupported/ambiguous directives, returns UNSUPPORTED/UNKNOWN without guessing.
 */
// Flag classifications:
// Fully supported: R, R=xxx, L, END, NC, QSA, QSD, NE, F, G
// Unsupported in fallback: PT, N, S, C, E, B, CO, H, T
const UNSUPPORTED_FLAGS = new Set(['PT', 'N', 'S', 'C', 'E', 'B', 'CO', 'H', 'T']);

interface PendingCondition {
  variable: string;
  pattern: string;
  flags: string[];
  isOr: boolean;
  lineNumber: number;
  originalText: string;
}

/**
 * Evaluates pending RewriteCond directives using proper Apache boolean grouping.
 * Consecutive conditions marked with [OR] form an OR-clause.
 * An AND operation connects these clauses.
 * Returns { met: boolean, condCaptureMap: Record<number, string>, traceItems: HtaccessTraceLine[], warnings: string[], hasIndeterminate: boolean }
 */
function evaluateConditionGroups(
  conditions: PendingCondition[],
  serverVars: HtaccessServerVariables
): {
  met: boolean;
  condCaptureMap: Record<number, string>;
  traceItems: HtaccessTraceLine[];
  warnings: string[];
  hasIndeterminate: boolean;
} {
  const traceItems: HtaccessTraceLine[] = [];
  const warnings: string[] = [];
  const condCaptureMap: Record<number, string> = {};
  let hasIndeterminate = false;

  if (conditions.length === 0) {
    return { met: true, condCaptureMap, traceItems, warnings, hasIndeterminate };
  }

  // Partition conditions into OR-groups.
  // A group continues while cond.isOr is true. The first condition with !isOr closes the group.
  const groups: PendingCondition[][] = [];
  let currentGroup: PendingCondition[] = [];

  for (const cond of conditions) {
    currentGroup.push(cond);
    if (!cond.isOr) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  let allGroupsPassed = true;

  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const group = groups[gIdx];
    let groupMatched = false;
    let groupFirstCaptures: Record<number, string> | null = null;

    for (let cIdx = 0; cIdx < group.length; cIdx++) {
      const cond = group[cIdx];
      const testVal = (serverVars[cond.variable] ?? '') as string;
      let condMatched = false;

      let cleanPattern = cond.pattern;
      let isNegated = false;
      if (cleanPattern.startsWith('!')) {
        isNegated = true;
        cleanPattern = cleanPattern.substring(1);
      }

      // Filesystem checks (-f, -d, -s, -l) cannot be determined locally without live server fs
      if (cleanPattern === '-f' || cleanPattern === '-d' || cleanPattern === '-s' || cleanPattern === '-l') {
        warnings.push(`Line ${cond.lineNumber}: Condition uses filesystem check ${cond.pattern}, which cannot be verified without local server files.`);
        hasIndeterminate = true;
      }

      const isCaseInsensitive = cond.flags.some(f => f === 'NC' || f.startsWith('NC'));

      try {
        const rx = new RegExp(cleanPattern, isCaseInsensitive ? 'i' : undefined);
        const m = testVal.match(rx);
        if (m) {
          condMatched = !isNegated;
          if (condMatched && !groupFirstCaptures) {
            groupFirstCaptures = {};
            m.forEach((val, i) => {
              if (groupFirstCaptures) groupFirstCaptures[i] = val;
            });
          }
        } else {
          condMatched = isNegated;
        }
      } catch {
        condMatched = false;
      }

      if (condMatched) {
        groupMatched = true;
      }

      traceItems.push({
        lineNumber: cond.lineNumber,
        originalText: cond.originalText,
        directive: 'RewriteCond',
        isValid: true,
        wasReached: true,
        isMet: condMatched,
        isSupported: true,
        message: condMatched
          ? `Condition %{${cond.variable}} ("${testVal}") matched pattern "${cond.pattern}".`
          : `Condition %{${cond.variable}} ("${testVal}") did not match pattern "${cond.pattern}".`
      });
    }

    if (groupFirstCaptures) {
      Object.assign(condCaptureMap, groupFirstCaptures);
    }

    if (!groupMatched) {
      allGroupsPassed = false;
    }
  }

  return {
    met: allGroupsPassed,
    condCaptureMap,
    traceItems,
    warnings,
    hasIndeterminate
  };
}

/**
 * Local Fallback Simulator.
 * Evaluates common SEO rewrite & redirect directives with multi-pass internal rewrite support,
 * RewriteBase handling, strict flag auditing, and loop detection.
 */
function evaluateLocalFallback(
  inputUrl: string,
  htaccess: string,
  serverVars: HtaccessServerVariables,
  settings?: { directoryContext?: string; maxRewritePasses?: number }
): HtaccessTestResult {
  const trace: HtaccessTraceLine[] = [];
  const warnings: string[] = ['Result evaluated using the local fallback simulator. Some advanced Apache behavior may not be supported.'];
  const errors: string[] = [];

  const maxPasses = settings?.maxRewritePasses || 5;
  const directoryContext = settings?.directoryContext || '';

  let currentUrl = inputUrl;
  let statusCode: number | null = null;
  let statusText: string | null = null;
  let transformationType: TransformationType = 'NO_CHANGE';
  let appliedRule: HtaccessTestResult['appliedRule'] = null;
  let fullyEvaluated = true;
  let stoppedExecution = false;

  const visitedUrls = new Set<string>([currentUrl]);
  const lines = htaccess.split(/\r\n|\r|\n/);

  for (let pass = 1; pass <= maxPasses; pass++) {
    if (stoppedExecution) break;

    const urlObj = new URL(currentUrl);
    let currentPath = urlObj.pathname;
    let currentQuery = urlObj.search; // includes '?' or ''
    const currentVars = deriveServerVariables(urlObj, serverVars);

    let rewriteEngineOn = false;
    let rewriteBase = directoryContext || '/';
    let pendingConditions: PendingCondition[] = [];
    let passRewritten = false;
    let hitLFlag = false;

    for (let idx = 0; idx < lines.length; idx++) {
      const lineNumber = idx + 1;
      const rawLine = lines[idx];
      const trimmed = rawLine.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      if (stoppedExecution || (hitLFlag && passRewritten)) {
        trace.push({
          lineNumber,
          originalText: rawLine,
          directive: trimmed.split(/\s+/)[0] || '',
          isValid: true,
          wasReached: false,
          isMet: false,
          isSupported: true,
          message: 'Rule was not reached because evaluation was stopped by a previous rule.'
        });
        continue;
      }

      const parts = trimmed.split(/\s+/);
      const directive = parts[0].toLowerCase();

      // RewriteEngine
      if (directive === 'rewriteengine') {
        const state = (parts[1] || '').toLowerCase();
        rewriteEngineOn = state === 'on';
        trace.push({
          lineNumber,
          originalText: rawLine,
          directive: 'RewriteEngine',
          isValid: state === 'on' || state === 'off',
          wasReached: true,
          isMet: true,
          isSupported: true,
          message: `RewriteEngine turned ${rewriteEngineOn ? 'ON' : 'OFF'}.`
        });
        continue;
      }

      // RewriteBase
      if (directive === 'rewritebase') {
        rewriteBase = parts[1] || '/';
        if (!rewriteBase.startsWith('/')) {
          rewriteBase = '/' + rewriteBase;
        }
        if (!rewriteBase.endsWith('/')) {
          rewriteBase = rewriteBase + '/';
        }
        trace.push({
          lineNumber,
          originalText: rawLine,
          directive: 'RewriteBase',
          isValid: true,
          wasReached: true,
          isMet: true,
          isSupported: true,
          message: `RewriteBase set to "${rewriteBase}".`
        });
        continue;
      }

      // mod_alias: Redirect / RedirectMatch
      if (directive === 'redirect' || directive === 'redirectmatch') {
        const isMatch = directive === 'redirectmatch';
        let code = 302;
        let fromIdx = 1;

        if (/^\d{3}$/.test(parts[1])) {
          code = parseInt(parts[1], 10);
          fromIdx = 2;
        } else if (parts[1]?.toLowerCase() === 'permanent') {
          code = 301;
          fromIdx = 2;
        } else if (parts[1]?.toLowerCase() === 'temp') {
          code = 302;
          fromIdx = 2;
        }

        const fromPattern = parts[fromIdx];
        const targetDestination = parts[fromIdx + 1];

        if (!fromPattern || !targetDestination) {
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: parts[0],
            isValid: false,
            wasReached: true,
            isMet: false,
            isSupported: true,
            message: 'Malformed Redirect directive: missing source or destination pattern.'
          });
          errors.push(`Line ${lineNumber}: Malformed ${parts[0]} directive.`);
          continue;
        }

        let matches = false;
        let newDest = targetDestination;

        if (isMatch) {
          try {
            const reg = new RegExp(fromPattern);
            const m = currentPath.match(reg);
            if (m) {
              matches = true;
              newDest = targetDestination.replace(/\$([0-9])/g, (_, n) => m[parseInt(n, 10)] || '');
            }
          } catch (e: any) {
            trace.push({
              lineNumber,
              originalText: rawLine,
              directive: 'RedirectMatch',
              isValid: false,
              wasReached: true,
              isMet: false,
              isSupported: true,
              message: `Invalid regex pattern in RedirectMatch: ${e.message}`
            });
            continue;
          }
        } else {
          if (currentPath.startsWith(fromPattern)) {
            matches = true;
            const remainder = currentPath.substring(fromPattern.length);
            newDest = targetDestination.endsWith('/') && remainder.startsWith('/')
              ? targetDestination + remainder.substring(1)
              : targetDestination + remainder;
          }
        }

        if (matches) {
          let finalOutput = newDest;
          if (newDest.startsWith('/')) {
            finalOutput = `${urlObj.protocol}//${currentVars.HTTP_HOST || urlObj.host}${newDest}`;
          }
          currentUrl = finalOutput;
          statusCode = code;
          statusText = code === 301 ? 'Moved Permanently' : 'Found';
          transformationType = 'EXTERNAL_REDIRECT';
          appliedRule = { lineNumber, directive: parts[0], originalText: rawLine };
          stoppedExecution = true;

          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: parts[0],
            isValid: true,
            wasReached: true,
            isMet: true,
            isSupported: true,
            message: `Redirect matched. Destination transformed to ${finalOutput} with HTTP ${code}.`
          });
        } else {
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: parts[0],
            isValid: true,
            wasReached: true,
            isMet: false,
            isSupported: true,
            message: `Path "${currentPath}" does not match redirect pattern "${fromPattern}".`
          });
        }
        continue;
      }

      // RewriteCond
      if (directive === 'rewritecond') {
        if (!rewriteEngineOn) {
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteCond',
            isValid: true,
            wasReached: false,
            isMet: false,
            isSupported: true,
            message: 'Ignored because RewriteEngine is OFF.'
          });
          continue;
        }

        const varMatch = parts[1]?.match(/%\{([^}]+)\}/);
        const varName = varMatch ? varMatch[1] : '';
        const pattern = parts[2] || '';
        const flagsStr = parts[3] || '';
        const flags = flagsStr.replace(/^\[|\]$/g, '').split(',').map(f => f.trim().toUpperCase());

        pendingConditions.push({
          variable: varName,
          pattern,
          flags,
          isOr: flags.includes('OR'),
          lineNumber,
          originalText: rawLine
        });
        continue;
      }

      // RewriteRule
      if (directive === 'rewriterule') {
        if (!rewriteEngineOn) {
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteRule',
            isValid: true,
            wasReached: false,
            isMet: false,
            isSupported: true,
            message: 'Ignored because RewriteEngine is OFF.'
          });
          pendingConditions = [];
          continue;
        }

        const pattern = parts[1];
        const substitution = parts[2];
        const flagsStr = parts[3] || '';
        const rawFlags = flagsStr.replace(/^\[|\]$/g, '').split(',').map(f => f.trim()).filter(Boolean);
        const flagsUpper = rawFlags.map(f => f.toUpperCase());

        if (!pattern || substitution === undefined) {
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteRule',
            isValid: false,
            wasReached: true,
            isMet: false,
            isSupported: true,
            message: 'Malformed RewriteRule: missing pattern or substitution.'
          });
          pendingConditions = [];
          continue;
        }

        // 1. Check for unsupported flags
        const foundUnsupported = rawFlags.filter(f => {
          const upper = f.toUpperCase().split('=')[0];
          return UNSUPPORTED_FLAGS.has(upper);
        });

        // 2. Evaluate conditions with OR grouping
        const condEval = evaluateConditionGroups(pendingConditions, currentVars);
        pendingConditions = [];
        trace.push(...condEval.traceItems);
        warnings.push(...condEval.warnings);

        if (condEval.hasIndeterminate) {
          fullyEvaluated = false;
        }

        if (!condEval.met) {
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteRule',
            isValid: true,
            wasReached: true,
            isMet: false,
            isSupported: true,
            message: 'RewriteRule skipped because preceding RewriteCond was not met.'
          });
          continue;
        }

        // 3. Evaluate RewriteRule pattern
        // In Apache per-directory context, the directory prefix (e.g. /shop/) is stripped before matching,
        // and any leading slash is omitted from the pattern test string.
        let testPath = currentPath;
        if (directoryContext) {
          const dirPrefix = directoryContext.startsWith('/') ? directoryContext : '/' + directoryContext;
          if (testPath.startsWith(dirPrefix)) {
            testPath = testPath.substring(dirPrefix.length);
          }
        }
        if (testPath.startsWith('/')) {
          testPath = testPath.substring(1);
        }

        const isCaseInsensitive = flagsUpper.some(f => f === 'NC' || f.startsWith('NC'));
        let ruleMatched = false;
        let ruleMatch: RegExpMatchArray | null = null;

        try {
          const rx = new RegExp(pattern, isCaseInsensitive ? 'i' : undefined);
          ruleMatch = testPath.match(rx);
          if (ruleMatch) {
            ruleMatched = true;
          }
        } catch (e: any) {
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteRule',
            isValid: false,
            wasReached: true,
            isMet: false,
            isSupported: true,
            message: `Invalid regex pattern in RewriteRule: ${e.message}`
          });
          continue;
        }

        if (!ruleMatched || !ruleMatch) {
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteRule',
            isValid: true,
            wasReached: true,
            isMet: false,
            isSupported: true,
            message: `Path "${testPath}" did not match pattern "${pattern}".`
          });
          continue;
        }

        // Rule matched! Check if any unsupported flag influences this rule
        if (foundUnsupported.length > 0) {
          const unMsg = `Cannot reliably simulate this rule because the [${foundUnsupported.join(', ')}] flag is not supported by the local fallback engine.`;
          warnings.push(`Line ${lineNumber}: ${unMsg}`);
          fullyEvaluated = false;
          transformationType = 'UNSUPPORTED';
          statusText = 'Unsupported Flag';

          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteRule',
            isValid: true,
            wasReached: true,
            isMet: true,
            isSupported: false,
            message: unMsg
          });
          stoppedExecution = true;
          continue;
        }

        // Evaluate supported flags
        let isRedirect = false;
        let rCode = 302;
        let isForbidden = false;
        let isGone = false;
        let isEnd = false;
        let isLast = false;
        let qsa = false;
        let qsd = false;

        for (const flag of flagsUpper) {
          if (flag === 'R' || flag === 'R=302') {
            isRedirect = true;
            rCode = 302;
          } else if (flag === 'R=301') {
            isRedirect = true;
            rCode = 301;
          } else if (flag === 'R=307') {
            isRedirect = true;
            rCode = 307;
          } else if (flag === 'R=308') {
            isRedirect = true;
            rCode = 308;
          } else if (flag === 'F') {
            isForbidden = true;
          } else if (flag === 'G') {
            isGone = true;
          } else if (flag === 'END') {
            isEnd = true;
          } else if (flag === 'L') {
            isLast = true;
          } else if (flag === 'QSA') {
            qsa = true;
          } else if (flag === 'QSD') {
            qsd = true;
          }
        }

        if (isForbidden || isGone) {
          transformationType = isForbidden ? 'FORBIDDEN' : 'GONE';
          statusCode = isForbidden ? 403 : 410;
          statusText = isForbidden ? 'Forbidden' : 'Gone';
          stoppedExecution = true;
          appliedRule = { lineNumber, directive: 'RewriteRule', originalText: rawLine };

          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteRule',
            isValid: true,
            wasReached: true,
            isMet: true,
            isSupported: true,
            message: `Rule matched. Access halted with HTTP ${statusCode} (${statusText}).`
          });
          continue;
        }

        // Dash '-' substitution: do not change path
        if (substitution === '-') {
          appliedRule = { lineNumber, directive: 'RewriteRule', originalText: rawLine };
          trace.push({
            lineNumber,
            originalText: rawLine,
            directive: 'RewriteRule',
            isValid: true,
            wasReached: true,
            isMet: true,
            isSupported: true,
            message: `Rule matched with '-' (no substitution performed).`
          });
          if (isEnd || isLast) {
            stoppedExecution = true;
          }
          continue;
        }

        // Apply capture backreferences: $1-$9 (rule captures) and %1-%9 (cond captures)
        let substituted = substitution
          .replace(/\$([0-9])/g, (_, n) => ruleMatch![parseInt(n, 10)] || '')
          .replace(/%([0-9])/g, (_, n) => condEval.condCaptureMap[parseInt(n, 10)] || '');

        // Query string handling
        let finalQuery = currentQuery; // e.g. "?id=123" or ""

        if (substituted.includes('?')) {
          const qIdx = substituted.indexOf('?');
          const newQueryPart = substituted.substring(qIdx + 1);
          substituted = substituted.substring(0, qIdx);

          if (qsa && currentQuery) {
            const rawCur = currentQuery.startsWith('?') ? currentQuery.substring(1) : currentQuery;
            finalQuery = newQueryPart ? `?${newQueryPart}&${rawCur}` : (rawCur ? `?${rawCur}` : '');
          } else {
            finalQuery = newQueryPart ? `?${newQueryPart}` : '';
          }
        } else if (qsd) {
          finalQuery = '';
        }

        let transformedUrl = substituted;
        const isAbsoluteTarget = substituted.startsWith('http://') || substituted.startsWith('https://');

        if (isAbsoluteTarget) {
          transformedUrl = substituted + finalQuery;
          isRedirect = true; // Absolute URLs imply external redirect
        } else {
          // Relative or root-relative substitution:
          // If relative (does NOT start with '/'), prepend rewriteBase
          let pathWithBase = substituted;
          if (!pathWithBase.startsWith('/')) {
            const basePrefix = rewriteBase.endsWith('/') ? rewriteBase : rewriteBase + '/';
            pathWithBase = basePrefix + pathWithBase;
          }
          // Normalize double slashes
          pathWithBase = pathWithBase.replace(/\/+/g, '/');

          transformedUrl = `${urlObj.protocol}//${currentVars.HTTP_HOST || urlObj.host}${pathWithBase}${finalQuery}`;
        }

        currentUrl = transformedUrl;
        appliedRule = { lineNumber, directive: 'RewriteRule', originalText: rawLine };
        passRewritten = true;

        if (isRedirect) {
          transformationType = 'EXTERNAL_REDIRECT';
          statusCode = rCode;
          statusText = rCode === 301 ? 'Moved Permanently' : 'Found';
          stoppedExecution = true;
        } else {
          transformationType = 'INTERNAL_REWRITE';
          statusCode = null;
          statusText = 'Internal Rewrite';
        }

        trace.push({
          lineNumber,
          originalText: rawLine,
          directive: 'RewriteRule',
          isValid: true,
          wasReached: true,
          isMet: true,
          isSupported: true,
          message: isRedirect
            ? `Rule matched. Redirected to ${transformedUrl} with HTTP ${statusCode}.`
            : `Rule matched. Internally rewritten to ${transformedUrl}.`
        });

        if (isEnd) {
          // [END] halts all further passes completely
          stoppedExecution = true;
          break;
        }

        if (isLast) {
          // [L] stops this pass.
          hitLFlag = true;
          break;
        }

        continue;
      }

      // Other directives not simulated
      trace.push({
        lineNumber,
        originalText: rawLine,
        directive: parts[0],
        isValid: true,
        wasReached: true,
        isMet: false,
        isSupported: false,
        message: `Directive "${parts[0]}" is not supported by the local fallback simulator.`
      });
      warnings.push(`Line ${lineNumber}: Directive "${parts[0]}" is unsupported locally.`);
      fullyEvaluated = false;
    }

    // End of ruleset pass
    if (stoppedExecution) {
      break;
    }

    if (passRewritten) {
      // Internal rewrite occurred. Check for rewrite loop
      if (visitedUrls.has(currentUrl)) {
        transformationType = 'UNKNOWN';
        fullyEvaluated = false;
        warnings.push(`Rewrite loop detected on pass ${pass}. URL "${currentUrl}" was revisited.`);
        trace.push({
          lineNumber: 0,
          originalText: 'Multi-pass Loop Detection',
          directive: 'LoopGuard',
          isValid: true,
          wasReached: true,
          isMet: true,
          isSupported: true,
          message: `Evaluation halted: circular rewrite loop detected on pass ${pass}.`
        });
        stoppedExecution = true;
        break;
      }
      visitedUrls.add(currentUrl);

      if (pass === maxPasses) {
        warnings.push(`Maximum rewrite passes (${maxPasses}) reached. Simulation halted.`);
      }
    } else {
      // No rules modified the URL during this pass, processing complete
      break;
    }
  }

  const changed = currentUrl !== inputUrl;

  return {
    success: errors.length === 0,
    inputUrl,
    outputUrl: currentUrl,
    transformationType,
    statusCode,
    statusText,
    changed,
    fullyEvaluated,
    engineUsed: 'LOCAL_FALLBACK',
    appliedRule,
    trace,
    serverVariablesUsed: serverVars,
    warnings,
    errors,
    privacyNotice: PRIVACY_NOTICE_LOCAL
  };
}

/**
 * Internal simulation engine runner supporting dependency injection for testing.
 */
export async function testOnlyEvaluateWithMocking(
  request: HtaccessTestRequest,
  mockOptions?: { mockApiResponse?: any; mockApiError?: string }
): Promise<HtaccessTestResult> {
  const { validUrl, rawUrl, cleanedHtaccess } = validateHtaccessInput(request.url, request.htaccess);
  const serverVars = deriveServerVariables(validUrl, request.serverVariables);

  if (request.settings?.useLocalOnly) {
    return evaluateLocalFallback(rawUrl, cleanedHtaccess, serverVars, request.settings);
  }

  try {
    let apiRes: any;
    if (mockOptions?.mockApiError) {
      throw new Error(mockOptions.mockApiError);
    } else if (mockOptions?.mockApiResponse !== undefined) {
      apiRes = mockOptions.mockApiResponse;
    } else {
      apiRes = await callPrimaryApi(rawUrl, cleanedHtaccess, serverVars);
    }

    // Validate structure of API response
    if (!apiRes || typeof apiRes !== 'object') {
      throw new Error('Primary testing API returned an empty or non-object response.');
    }

    const outputUrl = typeof apiRes.output_url === 'string' ? apiRes.output_url : rawUrl;
    const outputStatusCode = apiRes.output_status_code !== undefined && apiRes.output_status_code !== null
      ? Number(apiRes.output_status_code)
      : null;
    const changed = outputUrl !== rawUrl;

    let transformationType: TransformationType = 'NO_CHANGE';
    let statusText: string | null = null;
    let fullyEvaluated = true;
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for syntax or directive validity issues reported by API lines
    let hasInvalidLine = false;
    let appliedRule: HtaccessTestResult['appliedRule'] = null;
    const trace: HtaccessTraceLine[] = [];

    if (Array.isArray(apiRes.lines)) {
      apiRes.lines.forEach((line: any, idx: number) => {
        const lineNum = idx + 1;
        const directive = (line.value || '').trim().split(/\s+/)[0] || '';
        const isMet = Boolean(line.isMet);
        const wasReached = Boolean(line.wasReached);
        const isValid = line.isValid !== false;
        const isSupported = line.isSupported !== false;

        if (!isValid) {
          hasInvalidLine = true;
          errors.push(`Line ${lineNum}: Invalid Apache directive or syntax: "${line.value || ''}".`);
        }
        if (!isSupported) {
          warnings.push(`Line ${lineNum}: Directive "${directive}" is unsupported by the primary simulation engine.`);
          fullyEvaluated = false;
        }

        if (isMet && (directive.toLowerCase() === 'rewriterule' || directive.toLowerCase().startsWith('redirect'))) {
          if (!appliedRule) {
            appliedRule = {
              lineNumber: lineNum,
              directive,
              originalText: line.value || ''
            };
          }
        }

        trace.push({
          lineNumber: lineNum,
          originalText: line.value || '',
          directive,
          isValid,
          wasReached,
          isMet,
          isSupported,
          message: line.message || (isMet ? 'Condition / Rule met' : 'Did not match')
        });
      });
    }

    if (hasInvalidLine) {
      transformationType = 'INVALID_RULES';
      statusText = 'Syntax or Directive Error';
      fullyEvaluated = false;
    } else if (outputStatusCode) {
      if (outputStatusCode === 301) {
        transformationType = 'EXTERNAL_REDIRECT';
        statusText = 'Moved Permanently';
      } else if (outputStatusCode === 302) {
        transformationType = 'EXTERNAL_REDIRECT';
        statusText = 'Found';
      } else if (outputStatusCode === 307 || outputStatusCode === 308) {
        transformationType = 'EXTERNAL_REDIRECT';
        statusText = outputStatusCode === 308 ? 'Permanent Redirect' : 'Temporary Redirect';
      } else if (outputStatusCode === 403) {
        transformationType = 'FORBIDDEN';
        statusText = 'Forbidden';
      } else if (outputStatusCode === 410) {
        transformationType = 'GONE';
        statusText = 'Gone';
      } else {
        transformationType = 'EXTERNAL_REDIRECT';
        statusText = `Redirect (${outputStatusCode})`;
      }
    } else if (changed) {
      transformationType = 'INTERNAL_REWRITE';
      statusText = 'Internal Rewrite';
    }

    return {
      success: errors.length === 0,
      inputUrl: rawUrl,
      outputUrl,
      transformationType,
      statusCode: outputStatusCode,
      statusText,
      changed,
      fullyEvaluated,
      engineUsed: 'PRIMARY_API',
      appliedRule,
      trace,
      serverVariablesUsed: serverVars,
      warnings,
      errors,
      privacyNotice: PRIVACY_NOTICE_API
    };
  } catch (apiErr: any) {
    // Graceful fallback to deterministic local engine
    const fallback = evaluateLocalFallback(rawUrl, cleanedHtaccess, serverVars, request.settings);
    fallback.warnings.push(`Primary engine unavailable (${apiErr.message}). Evaluated via local fallback engine.`);
    return fallback;
  }
}

/**
 * Public test function. Only processes validated, sanitized production settings.
 * Cannot be injected with mock API responses or mock errors.
 */
export async function testHtaccessRules(request: HtaccessTestRequest): Promise<HtaccessTestResult> {
  return testOnlyEvaluateWithMocking(request);
}

