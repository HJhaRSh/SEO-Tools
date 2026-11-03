import { NextResponse } from 'next/server';
import { compareArchivedVsLiveContent } from '@/lib/seo/common-crawl/contentComparisonService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const targetUrl = String(body.targetUrl || '').trim();
    const warcFilename = String(body.warcFilename || '').trim();
    const offset = parseInt(body.offset, 10);
    const length = parseInt(body.length, 10);
    const captureTimestamp = String(body.captureTimestamp || '').trim();

    if (!targetUrl || !warcFilename || isNaN(offset) || isNaN(length)) {
      return NextResponse.json(
        { success: false, error: 'targetUrl, warcFilename, offset, and length parameters are required.' },
        { status: 400 }
      );
    }

    const comparison = await compareArchivedVsLiveContent(
      targetUrl,
      warcFilename,
      offset,
      length,
      captureTimestamp
    );

    return NextResponse.json({
      success: true,
      comparison
    });
  } catch (err: any) {
    console.error('[WarcContent] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retrieve or compare archived WARC HTML.'
      },
      { status: 400 }
    );
  }
}

