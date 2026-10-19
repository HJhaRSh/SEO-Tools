import { NextRequest, NextResponse } from 'next/server';
import { BROWSER_AUDIT_INJECTION_SCRIPT } from '@/lib/seo/mobile-friendly/browserEvaluator';
import {
  validateTargetUrlForBrowser,
  setupBrowserSecurityContext,
  classifyBrowserRenderError,
} from '@/lib/seo/mobile-friendly/browserSecurity';
import { redactSensitiveDetails } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let browser: import('playwright-core').Browser | null = null;
  let securityViolation: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const { url, viewport } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, code: 'INVALID_URL', error: 'A valid target URL is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (body.evaluateScript !== undefined) {
      return NextResponse.json(
        { success: false, code: 'SECURITY_ERROR', error: 'Supplying custom evaluateScript is forbidden.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // 1. Connection-level pre-validation against SSRF, blocked hostnames, private IPs, and cloud metadata
    const parsedTarget = await validateTargetUrlForBrowser(url);

    const rawWidth = viewport && typeof viewport.width === 'number' ? viewport.width : 390;
    const rawHeight = viewport && typeof viewport.height === 'number' ? viewport.height : 844;
    const rawScale = viewport && typeof viewport.deviceScaleFactor === 'number' ? viewport.deviceScaleFactor : 3;

    if (rawWidth < 300 || rawWidth > 800 || rawHeight < 400 || rawHeight > 1600 || rawScale < 1 || rawScale > 4) {
      return NextResponse.json(
        { success: false, code: 'INVALID_VIEWPORT', error: 'Viewport dimensions are outside supported mobile ranges.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
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

    // 2. Attach strict network isolation: intercepts all subresources, JS requests, and redirect hops
    const securityIsolation = await setupBrowserSecurityContext(context);

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(20000);
    page.setDefaultTimeout(15000);

    let finalUrl = parsedTarget.toString();
    let statusCode = 200;
    let statusText = 'OK';

    try {
      const response = await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (response) {
        statusCode = response.status();
        statusText = response.statusText();
        finalUrl = response.url();

        // If redirected, revalidate destination against SSRF
        if (finalUrl !== url) {
          await validateTargetUrlForBrowser(finalUrl);
        }
      } else {
        // Missing HTTP navigation response
        statusCode = 200;
        statusText = 'OK';
      }
    } catch (navErr: any) {
      securityViolation = securityIsolation.getSecurityViolation();
      const classified = classifyBrowserRenderError(navErr, securityViolation);

      await browser.close().catch(() => {});
      browser = null;

      return NextResponse.json(
        { success: false, code: classified.code, error: classified.message },
        { status: classified.status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Check if subresource security violations occurred during DOM building
    securityViolation = securityIsolation.getSecurityViolation();
    if (securityViolation) {
      // Subresource was blocked by policy; continue audit with safe elements, but log security event
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[Subresource Blocked by Security Policy]', redactSensitiveDetails(securityViolation));
      }
    }

    await page.waitForTimeout(1000).catch(() => {});

    let metrics: Record<string, unknown> = {};
    try {
      metrics = await page.evaluate(BROWSER_AUDIT_INJECTION_SCRIPT as string);
    } catch {
      // metrics unavailable — non-fatal
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

    if (process.env.NODE_ENV !== 'test') {
      const sanitizedLog = redactSensitiveDetails(err?.message || String(err || ''));
      console.error('[Mobile Render Route Error]', sanitizedLog);
    }

    const classified = classifyBrowserRenderError(err, securityViolation);
    return NextResponse.json(
      { success: false, code: classified.code, error: classified.message },
      { status: classified.status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
