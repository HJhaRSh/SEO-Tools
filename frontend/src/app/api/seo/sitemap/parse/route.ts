import { NextRequest, NextResponse } from 'next/server';
import { parseCsvContent, parseXlsxContent } from '@/lib/seo/sitemap/sitemapParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { format, content, sheetName } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'No content or file data provided.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (format === 'csv') {
      const result = await parseCsvContent(content);
      return NextResponse.json(result, {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      });
    } else if (format === 'xlsx') {
      const buffer = Buffer.from(content, 'base64');
      const result = await parseXlsxContent(buffer, sheetName);
      return NextResponse.json(result, {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      });
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported format: ${format}. Use 'csv' or 'xlsx'.` },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to parse spreadsheet file.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
