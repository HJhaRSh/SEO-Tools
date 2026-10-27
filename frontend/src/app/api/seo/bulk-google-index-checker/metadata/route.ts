import { NextRequest, NextResponse } from 'next/server';
import { normalizeInputUrls, MAX_BATCH_CAPACITY } from '@/lib/seo/bulk-google-index-checker/urlUtils';
import { fetchBatchMetadata } from '@/lib/seo/bulk-google-index-checker/metadataService';
import type { MetadataCheckResponse, MetadataResultItem } from '@/lib/seo/bulk-google-index-checker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse<MetadataCheckResponse>> {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          results: [],
          summary: { total: 0, successCount: 0, errorCount: 0, missingTitles: 0, missingDescriptions: 0 },
          error: 'Invalid JSON body in request.',
          code: 'BAD_REQUEST',
        },
        { status: 400 }
      );
    }

    const { urls } = body || {};

    if (!Array.isArray(urls)) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          summary: { total: 0, successCount: 0, errorCount: 0, missingTitles: 0, missingDescriptions: 0 },
          error: 'Invalid payload: "urls" must be an array of URL strings.',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      );
    }

    const { validUrls, errors } = normalizeInputUrls(urls);

    if (validUrls.length === 0 && errors.length === 0) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          summary: { total: 0, successCount: 0, errorCount: 0, missingTitles: 0, missingDescriptions: 0 },
          error: 'Please enter at least one valid HTTP or HTTPS URL.',
          code: 'EMPTY_INPUT',
        },
        { status: 400 }
      );
    }

    if (validUrls.length > MAX_BATCH_CAPACITY) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          summary: { total: 0, successCount: 0, errorCount: 0, missingTitles: 0, missingDescriptions: 0 },
          error: `Exceeds maximum batch limit of ${MAX_BATCH_CAPACITY} URLs.`,
          code: 'BATCH_LIMIT_EXCEEDED',
        },
        { status: 400 }
      );
    }

    // Fetch live metadata with max 5 concurrency
    const fetchedResults = await fetchBatchMetadata(validUrls);

    // Append syntax error URLs as failed entries
    const invalidEntries: MetadataResultItem[] = errors.map((err) => ({
      url: err.url,
      metaTitle: null,
      titleLength: 0,
      metaDescription: null,
      descriptionLength: 0,
      fetchStatus: 'error',
      error: err.error,
    }));

    const combinedResults = [...fetchedResults, ...invalidEntries];

    const summary = {
      total: combinedResults.length,
      successCount: combinedResults.filter((r) => r.fetchStatus === 'success').length,
      errorCount: combinedResults.filter((r) => r.fetchStatus === 'error').length,
      missingTitles: combinedResults.filter((r) => !r.metaTitle).length,
      missingDescriptions: combinedResults.filter((r) => !r.metaDescription).length,
    };

    return NextResponse.json({
      success: true,
      results: combinedResults,
      summary,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        results: [],
        summary: { total: 0, successCount: 0, errorCount: 0, missingTitles: 0, missingDescriptions: 0 },
        error: 'An internal error occurred while extracting webpage metadata.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
