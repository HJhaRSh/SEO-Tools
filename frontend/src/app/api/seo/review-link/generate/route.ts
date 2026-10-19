import { NextRequest, NextResponse } from 'next/server';
import { executeGenerateLink } from '@/lib/seo/reviewLinkService';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { placeId, reviewUrl, businessName, location } = body;

    const result = executeGenerateLink(placeId, reviewUrl, businessName, location);

    if (!result.success) {
      return NextResponse.json(result, {
        status: 400,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'An unexpected error occurred while generating the review link.');
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
