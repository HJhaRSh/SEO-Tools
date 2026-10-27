import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  decryptSession,
  encryptSession,
  GscSessionData,
} from '@/lib/seo/bulk-google-index-checker/sessionUtils';
import {
  getGoogleConfig,
  refreshAccessToken,
  isUrlInProperty,
  inspectUrlWithGsc,
} from '@/lib/seo/bulk-google-index-checker/gscService';
import { fetchSingleUrlMetadata } from '@/lib/seo/bulk-google-index-checker/metadataService';
import { normalizeInputUrls } from '@/lib/seo/bulk-google-index-checker/urlUtils';
import type {
  InspectBatchRequest,
  InspectBatchResponse,
  InspectionRowResult,
} from '@/lib/seo/bulk-google-index-checker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse<InspectBatchResponse>> {
  try {
    const config = getGoogleConfig(req.nextUrl.origin);
    if (!config) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          error: 'Google Search Console connection is not configured yet.',
          code: 'OAUTH_NOT_CONFIGURED',
        },
        { status: 500 }
      );
    }

    const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
    const session: GscSessionData | null = decryptSession(sessionCookie);

    if (!session || !session.accessToken) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          error: 'Your Google connection has expired or is not connected. Please connect Google Search Console.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    let activeAccessToken = session.accessToken;
    let updatedSessionCookie: string | null = null;

    // Refresh token if expired
    const isExpired = Date.now() >= (session.expiresAt - 60000);
    if (isExpired && session.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(session.refreshToken, config);
        activeAccessToken = refreshed.accessToken;
        const newSessionData: GscSessionData = {
          ...session,
          accessToken: refreshed.accessToken,
          expiresAt: Date.now() + (refreshed.expiresIn * 1000),
        };
        updatedSessionCookie = encryptSession(newSessionData);
      } catch {
        return NextResponse.json(
          {
            success: false,
            results: [],
            error: 'Your Google connection has expired. Please reconnect.',
            code: 'UNAUTHORIZED',
          },
          { status: 401 }
        );
      }
    } else if (isExpired && !session.refreshToken) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          error: 'Your Google connection has expired. Please reconnect.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          results: [],
          error: 'Invalid JSON request payload.',
          code: 'BAD_REQUEST',
        },
        { status: 400 }
      );
    }

    const { urls, siteUrl }: InspectBatchRequest = body || {};

    if (!siteUrl || typeof siteUrl !== 'string') {
      return NextResponse.json(
        {
          success: false,
          results: [],
          error: 'A Search Console property (siteUrl) must be selected.',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          error: 'Please provide at least one URL to inspect.',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      );
    }

    const { validUrls, errors } = normalizeInputUrls(urls);

    // Process chunk with bounded concurrency
    const checkTasks = validUrls.map(async (url, idx) => {
      const now = new Date().toISOString();

      // 1. Property scope check
      if (!isUrlInProperty(url, siteUrl)) {
        return {
          id: `row-${idx}-${Date.now()}`,
          url,
          googleIndexStatus: 'check_failed' as const,
          verdict: 'OUTSIDE_PROPERTY',
          coverageState: 'This URL is outside your selected Search Console property.',
          indexingState: null,
          pageFetchState: null,
          robotsTxtState: null,
          crawledAs: null,
          lastGoogleCrawl: null,
          googleCanonical: null,
          userCanonical: null,
          sitemap: [],
          referringUrls: [],
          inspectionCheckedAt: now,
          metaTitle: null,
          titleLength: 0,
          metaDescription: null,
          descriptionLength: 0,
          metadataStatus: 'missing' as const,
          checkedAt: now,
          error: 'URL is outside selected Search Console property.',
        };
      }

      // 2. Run Google inspection and live metadata concurrently
      const [inspection, metadata] = await Promise.all([
        inspectUrlWithGsc(activeAccessToken, url, siteUrl),
        fetchSingleUrlMetadata(url).catch(() => null),
      ]);

      const item: InspectionRowResult = {
        id: `row-${idx}-${Date.now()}`,
        url,
        googleIndexStatus: inspection.googleIndexStatus,
        verdict: inspection.verdict,
        coverageState: inspection.coverageState,
        indexingState: inspection.indexingState,
        pageFetchState: inspection.pageFetchState,
        robotsTxtState: inspection.robotsTxtState,
        crawledAs: inspection.crawledAs,
        lastGoogleCrawl: inspection.lastGoogleCrawl,
        googleCanonical: inspection.googleCanonical,
        userCanonical: inspection.userCanonical,
        sitemap: inspection.sitemap,
        referringUrls: inspection.referringUrls,
        inspectionCheckedAt: inspection.inspectionCheckedAt,
        metaTitle: metadata?.metaTitle || null,
        titleLength: metadata?.titleLength || 0,
        metaDescription: metadata?.metaDescription || null,
        descriptionLength: metadata?.descriptionLength || 0,
        metadataStatus: metadata?.fetchStatus || 'missing',
        checkedAt: now,
        error: inspection.googleIndexStatus === 'check_failed' ? inspection.coverageState : null,
      };

      return item;
    });

    const checkedResults = await Promise.all(checkTasks);

    // Append syntax error URLs as failed entries
    const invalidEntries: InspectionRowResult[] = errors.map((err, idx) => {
      const now = new Date().toISOString();
      return {
        id: `err-${idx}-${Date.now()}`,
        url: err.url,
        googleIndexStatus: 'check_failed' as const,
        verdict: 'INVALID_URL',
        coverageState: err.error,
        indexingState: null,
        pageFetchState: null,
        robotsTxtState: null,
        crawledAs: null,
        lastGoogleCrawl: null,
        googleCanonical: null,
        userCanonical: null,
        sitemap: [],
        referringUrls: [],
        inspectionCheckedAt: now,
        metaTitle: null,
        titleLength: 0,
        metaDescription: null,
        descriptionLength: 0,
        metadataStatus: 'error' as const,
        checkedAt: now,
        error: err.error,
      };
    });

    const combinedResults = [...checkedResults, ...invalidEntries];

    const res = NextResponse.json({
      success: true,
      results: combinedResults,
    });

    if (updatedSessionCookie) {
      res.cookies.set({
        name: COOKIE_NAME,
        value: updatedSessionCookie,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    return res;
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        results: [],
        error: err.message || 'An error occurred during Search Console inspection.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
