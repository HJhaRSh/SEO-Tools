import { NextRequest, NextResponse } from 'next/server';
import { testRobotsTxt } from '@/lib/seo/robotsService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { websiteUrl, path, userAgent, mode, customRobotsTxt, forceRefresh } = body;

    if (!websiteUrl || typeof websiteUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A valid websiteUrl string is required.' },
        { status: 400 }
      );
    }

    if (!userAgent || typeof userAgent !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A valid userAgent string is required.' },
        { status: 400 }
      );
    }

    const testPath = typeof path === 'string' ? path : '/';

    const result = await testRobotsTxt({
      websiteUrl,
      path: testPath,
      userAgent,
      mode: mode === 'editor' ? 'editor' : 'live',
      customRobotsTxt: typeof customRobotsTxt === 'string' ? customRobotsTxt : null,
      forceRefresh: Boolean(forceRefresh)
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An error occurred while evaluating robots.txt.'
      },
      { status: 400 }
    );
  }
}
