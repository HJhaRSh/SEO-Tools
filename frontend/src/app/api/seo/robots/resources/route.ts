import { NextRequest, NextResponse } from 'next/server';
import { checkPageResources } from '@/lib/seo/resourceService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pageUrl, userAgent } = body;

    if (!pageUrl || typeof pageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A valid pageUrl string is required.' },
        { status: 400 }
      );
    }

    const ua = typeof userAgent === 'string' && userAgent ? userAgent : 'Googlebot';
    const result = await checkPageResources(pageUrl, ua);

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed checking resources' },
      { status: 400 }
    );
  }
}
