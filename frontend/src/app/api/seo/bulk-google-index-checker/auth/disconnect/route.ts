import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  decryptSession,
} from '@/lib/seo/bulk-google-index-checker/sessionUtils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
  const session = decryptSession(sessionCookie);

  if (session?.accessToken) {
    try {
      // Attempt token revocation with Google OAuth server
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(session.accessToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      // Best-effort revocation
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);

  return response;
}
