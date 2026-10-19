import { NextRequest, NextResponse } from 'next/server';
import { executeBulkBatch } from '@/lib/seo/reviewLinkService';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { rows } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide an array of rows to process.',
          code: 'EMPTY_BATCH'
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const result = executeBulkBatch(rows);

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'An unexpected error occurred during bulk processing.');
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
