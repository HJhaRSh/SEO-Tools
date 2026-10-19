import { NextRequest, NextResponse } from 'next/server';
import { getDownload } from '@/lib/seo/sitemap/sitemapExport';
import * as fs from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ downloadId: string }> }
) {
  try {
    const params = await context.params;
    const downloadId = params?.downloadId;

    if (!downloadId) {
      return new NextResponse('Download ID missing.', { status: 400 });
    }

    const pkg = getDownload(downloadId);
    if (!pkg) {
      return new NextResponse(
        'Download link expired or not found. Please regenerate sitemap.',
        { status: 404 }
      );
    }

    let bodyBuffer: Buffer | null = null;
    if (pkg.filePath) {
      if (fs.existsSync(pkg.filePath)) {
        bodyBuffer = fs.readFileSync(pkg.filePath);
      }
    } else if (pkg.buffer) {
      bodyBuffer = pkg.buffer;
    }

    if (!bodyBuffer) {
      return new NextResponse('No file payload found for this download.', { status: 404 });
    }

    return new NextResponse(new Uint8Array(bodyBuffer), {
      status: 200,
      headers: {
        'Content-Type': pkg.mimeType,
        'Content-Disposition': `attachment; filename="${pkg.filename}"`,
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    return new NextResponse(err?.message || 'Error serving download file.', { status: 500 });
  }
}
