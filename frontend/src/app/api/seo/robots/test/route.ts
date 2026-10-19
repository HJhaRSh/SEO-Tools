import { NextRequest, NextResponse } from 'next/server';
import { testRobotsTxt } from '@/lib/seo/robotsService';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { websiteUrl, path, userAgent, mode, customRobotsTxt, forceRefresh } = body;

    if (!websiteUrl || typeof websiteUrl !== 'string' || !websiteUrl.trim()) {
      return NextResponse.json(
        { success: false, code: 'INVALID_URL', error: 'A valid websiteUrl string is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (!userAgent || typeof userAgent !== 'string' || !userAgent.trim()) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', error: 'A valid userAgent string is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const testPath = typeof path === 'string' ? path : '/';

    const result = await testRobotsTxt({
      websiteUrl: websiteUrl.trim(),
      path: testPath,
      userAgent: userAgent.trim(),
      mode: mode === 'editor' ? 'editor' : 'live',
      customRobotsTxt: typeof customRobotsTxt === 'string' ? customRobotsTxt : null,
      forceRefresh: Boolean(forceRefresh)
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'An error occurred while evaluating robots.txt.');
    return NextResponse.json(
      {
        success: false,
        code: sanitized.code,
        error: sanitized.message
      },
      {
        status: sanitized.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  }
}
