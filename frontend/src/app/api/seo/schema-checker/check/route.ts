import { NextRequest, NextResponse } from 'next/server';
import { checkUrlsBatch } from '@/lib/seo/schema-checker/schemaCheckerService';
import { validateUrl } from '@/lib/seo/safeFetch';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';
import type { SchemaCheckRequest } from '@/lib/seo/schema-checker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_URLS = 100;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export async function POST(req: NextRequest) {
  try {
    const body: Partial<SchemaCheckRequest> = await req.json().catch(() => ({}));
    const rawUrls = body.urls;

    if (!Array.isArray(rawUrls)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request: "urls" must be an array.', code: 'VALIDATION_ERROR' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (rawUrls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please provide at least one URL to check.', code: 'VALIDATION_ERROR' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (rawUrls.length > MAX_URLS) {
      return NextResponse.json(
        {
          success: false,
          error: `Exceeds the maximum URL limit of ${MAX_URLS}. Please submit ${MAX_URLS} or fewer URLs at a time.`,
          code: 'VALIDATION_ERROR',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Validate each URL using the existing SSRF-aware validateUrl function
    const validatedUrls: string[] = [];
    for (const raw of rawUrls) {
      if (typeof raw !== 'string') continue;
      try {
        const parsed = validateUrl(raw.trim());
        if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) continue;
        validatedUrls.push(parsed.href);
      } catch {
        // Skip invalid URLs silently — they were filtered at the frontend
        continue;
      }
    }

    if (validatedUrls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid HTTP/HTTPS URLs were provided.', code: 'VALIDATION_ERROR' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const results = await checkUrlsBatch(validatedUrls, 5);

    return NextResponse.json(
      { success: true, results },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: unknown) {
    const sanitized = classifyAndSanitizeError(err);
    return NextResponse.json(
      { success: false, error: sanitized.message, code: sanitized.code },
      { status: sanitized.status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method Not Allowed. Use POST with a JSON body containing { urls: string[] }.',
      code: 'METHOD_NOT_ALLOWED',
    },
    { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store, max-age=0' } }
  );
}
