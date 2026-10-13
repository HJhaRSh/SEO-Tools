import { NextRequest, NextResponse } from 'next/server';
import { executeBulkBatch, MAX_BATCH_SIZE } from '@/lib/seo/reviewLinkService';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { rows, batchIndex, totalBatches } = body;

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

    if (rows.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Batch size of ${rows.length} exceeds maximum allowed limit of ${MAX_BATCH_SIZE} rows per request.`,
          code: 'BATCH_SIZE_EXCEEDED'
        },
        { status: 400 }
      );
    }

    const result = await executeBulkBatch(
      rows,
      typeof batchIndex === 'number' ? batchIndex : 0,
      typeof totalBatches === 'number' ? totalBatches : 1
    );

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
