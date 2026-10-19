import { NextRequest, NextResponse } from 'next/server';
import { runMobileFirstAudit } from '@/lib/seo/mobile-first/auditService';
import { sanitizeAuditError } from '@/lib/seo/mobile-first/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function classifyAndSanitizeError(err: any): { message: string; code: string; status: number } {
  const sanitized = sanitizeAuditError(err);
  return {
    message: sanitized.userMessage,
    code: sanitized.code,
    status: sanitized.statusCode,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url, mobileUrl, profile } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid website URL to audit.',
          code: 'INVALID_URL',
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
    const sanitized = classifyAndSanitizeError(err);
    return NextResponse.json(
      {
        success: false,
        error: sanitized.message,
        code: sanitized.code,
      },
      {
        status: sanitized.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method Not Allowed. Use POST with a JSON body containing { url } to initiate an audit.',
      code: 'METHOD_NOT_ALLOWED',
    },
    {
      status: 405,
      headers: {
        Allow: 'POST',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
