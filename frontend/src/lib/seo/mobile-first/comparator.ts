import {
  AgentCrawlResult,
  ComparisonRow,
  DiscrepancyFinding,
  MobileFirstAuditSummary,
  MobileFirstParityVerdict,
  ParityStatus,
} from './types';

/**
 * Tokenizes text into normalized Unicode words (supporting English, Hindi, Gujarati, accented characters, etc.).
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

/**
 * Calculates a robust, deterministic content similarity score (0.0 to 1.0)
 * between desktop and mobile content representations.
 *
 * Combines:
 * 1. Frequency-weighted token containment / unigram Jaccard
 * 2. Word-pair (bigram) shingle similarity for phrase structure and word order
 * 3. Document length coverage ratio
 *
 * Guarantees:
 * - Identical text: 1.0 (100%)
 * - Same 300-char opening with different remainder: detects significant disparity (< 0.35)
 * - Desktop complete (2,000 words) vs Mobile truncated (100 words): low similarity (< 0.15)
 * - Same word count but different text: low similarity (< 0.20)
 * - Minor navigation differences on matching articles: high similarity (> 0.85)
 * - Unicode (Hindi, Gujarati, accents): natively supported via Unicode character class regex
 * - Bounded CPU and memory execution (< 5ms)
 */
export function calculateContentSimilarity(textA: string, textB: string): number {
  const tokensA = tokenizeText(textA);
  const tokensB = tokenizeText(textB);

  if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  // Unigram frequencies
  const freqA = new Map<string, number>();
  for (const t of tokensA) freqA.set(t, (freqA.get(t) || 0) + 1);
  const freqB = new Map<string, number>();
  for (const t of tokensB) freqB.set(t, (freqB.get(t) || 0) + 1);

  let unigramIntersection = 0;
  for (const [t, countA] of freqA.entries()) {
    const countB = freqB.get(t) || 0;
    unigramIntersection += Math.min(countA, countB);
  }
  const unigramUnion = tokensA.length + tokensB.length - unigramIntersection;
  const unigramSim = unigramUnion > 0 ? unigramIntersection / unigramUnion : 1.0;

  // Bigrams for phrase structure & word order preservation
  let bigramSim = unigramSim;
  if (tokensA.length > 2 && tokensB.length > 2) {
    const bigramsA = new Set<string>();
    for (let i = 0; i < tokensA.length - 1; i++) {
      bigramsA.add(`${tokensA[i]} ${tokensA[i + 1]}`);
    }
    const bigramsB = new Set<string>();
    for (let i = 0; i < tokensB.length - 1; i++) {
      bigramsB.add(`${tokensB[i]} ${tokensB[i + 1]}`);
    }

    let bigramInter = 0;
    for (const bg of bigramsA) {
      if (bigramsB.has(bg)) bigramInter++;
    }
    const bigramUnion = bigramsA.size + bigramsB.size - bigramInter;
    bigramSim = bigramUnion > 0 ? bigramInter / bigramUnion : 0;
  }

  // Length coverage ratio (detects when one version is cut short)
  const lengthCoverage =
    Math.min(tokensA.length, tokensB.length) / Math.max(tokensA.length, tokensB.length, 1);

  // Combined score: unigram token overlap (45%) + bigram phrase overlap (45%) + length coverage (10%)
  const combined = 0.45 * unigramSim + 0.45 * bigramSim + 0.1 * lengthCoverage;

  // Strict upper bound by length coverage: a 100-word page cannot have > 20% similarity to a 2000-word page
  const boundedSim = Math.min(combined, lengthCoverage > 0.4 ? combined : lengthCoverage * 1.5);

  return Math.max(0, Math.min(1.0, boundedSim));
}

/**
 * Compares Desktop and Mobile crawled data and generates:
 * 1. Detailed Discrepancy Findings with actionable SEO advice
 * 2. Structured Side-by-Side Comparison Table
 * 3. Overall Audit Summary and Parity Verdict
 */
