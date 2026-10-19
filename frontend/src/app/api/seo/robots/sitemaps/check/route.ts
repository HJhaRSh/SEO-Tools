import { NextRequest, NextResponse } from 'next/server';
import { checkSitemaps } from '@/lib/seo/resourceService';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sitemaps } = body;

    if (!Array.isArray(sitemaps) || sitemaps.length === 0) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', error: 'An array of sitemap URLs is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const results = await checkSitemaps(sitemaps);
    return NextResponse.json({ success: true, sitemaps: results }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'Failed checking sitemaps.');
    return NextResponse.json(
      { success: false, code: sanitized.code, error: sanitized.message },
      { status: sanitized.status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
