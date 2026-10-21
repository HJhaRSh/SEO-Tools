import { NextRequest, NextResponse } from 'next/server';
import { getDownload } from '@/lib/seo/sitemap/sitemapExport';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';
import * as fs from 'fs';
import { Readable } from 'stream';

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

    if (pkg.filePath) {
      if (!fs.existsSync(pkg.filePath)) {
        return new NextResponse('No file payload found for this download.', { status: 404 });
      }
      const nodeStream = fs.createReadStream(pkg.filePath);
      const webStream = Readable.toWeb(nodeStream);
      return new NextResponse(webStream as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': pkg.mimeType,
          'Content-Disposition': `attachment; filename="${pkg.filename}"`,
          'Cache-Control': 'no-store, max-age=0'
        }
      });
    }

    if (pkg.buffer) {
      return new NextResponse(new Uint8Array(pkg.buffer), {
        status: 200,
        headers: {
          'Content-Type': pkg.mimeType,
          'Content-Disposition': `attachment; filename="${pkg.filename}"`,
          'Cache-Control': 'no-store, max-age=0'
        }
      });
    }

    return new NextResponse('No file payload found for this download.', { status: 404 });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'Error serving download file.');
    return new NextResponse(sanitized.message, { status: sanitized.status });
  }
}
