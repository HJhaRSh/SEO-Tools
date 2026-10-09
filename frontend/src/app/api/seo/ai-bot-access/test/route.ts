import { NextRequest, NextResponse } from 'next/server';
import { runAiBotAccessTest } from '@/lib/seo/aiBotTesterService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { urls, botIds, checks } = body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please provide an array of URLs to test.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(botIds) || botIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please select at least one AI bot to test.' },
        { status: 400 }
      );
    }

    const testResponse = await runAiBotAccessTest({
      urls,
      botIds,
      checks
    });

    return NextResponse.json(testResponse, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to process AI Bot Access test.'
      },
      { status: 400 }
    );
  }
}
