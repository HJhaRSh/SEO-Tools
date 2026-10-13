import { NextRequest, NextResponse } from 'next/server';
import { executeGenerateLink } from '@/lib/seo/reviewLinkService';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { placeId, businessName, address, writeReviewUrl } = body;

    const result = executeGenerateLink(placeId, businessName, address, writeReviewUrl);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An unexpected error occurred while generating the review link.',
        code: 'INTERNAL_SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}
