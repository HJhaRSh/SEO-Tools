import { NextRequest, NextResponse } from 'next/server';
import { parseAndValidateBulkUrls } from '@/lib/seo/mobile-friendly/urlValidator';
import { auditSingleUrl } from '@/lib/seo/mobile-friendly/auditService';
import {
  SingleUrlMobileAuditResult,
  MobileAuditApiResponse,
} from '@/lib/seo/mobile-friendly/types';
import { DEFAULT_VIEWPORT_PRESET, MOBILE_VIEWPORT_PRESETS } from '@/lib/seo/mobile-friendly/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONCURRENT_REQUESTS = 3;

/**
 * Concurrency runner with bounded limit.
 */
async function asyncPool<T, R>(
  items: T[],
  limit: number,
  iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (limit <= items.length) {
      const e: Promise<void> = p.then(() => {
        executing.splice(executing.indexOf(e), 1);
      });
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(ret);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url, urls, viewportPreset } = body;

    // Determine target URLs and capture full validation report
    let validationReport: {
      totalSubmitted: number;
      validCount: number;
      duplicateCount: number;
      invalidRows: { row: number; raw: string; error: string }[];
    } = {
      totalSubmitted: 0,
      validCount: 0,
      duplicateCount: 0,
      invalidRows: [],
    };

    let targetUrls: string[] = [];
    if (Array.isArray(urls) && urls.length > 0) {
      const parsed = parseAndValidateBulkUrls(urls.join('\n'));
      targetUrls = parsed.validUrls;
      validationReport = {
        totalSubmitted: parsed.totalParsed,
        validCount: parsed.validUrls.length,
        duplicateCount: parsed.duplicateCount,
        invalidRows: parsed.invalidRows,
      };
    } else if (typeof url === 'string' && url.trim()) {
      const parsed = parseAndValidateBulkUrls(url.trim());
      targetUrls = parsed.validUrls;
      validationReport = {
        totalSubmitted: parsed.totalParsed,
        validCount: parsed.validUrls.length,
        duplicateCount: parsed.duplicateCount,
        invalidRows: parsed.invalidRows,
      };
    }

    if (targetUrls.length === 0) {
      const firstInvalid = validationReport.invalidRows[0];
      const errorMsg = firstInvalid
        ? `Invalid URL on line ${firstInvalid.row}: "${firstInvalid.raw}" (${firstInvalid.error})`
        : 'Please provide at least one valid HTTP or HTTPS webpage URL to test.';

      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
          errorCode: 'INVALID_URL',
          validationReport,
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const presetId = typeof viewportPreset === 'string' && MOBILE_VIEWPORT_PRESETS[viewportPreset]
      ? viewportPreset
      : 'standard';

    // Helper to categorize errors safely without leaking internal paths or IPs
    function categorizeError(err: any): { code: 'INVALID_URL' | 'BLOCKED_DESTINATION' | 'REQUEST_TIMEOUT' | 'FETCH_FAILED' | 'RENDER_FAILED' | 'UNSUPPORTED_CONTENT' | 'INTERNAL_ERROR'; message: string } {
      const msg = String(err?.message || '');
      if (err?.code === 'BLOCKED_DESTINATION' || msg.includes('SSRF') || msg.includes('restricted IP') || msg.includes('private') || msg.includes('localhost')) {
        return { code: 'BLOCKED_DESTINATION', message: 'Target destination is blocked for security reasons.' };
      }
      if (err?.code === 'FETCH_TIMEOUT' || msg.includes('timed out') || msg.includes('Timeout')) {
        return { code: 'REQUEST_TIMEOUT', message: 'The target server took too long to respond.' };
      }
      if (msg.includes('Invalid URL') || msg.includes('Disallowed protocol')) {
        return { code: 'INVALID_URL', message: 'The provided URL is not a valid public HTTP or HTTPS web address.' };
      }
      if (msg.includes('Non-HTML') || msg.includes('HTML document')) {
        return { code: 'UNSUPPORTED_CONTENT', message: 'The response content is not an HTML webpage.' };
      }
      if (msg.includes('fetch') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
        return { code: 'FETCH_FAILED', message: 'Failed to establish connection with the target server.' };
      }
      if (msg.includes('render') || msg.includes('Playwright') || msg.includes('Chromium')) {
        return { code: 'RENDER_FAILED', message: 'Browser rendering engine could not complete audit for this page.' };
      }
      return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred while auditing this webpage.' };
    }

    // Execute audit across requested URLs with bounded concurrency
    const results: SingleUrlMobileAuditResult[] = await asyncPool(
      targetUrls,
      CONCURRENT_REQUESTS,
      async (targetUrl): Promise<SingleUrlMobileAuditResult> => {
        try {
          return await auditSingleUrl({
            url: targetUrl,
            viewportPresetId: presetId,
          });
        } catch (err: any) {
          const categorized = categorizeError(err);
          const defaultVp = MOBILE_VIEWPORT_PRESETS[presetId] || DEFAULT_VIEWPORT_PRESET;
          return {
            url: targetUrl,
            finalUrl: targetUrl,
            durationMs: 0,
            testedAt: new Date().toISOString(),
            isCompleted: false,
            overallStatus: 'ERROR',
            overallSummary: categorized.message,
            executionMode: 'static-dom-heuristics',
            assessmentLabel: 'Static HTML Assessment — Browser rendering not performed',
            errorCode: categorized.code,
            viewport: {
              width: defaultVp.width,
              height: defaultVp.height,
              deviceScaleFactor: defaultVp.deviceScaleFactor,
            },
            viewportDeclaration: {
              present: false,
              rawContent: null,
              hasDeviceWidth: false,
              hasInitialScale: false,
              userScalableNo: false,
              maximumScaleRestricted: false,
            },
            tests: {
              configureViewport: {
                status: 'NOT_TESTED',
                summary: 'Evaluation aborted due to network or access failure.',
                issues: [],
              },
              fixedWidthViewport: {
                status: 'NOT_TESTED',
                summary: 'Evaluation aborted due to network or access failure.',
                issues: [],
              },
              sizeContentToViewport: {
                status: 'NOT_TESTED',
                summary: 'Evaluation aborted due to network or access failure.',
                issues: [],
              },
              legibleFontSizes: {
                status: 'NOT_TESTED',
                summary: 'Evaluation aborted due to network or access failure.',
                issues: [],
              },
              tapTargets: {
                status: 'NOT_TESTED',
                summary: 'Evaluation aborted due to network or access failure.',
                issues: [],
              },
              incompatiblePlugins: {
                status: 'NOT_TESTED',
                summary: 'Evaluation aborted due to network or access failure.',
                issues: [],
              },
            },
            screenshot: {
              available: false,
              errorMessage: 'Screenshots require a successful webpage response.',
              format: 'png',
              width: defaultVp.width,
              height: defaultVp.height,
            },
            issues: [
              {
                category: 'NETWORK',
                title: 'Page Access Failed',
                severity: 'CRITICAL',
                description: categorized.message,
                evidence: `Target: ${targetUrl}`,
                recommendedAction: 'Verify that the server is online and accessible without blocking automated audits.',
              },
            ],
            metrics: {},
            errorMessage: categorized.message,
          };
        }
      }
    );

    const summary = {
      totalTested: results.length,
      passed: results.filter((r) => r.overallStatus === 'PASS').length,
      warning: results.filter((r) => r.overallStatus === 'WARNING').length,
      failed: results.filter((r) => r.overallStatus === 'FAIL').length,
      error: results.filter((r) => r.overallStatus === 'ERROR').length,
    };

    const hasBrowserRendered = results.some((r) => r.executionMode === 'browser-rendered');

    const responsePayload: MobileAuditApiResponse = {
      success: true,
      results,
      summary,
      validationReport,
      executionMode: hasBrowserRendered ? 'browser-rendered' : 'static-dom-heuristics',
      serverRuntimeNotice:
        'Independent mobile-usability assessment. Note: Google retired the legacy standalone Mobile-Friendly Test API in December 2023.',
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    console.error('[Mobile Friendly API Route Error]', err);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected internal error occurred during mobile friendly testing. Please retry.',
        errorCode: 'INTERNAL_ERROR',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
