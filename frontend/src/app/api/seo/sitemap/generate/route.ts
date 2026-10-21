import { NextRequest, NextResponse } from 'next/server';
import { generateSitemapXml } from '@/lib/seo/sitemap/sitemapGenerator';
import { validatePublicSitemapOptions, validateSitemapInputLimit } from '@/lib/seo/sitemap/sitemapValidation';
import { extractUrlEntriesFromRows } from '@/lib/seo/sitemap/sitemapParser';
import {
  storeDownload,
  createSitemapsZip,
  generateIssuesCsv
} from '@/lib/seo/sitemap/sitemapExport';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { rows, mapping, formatType, options, manualUrls } = body;

    const validatedOpts = validatePublicSitemapOptions(options);
    if (!validatedOpts.isValid) {
      return NextResponse.json(
        { success: false, error: validatedOpts.error || 'Invalid generation options.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const limitCheck = validateSitemapInputLimit({ manualUrls, rows });
    if (!limitCheck.isValid) {
      return NextResponse.json(
        { success: false, error: limitCheck.error },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    let entries: any[] = [];

    if (manualUrls && typeof manualUrls === 'string') {
      const lines = manualUrls
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter((l: string) => Boolean(l));
      entries = lines.map((url: string) => ({ loc: url }));
    } else if (Array.isArray(rows)) {
      if (mapping && formatType) {
        entries = extractUrlEntriesFromRows(rows, mapping, formatType);
      } else {
        entries = rows;
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide either manualUrls, mapped spreadsheet rows, or URL entry objects.'
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const genResult = generateSitemapXml(entries, validatedOpts.options);

    for (const file of genResult.files) {
      const token = storeDownload(
        file.filename,
        'application/xml; charset=utf-8',
        Buffer.from(file.content, 'utf-8')
      );
      file.downloadId = token;
    }

    const allIssues = [...genResult.errors, ...genResult.warnings];
    const zipPackage = await createSitemapsZip(genResult.files, allIssues);
    const zipToken = storeDownload('sitemaps.zip', 'application/zip', zipPackage);

    let reportToken: string | undefined = undefined;
    let reportCsv: string | undefined = undefined;
    if (allIssues.length > 0) {
      reportCsv = generateIssuesCsv(allIssues);
      reportToken = storeDownload(
        'sitemap-validation-report.csv',
        'text/csv; charset=utf-8',
        Buffer.from(reportCsv, 'utf-8')
      );
    }

    return NextResponse.json(
      {
        success: genResult.success,
        summary: genResult.summary,
        files: genResult.files.map(f => ({
          filename: f.filename,
          type: f.type,
          urlCount: f.urlCount,
          byteSize: f.byteSize,
          content: f.byteSize <= 2 * 1024 * 1024 ? f.content : undefined,
          downloadId: f.downloadId
        })),
        zipBase64: zipPackage.zipBase64,
        reportCsv,
        zipDownloadId: zipToken,
        reportDownloadId: reportToken,
        xmlPreview: genResult.xmlPreview,
        isPreviewTruncated: genResult.isPreviewTruncated,
        warnings: genResult.warnings,
        errors: genResult.errors
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'Failed to generate XML sitemap.');
    return NextResponse.json(
      { success: false, error: sanitized.message },
      { status: sanitized.status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
