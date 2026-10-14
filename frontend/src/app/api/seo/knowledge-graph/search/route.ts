import { NextRequest, NextResponse } from 'next/server';
import { validateSearchRequest } from '@/lib/seo/knowledge-graph/validation';
import { searchKnowledgeGraphProvider } from '@/lib/seo/knowledge-graph/googleProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const validation = validateSearchRequest(body);
    if (!validation.isValid || !validation.sanitized) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_REQUEST',
          error: validation.error || 'Invalid request parameters.',
        },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        }
      );
    }

    const { query, id, types, language, limit, prefix } = validation.sanitized;

    const result = await searchKnowledgeGraphProvider({
      query,
      id,
      types,
      language,
      limit,
      prefix,
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        PROVIDER_NOT_CONFIGURED: 503,
        API_KEY_INVALID: 401,
        API_DISABLED: 403,
        RATE_LIMITED: 429,
        UPSTREAM_TIMEOUT: 504,
        UPSTREAM_ERROR: 502,
        INVALID_REQUEST: 400,
      };

      const httpStatus = statusMap[result.code] || 500;

      return NextResponse.json(result, {
        status: httpStatus,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        error: err.message || 'An unexpected error occurred while querying the Knowledge Graph.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