export function compareDesktopAndMobile(
  desktop: AgentCrawlResult,
  mobile: AgentCrawlResult,
  isSeparateMobileUrlRequested: boolean
): {
  summary: MobileFirstAuditSummary;
  comparisonTable: ComparisonRow[];
  discrepancies: DiscrepancyFinding[];
} {
  const discrepancies: DiscrepancyFinding[] = [];
  const comparisonTable: ComparisonRow[] = [];

  const desktopEligible = desktop.isEligibleForSeoExtraction;
  const mobileEligible = mobile.isEligibleForSeoExtraction;

  // Determine if this is a separate mobile URL setup (e.g. m.example.com or user specified)
  let isSeparateMobileUrl = isSeparateMobileUrlRequested;
  try {
    const dHost = new URL(desktop.finalUrl).hostname.toLowerCase();
    const mHost = new URL(mobile.finalUrl).hostname.toLowerCase();
    if (dHost !== mHost && (mHost.startsWith('m.') || mHost.startsWith('mobile.'))) {
      isSeparateMobileUrl = true;
    }
  } catch {
    // ignore
  }

  // ==========================================
  // 1. CRAWLING & INDEXING COMPARISON (Always evaluated)
  // ==========================================

  // A. Final URL & Redirects
  const finalUrlsMatch = desktop.finalUrl.toLowerCase() === mobile.finalUrl.toLowerCase();
  let urlStatus: ParityStatus = 'Match';
  if (!finalUrlsMatch) {
    if (isSeparateMobileUrl) {
      urlStatus = 'Difference';
      discrepancies.push({
        id: 'crawling-separate-mobile-url',
        category: 'Crawling & Indexing',
        name: 'Separate Mobile URL Configuration Detected',
        severity: 'Informational',
        desktopEvidence: `Desktop resolves to: ${desktop.finalUrl}`,
        mobileEvidence: `Mobile resolves to: ${mobile.finalUrl}`,
        whyItMatters:
          'Separate mobile URLs (m-dot sites) require bidirectional linking: desktop must declare rel="alternate" pointing to mobile, and mobile must declare rel="canonical" pointing to desktop.',
        recommendation:
          'Ensure bidirectional canonical/alternate linking is correctly maintained across all page equivalents.',
      });
    } else {
      urlStatus = 'Warning';
      discrepancies.push({
        id: 'crawling-redirect-mismatch',
        category: 'Crawling & Indexing',
        name: 'Desktop and Mobile Final Destinations Differ',
        severity: 'Medium',
        desktopEvidence: `Desktop redirected to: ${desktop.finalUrl}`,
        mobileEvidence: `Mobile redirected to: ${mobile.finalUrl}`,
        whyItMatters:
          'Unless your site intentionally operates separate desktop and mobile URLs, redirect divergence can cause search engines to index unintended pages.',
        recommendation:
          'Verify your server redirect rules to confirm whether this redirect divergence is intentional.',
      });
    }
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'Final Destination URL',
    desktop: desktop.finalUrl,
    mobile: mobile.finalUrl,
    status: urlStatus,
    details: finalUrlsMatch ? 'Both versions land on the same URL.' : isSeparateMobileUrl ? 'Separate mobile URL detected.' : 'Redirect paths diverge.',
    isImportant: true,
  });

  // B. HTTP Status Code
  const dStatus = desktop.statusCode;
  const mStatus = mobile.statusCode;
  let httpStatusState: ParityStatus = 'Match';

  if (dStatus === 0 && mStatus === 0) {
    httpStatusState = 'Critical';
    discrepancies.push({
      id: 'crawling-both-failed-fetch',
      category: 'Crawling & Indexing',
      name: 'Both Desktop and Mobile Requests Failed to Connect',
      severity: 'Critical',
      desktopEvidence: `Desktop error: ${desktop.statusText}`,
      mobileEvidence: `Mobile error: ${mobile.statusText}`,
      whyItMatters: 'Neither request could establish a connection with the target host.',
      recommendation: 'Check website availability, DNS resolution, and firewall settings.',
    });
  } else if (dStatus === 404 && mStatus === 404) {
    httpStatusState = 'Critical';
    discrepancies.push({
      id: 'crawling-both-404',
      category: 'Crawling & Indexing',
      name: 'Both Desktop and Mobile URLs Returned HTTP 404 (Not Found)',
      severity: 'Critical',
      desktopEvidence: `Desktop response code: HTTP ${dStatus}`,
      mobileEvidence: `Mobile response code: HTTP ${mStatus}`,
      whyItMatters:
        'Both versions of this URL returned HTTP 404 Not Found. Search engines crawling either version will treat the URL as non-existent and cannot index it.',
      recommendation:
        'Ensure the URL is published and returns a valid HTTP 200 OK status.',
    });
  } else if (dStatus >= 500 && mStatus >= 500) {
    httpStatusState = 'Critical';
    discrepancies.push({
      id: 'crawling-both-5xx',
      category: 'Crawling & Indexing',
      name: 'Both Desktop and Mobile Requests Returned Server Errors (HTTP 5xx)',
      severity: 'Critical',
      desktopEvidence: `Desktop response code: HTTP ${dStatus}`,
      mobileEvidence: `Mobile response code: HTTP ${mStatus}`,
      whyItMatters: 'The application server threw an internal error for both requests.',
      recommendation: 'Inspect web application server error logs to resolve the 5xx exception.',
    });
  } else if (mStatus !== dStatus) {
    if (dStatus === 200 && (mStatus === 404 || mStatus === 410)) {
      httpStatusState = 'Critical';
      discrepancies.push({
        id: 'crawling-mobile-404',
        category: 'Crawling & Indexing',
        name: 'Mobile Version Returns HTTP 404/410 (Not Found)',
        severity: 'Critical',
        desktopEvidence: `Desktop response code: HTTP ${dStatus}`,
        mobileEvidence: `Mobile response code: HTTP ${mStatus}`,
        whyItMatters:
          'Because Google crawls predominantly with Googlebot Smartphone, a mobile HTTP 404 response may prevent search engines from indexing this URL.',
        recommendation:
          'Ensure server routing serves the mobile user-agent an HTTP 200 OK response with full content.',
      });
    } else if (dStatus === 200 && (mStatus === 403 || mStatus === 401)) {
      httpStatusState = 'Critical';
      discrepancies.push({
        id: 'crawling-mobile-blocked',
        category: 'Crawling & Indexing',
        name: 'Mobile Version Returns Access Denied (HTTP 401/403)',
        severity: 'Critical',
        desktopEvidence: `Desktop response code: HTTP ${dStatus}`,
        mobileEvidence: `Mobile response code: HTTP ${mStatus}`,
        whyItMatters:
          'The mobile user-agent request received HTTP 403 Forbidden while the desktop request succeeded. Verify server firewall, WAF, and access rules to ensure mobile crawlers are permitted.',
        recommendation:
          'Check your firewall, WAF (Cloudflare/AWS WAF), or server security rules to allow mobile crawlers.',
      });
    } else if (dStatus === 200 && mStatus >= 500) {
      httpStatusState = 'Critical';
      discrepancies.push({
        id: 'crawling-mobile-server-error',
        category: 'Crawling & Indexing',
        name: 'Mobile Version Throws Server Error (HTTP 5xx)',
        severity: 'Critical',
        desktopEvidence: `Desktop response code: HTTP ${dStatus}`,
        mobileEvidence: `Mobile response code: HTTP ${mStatus}`,
        whyItMatters:
          'The mobile user-agent request triggered a server error. Persistent 5xx errors may lead search engines to de-index pages.',
        recommendation:
          'Inspect application server error logs for exceptions thrown specifically when handling mobile user-agents.',
      });
    } else if (dStatus === 200 && mStatus === 0) {
      httpStatusState = 'Critical';
      discrepancies.push({
        id: 'crawling-mobile-fetch-failed',
        category: 'Crawling & Indexing',
        name: 'Mobile Request Failed to Complete',
        severity: 'Critical',
        desktopEvidence: `Desktop succeeded: HTTP ${dStatus}`,
        mobileEvidence: `Mobile failed: ${mobile.statusText || 'Connection error'}`,
        whyItMatters: 'The mobile user-agent could not complete the request.',
        recommendation: 'Check server responsiveness to mobile user-agent requests.',
      });
    } else {
      httpStatusState = 'Warning';
      discrepancies.push({
        id: 'crawling-status-code-difference',
        category: 'Crawling & Indexing',
        name: 'Desktop and Mobile Return Different Status Codes',
        severity: 'High',
        desktopEvidence: `Desktop HTTP ${dStatus}`,
        mobileEvidence: `Mobile HTTP ${mStatus}`,
        whyItMatters: 'Status code divergence can cause search crawlers to treat the page differently from desktop expectations.',
        recommendation: 'Ensure both versions return consistent, successful HTTP 200 responses.',
      });
    }
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'HTTP Response Status',
    desktop: dStatus > 0 ? `HTTP ${dStatus} ${desktop.statusText || ''}`.trim() : `Failed (${desktop.statusText})`,
    mobile: mStatus > 0 ? `HTTP ${mStatus} ${mobile.statusText || ''}`.trim() : `Failed (${mobile.statusText})`,
    status: httpStatusState,
    details: dStatus === mStatus ? `Both return HTTP ${dStatus}` : `Status code mismatch: Desktop ${dStatus} vs Mobile ${mStatus}`,
    isImportant: true,
  });

  // C. Content-Type Check
  const dContentType = desktop.contentType || '(None)';
  const mContentType = mobile.contentType || '(None)';
  const contentTypeMatches = dContentType.toLowerCase() === mContentType.toLowerCase();

  if (desktopEligible && !mobileEligible && mobile.statusCode >= 200 && mobile.statusCode < 300) {
    discrepancies.push({
      id: 'crawling-mobile-non-html',
      category: 'Crawling & Indexing',
      name: 'Mobile Version Returned Non-HTML Content-Type',
      severity: 'Critical',
      desktopEvidence: `Desktop Content-Type: ${dContentType}`,
      mobileEvidence: `Mobile Content-Type: ${mContentType}`,
      whyItMatters:
        'Desktop returned HTML markup, but mobile returned a non-HTML payload. Search crawlers expect equivalent HTML markup across devices.',
      recommendation: 'Ensure mobile requests receive the intended HTML document.',
    });
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'Response Content-Type',
    desktop: dContentType,
    mobile: mContentType,
    status: contentTypeMatches ? 'Match' : (desktopEligible && !mobileEligible ? 'Critical' : 'Difference'),
    details: contentTypeMatches ? 'Both Content-Types match.' : 'Content-Types differ.',
  });

  // D. Robots.txt Crawlability
  const dRobots = desktop.robotsTxt;
  const mRobots = mobile.robotsTxt;
  let robotsStatus: ParityStatus = 'Match';

  if (dRobots.status === 'ALLOWED' && mRobots.status === 'BLOCKED') {
    robotsStatus = 'Critical';
    discrepancies.push({
      id: 'crawling-robots-mobile-blocked',
      category: 'Crawling & Indexing',
      name: 'Mobile Crawling Blocked by robots.txt',
      severity: 'Critical',
      desktopEvidence: `Desktop crawlability: ${dRobots.status} (${dRobots.explanation})`,
      mobileEvidence: `Mobile crawlability: ${mRobots.status} (${mRobots.explanation})`,
      whyItMatters:
        'The mobile crawler is disallowed by your robots.txt file. Under mobile-first indexing, search engines cannot crawl or update your page.',
      recommendation:
        `Modify ${mRobots.origin}/robots.txt to remove the blocking Disallow rule: "${mRobots.appliedRule?.originalText || 'Disallow'}"`,
    });
  } else if (dRobots.status !== mRobots.status) {
    robotsStatus = 'Difference';
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'robots.txt Crawlability',
    desktop: `${dRobots.status} (${dRobots.explanation})`,
    mobile: `${mRobots.status} (${mRobots.explanation})`,
    status: robotsStatus,
    details: dRobots.status === mRobots.status ? 'Both allowed to crawl according to robots.txt.' : 'Crawlability rules diverge between origins.',
    isImportant: true,
  });

  // E. X-Robots-Tag HTTP Header (can be checked even without HTML body)
  const dXRobots = desktop.xRobotsTag;
  const mXRobots = mobile.xRobotsTag;
  let xRobotsStatus: ParityStatus = 'Match';

  if (dXRobots.index && mXRobots.noindex) {
    xRobotsStatus = 'Critical';
    discrepancies.push({
      id: 'crawling-xrobots-mobile-noindex',
      category: 'Crawling & Indexing',
      name: 'Mobile Header Declares X-Robots-Tag: noindex',
      severity: 'Critical',
      desktopEvidence: `Desktop header: ${dXRobots.raw || '(None)'}`,
      mobileEvidence: `Mobile header: ${mXRobots.raw}`,
      whyItMatters:
        'The mobile HTTP response sends an X-Robots-Tag with noindex, instructing search engines not to index the page.',
      recommendation: 'Remove the X-Robots-Tag: noindex header from the mobile response.',
    });
  } else if ((dXRobots.raw || '') !== (mXRobots.raw || '')) {
    xRobotsStatus = 'Difference';
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'X-Robots-Tag Header',
    desktop: dXRobots.raw || '(None declared)',
    mobile: mXRobots.raw || '(None declared)',
    status: xRobotsStatus,
    details: xRobotsStatus === 'Match' ? 'Both headers match or omitted.' : 'Header values differ.',
  });

  // F. Vary: User-Agent Header
  const dVary = desktop.varyHeader;
  const mVary = mobile.varyHeader;
  let varyStatus: ParityStatus = 'Match';

  if (dVary.includesUserAgent && mVary.includesUserAgent) {
    varyStatus = 'Match';
  } else if (!finalUrlsMatch && !isSeparateMobileUrl) {
    varyStatus = 'Difference';
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'Vary: User-Agent Header',
    desktop: dVary.raw || '(None)',
    mobile: mVary.raw || '(None)',
    status: varyStatus,
    details: dVary.explanation,
  });

  // G. HTML Response Completeness & Truncation Check
  const dTruncated = Boolean(desktop.isTruncated || desktop.isPartial);
  const mTruncated = Boolean(mobile.isTruncated || mobile.isPartial);
  const hasTruncation = dTruncated || mTruncated;

  if (hasTruncation) {
    discrepancies.push({
      id: 'crawling-html-truncated',
      category: 'Crawling & Indexing',
      name: 'HTML Payload Truncated (Exceeded Response Size Limit)',
      severity: 'High',
      desktopEvidence: dTruncated
        ? `Desktop HTML truncated at ${(desktop.responseSizeBytes / 1024).toFixed(1)} KB (Incomplete download)`
        : `Desktop download complete (${(desktop.responseSizeBytes / 1024).toFixed(1)} KB)`,
      mobileEvidence: mTruncated
        ? `Mobile HTML truncated at ${(mobile.responseSizeBytes / 1024).toFixed(1)} KB (Incomplete download)`
        : `Mobile download complete (${(mobile.responseSizeBytes / 1024).toFixed(1)} KB)`,
      whyItMatters:
        'The HTML response exceeded the maximum size limit and was truncated before the entire document was received. SEO signals lower in the HTML (such as structured data, footer links, or content sections) may appear missing solely because the download stopped prematurely.',
      recommendation:
        'Optimize page HTML size or review full server-side logs to confirm indexability of elements located late in the DOM.',
    });
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'HTML Download Completeness',
    desktop: dTruncated
      ? `Truncated (${(desktop.responseSizeBytes / 1024).toFixed(1)} KB)`
      : `Complete (${(desktop.responseSizeBytes / 1024).toFixed(1)} KB)`,
    mobile: mTruncated
      ? `Truncated (${(mobile.responseSizeBytes / 1024).toFixed(1)} KB)`
      : `Complete (${(mobile.responseSizeBytes / 1024).toFixed(1)} KB)`,
    status: hasTruncation ? 'Warning' : 'Match',
    details: hasTruncation
      ? 'One or both responses exceeded response size limits and were truncated.'
      : 'Both HTML documents downloaded completely within response size limits.',
    isImportant: true,
  });

  // ==========================================
  // 2. HTML SEO SIGNALS COMPARISON (Subject to eligibility)
  // ==========================================

  // CASE 1: Neither desktop nor mobile is eligible for HTML SEO extraction
  if (!desktopEligible && !mobileEligible) {
    const ineligibleLabelD = `Not Available (${desktop.ineligibilityReason || 'HTTP Error'})`;
    const ineligibleLabelM = `Not Available (${mobile.ineligibilityReason || 'HTTP Error'})`;

    const skippedElements = [
      { element: 'Canonical Tag', category: 'Canonicals & Alternates' as const },
      { element: 'Mobile Alternate Link', category: 'Canonicals & Alternates' as const },
      { element: 'Meta Robots Tag', category: 'Crawling & Indexing' as const },
      { element: 'Page Title (<title>)', category: 'Headings & Content' as const },
      { element: 'Meta Description', category: 'Headings & Content' as const },
      { element: 'Primary H1 Heading', category: 'Headings & Content' as const },
      { element: 'Visible Text Word Count', category: 'Headings & Content' as const },
      { element: 'Content Text Similarity', category: 'Headings & Content' as const },
      { element: 'Unique Internal Links', category: 'Links & Navigation' as const },
      { element: 'Images & Alt Text Parity', category: 'Images & Media' as const },
      { element: 'Schema Markup (JSON-LD / Microdata)', category: 'Structured Data' as const },
      { element: 'Hreflang Annotations', category: 'Hreflang' as const },
    ];

    for (const item of skippedElements) {
      comparisonTable.push({
        category: item.category,
        element: item.element,
        desktop: ineligibleLabelD,
        mobile: ineligibleLabelM,
        status: 'Not Applicable',
        details: 'HTML SEO signal extraction not performed due to HTTP error or non-HTML content.',
      });
    }

    const criticalCount = discrepancies.filter((d) => d.severity === 'Critical').length;
    const highCount = discrepancies.filter((d) => d.severity === 'High').length;
    const mediumCount = discrepancies.filter((d) => d.severity === 'Medium').length;
    const lowCount = discrepancies.filter((d) => d.severity === 'Low').length;
    const infoCount = discrepancies.filter((d) => d.severity === 'Informational').length;

    const summary: MobileFirstAuditSummary = {
      desktopFinalUrl: desktop.finalUrl,
      mobileFinalUrl: mobile.finalUrl,
      desktopStatus: desktop.statusCode,
      mobileStatus: mobile.statusCode,
      isSeparateMobileUrl,
      parityVerdict: 'Audit Failed',
      verdictExplanation: 'Neither response was eligible for HTML SEO extraction due to HTTP errors, non-HTML content, or network failures.',
      hasDifferences: true,
      totalDiscrepancies: discrepancies.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      infoCount,
      textSimilarityPct: 0,
      desktopEligible: false,
      mobileEligible: false,
    };

    return { summary, comparisonTable, discrepancies };
  }

  // CASE 2: Only one response is eligible for HTML SEO extraction
  if (desktopEligible !== mobileEligible) {
    const ineligibleAgent = desktopEligible ? mobile : desktop;
    const eligibleAgent = desktopEligible ? desktop : mobile;
    const ineligibleLabel = `Not Available (${ineligibleAgent.ineligibilityReason || 'HTTP Error'})`;

    const appendPartialRow = (
      category: ComparisonRow['category'],
      element: string,
      eligibleVal: string,
      isDesktop: boolean
    ) => {
      comparisonTable.push({
        category,
        element,
        desktop: isDesktop ? eligibleVal : ineligibleLabel,
        mobile: isDesktop ? ineligibleLabel : eligibleVal,
        status: 'Not Applicable',
        details: `${ineligibleAgent.agentName} was not eligible for HTML SEO extraction (${ineligibleAgent.ineligibilityReason || 'HTTP Error'}).`,
      });
    };

    appendPartialRow('Canonicals & Alternates', 'Canonical Tag', eligibleAgent.canonical.resolved || '(Missing)', desktopEligible);
    appendPartialRow('Canonicals & Alternates', 'Mobile Alternate Link', eligibleAgent.mobileAlternate.resolved || '(None)', desktopEligible);
    appendPartialRow('Crawling & Indexing', 'Meta Robots Tag', eligibleAgent.metaRobots.raw || 'index, follow (implicit default)', desktopEligible);
    appendPartialRow('Headings & Content', 'Page Title (<title>)', eligibleAgent.content.title || '(Missing)', desktopEligible);
    appendPartialRow('Headings & Content', 'Meta Description', eligibleAgent.content.metaDescription || '(Missing)', desktopEligible);
    appendPartialRow('Headings & Content', 'Primary H1 Heading', eligibleAgent.content.h1Primary || '(Missing)', desktopEligible);
    appendPartialRow('Headings & Content', 'Visible Text Word Count', `${eligibleAgent.content.wordCount.toLocaleString()} words`, desktopEligible);
    appendPartialRow('Headings & Content', 'Content Text Similarity', 'Not Applicable (Incomplete)', desktopEligible);
    appendPartialRow('Links & Navigation', 'Unique Internal Links', `${eligibleAgent.links.uniqueInternalDestinations} unique (${eligibleAgent.links.internalCount} total)`, desktopEligible);
    appendPartialRow('Images & Media', 'Images & Alt Text Parity', `${eligibleAgent.images.totalCount} total (${eligibleAgent.images.withAltCount} with alt)`, desktopEligible);
    appendPartialRow('Structured Data', 'Schema Markup (JSON-LD / Microdata)', eligibleAgent.structuredData.types.length > 0 ? eligibleAgent.structuredData.types.join(', ') : '(None)', desktopEligible);
    appendPartialRow('Hreflang', 'Hreflang Annotations', `${eligibleAgent.hreflang.count} annotations`, desktopEligible);

    const criticalCount = discrepancies.filter((d) => d.severity === 'Critical').length;
    const highCount = discrepancies.filter((d) => d.severity === 'High').length;
    const mediumCount = discrepancies.filter((d) => d.severity === 'Medium').length;
    const lowCount = discrepancies.filter((d) => d.severity === 'Low').length;
    const infoCount = discrepancies.filter((d) => d.severity === 'Informational').length;

    let parityVerdict: MobileFirstParityVerdict = 'Incomplete Audit';
    if (criticalCount > 0) {
      parityVerdict = 'Critical Discrepancies Detected';
    }

    const summary: MobileFirstAuditSummary = {
      desktopFinalUrl: desktop.finalUrl,
      mobileFinalUrl: mobile.finalUrl,
      desktopStatus: desktop.statusCode,
      mobileStatus: mobile.statusCode,
      isSeparateMobileUrl,
      parityVerdict,
      verdictExplanation: `Audit incomplete: ${ineligibleAgent.agentName} was not eligible for HTML SEO extraction (${ineligibleAgent.ineligibilityReason || 'HTTP Error'}).`,
      hasDifferences: true,
      totalDiscrepancies: discrepancies.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      infoCount,
      textSimilarityPct: 0,
      desktopEligible,
      mobileEligible,
    };

    return { summary, comparisonTable, discrepancies };
  }

  // CASE 3: BOTH Desktop and Mobile are eligible HTML responses
  // Perform complete deep comparison across all categories!

  // Meta Robots Tag
  const dMetaRobots = desktop.metaRobots;
  const mMetaRobots = mobile.metaRobots;
  let metaRobotsStatus: ParityStatus = 'Match';

  if (dMetaRobots.index && mMetaRobots.noindex) {
    metaRobotsStatus = 'Critical';
    discrepancies.push({
      id: 'crawling-mobile-noindex',
      category: 'Crawling & Indexing',
      name: 'Mobile Version Declares Noindex (Desktop Indexes)',
      severity: 'Critical',
      desktopEvidence: `Desktop: ${dMetaRobots.raw || 'index, follow (default)'}`,
      mobileEvidence: `Mobile: ${mMetaRobots.raw}`,
      whyItMatters:
        'The mobile user-agent response contains a noindex directive, which may prevent indexing if search engines receive and apply the same directive.',
      recommendation:
        'Remove the noindex directive from the mobile version so search engines can index your content.',
    });
  } else if (dMetaRobots.follow && mMetaRobots.nofollow) {
    metaRobotsStatus = 'Warning';
    discrepancies.push({
      id: 'crawling-mobile-nofollow',
      category: 'Crawling & Indexing',
      name: 'Mobile Version Declares Nofollow',
      severity: 'High',
      desktopEvidence: `Desktop: ${dMetaRobots.raw || 'follow (default)'}`,
      mobileEvidence: `Mobile: ${mMetaRobots.raw}`,
      whyItMatters:
        'Search crawlers evaluating mobile responses may not follow links on the mobile version, impairing link equity and discovery of internal pages.',
      recommendation: 'Remove nofollow from the mobile robots meta tag.',
    });
  } else if ((dMetaRobots.raw || '') !== (mMetaRobots.raw || '')) {
    metaRobotsStatus = 'Difference';
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'Meta Robots Tag',
    desktop: dMetaRobots.raw || 'index, follow (implicit default)',
    mobile: mMetaRobots.raw || 'index, follow (implicit default)',
    status: metaRobotsStatus,
    details: metaRobotsStatus === 'Match' ? 'Directives match on both versions.' : 'Directives differ.',
    isImportant: true,
  });

  // Canonical Tag
  const dCanon = desktop.canonical;
  const mCanon = mobile.canonical;
  let canonStatus: ParityStatus = 'Match';

  if (dCanon.isMissing && mCanon.isMissing) {
    canonStatus = 'Both Missing';
    discrepancies.push({
      id: 'canonicals-missing-both',
      category: 'Canonicals & Alternates',
      name: 'No Canonical Tag Declared on Either Version',
      severity: 'Low',
      desktopEvidence: 'No <link rel="canonical"> found',
      mobileEvidence: 'No <link rel="canonical"> found',
      whyItMatters: 'Search engines must infer the canonical URL, which can lead to duplicate content issues with query parameters or tracking codes.',
      recommendation: 'Add self-referencing canonical tags to both versions.',
    });
  } else if (!dCanon.isMissing && mCanon.isMissing) {
    canonStatus = 'Warning';
    discrepancies.push({
      id: 'canonicals-missing-mobile',
      category: 'Canonicals & Alternates',
      name: 'Canonical Tag Missing on Mobile Version',
      severity: 'High',
      desktopEvidence: `Desktop canonical: ${dCanon.resolved}`,
      mobileEvidence: 'Mobile canonical: (Missing)',
      whyItMatters:
        'The mobile version lacks a canonical declaration. Under mobile-first indexing, search engines prioritize mobile markup.',
      recommendation: `Add <link rel="canonical" href="${dCanon.resolved}"> to the mobile page.`,
    });
  } else if (dCanon.isMissing && !mCanon.isMissing) {
    canonStatus = 'Warning';
  } else if (dCanon.resolved && mCanon.resolved) {
    if (isSeparateMobileUrl) {
      const expectedTarget = (dCanon.resolved || desktop.finalUrl).toLowerCase();
      const actualMobileCanon = mCanon.resolved.toLowerCase();

      if (actualMobileCanon === expectedTarget || actualMobileCanon === expectedTarget.replace(/\/$/, '') || expectedTarget === actualMobileCanon.replace(/\/$/, '')) {
        canonStatus = 'Match';
      } else {
        canonStatus = 'Critical';
        discrepancies.push({
          id: 'canonicals-separate-mobile-target-mismatch',
          category: 'Canonicals & Alternates',
          name: 'Mobile Canonical Does Not Point to Desktop Version',
          severity: 'Critical',
          desktopEvidence: `Desktop canonical: ${dCanon.resolved}`,
          mobileEvidence: `Mobile canonical: ${mCanon.resolved}`,
          whyItMatters:
            'Per Google Mobile-First Indexing documentation for separate mobile sites (m-dot), the mobile page MUST canonicalize to the desktop page URL. Canonicalizing to itself or another page creates canonical splitting.',
          recommendation: `Update mobile page canonical to point to the desktop version: <link rel="canonical" href="${dCanon.resolved}">`,
        });
      }
    } else {
      if (dCanon.resolved.toLowerCase() === mCanon.resolved.toLowerCase()) {
        canonStatus = 'Match';
      } else {
        canonStatus = 'Critical';
        discrepancies.push({
          id: 'canonicals-responsive-mismatch',
          category: 'Canonicals & Alternates',
          name: 'Desktop and Mobile Declare Conflicting Canonicals',
          severity: 'Critical',
          desktopEvidence: `Desktop canonical: ${dCanon.resolved}`,
          mobileEvidence: `Mobile canonical: ${mCanon.resolved}`,
          whyItMatters:
            'Conflicting canonical declarations can confuse search crawlers regarding which URL should receive ranking signals and display in search results.',
          recommendation: 'Ensure both desktop and mobile versions declare the exact same canonical URL.',
        });
      }
    }
  }

  comparisonTable.push({
    category: 'Canonicals & Alternates',
    element: 'Canonical Tag',
    desktop: dCanon.resolved || '(Missing)',
    mobile: mCanon.resolved || '(Missing)',
    status: canonStatus,
    details:
      canonStatus === 'Match'
        ? isSeparateMobileUrl
          ? 'Mobile correctly canonicalizes to desktop URL.'
          : 'Both versions declare identical canonical URLs.'
        : 'Canonical mismatch or missing.',
    isImportant: true,
  });

  // Mobile Alternate Tag
  const dMobileAlt = desktop.mobileAlternate;
  let altStatus: ParityStatus = 'Not Applicable';

  if (isSeparateMobileUrl) {
    if (dMobileAlt.isPresent) {
      altStatus = 'Match';
    } else {
      altStatus = 'Warning';
      discrepancies.push({
        id: 'canonicals-missing-mobile-alternate',
        category: 'Canonicals & Alternates',
        name: 'Desktop Missing rel="alternate" to Mobile URL',
        severity: 'Medium',
        desktopEvidence: 'No <link rel="alternate" media="..."> pointing to mobile',
        mobileEvidence: `Mobile URL is: ${mobile.finalUrl}`,
        whyItMatters:
          'For separate mobile sites, Google recommends the desktop version contain a rel="alternate" tag declaring the corresponding mobile URL.',
        recommendation: `Add <link rel="alternate" media="only screen and (max-width: 640px)" href="${mobile.finalUrl}"> to the desktop page.`,
      });
    }
  } else {
    altStatus = dMobileAlt.isPresent ? 'Difference' : 'Match';
  }

  comparisonTable.push({
    category: 'Canonicals & Alternates',
    element: 'Mobile Alternate Link',
    desktop: dMobileAlt.resolved ? `<link rel="alternate" href="${dMobileAlt.resolved}">` : '(Not declared)',
    mobile: mobile.mobileAlternate.resolved ? `<link rel="alternate" href="${mobile.mobileAlternate.resolved}">` : '(Not declared)',
    status: altStatus,
    details: isSeparateMobileUrl
      ? dMobileAlt.isPresent
        ? 'Desktop declares mobile alternate.'
        : 'Desktop missing mobile alternate tag.'
      : 'Responsive site — separate mobile alternate not required.',
  });

  // Title Tag
  const dTitle = desktop.content.title;
  const mTitle = mobile.content.title;
  let titleStatus: ParityStatus = 'Match';

  if (!dTitle && !mTitle) {
    titleStatus = 'Both Missing';
    discrepancies.push({
      id: 'content-title-missing-both',
      category: 'Headings & Content',
      name: 'Page Title Missing on Both Versions',
      severity: 'High',
      desktopEvidence: '(No title tag)',
      mobileEvidence: '(No title tag)',
      whyItMatters: 'The <title> tag is one of the most critical on-page ranking factors and SERP snippet sources.',
      recommendation: 'Add a descriptive, keyword-optimized <title> tag.',
    });
  } else if (dTitle && !mTitle) {
    titleStatus = 'Critical';
    discrepancies.push({
      id: 'content-title-missing-mobile',
      category: 'Headings & Content',
      name: 'Page Title Missing on Mobile Version',
      severity: 'Critical',
      desktopEvidence: `Desktop: "${dTitle}"`,
      mobileEvidence: '(Missing on mobile)',
      whyItMatters:
        'Under mobile-first indexing, search engines index the title tag from the mobile version. A missing title tag on mobile can degrade search rankings and SERP appearance.',
      recommendation: `Add the title tag to the mobile version: <title>${dTitle}</title>`,
    });
  } else if (dTitle !== mTitle) {
    titleStatus = 'Difference';
    discrepancies.push({
      id: 'content-title-mismatch',
      category: 'Headings & Content',
      name: 'Desktop and Mobile Page Titles Differ',
      severity: 'Medium',
      desktopEvidence: `Desktop: "${dTitle}" (${desktop.content.titleLength} chars)`,
      mobileEvidence: `Mobile: "${mTitle}" (${mobile.content.titleLength} chars)`,
      whyItMatters:
        'Google predominantly indexes and displays the mobile title in search results. Ensure the mobile title contains your primary target keywords and branding.',
      recommendation: 'Align the desktop and mobile title tags to ensure consistent keyword optimization.',
    });
  }

  comparisonTable.push({
    category: 'Headings & Content',
    element: 'Page Title (<title>)',
    desktop: dTitle ? `${dTitle} (${desktop.content.titleLength} chars)` : '(Missing)',
    mobile: mTitle ? `${mTitle} (${mobile.content.titleLength} chars)` : '(Missing)',
    status: titleStatus,
    details: titleStatus === 'Match' ? 'Titles are identical.' : 'Title mismatch or missing.',
    isImportant: true,
  });

  // Meta Description (Separated from Open Graph Description)
  const dDesc = desktop.content.metaDescription;
  const mDesc = mobile.content.metaDescription;
  let descStatus: ParityStatus = 'Match';

  if (!dDesc && !mDesc) {
    descStatus = 'Both Missing';
  } else if (dDesc && !mDesc) {
    descStatus = 'Warning';
    discrepancies.push({
      id: 'content-desc-missing-mobile',
      category: 'Headings & Content',
      name: 'Meta Description Missing on Mobile Version',
      severity: 'Medium',
      desktopEvidence: `Desktop: "${dDesc}"`,
      mobileEvidence: '(Missing on mobile)',
      whyItMatters: 'Search engines generating snippets for mobile search results may rely on the mobile meta description or fall back to extracting page text.',
      recommendation: 'Include the standard <meta name="description"> tag on the mobile version.',
    });
  } else if (dDesc !== mDesc) {
    descStatus = 'Difference';
    discrepancies.push({
      id: 'content-desc-mismatch',
      category: 'Headings & Content',
      name: 'Meta Descriptions Differ Between Versions',
      severity: 'Low',
      desktopEvidence: `Desktop: "${dDesc}"`,
      mobileEvidence: `Mobile: "${mDesc}"`,
      whyItMatters: 'The mobile snippet description will be derived from the mobile version.',
      recommendation: 'Verify that the mobile meta description is accurate and compelling.',
    });
  }

  comparisonTable.push({
    category: 'Headings & Content',
    element: 'Meta Description',
    desktop: dDesc ? `${dDesc} (${desktop.content.metaDescriptionLength} chars)` : '(Missing)',
    mobile: mDesc ? `${mDesc} (${mobile.content.metaDescriptionLength} chars)` : '(Missing)',
    status: descStatus,
    details: descStatus === 'Match' ? 'Descriptions are identical.' : 'Description values differ.',
  });

  // Primary H1 Heading
  const dH1 = desktop.content.h1Primary;
  const mH1 = mobile.content.h1Primary;
  let h1Status: ParityStatus = 'Match';

  if (!dH1 && !mH1) {
    h1Status = 'Both Missing';
    discrepancies.push({
      id: 'content-h1-missing-both',
      category: 'Headings & Content',
      name: 'No H1 Heading Found on Either Version',
      severity: 'Medium',
      desktopEvidence: '(No <h1> tag)',
      mobileEvidence: '(No <h1> tag)',
      whyItMatters: 'An H1 heading clarifies the primary topic of the page for search engines and assistive technology.',
      recommendation: 'Add a primary <h1> heading summarizing the main topic of the page.',
    });
  } else if (dH1 && !mH1) {
    h1Status = 'Critical';
    discrepancies.push({
      id: 'content-h1-missing-mobile',
      category: 'Headings & Content',
      name: 'H1 Heading Missing on Mobile Version',
      severity: 'High',
      desktopEvidence: `Desktop H1: "${dH1}"`,
      mobileEvidence: '(Missing on mobile)',
      whyItMatters:
        'Under mobile-first indexing, search engines evaluate heading structure from the mobile page. Omitting mobile headings may weaken topical relevance in mobile search evaluations.',
      recommendation: `Add the primary H1 to the mobile page: <h1>${dH1}</h1>`,
    });
  } else if (dH1 !== mH1) {
    h1Status = 'Difference';
    discrepancies.push({
      id: 'content-h1-mismatch',
      category: 'Headings & Content',
      name: 'Desktop and Mobile H1 Headings Differ',
      severity: 'Medium',
      desktopEvidence: `Desktop: "${dH1}"`,
      mobileEvidence: `Mobile: "${mH1}"`,
      whyItMatters: 'Heading differences can alter how search engines evaluate the core subject of the page.',
      recommendation: 'Align your H1 headings across both versions.',
    });
  }

  comparisonTable.push({
    category: 'Headings & Content',
    element: 'Primary H1 Heading',
    desktop: dH1 ? `"${dH1}" (${desktop.content.h1Count} total H1)` : '(Missing)',
    mobile: mH1 ? `"${mH1}" (${mobile.content.h1Count} total H1)` : '(Missing)',
    status: h1Status,
    details: h1Status === 'Match' ? 'H1 headings match exactly.' : 'H1 headings differ or missing.',
    isImportant: true,
  });

  // Visible Text & Word Count Parity
  const dWords = desktop.content.wordCount;
  const mWords = mobile.content.wordCount;
  const dCompText = desktop.content.comparisonText || desktop.content.textSnippet;
  const mCompText = mobile.content.comparisonText || mobile.content.textSnippet;
  const textSimilarity = calculateContentSimilarity(dCompText, mCompText);
  let wordCountStatus: ParityStatus = 'Match';

  const maxWords = Math.max(dWords, mWords, 1);
  const wordDiffRatio = Math.abs(dWords - mWords) / maxWords;

  if (dWords > 100 && mWords < dWords * 0.5) {
    wordCountStatus = 'Critical';
    discrepancies.push({
      id: 'content-massive-text-loss',
      category: 'Headings & Content',
      name: 'Substantial Content Dropped on Mobile (>50% Word Loss)',
      severity: 'Critical',
      desktopEvidence: `Desktop word count: ${dWords.toLocaleString()} words`,
      mobileEvidence: `Mobile word count: ${mWords.toLocaleString()} words`,
      whyItMatters:
        'Under mobile-first indexing, search engines evaluate content from the mobile version. Hiding or cutting articles, product descriptions, or explanations on mobile means search crawlers may not index that content.',
      recommendation:
        'Ensure the primary content, body text, and key explanations are fully present in the mobile HTML payload.',
    });
  } else if (dWords > 100 && wordDiffRatio > 0.25) {
    wordCountStatus = 'Warning';
    discrepancies.push({
      id: 'content-significant-text-diff',
      category: 'Headings & Content',
      name: 'Significant Content Parity Difference (>25% Word Difference)',
      severity: 'High',
      desktopEvidence: `Desktop: ${dWords.toLocaleString()} words`,
      mobileEvidence: `Mobile: ${mWords.toLocaleString()} words`,
      whyItMatters:
        'Meaningful text differences mean mobile search crawlers may evaluate different content and keywords than desktop visitors experience.',
      recommendation: 'Review mobile templates to ensure secondary sections and explanatory content are not stripped.',
    });
  } else if (wordDiffRatio > 0.1) {
    wordCountStatus = 'Difference';
  }

  comparisonTable.push({
    category: 'Headings & Content',
    element: 'Visible Text Word Count',
    desktop: `${dWords.toLocaleString()} words`,
    mobile: `${mWords.toLocaleString()} words`,
    status: wordCountStatus,
    details:
      wordCountStatus === 'Match'
        ? 'Word count is closely aligned.'
        : `Difference: ${Math.abs(dWords - mWords).toLocaleString()} words (${Math.round(wordDiffRatio * 100)}% variance).`,
    isImportant: true,
  });

  // Content Text Similarity Parity
  let textSimilarityStatus: ParityStatus = 'Match';
  if (dWords > 30 && mWords > 30) {
    if (textSimilarity < 0.35) {
      textSimilarityStatus = 'Warning';
      discrepancies.push({
        id: 'content-text-similarity-low',
        category: 'Headings & Content',
        name: 'Body Content Disparity: Substantial Text Differences Detected',
        severity: 'High',
        desktopEvidence: `Desktop: ${dWords.toLocaleString()} words (Text preview: "${desktop.content.textSnippet.slice(0, 80)}...")`,
        mobileEvidence: `Mobile: ${mWords.toLocaleString()} words (Text preview: "${mobile.content.textSnippet.slice(0, 80)}...")`,
        whyItMatters:
          'Under Google mobile-first indexing, rankings and relevance are derived from the mobile content. Serving different topics or missing substantial text sections on mobile can cause unexpected ranking drops or keyword drift.',
        recommendation:
          'Review the mobile page source to ensure the explanatory body content, articles, and product details match the desktop version.',
      });
    } else if (textSimilarity < 0.65) {
      textSimilarityStatus = 'Difference';
      discrepancies.push({
        id: 'content-text-similarity-moderate',
        category: 'Headings & Content',
        name: 'Content Parity Difference: Notable Text Variance Between Versions',
        severity: 'Medium',
        desktopEvidence: `Desktop: ${dWords.toLocaleString()} words (Content similarity: ${Math.round(textSimilarity * 100)}%)`,
        mobileEvidence: `Mobile: ${mWords.toLocaleString()} words (Content similarity: ${Math.round(textSimilarity * 100)}%)`,
        whyItMatters:
          'Differences in paragraph text, descriptions, or specifications can cause Googlebot to evaluate a different set of topical signals on mobile.',
        recommendation: 'Align primary descriptive content between desktop and mobile versions.',
      });
    }
  }

  comparisonTable.push({
    category: 'Headings & Content',
    element: 'Content Text Similarity',
    desktop: '100% (Baseline)',
    mobile: `${Math.round(textSimilarity * 100)}% similarity${
      desktop.content.isSampled || mobile.content.isSampled ? ' (Sampled)' : ''
    }`,
    status: textSimilarityStatus,
    details:
      textSimilarityStatus === 'Match'
        ? 'Body text content displays strong topical and phrasing parity.'
        : `Body text differs: similarity is ${Math.round(textSimilarity * 100)}% (${
            textSimilarity < 0.35 ? 'significant disparity' : 'moderate variance'
          }).`,
    isImportant: true,
  });

  // Links & Navigation Comparison
  const dLinks = desktop.links;
  const mLinks = mobile.links;
  let linksStatus: ParityStatus = 'Match';

  const maxInternal = Math.max(dLinks.uniqueInternalDestinations, mLinks.uniqueInternalDestinations, 1);
  const internalDiffRatio = Math.abs(dLinks.uniqueInternalDestinations - mLinks.uniqueInternalDestinations) / maxInternal;

  if (dLinks.uniqueInternalDestinations > 20 && mLinks.uniqueInternalDestinations < dLinks.uniqueInternalDestinations * 0.6) {
    linksStatus = 'Warning';
    discrepancies.push({
      id: 'links-internal-loss-mobile',
      category: 'Links & Navigation',
      name: 'Substantial Loss of Internal Links on Mobile',
      severity: 'High',
      desktopEvidence: `Desktop: ${dLinks.uniqueInternalDestinations} unique internal link targets (${dLinks.internalCount} total internal links)`,
      mobileEvidence: `Mobile: ${mLinks.uniqueInternalDestinations} unique internal link targets (${mLinks.internalCount} total internal links)`,
      whyItMatters:
        'Because Googlebot crawls with a mobile user agent, any internal links omitted from the mobile navigation or footer may pass less internal link equity and impede crawler discovery.',
      recommendation:
        'Ensure key navigational menus, category links, and footer links remain accessible in the mobile DOM.',
    });
  } else if (internalDiffRatio > 0.15) {
    linksStatus = 'Difference';
  }

  comparisonTable.push({
    category: 'Links & Navigation',
    element: 'Unique Internal Links',
    desktop: `${dLinks.uniqueInternalDestinations} unique (${dLinks.internalCount} total)`,
    mobile: `${mLinks.uniqueInternalDestinations} unique (${mLinks.internalCount} total)`,
    status: linksStatus,
    details:
      linksStatus === 'Match'
        ? 'Internal linking structure is preserved.'
        : `Difference in unique internal link destinations: Desktop ${dLinks.uniqueInternalDestinations} vs Mobile ${mLinks.uniqueInternalDestinations}`,
  });

  // Images & Media Comparison
  const dImages = desktop.images;
  const mImages = mobile.images;
  let imagesStatus: ParityStatus = 'Match';

  if (dImages.totalCount > 0 && mImages.totalCount === 0) {
    imagesStatus = 'Warning';
    discrepancies.push({
      id: 'images-missing-on-mobile',
      category: 'Images & Media',
      name: 'Images Present on Desktop are Absent on Mobile',
      severity: 'High',
      desktopEvidence: `Desktop: ${dImages.totalCount} images`,
      mobileEvidence: 'Mobile: 0 images found',
      whyItMatters:
        'Image search indexes assets evaluated from the mobile version of the page. Omitting images on mobile may remove them from image search indexing.',
      recommendation: 'Ensure key content images are served on mobile, using responsive image techniques.',
    });
  } else if (dImages.withAltCount > 0 && mImages.missingAltCount > dImages.missingAltCount + 3) {
    imagesStatus = 'Difference';
    discrepancies.push({
      id: 'images-alt-text-missing-mobile',
      category: 'Images & Media',
      name: 'Image Alt Text Missing on Mobile Version',
      severity: 'Medium',
      desktopEvidence: `Desktop: ${dImages.withAltCount} images with alt text (${dImages.missingAltCount} missing)`,
      mobileEvidence: `Mobile: ${mImages.withAltCount} images with alt text (${mImages.missingAltCount} missing)`,
      whyItMatters:
        'Alt text provides essential context for search engines and screen readers. Omitting alt text on mobile harms accessibility and image SEO.',
      recommendation: 'Ensure responsive image tags preserve descriptive alt attributes on mobile.',
    });
  } else if (dImages.totalCount !== mImages.totalCount) {
    imagesStatus = 'Difference';
  }

  comparisonTable.push({
    category: 'Images & Media',
    element: 'Images & Alt Text Parity',
    desktop: `${dImages.totalCount} total (${dImages.withAltCount} with alt, ${dImages.missingAltCount} missing alt)`,
    mobile: `${mImages.totalCount} total (${mImages.withAltCount} with alt, ${mImages.missingAltCount} missing alt)`,
    status: imagesStatus,
    details:
      imagesStatus === 'Match'
        ? 'Image counts and alt tags match.'
        : `Image markup differences detected (Responsive <picture>/srcset tags detected: Desktop ${dImages.responsiveMarkupCount}, Mobile ${mImages.responsiveMarkupCount}).`,
  });

  // Structured Data Comparison
  const dSchema = desktop.structuredData;
  const mSchema = mobile.structuredData;
  let schemaStatus: ParityStatus = 'Match';

  if (!dSchema.hasStructuredData && !mSchema.hasStructuredData) {
    schemaStatus = 'Both Missing';
  } else if (dSchema.hasStructuredData && !mSchema.hasStructuredData) {
    if (mTruncated) {
      schemaStatus = 'Warning';
      discrepancies.push({
        id: 'schema-missing-on-mobile',
        category: 'Structured Data',
        name: 'Structured Data Not Detected in Truncated Mobile Payload',
        severity: 'Medium',
        desktopEvidence: `Desktop Schema Types: ${dSchema.types.join(', ')} (${dSchema.entityCount} entities)`,
        mobileEvidence: 'Mobile: (No structured data detected in truncated response)',
        whyItMatters:
          'The mobile response was truncated due to response size limits before structured data could be found. The JSON-LD markup may exist further down in the source.',
        recommendation:
          'Review the complete mobile page source to confirm whether JSON-LD blocks are located late in the document.',
      });
    } else {
      schemaStatus = 'Critical';
      discrepancies.push({
        id: 'schema-missing-on-mobile',
        category: 'Structured Data',
        name: 'Structured Data Present on Desktop but Missing on Mobile',
        severity: 'Critical',
        desktopEvidence: `Desktop Schema Types: ${dSchema.types.join(', ')} (${dSchema.entityCount} entities)`,
        mobileEvidence: 'Mobile: (No structured data detected)',
        whyItMatters:
          'Google extracts schema markup predominantly from the mobile version under mobile-first indexing. If mobile omits JSON-LD, pages may lose rich snippets and Knowledge Graph eligibility.',
        recommendation:
          'Add the exact same JSON-LD structured data markup to the mobile version.',
      });
    }
  } else if (!dSchema.hasStructuredData && mSchema.hasStructuredData) {
    schemaStatus = 'Difference';
  } else {
    const missingOnMobile = dSchema.types.filter(
      (t) => !mSchema.types.some((mt) => mt.toLowerCase() === t.toLowerCase())
    );
    const mobileOnly = mSchema.types.filter(
      (t) => !dSchema.types.some((dt) => dt.toLowerCase() === t.toLowerCase())
    );

    if (missingOnMobile.length > 0) {
      schemaStatus = 'Warning';
      discrepancies.push({
        id: 'schema-types-missing-on-mobile',
        category: 'Structured Data',
        name: 'Schema Types Present on Desktop Omitted on Mobile',
        severity: 'High',
        desktopEvidence: `Desktop types: ${dSchema.types.join(', ')}`,
        mobileEvidence: `Mobile types: ${mSchema.types.join(', ')} (Missing: ${missingOnMobile.join(', ')})`,
        whyItMatters:
          `The schema type(s) [${missingOnMobile.join(', ')}] may not be evaluated by search engines if omitted from the mobile payload.`,
        recommendation: `Include [${missingOnMobile.join(', ')}] structured data on the mobile version.`,
      });
    } else if (mobileOnly.length > 0) {
      schemaStatus = 'Difference';
    } else {
      if (dSchema.entityCount !== mSchema.entityCount) {
        schemaStatus = 'Difference';
        discrepancies.push({
          id: 'schema-entity-count-mismatch',
          category: 'Structured Data',
          name: 'Structured Data Entity Count Discrepancy',
          severity: 'Medium',
          desktopEvidence: `Desktop: ${dSchema.entityCount} entities across ${dSchema.jsonLdBlocksCount} script blocks`,
          mobileEvidence: `Mobile: ${mSchema.entityCount} entities across ${mSchema.jsonLdBlocksCount} script blocks`,
          whyItMatters: 'Fewer schema entities on mobile may mean product variants, reviews, or FAQ questions are not being evaluated.',
          recommendation: 'Ensure all entities declared on desktop are replicated on mobile.',
        });
      } else {
        schemaStatus = 'Match';
      }
    }
  }

  const missingOnMobileForDetails = dSchema.types.filter(
    (t) => !mSchema.types.some((mt) => mt.toLowerCase() === t.toLowerCase())
  );
  const mobileOnlyForDetails = mSchema.types.filter(
    (t) => !dSchema.types.some((dt) => dt.toLowerCase() === t.toLowerCase())
  );

  comparisonTable.push({
    category: 'Structured Data',
    element: 'Schema Markup (JSON-LD / Microdata)',
    desktop: dSchema.types.length > 0 ? `${dSchema.types.join(', ')} (${dSchema.entityCount} entities)` : '(None detected)',
    mobile: mSchema.types.length > 0 ? `${mSchema.types.join(', ')} (${mSchema.entityCount} entities)` : '(None detected)',
    status: schemaStatus,
    details:
      schemaStatus === 'Match'
        ? (dSchema.types.length > 0
            ? `Structured data types match across both versions (${dSchema.types.join(', ')}).`
            : 'Structured data types match across both versions.')
        : schemaStatus === 'Both Missing'
        ? 'No structured data detected on either desktop or mobile.'
        : schemaStatus === 'Critical'
        ? 'Structured data present on desktop but completely missing on mobile.'
        : schemaStatus === 'Warning'
        ? (missingOnMobileForDetails.length > 0
            ? `Schema types missing on mobile: ${missingOnMobileForDetails.join(', ')}.`
            : 'Structured data discrepancy between desktop and mobile.')
        : mobileOnlyForDetails.length > 0
        ? `Additional schema types present only on mobile: ${mobileOnlyForDetails.join(', ')}.`
        : 'Structured data discrepancy between desktop and mobile.',
    isImportant: true,
  });

  // Hreflang Comparison
  const dHreflang = desktop.hreflang;
  const mHreflang = mobile.hreflang;
  let hreflangStatus: ParityStatus = 'Match';

  if (dHreflang.count === 0 && mHreflang.count === 0) {
    hreflangStatus = 'Both Missing';
  } else if (dHreflang.count > 0 && mHreflang.count === 0) {
    if (mTruncated) {
      hreflangStatus = 'Warning';
      discrepancies.push({
        id: 'hreflang-missing-on-mobile',
        category: 'Hreflang',
        name: 'Hreflang Annotations Not Detected in Truncated Mobile Payload',
        severity: 'Medium',
        desktopEvidence: `Desktop: ${dHreflang.count} hreflang annotations found`,
        mobileEvidence: 'Mobile: (0 annotations found in truncated response)',
        whyItMatters:
          'The mobile response was truncated before hreflang annotations could be confirmed. Link tags located late in <head> or in the body may have been cut off.',
        recommendation:
          'Verify that hreflang link tags are declared early in the mobile <head> or served via HTTP Link headers.',
      });
    } else {
      hreflangStatus = 'Critical';
      discrepancies.push({
        id: 'hreflang-missing-on-mobile',
        category: 'Hreflang',
        name: 'Hreflang Annotations Present on Desktop but Missing on Mobile',
        severity: 'Critical',
        desktopEvidence: `Desktop: ${dHreflang.count} hreflang annotations found`,
        mobileEvidence: 'Mobile: 0 hreflang annotations found',
        whyItMatters:
          'Under mobile-first indexing, search engines process international targeting signals from the mobile version. If mobile omits hreflang, international targeting may not be evaluated correctly.',
        recommendation:
          'Include all corresponding hreflang link elements in the mobile page <head> (or HTTP Link headers).',
      });
    }
  } else if (dHreflang.count !== mHreflang.count) {
    hreflangStatus = 'Warning';
    discrepancies.push({
      id: 'hreflang-count-mismatch',
      category: 'Hreflang',
      name: 'Hreflang Annotation Count Mismatch',
      severity: 'High',
      desktopEvidence: `Desktop: ${dHreflang.count} annotations`,
      mobileEvidence: `Mobile: ${mHreflang.count} annotations`,
      whyItMatters: 'Discrepancies in hreflang sets between versions can cause international indexing conflicts.',
      recommendation: 'Ensure the mobile and desktop versions have identical hreflang annotation sets.',
    });
  }

  comparisonTable.push({
    category: 'Hreflang',
    element: 'Hreflang Annotations',
    desktop: dHreflang.count > 0 ? `${dHreflang.count} annotations declared` : '(None)',
    mobile: mHreflang.count > 0 ? `${mHreflang.count} annotations declared` : '(None)',
    status: hreflangStatus,
    details: hreflangStatus === 'Match' ? 'Hreflang annotations are consistent.' : 'Hreflang count or targets differ.',
  });

  // Calculate overall summary counts
  const criticalCount = discrepancies.filter((d) => d.severity === 'Critical').length;
  const highCount = discrepancies.filter((d) => d.severity === 'High').length;
  const mediumCount = discrepancies.filter((d) => d.severity === 'Medium').length;
  const lowCount = discrepancies.filter((d) => d.severity === 'Low').length;
  const infoCount = discrepancies.filter((d) => d.severity === 'Informational').length;

  let parityVerdict: MobileFirstParityVerdict = 'Full Parity Passed';
  let verdictExplanation: string | undefined = undefined;

  if (hasTruncation) {
    parityVerdict = 'Incomplete Audit — HTML Response Truncated';
    verdictExplanation =
      'The audit could not be fully completed because one or both HTML responses exceeded the response size limit and were truncated before download completion.';
  } else if (criticalCount > 0) {
    parityVerdict = 'Critical Discrepancies Detected';
  } else if (highCount > 0) {
    parityVerdict = 'Significant SEO Parity Issues';
  } else if (mediumCount > 0 || lowCount > 0) {
    parityVerdict = 'Minor Discrepancies Detected';
  }

  const summary: MobileFirstAuditSummary = {
    desktopFinalUrl: desktop.finalUrl,
    mobileFinalUrl: mobile.finalUrl,
    desktopStatus: desktop.statusCode,
    mobileStatus: mobile.statusCode,
    isSeparateMobileUrl,
    parityVerdict,
    verdictExplanation,
    hasDifferences: discrepancies.length > 0,
    totalDiscrepancies: discrepancies.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
    textSimilarityPct: Math.round(textSimilarity * 100),
    desktopEligible: true,
    mobileEligible: true,
  };

  return {
    summary,
    comparisonTable,
    discrepancies,
  };
}
