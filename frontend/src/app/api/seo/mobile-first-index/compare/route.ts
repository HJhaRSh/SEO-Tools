import { NextRequest, NextResponse } from 'next/server';
import { validateSafeUrl } from '@/lib/seo/serp/fetchMetadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ExtractedSignals {
  title: string | null;
  description: string | null;
  h1: string | null;
  wordCount: number;
  imageCount: number;
  internalLinksCount: number;
  canonical: string | null;
  robotsMeta: string | null;
  hasSchema: boolean;
  statusCode: number;
}

function extractSignalsFromHtml(html: string, baseUrl: string, statusCode: number): ExtractedSignals {
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : null;

  // Description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const description = descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : null;

  // H1
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null;

  // Canonical
  const canonMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) ||
    html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);
  const canonical = canonMatch ? canonMatch[1].trim() : null;

  // Robots
  const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i);
  const robotsMeta = robotsMatch ? robotsMatch[1].trim() : null;

  // Schema
  const hasSchema = /<script[^>]*type=["']application\/ld\+json["']/i.test(html);

  // Images count
  const images = html.match(/<img[^>]*>/gi) || [];
  const imageCount = images.length;

  // Links count (internal)
  let internalLinksCount = 0;
  let targetOrigin = '';
  try {
    targetOrigin = new URL(baseUrl).origin.toLowerCase();
  } catch {
    targetOrigin = '';
  }

  const hrefMatches = html.matchAll(/<a[^>]*href=["']([^"']*)["']/gi);
  for (const m of hrefMatches) {
    const href = m[1].trim();
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin.toLowerCase() === targetOrigin) {
        internalLinksCount++;
      }
    } catch {
      // ignore
    }
  }

  // Word count of visible body text
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;
  const stripped = bodyContent
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = stripped ? stripped.split(/\s+/).length : 0;

  return {
    title,
    description,
    h1,
    wordCount: words,
    imageCount,
    internalLinksCount,
    canonical,
    robotsMeta,
    hasSchema,
    statusCode,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid website URL to compare.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const validatedUrl = await validateSafeUrl(url.trim());

    const desktopUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    const mobileUa = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

    const fetchVersion = async (ua: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      try {
        const response = await fetch(validatedUrl.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': ua,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          redirect: 'follow',
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeoutId);

        if (response.url && response.url !== validatedUrl.toString()) {
          await validateSafeUrl(response.url);
        }

        const html = await response.text();
        return extractSignalsFromHtml(html, response.url || validatedUrl.toString(), response.status);
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    const [desktop, mobile] = await Promise.all([
      fetchVersion(desktopUa),
      fetchVersion(mobileUa),
    ]);

    // Build comparison rows
    const comparison = [
      {
        name: 'Title Tag',
        desktop: desktop.title || 'Missing',
        mobile: mobile.title || 'Missing',
        status: desktop.title === mobile.title ? 'Match' : 'Difference',
      },
      {
        name: 'Meta Description',
        desktop: desktop.description || 'Missing',
        mobile: mobile.description || 'Missing',
        status: desktop.description === mobile.description ? 'Match' : 'Difference',
      },
      {
        name: 'H1 Heading',
        desktop: desktop.h1 || 'Missing',
        mobile: mobile.h1 || 'Missing',
        status: desktop.h1 === mobile.h1 ? 'Match' : 'Difference',
      },
      {
        name: 'Main Content Word Count',
        desktop: `${desktop.wordCount.toLocaleString()} words`,
        mobile: `${mobile.wordCount.toLocaleString()} words`,
        // Flag difference if word counts deviate by more than 15%
        status:
          desktop.wordCount > 0 && Math.abs(desktop.wordCount - mobile.wordCount) / Math.max(desktop.wordCount, mobile.wordCount) > 0.15
            ? 'Difference'
            : 'Match',
      },
      {
        name: 'Images',
        desktop: `${desktop.imageCount}`,
        mobile: `${mobile.imageCount}`,
        status: desktop.imageCount === mobile.imageCount ? 'Match' : 'Difference',
      },
      {
        name: 'Internal Links',
        desktop: `${desktop.internalLinksCount}`,
        mobile: `${mobile.internalLinksCount}`,
        status: desktop.internalLinksCount === mobile.internalLinksCount ? 'Match' : 'Difference',
      },
      {
        name: 'Canonical Tag',
        desktop: desktop.canonical || 'Not declared',
        mobile: mobile.canonical || 'Not declared',
        status: desktop.canonical === mobile.canonical ? 'Match' : 'Difference',
      },
      {
        name: 'Schema Markup (JSON-LD)',
        desktop: desktop.hasSchema ? 'Present' : 'Missing',
        mobile: mobile.hasSchema ? 'Present' : 'Missing',
        status: desktop.hasSchema === mobile.hasSchema ? 'Match' : 'Difference',
      },
      {
        name: 'Robots Directives',
        desktop: desktop.robotsMeta || 'index, follow (default)',
        mobile: mobile.robotsMeta || 'index, follow (default)',
        status: desktop.robotsMeta === mobile.robotsMeta ? 'Match' : 'Difference',
      },
    ];

    const hasDifferences = comparison.some((c) => c.status === 'Difference');

    return NextResponse.json(
      {
        success: true,
        url: validatedUrl.toString(),
        desktopStatus: desktop.statusCode,
        mobileStatus: mobile.statusCode,
        parityVerdict: hasDifferences ? 'Potential parity issue' : 'Parity check passed',
        hasDifferences,
        comparison,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to compare mobile and desktop versions.',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
