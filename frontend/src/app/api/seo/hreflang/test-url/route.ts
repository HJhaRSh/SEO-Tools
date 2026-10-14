import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/seo/hreflang/safeFetch';
import { parseHtmlHreflang } from '@/lib/seo/hreflang/parseHtml';
import { parseHttpHeaders } from '@/lib/seo/hreflang/parseHeaders';
import { validateHreflangCluster } from '@/lib/seo/hreflang/analyzeHreflang';
import { HreflangSummary, HreflangUrlRequest, HreflangTestUrlResponse } from '@/lib/seo/hreflang/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body: HreflangUrlRequest = await req.json().catch(() => ({ url: '' }));
    const rawUrl = (body.url || '').trim();

    if (!rawUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid website URL to test.',
        },
        { status: 400 }
      );
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
    const allAnnotations = [
      ...htmlParsed.annotations,
      ...headerParsed.annotations,
    ];

    // Combine page signals
    const pageSignals = {
      htmlLang: htmlParsed.htmlLang,
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

    const summary: HreflangSummary = {
      urlsAnalyzed: 1 + validationItems.length,
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
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An error occurred while inspecting the URL.',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
