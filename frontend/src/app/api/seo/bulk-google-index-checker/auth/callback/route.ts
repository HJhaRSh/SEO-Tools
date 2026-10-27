import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  STATE_COOKIE_NAME,
  VERIFIER_COOKIE_NAME,
  encryptSession,
  GscSessionData,
} from '@/lib/seo/bulk-google-index-checker/sessionUtils';
import {
  getGoogleConfig,
  exchangeCodeForTokens,
} from '@/lib/seo/bulk-google-index-checker/gscService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const config = getGoogleConfig(origin);
  const redirectTarget = new URL('/tools/bulk-google-index-checker', req.url);

  if (!config) {
    redirectTarget.searchParams.set('error', 'OAUTH_NOT_CONFIGURED');
    return NextResponse.redirect(redirectTarget);
  }

  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    redirectTarget.searchParams.set('error', errorParam);
    return NextResponse.redirect(redirectTarget);
  }

  const storedState = req.cookies.get(STATE_COOKIE_NAME)?.value;
  const codeVerifier = req.cookies.get(VERIFIER_COOKIE_NAME)?.value;

  // CSRF validation
  if (!state || !storedState || state !== storedState) {
    redirectTarget.searchParams.set('error', 'CSRF_STATE_MISMATCH');
    return NextResponse.redirect(redirectTarget);
  }

  if (!code || !codeVerifier) {
    redirectTarget.searchParams.set('error', 'MISSING_AUTHORIZATION_CODE');
    return NextResponse.redirect(redirectTarget);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, codeVerifier, config);

    // Try fetching user info to identify the connected Google account
    let userEmail: string | undefined = undefined;
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        userEmail = userInfo.email;
      }
    } catch {
      // User email lookup is optional
    }

    const sessionData: GscSessionData = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + (tokens.expiresIn * 1000),
      userEmail,
    };

    const encryptedSession = encryptSession(sessionData);

    redirectTarget.searchParams.set('auth', 'success');
    const response = NextResponse.redirect(redirectTarget);

    // Set encrypted session cookie (30 days if refresh token, else token lifetime)
    response.cookies.set({
      name: COOKIE_NAME,
      value: encryptedSession,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.refreshToken ? 30 * 24 * 60 * 60 : tokens.expiresIn,
    });

    // Clear one-time state and PKCE cookies
    response.cookies.delete(STATE_COOKIE_NAME);
    response.cookies.delete(VERIFIER_COOKIE_NAME);

    return response;
  } catch (err: any) {
    redirectTarget.searchParams.set('error', 'TOKEN_EXCHANGE_FAILED');
    return NextResponse.redirect(redirectTarget);
  }
}
