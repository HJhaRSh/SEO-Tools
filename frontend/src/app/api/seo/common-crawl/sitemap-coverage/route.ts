import { NextResponse } from 'next/server';
import { compareSitemapWithCollection, discoverSitemapUrl } from '@/lib/seo/common-crawl/sitemapService';
import { getLatestCrawlCollections } from '@/lib/seo/common-crawl/collectionService';
import { checkCommonCrawlRateLimit, extractClientIp } from '@/lib/seo/common-crawl/rateLimiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const clientIp = extractClientIp(request.headers);
    const rateCheck = await checkCommonCrawlRateLimit(clientIp);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: rateCheck.reason || 'Rate limit exceeded for sitemap coverage check.',
          retryAfter: rateCheck.retryAfterSeconds
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const hostname = String(body.hostname || '').trim();
    let sitemapUrl = String(body.sitemapUrl || '').trim();
    const collectionId = String(body.collectionId || '').trim();

    if (!hostname) {
      return NextResponse.json(
        { success: false, error: 'Hostname parameter is required.' },
        { status: 400 }
      );
    }

    // Auto-discover sitemap if not specified
    if (!sitemapUrl) {
      sitemapUrl = await discoverSitemapUrl(hostname);
    }

    // Find the collection endpoint
    const collections = await getLatestCrawlCollections(12);
    const targetCol = collections.find(c => c.id === collectionId) || collections[0];

    if (!targetCol) {
      return NextResponse.json(
        { success: false, error: 'No valid Common Crawl collection found.' },
        { status: 404 }
      );
    }

    const coverage = await compareSitemapWithCollection(
      sitemapUrl,
      targetCol.cdxApi,
      targetCol.id,
      Array.isArray(body.capturedUrls) ? body.capturedUrls : undefined
    );

    return NextResponse.json({
      success: true,
      coverage
    });
  } catch (err: any) {
    console.error('[SitemapCoverage] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to analyze sitemap coverage against Common Crawl.'
      },
      { status: 400 }
    );
  }
}

