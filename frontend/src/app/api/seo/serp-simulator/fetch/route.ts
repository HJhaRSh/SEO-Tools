import { NextRequest, NextResponse } from 'next/server';
import { fetchPageMetadata } from '@/lib/seo/serp/fetchMetadata';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_URL',
          error: 'Please provide a valid webpage URL to fetch metadata.',
        },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        }
      );
    }

    const data = await fetchPageMetadata(url.trim());

    return NextResponse.json(
      {
        success: true,
        data,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'Unable to fetch metadata from this URL.');

    return NextResponse.json(
      {
        success: false,
        code: sanitized.code,
        error: sanitized.message,
      },
      {
        status: sanitized.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
