import { NextRequest, NextResponse } from 'next/server';
import { executeSingleBusinessSearch } from '@/lib/seo/reviewLinkService';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { businessName, location } = body;

    const result = await executeSingleBusinessSearch(businessName, location);

    if (!result.success) {
      const status = result.code === 'MISSING_BUSINESS_NAME' ? 400 : 503;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred during business search.',
        code: 'INTERNAL_SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}
