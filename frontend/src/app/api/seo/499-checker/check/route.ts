/**
 * POST /api/seo/499-checker/check
 *
 * API endpoint for the 499 Timeout Risk Checker.
 * Accepts { url: string } and returns TimeoutRiskCheckApiResponse.
 *
 * Security:
 * - Uses existing SSRF validation from ssrf.ts
 * - Applies no-store cache headers
 * - Sanitizes error output via errorSanitizer
 * - Rate-limited via in-memory counter (not globally reliable in serverless)
 */

import { NextRequest, NextResponse } from 'next/server';
import { runTimeoutRiskCheck } from '@/lib/seo/timeout-risk/service';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';
import type { TimeoutRiskCheckApiResponse } from '@/lib/seo/timeout-risk/types';

// Runtime configuration for Vercel serverless
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── In-memory rate limiter ────────────────────────────────────────
// NOTE: In serverless environments this only limits within a single
// function instance. It is not a globally reliable rate limit.
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - REQUEST_WINDOW_MS;

  // Prune expired entries inline (avoids top-level setInterval in serverless)
  if (requestLog.size > 200) {
    for (const [k, timestamps] of requestLog.entries()) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) requestLog.delete(k);
      else requestLog.set(k, fresh);
    }
  }

  const timestamps = requestLog.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < REQUEST_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

// ─── Response headers ──────────────────────────────────────────────
function secureHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  };
}

// ─── POST handler ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please wait before making another request.',
          errorCode: 'RATE_LIMITED',
        } satisfies TimeoutRiskCheckApiResponse,
        { status: 429, headers: secureHeaders() }
      );
    }

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON request body.',
          errorCode: 'VALIDATION_ERROR',
        } satisfies TimeoutRiskCheckApiResponse,
        { status: 400, headers: secureHeaders() }
      );
    }

    const payload = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const url = typeof payload.url === 'string' ? payload.url : undefined;
    if (!url) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a "url" field with the webpage URL to check.',
          errorCode: 'VALIDATION_ERROR',
        } satisfies TimeoutRiskCheckApiResponse,
        { status: 400, headers: secureHeaders() }
      );
    }

    if (url.length > 2048) {
      return NextResponse.json(
        {
          success: false,
          error: 'URL exceeds maximum length of 2048 characters.',
          errorCode: 'VALIDATION_ERROR',
        } satisfies TimeoutRiskCheckApiResponse,
        { status: 400, headers: secureHeaders() }
      );
    }

    // Run the check
    const result = await runTimeoutRiskCheck(url);

    return NextResponse.json(
      {
        success: true,
        data: result,
      } satisfies TimeoutRiskCheckApiResponse,
      { status: 200, headers: secureHeaders() }
    );
  } catch (err: unknown) {
    const sanitized = classifyAndSanitizeError(err);

    return NextResponse.json(
      {
        success: false,
        error: sanitized.message,
        errorCode: sanitized.code,
      } satisfies TimeoutRiskCheckApiResponse,
      { status: sanitized.status, headers: secureHeaders() }
    );
  }
}

