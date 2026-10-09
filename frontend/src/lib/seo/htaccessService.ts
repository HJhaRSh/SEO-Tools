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
const PRIVACY_NOTICE_API = 'Simulation processed via Apache rule engine (htaccess.madewithlove.com). Rules are evaluated in memory for diagnostics and are not saved.';
const PRIVACY_NOTICE_LOCAL = 'Simulation processed via Indian Marketers local rule engine. All rules were evaluated entirely within our secure backend.';

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
function evaluateLocalFallback(
  inputUrl: string,
  htaccess: string,
  serverVars: HtaccessServerVariables
): HtaccessTestResult {
  const urlObj = new URL(inputUrl);
  const lines = htaccess.split(/\r\n|\r|\n/);
  const trace: HtaccessTraceLine[] = [];
  const warnings: string[] = ['Evaluated via Indian Marketers deterministic local fallback engine.'];
  const errors: string[] = [];

  let currentUrl = inputUrl;
  let currentPath = urlObj.pathname;
  let currentQuery = urlObj.search;

  let rewriteEngineOn = false;
  let statusCode: number | null = null;
  let statusText: string | null = null;
  let transformationType: TransformationType = 'NO_CHANGE';
  let appliedRule: HtaccessTestResult['appliedRule'] = null;
  let stopped = false;
  let fullyEvaluated = true;

  interface PendingCondition {
    variable: string;
    pattern: string;
    flags: string[];
    isOr: boolean;
    lineNumber: number;
    originalText: string;
  }
  let pendingConditions: PendingCondition[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const lineNumber = idx + 1;
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (stopped) {
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

    if (directive === 'rewritebase') {
      trace.push({
        lineNumber,
        originalText: rawLine,
        directive: 'RewriteBase',
        isValid: true,
        wasReached: true,
        isMet: true,
        isSupported: true,
        message: `RewriteBase set to "${parts[1] || '/'}".`
      });
      continue;
    }

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
          finalOutput = `${urlObj.protocol}//${serverVars.HTTP_HOST || urlObj.host}${newDest}`;
        }
        currentUrl = finalOutput;
        statusCode = code;
        statusText = code === 301 ? 'Moved Permanently' : 'Found';
        transformationType = 'EXTERNAL_REDIRECT';
        appliedRule = { lineNumber, directive: parts[0], originalText: rawLine };
        stopped = true;

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
      const flags = flagsStr.replace(/^\[|\]$/g, '').split(',').map(f => f.trim().toUpperCase());

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

      // 1. Evaluate pending conditions
      let conditionsMet = true;
      let condCaptureMap: Record<number, string> = {};

      if (pendingConditions.length > 0) {
        let currentGroupResult = true;
        for (let cIdx = 0; cIdx < pendingConditions.length; cIdx++) {
          const cond = pendingConditions[cIdx];
          const testVal = (serverVars[cond.variable] ?? '') as string;
          let condMatched = false;

          let cleanPattern = cond.pattern;
          let isNegated = false;
          if (cleanPattern.startsWith('!')) {
            isNegated = true;
            cleanPattern = cleanPattern.substring(1);
          }

          // Special filesystem checks: -f, -d
          if (cleanPattern === '-f' || cleanPattern === '-d') {
            warnings.push(`Line ${cond.lineNumber}: Condition uses filesystem check ${cond.pattern}, which cannot be verified without local server files.`);
            fullyEvaluated = false;
          }

          try {
            const isCaseInsensitive = cond.flags.includes('NC');
            const rx = new RegExp(cleanPattern, isCaseInsensitive ? 'i' : undefined);
            const m = testVal.match(rx);
            if (m) {
              condMatched = !isNegated;
              m.forEach((val, i) => { condCaptureMap[i] = val; });
            } else {
              condMatched = isNegated;
            }
          } catch {
            condMatched = false;
          }

          trace.push({
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

          if (!cond.isOr) {
            if (!condMatched) {
              conditionsMet = false;
            }
          }
        }
        pendingConditions = [];
      }

      if (!conditionsMet) {
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

      // 2. Evaluate RewriteRule pattern
      // In .htaccess context, paths are matched without leading slash
      const testPathWithoutLeadingSlash = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
      const isCaseInsensitive = flags.some(f => f === 'NC' || f.startsWith('NC'));
      let ruleMatched = false;
      let ruleMatch: RegExpMatchArray | null = null;

      try {
        const rx = new RegExp(pattern, isCaseInsensitive ? 'i' : undefined);
        ruleMatch = testPathWithoutLeadingSlash.match(rx);
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
          message: `Path "${testPathWithoutLeadingSlash}" did not match pattern "${pattern}".`
        });
        continue;
      }

      // Rule Matched! Apply substitution
      let isRedirect = false;
      let rCode = 302;
      for (const flag of flags) {
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
          transformationType = 'FORBIDDEN';
          statusCode = 403;
          statusText = 'Forbidden';
          stopped = true;
        } else if (flag === 'G') {
          transformationType = 'GONE';
          statusCode = 410;
          statusText = 'Gone';
          stopped = true;
        }
      }

      if (transformationType === 'FORBIDDEN' || transformationType === 'GONE') {
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

      // Substitution replacements: $1-$9 (rule captures) and %1-%9 (cond captures)
      let substituted = substitution
        .replace(/\$([0-9])/g, (_, n) => ruleMatch![parseInt(n, 10)] || '')
        .replace(/%([0-9])/g, (_, n) => condCaptureMap[parseInt(n, 10)] || '');

      // Query String handling: QSA vs QSD vs trailing ?
      const qsa = flags.includes('QSA');
      const qsd = flags.includes('QSD');
      let finalQuery = currentQuery;

      if (substituted.includes('?')) {
        const qIdx = substituted.indexOf('?');
        const newQueryPart = substituted.substring(qIdx + 1);
        substituted = substituted.substring(0, qIdx);
        if (qsa && currentQuery) {
          finalQuery = (newQueryPart ? newQueryPart + '&' : '') + (currentQuery.startsWith('?') ? currentQuery.substring(1) : currentQuery);
        } else {
          finalQuery = newQueryPart ? `?${newQueryPart}` : '';
        }
      } else if (qsd) {
        finalQuery = '';
      }

      let transformedUrl = substituted;
      if (substituted.startsWith('http://') || substituted.startsWith('https://')) {
        transformedUrl = substituted + (finalQuery ? (finalQuery.startsWith('?') ? finalQuery : '?' + finalQuery) : '');
        isRedirect = true; // Absolute URLs imply external redirect
      } else {
        if (!substituted.startsWith('/')) {
          substituted = '/' + substituted;
        }
        transformedUrl = `${urlObj.protocol}//${serverVars.HTTP_HOST || urlObj.host}${substituted}${finalQuery ? (finalQuery.startsWith('?') ? finalQuery : '?' + finalQuery) : ''}`;
      }

      currentUrl = transformedUrl;
      appliedRule = { lineNumber, directive: 'RewriteRule', originalText: rawLine };

      if (isRedirect) {
        transformationType = 'EXTERNAL_REDIRECT';
        statusCode = rCode;
        statusText = rCode === 301 ? 'Moved Permanently' : 'Found';
      } else {
        transformationType = 'INTERNAL_REWRITE';
        statusCode = null;
        statusText = 'Internal Rewrite';
      }

      const isLast = flags.includes('L') || flags.includes('END');
      if (isLast) {
        stopped = true;
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

      continue;
    }

    // Directive not explicitly handled locally
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
 * Main function: Evaluates .htaccess rules against target URL.
 * Automatically tries Primary API first; falls back to deterministic Local Engine on failure.
 */
export async function testHtaccessRules(request: HtaccessTestRequest): Promise<HtaccessTestResult> {
  const { validUrl, rawUrl, cleanedHtaccess } = validateHtaccessInput(request.url, request.htaccess);
  const serverVars = deriveServerVariables(validUrl, request.serverVariables);

  if (request.settings?.useLocalOnly) {
    return evaluateLocalFallback(rawUrl, cleanedHtaccess, serverVars);
  }

  try {
    const apiRes = await callPrimaryApi(rawUrl, cleanedHtaccess, serverVars);

    const outputUrl = apiRes.output_url || rawUrl;
    const outputStatusCode = apiRes.output_status_code !== undefined ? apiRes.output_status_code : null;
    const changed = outputUrl !== rawUrl;

    let transformationType: TransformationType = 'NO_CHANGE';
    let statusText: string | null = null;

    if (outputStatusCode) {
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

    let appliedRule: HtaccessTestResult['appliedRule'] = null;
    const trace: HtaccessTraceLine[] = [];

    if (Array.isArray(apiRes.lines)) {
      apiRes.lines.forEach((line: any, idx: number) => {
        const lineNum = idx + 1;
        const directive = (line.value || '').trim().split(/\s+/)[0] || '';
        const isMet = Boolean(line.isMet);
        const wasReached = Boolean(line.wasReached);

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
          isValid: Boolean(line.isValid),
          wasReached,
          isMet,
          isSupported: line.isSupported !== false,
          message: line.message || (isMet ? 'Condition / Rule met' : 'Did not match')
        });
      });
    }

    return {
      success: true,
      inputUrl: rawUrl,
      outputUrl,
      transformationType,
      statusCode: outputStatusCode,
      statusText,
      changed,
      fullyEvaluated: true,
      engineUsed: 'PRIMARY_API',
      appliedRule,
      trace,
      serverVariablesUsed: serverVars,
      warnings: [],
      errors: [],
      privacyNotice: PRIVACY_NOTICE_API
    };
  } catch (apiErr: any) {
    // Graceful fallback to deterministic local engine
    const fallback = evaluateLocalFallback(rawUrl, cleanedHtaccess, serverVars);
    fallback.warnings.push(`Primary engine unavailable (${apiErr.message}). Evaluated via local fallback engine.`);
    return fallback;
  }
}
