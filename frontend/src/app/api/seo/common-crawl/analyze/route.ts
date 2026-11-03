import { NextResponse } from 'next/server';
import { runCommonCrawlAudit } from '@/lib/seo/common-crawl';
import { ScopeSetting } from '@/lib/seo/common-crawl/types';
import { checkCommonCrawlRateLimit, extractClientIp } from '@/lib/seo/common-crawl/rateLimiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient serverless execution budget for parallel collections

export async function POST(request: Request) {
  try {
    const clientIp = extractClientIp(request.headers);
    const rateCheck = await checkCommonCrawlRateLimit(clientIp);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: rateCheck.reason || 'Rate limit exceeded. Please wait before running another Common Crawl audit.',
          retryAfter: rateCheck.retryAfterSeconds
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSeconds || 60),
            'X-RateLimit-Remaining-Minute': String(rateCheck.remainingMinute),
            'X-RateLimit-Remaining-Day': String(rateCheck.remainingDay)
          }
        }
      );
    }

    const body = await request.json();
    const input = String(body.input || '').trim();
    const scope = (body.scope as ScopeSetting) || 'include_www';
    const limitCollections = Math.min(12, Math.max(1, parseInt(body.limitCollections || '12', 10)));

    if (!input) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid website domain or page URL.' },
        { status: 400 }
      );
    }

    const report = await runCommonCrawlAudit({
      input,
      scope,
      limitCollections
    });

    return NextResponse.json({
      success: true,
      report
    });
  } catch (err: any) {
    console.error('[CommonCrawlAnalyze] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An error occurred during Common Crawl visibility analysis.'
      },
      { status: 400 }
    );
  }
}

