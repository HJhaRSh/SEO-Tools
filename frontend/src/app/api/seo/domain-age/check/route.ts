import { NextRequest, NextResponse } from 'next/server';
import { checkDomainsBatch } from '@/lib/seo/domain-age/domainAgeService';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';
import type { DomainAgeCheckRequest } from '@/lib/seo/domain-age/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_DOMAINS = 20;

export async function POST(req: NextRequest) {
  try {
    const body: Partial<DomainAgeCheckRequest> = await req.json().catch(() => ({}));

    // Accept either domains array or single domain string
    let rawInputs: string[] = [];
    if (Array.isArray(body.domains)) {
      rawInputs = body.domains;
    } else if (typeof body.domain === 'string') {
      rawInputs = [body.domain];
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request: "domains" array or "domain" string is required.',
          code: 'VALIDATION_ERROR'
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Filter out non-string and empty items
    const cleanedInputs = rawInputs
      .filter((d): d is string => typeof d === 'string')
      .map(d => d.trim())
      .filter(Boolean);

    if (cleanedInputs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter at least one domain or URL to check.',
          code: 'VALIDATION_ERROR'
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (cleanedInputs.length > MAX_DOMAINS) {
      return NextResponse.json(
        {
          success: false,
          error: `Exceeds maximum batch limit of ${MAX_DOMAINS} domains. Please submit ${MAX_DOMAINS} or fewer domains at a time.`,
          code: 'VALIDATION_ERROR'
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const response = await checkDomainsBatch(cleanedInputs, 3);

    return NextResponse.json(response, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'An error occurred while checking domain age.');
    return NextResponse.json(
      {
        success: false,
        code: sanitized.code,
        error: sanitized.message
      },
      {
        status: sanitized.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  }
}
