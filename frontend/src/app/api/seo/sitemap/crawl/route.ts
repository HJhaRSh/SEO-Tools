import { NextRequest, NextResponse } from 'next/server';
import { crawlWebsiteForSitemap, CrawlProgressEvent } from '@/lib/seo/sitemap/sitemapCrawler';
import { validateSitemapUrl } from '@/lib/seo/sitemap/sitemapValidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      url,
      maxPages = 50000,
      maxDepth = 50,
      crawlDelayMs = 40,
      includeSubdomains = false,
      discoverFromRobotsTxt = true
    } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid website URL to crawl.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const trimmedUrl = url.trim();
    const urlValidation = validateSitemapUrl(trimmedUrl, undefined, 'url');
    if (!urlValidation.isValid || !urlValidation.sanitizedUrl) {
      return NextResponse.json(
        {
          success: false,
          error: urlValidation.issues.map(i => i.message).join(' ') || 'Invalid website URL.'
        },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const sanitizedSeedUrl = urlValidation.sanitizedUrl;
    const isStream = req.headers.get('accept')?.includes('text/event-stream') || req.nextUrl.searchParams.get('stream') === 'true';

    // Full website crawl defaults: standard 50,000 URLs (Sitemap Protocol limit per file) and deep link traversal
    const safeMaxPages = Math.min(Math.max(1, Number(maxPages) || 50000), 50000);
    const safeMaxDepth = Math.min(Math.max(1, Number(maxDepth) || 50), 50);

    // If client requested Server-Sent Events stream
    if (isStream) {
      const encoder = new TextEncoder();
      const abortController = new AbortController();

      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (eventName: string, data: any) => {
            try {
              controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch {
              // Controller may be closed
            }
          };

          try {
            await crawlWebsiteForSitemap(sanitizedSeedUrl, {
              maxPages: safeMaxPages,
              maxDepth: safeMaxDepth,
              crawlDelayMs: Math.max(10, Number(crawlDelayMs) || 40),
              includeSubdomains: Boolean(includeSubdomains),
              discoverFromRobotsTxt: Boolean(discoverFromRobotsTxt),
              signal: abortController.signal,
              onProgress: (evt: CrawlProgressEvent) => {
                sendEvent(evt.type, evt);
              }
            });
          } catch (crawlErr: any) {
            sendEvent('error', { error: crawlErr.message || 'Crawl failed unexpectedly' });
          } finally {
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }
        },
        cancel() {
          abortController.abort();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      });
    }

    // Standard synchronous JSON response fallback
    const result = await crawlWebsiteForSitemap(sanitizedSeedUrl, {
      maxPages: safeMaxPages,
      maxDepth: safeMaxDepth,
      crawlDelayMs: Math.max(10, Number(crawlDelayMs) || 40),
      includeSubdomains: Boolean(includeSubdomains),
      discoverFromRobotsTxt: Boolean(discoverFromRobotsTxt)
    });

    return NextResponse.json(
      {
        success: result.success,
        validEntries: result.validEntries,
        summary: result.summary,
        errors: result.errors
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Server error occurred during website crawl.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
