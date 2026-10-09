import { NextRequest, NextResponse } from 'next/server';
import { checkSitemaps } from '@/lib/seo/resourceService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sitemaps } = body;

    if (!Array.isArray(sitemaps) || sitemaps.length === 0) {
      return NextResponse.json(
        { success: false, error: 'An array of sitemap URLs is required.' },
        { status: 400 }
      );
    }

    const results = await checkSitemaps(sitemaps);
    return NextResponse.json({ success: true, sitemaps: results }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed checking sitemaps' },
      { status: 400 }
    );
  }
}
