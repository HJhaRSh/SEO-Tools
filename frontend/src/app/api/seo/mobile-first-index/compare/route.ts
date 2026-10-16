import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/seo/hreflang/safeFetch';

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
  schemaTypes: string[];
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

  // Schema types parsing
  const schemaTypes: string[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(scriptMatch[1].trim());
      const scanType = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj['@type']) {
          const t = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
          for (const item of t) {
            if (typeof item === 'string' && !schemaTypes.includes(item)) {
              schemaTypes.push(item);
            }
          }
        }
        if (Array.isArray(obj['@graph'])) {
          for (const g of obj['@graph']) scanType(g);
        }
      };
      scanType(parsed);
    } catch {
      // Ignored if json-ld is malformed
    }
  }

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
    schemaTypes,
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

    const desktopUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    const mobileUa = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

    const fetchVersion = async (ua: string) => {
      const fetchResult = await safeFetch(url.trim(), {
        userAgent: ua,
        timeoutMs: 9000,
        maxBytes: 2 * 1024 * 1024,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      });
      return {
        signals: extractSignalsFromHtml(fetchResult.body, fetchResult.finalUrl, fetchResult.status),
        finalUrl: fetchResult.finalUrl,
      };
    };

    const [desktopData, mobileData] = await Promise.all([
      fetchVersion(desktopUa),
      fetchVersion(mobileUa),
    ]);

    const desktop = desktopData.signals;
    const mobile = mobileData.signals;

    // Helper for missing vs match vs difference
    const compareValues = (d: string | null, m: string | null) => {
      if (!d && !m) return { status: 'Both Missing', desktop: '(Not declared)', mobile: '(Not declared)' };
      if (d === m) return { status: 'Match', desktop: d || '(Not declared)', mobile: m || '(Not declared)' };
      return { status: 'Difference', desktop: d || '(Not declared)', mobile: m || '(Not declared)' };
    };

    // Helper for schema comparison
    const desktopSchemas = desktop.schemaTypes.sort().join(', ');
    const mobileSchemas = mobile.schemaTypes.sort().join(', ');
    let schemaStatus = 'Difference';
    if (!desktopSchemas && !mobileSchemas) {
      schemaStatus = 'Both Missing';
    } else if (desktopSchemas === mobileSchemas) {
      schemaStatus = 'Match';
    }

    // Build comparison rows
    const comparison = [
      {
        name: 'Title Tag',
        ...compareValues(desktop.title, mobile.title),
      },
      {
        name: 'Meta Description',
        ...compareValues(desktop.description, mobile.description),
      },
      {
        name: 'H1 Heading',
        ...compareValues(desktop.h1, mobile.h1),
      },
      {
        name: 'Main Content Word Count',
        desktop: `${desktop.wordCount.toLocaleString()} words`,
        mobile: `${mobile.wordCount.toLocaleString()} words`,
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
        ...compareValues(desktop.canonical, mobile.canonical),
      },
      {
        name: 'Schema Markup (JSON-LD)',
        desktop: desktopSchemas || '(None detected)',
        mobile: mobileSchemas || '(None detected)',
        status: schemaStatus,
      },
      {
        name: 'Robots Directives',
        desktop: desktop.robotsMeta || 'index, follow (default)',
        mobile: mobile.robotsMeta || 'index, follow (default)',
        status: (desktop.robotsMeta || 'index, follow') === (mobile.robotsMeta || 'index, follow') ? 'Match' : 'Difference',
      },
    ];

    const hasDifferences = comparison.some((c) => c.status === 'Difference');

    return NextResponse.json(
      {
        success: true,
        url: url.trim(),
        finalUrl: mobileData.finalUrl,
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
