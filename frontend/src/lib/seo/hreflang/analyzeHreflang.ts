import { HreflangAnnotation, HreflangIssue, HreflangValidationItem } from './types';
import { safeFetch, SafeFetchResult } from './safeFetch';
import { parseHtmlHreflang } from './parseHtml';
import { parseHttpHeaders } from './parseHeaders';

export interface ReturnTagCheckOptions {
  checkLiveUrls?: boolean;
  userAgent?: string;
  concurrency?: number;
}

/**
 * Validates alternate URLs, checks live HTTP status, detects redirects,
 * self-reference, canonical mismatch, indexability (meta robots, X-Robots-Tag),
 * and reciprocal return tags.
 */
export async function validateHreflangCluster(
  sourceUrl: string,
  annotations: HreflangAnnotation[],
  initialHtmlResult?: {
    htmlLang: string | null;
    metaContentLanguage: string | null;
    canonicalUrl: string | null;
    robotsMeta: string | null;
  },
  initialHeadersResult?: {
    contentLanguageHeader: string | null;
    xRobotsTag: string | null;
    canonicalUrl: string | null;
  },
  options: ReturnTagCheckOptions = {}
): Promise<HreflangValidationItem[]> {
  const checkLive = options.checkLiveUrls ?? true;
  const concurrency = options.concurrency ?? 4;

  // 1. Detect duplicates & conflicts across the set
  const duplicateMap = new Map<string, string[]>(); // normalizedHreflang -> href[]
  for (const ann of annotations) {
    const key = ann.normalizedHreflang;
    const existing = duplicateMap.get(key) || [];
    existing.push(ann.href);
    duplicateMap.set(key, existing);
  }

  // 2. Group unique destination URLs to avoid redundant requests (Request Optimization)
  const uniqueUrls = Array.from(new Set(annotations.map((a) => a.href)));
  const fetchCache = new Map<string, { result?: SafeFetchResult; error?: string }>();

  if (checkLive) {
    // Process in bounded concurrent chunks
    for (let i = 0; i < uniqueUrls.length; i += concurrency) {
      const chunk = uniqueUrls.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (destUrl) => {
          // If destination is identical to source, avoid re-fetching if initial data is present
          try {
            const res = await safeFetch(destUrl, {
              userAgent: options.userAgent,
              timeoutMs: 8000,
            });
            fetchCache.set(destUrl, { result: res });
          } catch (err: any) {
            fetchCache.set(destUrl, { error: err.message || 'Fetch failed' });
          }
        })
      );
    }
  }

  // 3. Evaluate each annotation
  const results: HreflangValidationItem[] = [];

  // Check self-reference presence for the source URL
  const hasSelfReference = annotations.some((a) => a.isSelfReference && a.normalizedHreflang !== 'x-default');

  for (const ann of annotations) {
    const itemIssues: HreflangIssue[] = [];

    // Conflict / Duplicate check
    const targets = duplicateMap.get(ann.normalizedHreflang) || [];
    if (targets.length > 1) {
      const distinctTargets = Array.from(new Set(targets));
      if (distinctTargets.length > 1) {
        itemIssues.push({
          code: 'CONFLICTING_LANGUAGE_TARGET',
          severity: 'error',
          message: `Conflicting destination URLs found for "${ann.hreflang}". It targets multiple distinct URLs (${distinctTargets.join(', ')}).`,
          hreflang: ann.hreflang,
          alternateUrl: ann.href,
        });
      } else {
        itemIssues.push({
          code: 'DUPLICATE_ANNOTATION',
          severity: 'warning',
          message: `Duplicate hreflang tag for "${ann.hreflang}" targeting "${ann.href}".`,
          hreflang: ann.hreflang,
          alternateUrl: ann.href,
        });
      }
    }

    // Check self-reference on source page
    if (!hasSelfReference && !ann.isSelfReference && ann.source !== 'XML_SITEMAP') {
      itemIssues.push({
        code: 'MISSING_SELF_REFERENCE',
        severity: 'warning',
        message: 'The page lacks a self-referencing hreflang tag pointing back to itself.',
        hreflang: ann.hreflang,
      });
    }

    // Live validation
    let statusCode: number | null = null;
    let finalUrl: string | null = null;
    let redirectChain: string[] = [];
    let returnTagFound: boolean | null = null;
    let canonicalUrl: string | null = null;
    let canonicalStatus: 'self' | 'different' | 'missing' | 'malformed' | 'unknown' = 'unknown';
    let indexability: 'pass' | 'warning' | 'fail' | 'unknown' = 'unknown';
    let indexabilityDetails: string | undefined;
    let htmlLang: string | null = null;
    let contentLanguageMeta: string | null = null;
    let contentLanguageHeader: string | null = null;
    let returnTagDetails: { expectedUrl: string; foundHreflang?: string; foundUrl?: string } | null = null;

    if (!checkLive) {
      results.push({
        annotation: ann,
        statusCode: null,
        finalUrl: null,
        returnTagFound: null,
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
      continue;
    }

    const cached = fetchCache.get(ann.href);

    if (cached?.error) {
      itemIssues.push({
        code: 'UNREACHABLE_ALTERNATE',
        severity: 'error',
        message: `Could not verify alternate page: ${cached.error}`,
        alternateUrl: ann.href,
      });
      results.push({
        annotation: ann,
        statusCode: null,
        finalUrl: null,
        returnTagFound: null, // Untested / unreachable
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
      continue;
    }

    if (cached?.result) {
      const res = cached.result;
      statusCode = res.status;
      finalUrl = res.finalUrl;
      redirectChain = res.redirectChain;

      // Status code evaluations
      if (statusCode >= 400 && statusCode < 500) {
        itemIssues.push({
          code: 'ALTERNATE_4XX',
          severity: 'error',
          message: `Alternate URL returned HTTP ${statusCode} ${res.statusText}.`,
          alternateUrl: ann.href,
        });
      } else if (statusCode >= 500) {
        itemIssues.push({
          code: 'ALTERNATE_5XX',
          severity: 'error',
          message: `Alternate URL returned server error HTTP ${statusCode} ${res.statusText}.`,
          alternateUrl: ann.href,
        });
      }

      // Redirect evaluation
      if (redirectChain.length > 0 || (finalUrl && finalUrl !== ann.href && finalUrl.replace(/\/$/, '') !== ann.href.replace(/\/$/, ''))) {
        itemIssues.push({
          code: 'ALTERNATE_REDIRECT',
          severity: 'warning',
          message: `Alternate URL redirected to "${finalUrl}". Google recommends hreflang URLs point directly to the canonical 200 OK version.`,
          alternateUrl: ann.href,
        });
      }

      // Parse response headers and HTML
      const headerParsed = parseHttpHeaders(res.headers, finalUrl || ann.href);
      contentLanguageHeader = headerParsed.contentLanguageHeader;
      const xRobots = headerParsed.xRobotsTag || '';

      const htmlParsed = parseHtmlHreflang(res.body, finalUrl || ann.href);
      htmlLang = htmlParsed.htmlLang;
      contentLanguageMeta = htmlParsed.metaContentLanguage;
      const metaRobots = htmlParsed.robotsMeta || '';
      canonicalUrl = headerParsed.canonicalUrl || htmlParsed.canonicalUrl;

      // Canonical evaluation
      if (canonicalUrl) {
        const normCanonical = canonicalUrl.replace(/\/$/, '');
        const normTarget = (finalUrl || ann.href).replace(/\/$/, '');
        if (normCanonical === normTarget) {
          canonicalStatus = 'self';
        } else {
          canonicalStatus = 'different';
          itemIssues.push({
            code: 'CANONICAL_MISMATCH',
            severity: 'warning',
            message: `Alternate URL canonicalizes to a different page ("${canonicalUrl}"). Hreflang should target canonical versions.`,
            alternateUrl: ann.href,
          });
        }
      } else {
        canonicalStatus = 'missing';
      }

      // Indexability evaluation
      const combinedRobots = `${metaRobots} ${xRobots}`.toLowerCase();
      if (combinedRobots.includes('noindex')) {
        indexability = 'fail';
        indexabilityDetails = 'Contains "noindex" directive';
        itemIssues.push({
          code: 'NOINDEX_ALTERNATE',
          severity: 'error',
          message: 'Alternate URL has a "noindex" directive in meta robots or X-Robots-Tag.',
          alternateUrl: ann.href,
        });
      } else if (statusCode >= 400 || canonicalStatus === 'different') {
        indexability = 'warning';
        indexabilityDetails = statusCode >= 400 ? `HTTP ${statusCode}` : 'Non-self canonical';
      } else {
        indexability = 'pass';
        indexabilityDetails = 'No indexability blocks detected';
      }

      // 4. Return Tag (Reciprocal) Validation
      // If ann is self-reference, return link is inherent
      if (ann.isSelfReference) {
        returnTagFound = true;
      } else {
        // Collect all hreflang annotations found on the alternate page (HTML + HTTP headers)
        const alternateDeclaredAnnotations = [
          ...htmlParsed.annotations,
          ...headerParsed.annotations,
        ];

        // Does any annotation on the alternate page link back to the source URL?
        const normSource = sourceUrl.replace(/\/$/, '');
        const matchingReturn = alternateDeclaredAnnotations.find((altAnn) => {
          const normAltHref = altAnn.href.replace(/\/$/, '');
          return normAltHref === normSource;
        });

        if (matchingReturn) {
          returnTagFound = true;
          returnTagDetails = {
            expectedUrl: sourceUrl,
            foundHreflang: matchingReturn.hreflang,
            foundUrl: matchingReturn.href,
          };
        } else {
          returnTagFound = false;
          returnTagDetails = {
            expectedUrl: sourceUrl,
          };
          itemIssues.push({
            code: 'MISSING_RETURN_TAG',
            severity: 'error',
            message: `Missing reciprocal return tag: "${ann.href}" does not declare a return hreflang link to "${sourceUrl}".`,
            alternateUrl: ann.href,
            hreflang: ann.hreflang,
          });
        }
      }
    }

    results.push({
      annotation: ann,
      statusCode,
      finalUrl,
      redirectChain,
      returnTagFound,
      returnTagDetails,
      selfReferencing: ann.isSelfReference,
      indexability,
      indexabilityDetails,
      canonicalUrl,
      canonicalStatus,
      detectedLanguage: null,
      htmlLang,
      contentLanguageMeta,
      contentLanguageHeader,
      issues: itemIssues,
    });
  }

  return results;
}
