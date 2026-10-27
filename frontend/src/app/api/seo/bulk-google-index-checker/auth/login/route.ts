import { NextRequest, NextResponse } from 'next/server';
import {
  STATE_COOKIE_NAME,
  VERIFIER_COOKIE_NAME,
  generatePkcePair,
  generateCsrfState,
} from '@/lib/seo/bulk-google-index-checker/sessionUtils';
import {
  getGoogleConfig,
  buildGoogleAuthUrl,
} from '@/lib/seo/bulk-google-index-checker/gscService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost.split(',')[0].trim()}` : req.nextUrl.origin;
  const config = getGoogleConfig(origin);

  if (!config) {
    return NextResponse.json(
      {
        success: false,
        error: 'Google Search Console OAuth is not configured yet on this server.',
      },
      { status: 500 }
    );
  }

  const state = generateCsrfState();
  const { verifier, challenge } = generatePkcePair();

  const authUrl = buildGoogleAuthUrl(config, state, challenge);
  const response = NextResponse.redirect(authUrl);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600, // 10 minutes
  };

  response.cookies.set(STATE_COOKIE_NAME, state, cookieOptions);
  response.cookies.set(VERIFIER_COOKIE_NAME, verifier, cookieOptions);

  return response;
}
