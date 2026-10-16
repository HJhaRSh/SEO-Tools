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

    // Determine target URLs
    let targetUrls: string[] = [];
    if (Array.isArray(urls) && urls.length > 0) {
      const parsed = parseAndValidateBulkUrls(urls.join('\n'));
      targetUrls = parsed.validUrls;
    } else if (typeof url === 'string' && url.trim()) {
      const parsed = parseAndValidateBulkUrls(url.trim());
      targetUrls = parsed.validUrls;
    }

    if (targetUrls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide at least one valid HTTP or HTTPS webpage URL to test.',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const presetId = typeof viewportPreset === 'string' && MOBILE_VIEWPORT_PRESETS[viewportPreset]
      ? viewportPreset
      : 'standard';

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
          const defaultVp = MOBILE_VIEWPORT_PRESETS[presetId] || DEFAULT_VIEWPORT_PRESET;
          return {
            url: targetUrl,
            finalUrl: targetUrl,
            durationMs: 0,
            testedAt: new Date().toISOString(),
            isCompleted: false,
            overallStatus: 'ERROR',
            overallSummary: 'Audit incomplete because the target URL could not be fetched or rendered.',
            executionMode: 'static-dom-heuristics',
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
            issues: [
              {
                category: 'NETWORK',
                title: 'Page Access Failed',
                severity: 'CRITICAL',
                description: err.message || 'Unable to fetch the requested webpage.',
                evidence: `Target: ${targetUrl}`,
                recommendedAction: 'Verify that the server is online and accessible without blocking automated audits.',
              },
            ],
            metrics: {},
            errorMessage: err.message || 'Page access failure',
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
      executionMode: hasBrowserRendered ? 'browser-rendered' : 'static-dom-heuristics',
      serverRuntimeNotice:
        'Independent mobile-usability assessment. Note: Google retired the legacy standalone Mobile-Friendly Test API in December 2023.',
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred during mobile friendly testing.',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
