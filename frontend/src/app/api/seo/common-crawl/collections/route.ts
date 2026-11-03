import { NextResponse } from 'next/server';
import { getLatestCrawlCollections } from '@/lib/seo/common-crawl/collectionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(24, Math.max(1, parseInt(searchParams.get('limit') || '12', 10)));
    const collections = await getLatestCrawlCollections(limit);

    return NextResponse.json({
      success: true,
      collections,
      count: collections.length
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retrieve Common Crawl collection metadata'
      },
      { status: 500 }
    );
  }
}

