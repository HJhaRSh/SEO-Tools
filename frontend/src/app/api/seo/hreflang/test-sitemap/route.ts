import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/seo/hreflang/safeFetch';
import { parseSitemapXml } from '@/lib/seo/hreflang/parseSitemap';
import { validateHreflangCluster } from '@/lib/seo/hreflang/analyzeHreflang';
import { HreflangSummary, HreflangSitemapRequest, HreflangTestUrlResponse, HreflangValidationItem, HreflangAnnotation } from '@/lib/seo/hreflang/types';
import { classifyAndSanitizeError } from '@/lib/seo/errorSanitizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body: HreflangSitemapRequest = await req.json().catch(() => ({}));
    const { sitemapUrl, xmlContent, checkLiveUrls, userAgent } = body;

    let rawXml = xmlContent || '';
    let resolvedSourceUrl = sitemapUrl || 'Uploaded XML Sitemap';
    let pageStatus = 200;
    let contentType = 'application/xml';

    // 1. If sitemap URL is provided, fetch it safely
    if (sitemapUrl && !xmlContent) {
      const sitemapFetch = await safeFetch(sitemapUrl.trim(), {
        userAgent: userAgent || 'default',
        timeoutMs: 9000,
        maxBytes: 5 * 1024 * 1024, // 5MB sitemap cap
        accept: 'application/xml,text/xml,*/*',
      });
      rawXml = sitemapFetch.body;
      resolvedSourceUrl = sitemapFetch.finalUrl;
      pageStatus = sitemapFetch.status;
      contentType = sitemapFetch.headers.get('content-type') || 'application/xml';
    }

    if (!rawXml.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a sitemap URL or upload XML sitemap content to test.',
        },
        { status: 400 }
      );
    }

    // 2. Parse XML safely with fast-xml-parser
    const sitemapParsed = parseSitemapXml(rawXml, resolvedSourceUrl, 1000);

    if (sitemapParsed.issues.some((i) => i.code === 'MALFORMED_XML' || i.code === 'UNSAFE_XML_DOCTYPE')) {
      const firstError = sitemapParsed.issues.find((i) => i.severity === 'error');
      return NextResponse.json(
        {
          success: false,
          error: firstError?.message || 'Malformed XML structure.',
        },
        { status: 400 }
      );
    }

    let allAnnotations = sitemapParsed.annotations;
    let sitemapIssues = [...sitemapParsed.issues];
    let totalParsedUrls = sitemapParsed.totalUrls;
    let sitemapIndexNotice: string | undefined = undefined;

    // Bounded Sitemap Index processing
    if (sitemapParsed.isSitemapIndex) {
      const childUrls = sitemapParsed.sitemapIndexUrls.slice(0, 5); // Bound to first 5 child sitemaps
      sitemapIndexNotice = `Sitemap index detected with ${sitemapParsed.sitemapIndexUrls.length} child sitemaps. Processed ${childUrls.length} child sitemaps (bounded for serverless execution).`;

      for (const childUrl of childUrls) {
        try {
          const childFetch = await safeFetch(childUrl, {
            userAgent: userAgent || 'default',
            timeoutMs: 6000,
            maxBytes: 3 * 1024 * 1024,
            accept: 'application/xml,text/xml,*/*',
          });
          const childParsed = parseSitemapXml(childFetch.body, childFetch.finalUrl, 500);
          allAnnotations = allAnnotations.concat(childParsed.annotations);
          sitemapIssues = sitemapIssues.concat(childParsed.issues);
          totalParsedUrls += childParsed.totalUrls;
        } catch (err: any) {
          const sanitizedChildErr = classifyAndSanitizeError(err, 'Failed to fetch child sitemap.');
          sitemapIssues.push({
            code: 'CHILD_SITEMAP_FETCH_ERROR',
            severity: 'warning',
            message: `Could not fetch child sitemap "${childUrl}": ${sanitizedChildErr.message}`,
            sourceUrl: childUrl,
          });
        }
      }
    }

    // 3. For sitemaps, reciprocal returns can be validated statically across the dataset
    // We group by sourceUrl and alternateUrl
    const sitemapMap = new Map<string, Map<string, string>>(); // sourceUrl -> (hreflang -> href)
    for (const ann of allAnnotations) {
      const existing = sitemapMap.get(ann.sourceUrl) || new Map<string, string>();
      existing.set(ann.normalizedHreflang, ann.href);
      sitemapMap.set(ann.sourceUrl, existing);
    }

    let validationItems: HreflangValidationItem[] = [];

    if (checkLiveUrls) {
      // Live validation on a bounded batch (up to 50 URLs to protect Vercel timeouts)
      const boundedBatch = allAnnotations.slice(0, 50);
      validationItems = await validateHreflangCluster(
        resolvedSourceUrl,
        boundedBatch,
        undefined,
        undefined,
        {
          checkLiveUrls: true,
          userAgent,
          concurrency: 4,
        }
      );
    } else {
      // Identify the declared language of each source URL in the sitemap
      // sourceUrl -> (language or x-default declared for itself)
      const sourceSelfLangs = new Map<string, Set<string>>();
      for (const ann of allAnnotations) {
        if (!sourceSelfLangs.has(ann.sourceUrl)) {
          sourceSelfLangs.set(ann.sourceUrl, new Set<string>());
        }
        if (ann.isSelfReference) {
          sourceSelfLangs.get(ann.sourceUrl)!.add(ann.normalizedHreflang);
        }
      }

      // Static validation across the sitemap dataset
      for (const ann of allAnnotations) {
        const itemIssues = [...sitemapIssues.filter((iss) => iss.alternateUrl === ann.href && iss.hreflang === ann.hreflang)];
        
        // Static return check: Check if destination URL also exists as a <url> in the sitemap
        // and points back to exact sourceUrl with the correct language tag
        let returnTagFound: boolean | null = null;
        if (ann.isSelfReference) {
          returnTagFound = true;
        } else {
          const destEntry = sitemapMap.get(ann.href);
          if (destEntry) {
            let foundBackUrl = false;
            let foundCorrectLanguage = false;
            let returnLangFound: string | undefined = undefined;

            let isAmbiguous = false;

            // What languages are declared for sourceUrl on its own page?
            const expectedSourceLangs = sourceSelfLangs.get(ann.sourceUrl) || new Set<string>();

            for (const [retLang, returnHref] of destEntry.entries()) {
              // Exact URL comparison (strictly respect trailing slash)
              if (returnHref === ann.sourceUrl) {
                foundBackUrl = true;
                returnLangFound = retLang;

                // Return language validation:
                // 1. If ann.normalizedHreflang is 'x-default', destination must link back with the specific language declared for sourceUrl.
                // 2. If ann is a language mapping (e.g. 'fr'), destination must link back with the specific language declared for sourceUrl (e.g. 'en').
                // Do not treat x-default as interchangeable with a language-specific mapping.
                if (expectedSourceLangs.size > 0) {
                  if (expectedSourceLangs.has(retLang)) {
                    foundCorrectLanguage = true;
                    break;
                  }
                } else {
                  // Source has no explicit self-referencing declaration in the sitemap.
                  // The relationship cannot be conclusively determined without source language declaration.
                  isAmbiguous = true;
                  break;
                }
              }
            }

            if (!foundBackUrl) {
              returnTagFound = false;
              itemIssues.push({
                code: 'MISSING_RETURN_TAG',
                severity: 'error',
                message: `Reciprocal return link missing: Destination URL "${ann.href}" in sitemap does not declare a return link to "${ann.sourceUrl}".`,
                alternateUrl: ann.href,
                hreflang: ann.hreflang,
              });
            } else if (isAmbiguous) {
              returnTagFound = null; // Unverified
              itemIssues.push({
                code: 'AMBIGUOUS_RETURN_TAG',
                severity: 'warning',
                message: `Reciprocal return link unverified: Source page "${ann.sourceUrl}" lacks an explicit self-referencing language declaration, making the expected return language code ambiguous.`,
                alternateUrl: ann.href,
                hreflang: ann.hreflang,
              });
            } else if (!foundCorrectLanguage) {
              returnTagFound = false;
              itemIssues.push({
                code: 'WRONG_LANGUAGE_RETURN_TAG',
                severity: 'error',
                message: `Reciprocal return link language mismatch: Destination URL "${ann.href}" links back to "${ann.sourceUrl}" with hreflang="${returnLangFound}", which does not match source language (${Array.from(expectedSourceLangs).join(', ')}).`,
                alternateUrl: ann.href,
                hreflang: ann.hreflang,
              });
            } else {
              returnTagFound = true;
            }
          } else {
            // Not listed as an entry in this sitemap
            returnTagFound = null; // untested / not in sitemap
          }
        }

        validationItems.push({
          annotation: ann,
          statusCode: null,
          finalUrl: null,
          returnTagFound,
          selfReferencing: ann.isSelfReference,
          indexability: 'unknown',
          canonicalUrl: null,
          canonicalStatus: 'unknown',
          detectedLanguage: null,
          htmlLang: null,
          contentLanguageMeta: null,
          contentLanguageHeader: null,
          issues: itemIssues,
        });
      }
    }

    // 4. Summarize
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
      if (item.annotation.isSelfReference) {
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
    }

    const summary: HreflangSummary = {
      urlsAnalyzed: totalParsedUrls,
      totalAnnotations: allAnnotations.length,
      validAnnotations: validationItems.filter((v) => v.issues.filter((i) => i.severity === 'error').length === 0).length,
      errorCount,
      warningCount,
      selfReferenceStatus: allAnnotations.length === 0 ? 'N/A' : (selfRefFound ? 'Present' : 'Missing'),
      xDefaultPresent: xDefaultFound,
      returnTagsVerified,
      missingReturnTags,
      untestedAlternates,
      brokenUrls,
      redirectsFound,
    };

    const responsePayload: HreflangTestUrlResponse = {
      success: true,
      mode: xmlContent ? 'sitemap_upload' : 'sitemap_url',
      sourceUrl: resolvedSourceUrl,
      pageStatus,
      contentType,
      pageSignals: {
        htmlLang: null,
        metaContentLanguage: null,
        headerContentLanguage: null,
        canonicalUrl: null,
        robotsMeta: null,
        xRobotsTag: null,
        title: sitemapParsed.isSitemapIndex ? 'Sitemap Index Audit' : 'XML Sitemap Audit',
      },
      summary,
      results: validationItems,
      message: sitemapIndexNotice,
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    const sanitized = classifyAndSanitizeError(err, 'An error occurred while inspecting the sitemap.');
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
