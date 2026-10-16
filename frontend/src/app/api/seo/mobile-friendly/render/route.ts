import { NextRequest, NextResponse } from 'next/server';
import { BROWSER_AUDIT_INJECTION_SCRIPT } from '@/lib/seo/mobile-friendly/browserEvaluator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^::1$/,
  /^fd[0-9a-f]{2}:/i,
  /^0\.0\.0\.0$/,
  /^169\.254\.\d+\.\d+$/,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((p) => p.test(hostname));
}

export async function POST(req: NextRequest) {
  let browser: import('playwright-core').Browser | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const { url, viewport } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A valid target URL is required.' },
        { status: 400 }
      );
    }

    if (body.evaluateScript !== undefined) {
      return NextResponse.json(
        { success: false, code: 'SECURITY_ERROR', error: 'Supplying custom evaluateScript is forbidden.' },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Malformed URL.' },
        { status: 400 }
      );
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { success: false, error: 'Only HTTP and HTTPS URLs are supported.' },
        { status: 400 }
      );
    }

    if (isBlockedHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { success: false, code: 'BLOCKED_DESTINATION', error: 'Target destination is blocked.' },
        { status: 403 }
      );
    }

    const rawWidth = viewport && typeof viewport.width === 'number' ? viewport.width : 390;
    const rawHeight = viewport && typeof viewport.height === 'number' ? viewport.height : 844;
    const rawScale = viewport && typeof viewport.deviceScaleFactor === 'number' ? viewport.deviceScaleFactor : 3;

    if (rawWidth < 300 || rawWidth > 800 || rawHeight < 400 || rawHeight > 1600 || rawScale < 1 || rawScale > 4) {
      return NextResponse.json(
        { success: false, code: 'INVALID_VIEWPORT', error: 'Viewport dimensions are outside supported mobile ranges.' },
        { status: 400 }
      );
    }

    const vpWidth = Math.round(rawWidth);
    const vpHeight = Math.round(rawHeight);
    const vpScale = Number(rawScale.toFixed(2));
    const startMs = Date.now();

    const isVercel = Boolean(
      process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION
    );

    let executablePath: string | undefined;
    let chromiumArgs: string[] = [];

    if (isVercel) {
      const chromium = (await import('@sparticuz/chromium')).default;
      executablePath = await chromium.executablePath();
      chromiumArgs = chromium.args;
    }

    const { chromium: playwrightChromium } = await import('playwright-core');

    browser = await playwrightChromium.launch({
      executablePath,
      args: isVercel
        ? chromiumArgs
        : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: vpWidth, height: vpHeight },
      deviceScaleFactor: vpScale,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      acceptDownloads: false,
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(20000);
    page.setDefaultTimeout(15000);

    let finalUrl = url;
    let statusCode = 200;
    let statusText = 'OK';

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (response) {
        statusCode = response.status();
        statusText = response.statusText();
        finalUrl = response.url();
      }
    } catch (navErr: any) {
      if (navErr?.message?.includes('net::ERR_')) {
        await browser.close();
        browser = null;
        return NextResponse.json(
          { success: false, error: `Navigation failed: ${navErr.message}` },
          { status: 502 }
        );
      }
      // non-fatal nav errors (e.g. mixed content) — continue
    }

    await page.waitForTimeout(1500).catch(() => {});

    let metrics: Record<string, unknown> = {};
    try {
      metrics = await page.evaluate(BROWSER_AUDIT_INJECTION_SCRIPT as string);
    } catch {
      // metrics unavailable — still return screenshot
    }

    let screenshotBase64: string | null = null;
    try {
      const buf = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: vpWidth, height: Math.min(vpHeight * 2, 1600) },
        fullPage: false,
      });
      screenshotBase64 = `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      // non-fatal
    }

    await browser.close();
    browser = null;

    return NextResponse.json(
      {
        success: true,
        result: {
          metrics,
          screenshotBase64,
          renderDurationMs: Date.now() - startMs,
          renderStatus: 'success',
          finalUrl,
          statusCode,
          statusText,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: any) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    const message = err?.message || 'Browser rendering failed.';
    console.error('[Mobile Render Route Error]', message);
    let status = 500;
    if (message.includes('Executable') || message.includes('Failed to launch')) status = 503;
    else if (message.includes('timeout') || message.includes('Timeout')) status = 504;
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
