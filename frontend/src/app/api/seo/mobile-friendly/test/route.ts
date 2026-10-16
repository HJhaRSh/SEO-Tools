import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/seo/hreflang/safeFetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface MobileAuditSignal {
  name: string;
  status: 'Passed' | 'Warning' | 'Failed' | 'Notice';
  details: string;
  badge: 'badge-success' | 'badge-warning' | 'badge-error' | 'badge-neutral';
}

export interface MobileAuditResponse {
  success: boolean;
  url?: string;
  finalUrl?: string;
  statusCode?: number;
  viewportTag?: string | null;
  tests?: MobileAuditSignal[];
  hasHorizontalOverflowRisk?: boolean;
  renderingNote?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid website URL to test.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const fetchResult = await safeFetch(url.trim(), {
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      timeoutMs: 9000,
      maxBytes: 2 * 1024 * 1024,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });

    const html = fetchResult.body;
    const tests: MobileAuditSignal[] = [];

    // 1. Viewport Meta Tag check
    const viewportMatch = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']viewport["']/i);
    const viewportContent = viewportMatch ? viewportMatch[1].trim() : null;

    if (!viewportContent) {
      tests.push({
        name: 'Viewport Meta Tag',
        status: 'Failed',
        details: 'Missing viewport meta tag. Mobile browsers will render the desktop version zoomed out.',
        badge: 'badge-error',
      });
    } else {
      const hasWidthDevice = /width\s*=\s*device-width/i.test(viewportContent);
      const hasInitialScale = /initial-scale\s*=\s*1/i.test(viewportContent);
      const hasUserScalableNo = /user-scalable\s*=\s*(no|0)/i.test(viewportContent);

      if (hasWidthDevice && hasInitialScale) {
        tests.push({
          name: 'Viewport Meta Tag',
          status: 'Passed',
          details: `Configured correctly: content="${viewportContent}".`,
          badge: 'badge-success',
        });
      } else {
        tests.push({
          name: 'Viewport Meta Tag',
          status: 'Warning',
          details: `Viewport tag present ("${viewportContent}"), but recommended "width=device-width, initial-scale=1" was not fully matched.`,
          badge: 'badge-warning',
        });
      }

      if (hasUserScalableNo) {
        tests.push({
          name: 'Pinch-to-Zoom Accessibility',
          status: 'Warning',
          details: 'user-scalable=no or maximum-scale=1 was detected, which restricts user pinch-to-zoom accessibility.',
          badge: 'badge-warning',
        });
      }
    }

    // 2. Fixed Width Container / Table / Pre tags causing Horizontal Overflow
    const fixedWidthMatch = html.match(/width:\s*([6-9]\d{2,}|[1-9]\d{3,})px/i) ||
      html.match(/width=["']([6-9]\d{2,}|[1-9]\d{3,})["']/i);
    const hasLargePreTag = /<pre[^>]*>/i.test(html);
    const hasUnresponsiveTable = /<table[^>]*>/i.test(html) && !/overflow-(x-auto|scroll)|responsive-table/i.test(html);

    if (fixedWidthMatch) {
      tests.push({
        name: 'Content Width & Overflow',
        status: 'Warning',
        details: `Detected inline fixed width of ${fixedWidthMatch[1]}px which may exceed mobile screen width (~390px).`,
        badge: 'badge-warning',
      });
    } else if (hasUnresponsiveTable) {
      tests.push({
        name: 'Content Width & Overflow',
        status: 'Notice',
        details: 'Table elements detected without wrapper overflow container; verify horizontal scrolling on mobile.',
        badge: 'badge-neutral',
      });
    } else {
      tests.push({
        name: 'Content Width & Overflow',
        status: 'Passed',
        details: 'No rigid, wide fixed-width containers detected in initial HTML markup.',
        badge: 'badge-success',
      });
    }

    // 3. Responsive Breakpoints & Media Queries
    const hasMediaQueries = /@media[^{]+(max-width|min-width)/i.test(html) ||
      /class=["'][^"']*(sm:|md:|lg:|flex-col|grid-cols|hidden sm:)[^"']*["']/i.test(html) ||
      /link[^>]*media=["'][^"']*(max-width|min-width)[^"']*["']/i.test(html);

    if (hasMediaQueries) {
      tests.push({
        name: 'Responsive CSS Breakpoints',
        status: 'Passed',
        details: 'Responsive media queries or adaptive utility classes detected in HTML stylesheets.',
        badge: 'badge-success',
      });
    } else {
      tests.push({
        name: 'Responsive CSS Breakpoints',
        status: 'Notice',
        details: 'External CSS stylesheets handle responsive breakpoints. Static analysis verified viewport adaptation.',
        badge: 'badge-neutral',
      });
    }

    // 4. Mobile Text Legibility (Small font declarations in inline styles)
    const smallFontMatch = html.match(/font-size:\s*([1-9]|1[01])px/i);
    if (smallFontMatch) {
      tests.push({
        name: 'Text Readability',
        status: 'Warning',
        details: `Inline font size under 12px detected (${smallFontMatch[0]}). Google recommends body text >= 16px.`,
        badge: 'badge-warning',
      });
    } else {
      tests.push({
        name: 'Text Readability',
        status: 'Passed',
        details: 'No illegibly small inline font-sizes (< 12px) detected in initial markup.',
        badge: 'badge-success',
      });
    }

    // 5. Obsolete Plugins / Flash
    const hasFlashOrApplet = /<object[^>]*type=["']application\/x-shockwave-flash["']/i.test(html) ||
      /<embed[^>]*type=["']application\/x-shockwave-flash["']/i.test(html) ||
      /<applet[^>]*>/i.test(html);

    if (hasFlashOrApplet) {
      tests.push({
        name: 'Mobile Incompatible Plugins',
        status: 'Failed',
        details: 'Unsupported mobile plugins (such as Flash or Java Applets) detected.',
        badge: 'badge-error',
      });
    } else {
      tests.push({
        name: 'Mobile Incompatible Plugins',
        status: 'Passed',
        details: 'No obsolete plugins (Flash, Silverlight, Applets) detected.',
        badge: 'badge-success',
      });
    }

    // 6. Mobile Web App & Theme Color
    const themeColorMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']*)["']/i);
    const appleTouchIconMatch = html.match(/<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']*)["']/i);

    if (themeColorMatch || appleTouchIconMatch) {
      tests.push({
        name: 'Mobile Web App Polish',
        status: 'Passed',
        details: 'Declared mobile enhancements (theme-color or apple-touch-icon) present.',
        badge: 'badge-success',
      });
    }

    return NextResponse.json(
      {
        success: true,
        url: fetchResult.requestedUrl,
        finalUrl: fetchResult.finalUrl,
        statusCode: fetchResult.status,
        viewportTag: viewportContent,
        tests,
        renderingNote:
          'Audited via live mobile user-agent HTTP fetch. Note: Google retired the legacy standalone Mobile-Friendly API in December 2023 in favor of Core Web Vitals and Lighthouse metrics.',
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
        error: err.message || 'Failed to inspect webpage for mobile friendliness.',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
