import { NextRequest, NextResponse } from 'next/server';
import { checkPageResources } from '@/lib/seo/resourceService';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { pageUrl, userAgent } = body;

    if (!pageUrl || typeof pageUrl !== 'string' || !pageUrl.trim()) {
      return NextResponse.json(
        { success: false, code: 'INVALID_URL', error: 'A valid pageUrl string is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const ua = typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim() : 'Googlebot';
    const result = await checkPageResources(pageUrl.trim(), ua);

    return NextResponse.json({ success: true, ...result }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'Failed to check page resources.');
    return NextResponse.json(
      { success: false, code: sanitized.code, error: sanitized.message },
      { status: sanitized.status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
