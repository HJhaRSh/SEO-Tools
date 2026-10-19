import { NextRequest, NextResponse } from 'next/server';
import { SAMPLE_TEMPLATES } from '@/lib/seo/sitemap/sitemapExport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  try {
    const params = await context.params;
    const type = params?.type;

    if (!type || !SAMPLE_TEMPLATES[type]) {
      return NextResponse.json(
        { success: false, error: `Template "${type}" not found.` },
        { status: 404 }
      );
    }

    const tpl = SAMPLE_TEMPLATES[type];
    return new NextResponse(tpl.content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${tpl.filename}"`,
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error serving template.' },
      { status: 500 }
    );
  }
}
