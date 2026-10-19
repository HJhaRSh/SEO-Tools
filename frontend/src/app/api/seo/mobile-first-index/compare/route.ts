import { NextRequest, NextResponse } from 'next/server';
import { runMobileFirstAudit } from '@/lib/seo/mobile-first/auditService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url, mobileUrl, profile } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid website URL to audit.',
        },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        }
      );
    }

    const auditResult = await runMobileFirstAudit({
      desktopUrl: url.trim(),
      mobileUrl: mobileUrl && typeof mobileUrl === 'string' ? mobileUrl.trim() : undefined,
      profileId: profile === 'chrome' ? 'chrome' : 'googlebot',
    });

    return NextResponse.json(auditResult, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An error occurred while auditing mobile-first parity.',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
