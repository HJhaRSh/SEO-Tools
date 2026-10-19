import { NextRequest, NextResponse } from 'next/server';
import { runFetchAndRenderTest } from '@/lib/seo/fetch-render/fetchRenderService';
import { redactSensitiveDetails } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runFetchAndRenderTest(body);

    const FOUR_MB = 4 * 1024 * 1024;
    let jsonString = JSON.stringify({ success: true, result });
    if (Buffer.byteLength(jsonString, 'utf-8') > FOUR_MB) {
      if (result.renderResult && result.renderResult.screenshotBase64) {
        delete result.renderResult.screenshotBase64;
      }
      jsonString = JSON.stringify({ success: true, result });
      if (Buffer.byteLength(jsonString, 'utf-8') > FOUR_MB) {
        if (result.initialFetch?.rawHtml && result.initialFetch.rawHtml.length > 600000) {
          result.initialFetch.rawHtml = result.initialFetch.rawHtml.slice(0, 600000);
          result.initialFetch.isTruncated = true;
        }
        if (result.renderResult?.renderedHtml && result.renderResult.renderedHtml.length > 600000) {
          result.renderResult.renderedHtml = result.renderResult.renderedHtml.slice(0, 600000);
          result.renderResult.isTruncated = true;
        }
      }
    }

    return NextResponse.json(
      { success: true, result },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: any) {
    let status = 400;
    let code = err.code || 'FETCH_RENDER_ERROR';
    const rawMessage = err.message || 'Fetch & Render test failed.';

    if (err.code === 'BROWSER_RENDER_UNAVAILABLE' || (typeof err.statusCode === 'number' && err.statusCode === 503)) {
      status = 503;
      code = 'BROWSER_RENDER_UNAVAILABLE';
    } else if (rawMessage.includes('capacity exhausted')) {
      status = 429;
      code = 'RATE_LIMITED';
    } else if (
      rawMessage.includes('browserType.launch') ||
      rawMessage.includes("Executable doesn't exist") ||
      rawMessage.includes('Failed to launch browser')
    ) {
      status = 503;
      code = 'BROWSER_RENDER_UNAVAILABLE';
    } else if (err.status) {
      status = err.status;
    }

    const message = redactSensitiveDetails(rawMessage);

    return NextResponse.json(
      {
        success: false,
        code,
        error: message,
        details: err.details || undefined
      },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
