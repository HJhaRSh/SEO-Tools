import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/seo/hreflang/safeFetch';
import { parseHtmlHreflang } from '@/lib/seo/hreflang/parseHtml';
import { parseHttpHeaders } from '@/lib/seo/hreflang/parseHeaders';
import { validateHreflangCluster } from '@/lib/seo/hreflang/analyzeHreflang';
import { validateHtmlLang, compareHreflangWithHtmlLang } from '@/lib/seo/hreflang/validateLocale';
import { discoverSitemapHreflang } from '@/lib/seo/hreflang/sitemapDiscovery';
import { HreflangSummary, HreflangUrlRequest, HreflangTestUrlResponse } from '@/lib/seo/hreflang/types';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body: HreflangUrlRequest = await req.json().catch(() => ({ url: '' }));
    let rawUrl = (body.url || '').trim();

    if (!rawUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid website URL to test.',
        },
        { status: 400 }
      );
    }

    // Auto-normalize scheme if omitted (e.g. "samsung.com" -> "https://samsung.com")
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = `https://${rawUrl}`;
    }

    // 1. Fetch primary webpage safely with SSRF protections
    const pageFetch = await safeFetch(rawUrl, {
      userAgent: body.userAgent || 'default',
      timeoutMs: 8500,
    });

    const finalPageUrl = pageFetch.finalUrl;
    const contentType = pageFetch.headers.get('content-type') || '';

    // 2. Parse HTML annotations and signals
    const htmlParsed = parseHtmlHreflang(pageFetch.body, finalPageUrl);

    // 3. Parse HTTP header annotations and signals
    const headerParsed = parseHttpHeaders(pageFetch.headers, finalPageUrl);

    // Combine annotations from HTML and HTTP headers
    let allAnnotations = [
      ...htmlParsed.annotations,
      ...headerParsed.annotations,
    ];

    // Sitemap auto-discovery fallback if page has 0 HTML or HTTP header hreflangs
    let sitemapAutoDiscovered = false;
    let discoveredSitemapUrl: string | null = null;
    let detectedSitemaps: string[] = [];
    let customNoticeMessage: string | undefined = undefined;

    if (allAnnotations.length === 0) {
      try {
        const sitemapDiscovery = await discoverSitemapHreflang(finalPageUrl, body.userAgent, pageFetch.body);
        detectedSitemaps = sitemapDiscovery.detectedSitemaps;
        discoveredSitemapUrl = sitemapDiscovery.discoveredSitemapUrl;

        if (sitemapDiscovery.annotations.length > 0) {
          allAnnotations = sitemapDiscovery.annotations;
          sitemapAutoDiscovered = true;
          customNoticeMessage = `Discovered ${sitemapDiscovery.annotations.length} international hreflang annotations for this URL in XML Sitemap: ${sitemapDiscovery.discoveredSitemapUrl}`;
        } else if (detectedSitemaps.length > 0) {
          customNoticeMessage = `No hreflang tags found in HTML <head> or HTTP headers. Found ${detectedSitemaps.length} XML sitemap(s) in robots.txt (e.g. ${detectedSitemaps.slice(0, 2).join(', ')}). Websites like Samsung often define hreflang in XML sitemaps rather than HTML tags.`;
        }
      } catch {
        // Non-blocking sitemap discovery fallback
      }
    }

    // Validate HTML <html lang="..."> attribute on source page
    const htmlLangValidationResult = validateHtmlLang(htmlParsed.htmlLang);

    // Check if self-referencing hreflang tag matches source <html lang="...">
    let htmlLangMatchStatus: 'valid' | 'missing' | 'invalid' | 'mismatch' = htmlLangValidationResult.status;
    let htmlLangValidationMessage = htmlLangValidationResult.message;

    if (allAnnotations.length > 0) {
      const selfAnn = allAnnotations.find((a) => a.isSelfReference || a.href === finalPageUrl);
      if (selfAnn && htmlParsed.htmlLang) {
        const selfCheck = compareHreflangWithHtmlLang(selfAnn.hreflang, htmlParsed.htmlLang, finalPageUrl);
        if (!selfCheck.isCompatible) {
          htmlLangMatchStatus = 'mismatch';
          htmlLangValidationMessage = selfCheck.message;
        }
      }
    }

    // Combine page signals
    const pageSignals = {
      htmlLang: htmlParsed.htmlLang,
      htmlLangValidation: {
        isValid: htmlLangMatchStatus === 'valid',
        status: htmlLangMatchStatus,
        message: htmlLangValidationMessage,
      },
      metaContentLanguage: htmlParsed.metaContentLanguage,
      headerContentLanguage: headerParsed.contentLanguageHeader,
      canonicalUrl: headerParsed.canonicalUrl || htmlParsed.canonicalUrl,
      robotsMeta: htmlParsed.robotsMeta,
      xRobotsTag: headerParsed.xRobotsTag,
      title: htmlParsed.title,
    };

    // 4. Validate cluster (return tags, canonicals, status codes, indexability)
    const checkReturnTags = body.checkReturnTags !== false;
    const validationItems = await validateHreflangCluster(
      finalPageUrl,
      allAnnotations,
      htmlParsed,
      headerParsed,
      {
        checkLiveUrls: checkReturnTags,
        userAgent: body.userAgent,
        concurrency: 4,
      }
    );

    // 5. Calculate summary metrics
    const totalAnnotations = allAnnotations.length;
    let errorCount = 0;
    let warningCount = 0;
    let returnTagsVerified = 0;
    let missingReturnTags = 0;
    let untestedAlternates = 0;
    let brokenUrls = 0;
    let redirectsFound = 0;
    let selfRefFound = false;
    let xDefaultFound = false;

    for (const item of validationItems) {
      const errors = item.issues.filter((i) => i.severity === 'error');
      const warnings = item.issues.filter((i) => i.severity === 'warning');
      errorCount += errors.length;
      warningCount += warnings.length;

      if (item.annotation.normalizedHreflang === 'x-default') {
        xDefaultFound = true;
      }
      if (item.annotation.isSelfReference && item.annotation.normalizedHreflang !== 'x-default') {
        selfRefFound = true;
      }
      if (item.returnTagFound === true) {
        returnTagsVerified++;
      } else if (item.returnTagFound === false) {
        missingReturnTags++;
      } else {
        untestedAlternates++;
      }

      if (item.statusCode !== null && item.statusCode >= 400) {
        brokenUrls++;
      }
      if (item.redirectChain && item.redirectChain.length > 0) {
        redirectsFound++;
      }
    }

    // Calculate true unique URLs analyzed (1 source URL + unique alternate URLs actually fetched/tested)
    const uniqueAlternateUrls = new Set(validationItems.map((item) => item.annotation.href));
    uniqueAlternateUrls.add(finalPageUrl);
    const uniqueUrlsAnalyzedCount = uniqueAlternateUrls.size;

    const summary: HreflangSummary = {
      urlsAnalyzed: uniqueUrlsAnalyzedCount,
      totalAnnotations,
      validAnnotations: validationItems.filter((v) => v.issues.filter((i) => i.severity === 'error').length === 0).length,
      errorCount,
      warningCount,
      selfReferenceStatus: totalAnnotations === 0 ? 'N/A' : (selfRefFound ? 'Present' : 'Missing'),
      xDefaultPresent: xDefaultFound,
      returnTagsVerified,
      missingReturnTags,
      untestedAlternates,
      brokenUrls,
      redirectsFound,
    };

    const responsePayload: HreflangTestUrlResponse = {
      success: true,
      mode: 'url',
      sourceUrl: finalPageUrl,
      pageStatus: pageFetch.status,
      contentType,
      pageSignals,
      summary,
      results: validationItems,
      sitemapAutoDiscovered,
      discoveredSitemapUrl,
      detectedSitemaps,
      message: customNoticeMessage,
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'An error occurred while inspecting the URL.');
    return NextResponse.json(
      {
        success: false,
        error: sanitized.message,
      },
      {
        status: sanitized.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
