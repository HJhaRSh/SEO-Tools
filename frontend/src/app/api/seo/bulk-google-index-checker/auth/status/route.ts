import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  decryptSession,
  encryptSession,
  GscSessionData,
} from '@/lib/seo/bulk-google-index-checker/sessionUtils';
import {
  getGoogleConfig,
  fetchUserProperties,
  refreshAccessToken,
} from '@/lib/seo/bulk-google-index-checker/gscService';
import type { AuthStatusResponse } from '@/lib/seo/bulk-google-index-checker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse<AuthStatusResponse>> {
  try {
    const config = getGoogleConfig(req.nextUrl.origin);
    if (!config) {
      return NextResponse.json({
        configured: false,
        connected: false,
      });
    }

    const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
    const session: GscSessionData | null = decryptSession(sessionCookie);

    if (!session || !session.accessToken) {
      return NextResponse.json({
        configured: true,
        connected: false,
      });
    }

    let activeAccessToken = session.accessToken;
    let updatedSessionCookie: string | null = null;

    // Check if token expired or about to expire in next 60 seconds
    const isExpired = Date.now() >= (session.expiresAt - 60000);
    if (isExpired && session.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(session.refreshToken, config);
        activeAccessToken = refreshed.accessToken;
        const newSessionData: GscSessionData = {
          ...session,
          accessToken: refreshed.accessToken,
          expiresAt: Date.now() + (refreshed.expiresIn * 1000),
        };
        updatedSessionCookie = encryptSession(newSessionData);
      } catch {
        // Token refresh failed; session is stale
        const res = NextResponse.json({
          configured: true,
          connected: false,
        });
        res.cookies.delete(COOKIE_NAME);
        return res;
      }
    } else if (isExpired && !session.refreshToken) {
      const res = NextResponse.json({
        configured: true,
        connected: false,
      });
      res.cookies.delete(COOKIE_NAME);
      return res;
    }

    // Retrieve user Search Console properties
    try {
      const properties = await fetchUserProperties(activeAccessToken);
      const res = NextResponse.json({
        configured: true,
        connected: true,
        userEmail: session.userEmail || null,
        properties,
      });

      if (updatedSessionCookie) {
        res.cookies.set({
          name: COOKIE_NAME,
          value: updatedSessionCookie,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        });
      }

      return res;
    } catch {
      // If fetching properties failed with 401, token is invalid
      const res = NextResponse.json({
        configured: true,
        connected: false,
      });
      res.cookies.delete(COOKIE_NAME);
      return res;
    }
  } catch {
    return NextResponse.json({
      configured: false,
      connected: false,
    });
  }
}
