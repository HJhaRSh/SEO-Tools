import { NextRequest, NextResponse } from 'next/server';
import { runMobileFirstAudit } from '@/lib/seo/mobile-first/auditService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function classifyAndSanitizeError(err: any): { message: string; code: string; status: number } {
  const rawMsg = String(err?.message || err || 'Unknown error');

  if (rawMsg.includes('Invalid URL format') || rawMsg.includes('Please provide a valid website URL') || rawMsg.includes('User credentials in URLs')) {
    return {
      message: 'The submitted URL is not a valid HTTP or HTTPS web address.',
      code: 'INVALID_URL',
      status: 400,
    };
  }

  if (rawMsg.includes('Unsupported URL protocol')) {
    return {
      message: 'Only HTTP and HTTPS web addresses are permitted for auditing.',
      code: 'UNSUPPORTED_PROTOCOL',
      status: 400,
    };
  }

  if (
    rawMsg.includes('blocked or internal') ||
    rawMsg.includes('resolves to blocked/private IP') ||
    rawMsg.includes('Port') && rawMsg.includes('not allowed')
  ) {
    return {
      message: 'Access to private, loopback, cloud metadata, or internal addresses is forbidden for security reasons.',
      code: 'BLOCKED_DESTINATION',
      status: 400,
    };
  }

  if (rawMsg.includes('timed out') || rawMsg.includes('ETIMEDOUT')) {
    return {
      message: 'The audit request timed out before the server responded.',
      code: 'REQUEST_TIMEOUT',
      status: 504,
    };
  }

  if (rawMsg.includes('maximum redirect limit') || rawMsg.includes('Redirect loop')) {
    return {
      message: 'The target URL resulted in a redirect loop or exceeded the maximum limit of 5 hops.',
      code: 'TOO_MANY_REDIRECTS',
      status: 400,
    };
  }

  if (rawMsg.includes('exceeds maximum') || rawMsg.includes('too large') || rawMsg.includes('maxBytes')) {
    return {
      message: 'The server response body exceeded the maximum size limit of 2MB.',
      code: 'RESPONSE_TOO_LARGE',
      status: 400,
    };
  }

  if (rawMsg.includes('DNS lookup error') || rawMsg.includes('ENOTFOUND') || rawMsg.includes('ECONNREFUSED')) {
    return {
      message: 'Could not resolve the target hostname or establish a network connection.',
      code: 'NETWORK_ERROR',
      status: 502,
    };
  }

  // Generic sanitized fallback: never leak filesystem paths, secrets, or internal stacks
  return {
    message: 'An error occurred while executing the Mobile-First Index audit.',
    code: 'INTERNAL_ERROR',
    status: 500,
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
