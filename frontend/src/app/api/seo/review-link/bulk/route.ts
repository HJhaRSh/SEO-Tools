import { NextRequest, NextResponse } from 'next/server';
import { executeBulkBatch } from '@/lib/seo/reviewLinkService';

export const runtime = 'nodejs';

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
        { status: 400 }
      );
    }

    const result = executeBulkBatch(rows);

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred during bulk processing.',
        code: 'INTERNAL_SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}
