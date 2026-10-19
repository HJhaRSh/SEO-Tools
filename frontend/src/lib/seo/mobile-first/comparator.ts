import {
  AgentCrawlResult,
  ComparisonRow,
  DiscrepancyFinding,
  MobileFirstAuditSummary,
  ParityStatus,
} from './types';

/**
 * Calculates Jaccard token similarity between two text snippets (0.0 to 1.0).
 */
function calculateTextSimilarity(textA: string, textB: string): number {
  if (!textA && !textB) return 1.0;
  if (!textA || !textB) return 0.0;

  const tokensA = new Set(textA.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const tokensB = new Set(textB.toLowerCase().split(/\s+/).filter((w) => w.length > 2));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 1.0;
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
  // 1. CRAWLING & INDEXING COMPARISON
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
          'Unless your site intentionally operates separate desktop and mobile URLs, unexpected redirect divergence can cause search engines to index unintended pages.',
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

  if (mStatus !== dStatus) {
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
          'CRITICAL RISK: Google crawls and indexes exclusively with Googlebot Smartphone. Because your mobile URL returns HTTP 404, Google cannot index this page and will drop it from search results.',
        recommendation:
          'Immediately fix server routing so the mobile user-agent returns HTTP 200 OK with full content.',
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
          'Googlebot Smartphone is blocked from accessing the mobile version of the page. Google cannot crawl or index blocked content.',
        recommendation:
          'Check your firewall, WAF (Cloudflare/AWS WAF), or server security rules to whitelist Googlebot Smartphone.',
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
          'The mobile user-agent triggers a server error. Persistent 5xx errors cause search engines to de-index pages.',
        recommendation:
          'Inspect application server error logs for exceptions thrown specifically when handling mobile user-agents.',
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
        whyItMatters: 'Status code divergence can cause Googlebot Smartphone to treat the page differently from desktop expectations.',
        recommendation: 'Ensure both versions return consistent, successful HTTP 200 responses.',
      });
    }
  }

  comparisonTable.push({
    category: 'Crawling & Indexing',
    element: 'HTTP Response Status',
    desktop: `HTTP ${dStatus} ${desktop.statusText || ''}`.trim(),
    mobile: `HTTP ${mStatus} ${mobile.statusText || ''}`.trim(),
    status: httpStatusState,
    details: dStatus === mStatus ? `Both return HTTP ${dStatus}` : `Status code mismatch: Desktop ${dStatus} vs Mobile ${mStatus}`,
    isImportant: true,
  });

  // C. Robots.txt Crawlability
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
        'Googlebot Smartphone is disallowed by your robots.txt file. Under mobile-first indexing, Google cannot crawl or update your page.',
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

  // D. Meta Robots
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
        'CRITICAL ISSUE: Google respects the mobile version directives under mobile-first indexing. A noindex directive on mobile will cause Google to drop the page from search results entirely.',
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
        'Googlebot Smartphone will not follow links on the mobile version, severely impairing the flow of PageRank and discovery of internal pages.',
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

  // E. X-Robots-Tag HTTP Header
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
        'The mobile HTTP response sends an X-Robots-Tag with noindex, commanding search engines not to index the page.',
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

  // F. Canonical Tag
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
      whyItMatters: 'Search engines must guess the canonical URL, which can lead to duplicate content issues with query parameters or tracking codes.',
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
      // In a separate mobile setup: mobile canonical MUST point to desktop canonical
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
      // In a responsive setup: both should point to the exact same canonical URL
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
            'Conflicting canonical declarations confuse search crawlers regarding which URL should receive ranking signals and display in search results.',
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

  // G. Mobile Alternate Tag
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

  // H. Vary: User-Agent Header
  const dVary = desktop.varyHeader;
  const mVary = mobile.varyHeader;
  let varyStatus: ParityStatus = 'Match';

  if (dVary.includesUserAgent && mVary.includesUserAgent) {
    varyStatus = 'Match';
  } else if (!finalUrlsMatch && !isSeparateMobileUrl) {
    // Dynamic serving on same URL usually requires Vary: User-Agent
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

  // ==========================================
  // 2. HEADINGS & CONTENT COMPARISON
  // ==========================================

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
        'Under mobile-first indexing, Google indexes the title tag from the mobile version. A missing title tag will degrade your rankings.',
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
        'Google will display and rank the mobile title in search results. Ensure the mobile title contains your primary target keywords.',
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

  // Meta Description
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
      whyItMatters: 'Google will fall back to extracting page text for search snippets on mobile.',
      recommendation: 'Include the meta description tag on the mobile version.',
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
        'Under mobile-first indexing, search engines index heading structure from the mobile page. Missing mobile headings weakens topical relevance.',
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
      whyItMatters: 'Heading differences can alter how Google evaluates the core subject of the page.',
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
  const textSimilarity = calculateTextSimilarity(desktop.content.textSnippet, mobile.content.textSnippet);
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
        'CRITICAL MOBILE-FIRST PROBLEM: Google does not index content that exists only on your desktop version. Hiding or cutting articles, product descriptions, or explanations on mobile will cause Google to devalue or de-rank your page.',
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
        'Meaningful text differences mean Googlebot Smartphone may evaluate different content and keywords than your desktop visitors experience.',
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

  // ==========================================
  // 3. LINKS & NAVIGATION COMPARISON
  // ==========================================
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
        'Because Googlebot crawls with a mobile user agent, any internal links omitted from the mobile navigation or footer will stop passing PageRank and will impede crawler discovery across your site.',
      recommendation:
        'Ensure key navigational menus, category links, and footer links remain accessible in the mobile DOM (e.g. via accordion or slide-out menu that exists in initial HTML).',
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

  // ==========================================
  // 4. IMAGES & MEDIA COMPARISON
  // ==========================================
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
        'Google Image Search indexes image assets from the mobile version of the page. Omitting images on mobile removes them from image search indexing.',
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
        'Alt text provides essential context for Googlebot and screen readers. Omitting alt text on mobile harms accessibility and image SEO.',
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

  // ==========================================
  // 5. STRUCTURED DATA COMPARISON
  // ==========================================
  const dSchema = desktop.structuredData;
  const mSchema = mobile.structuredData;
  let schemaStatus: ParityStatus = 'Match';

  if (!dSchema.hasStructuredData && !mSchema.hasStructuredData) {
    schemaStatus = 'Both Missing';
  } else if (dSchema.hasStructuredData && !mSchema.hasStructuredData) {
    schemaStatus = 'Critical';
    discrepancies.push({
      id: 'schema-missing-on-mobile',
      category: 'Structured Data',
      name: 'Structured Data Present on Desktop but Missing on Mobile',
      severity: 'Critical',
      desktopEvidence: `Desktop Schema Types: ${dSchema.types.join(', ')} (${dSchema.entityCount} entities)`,
      mobileEvidence: 'Mobile: (No structured data detected)',
      whyItMatters:
        'CRITICAL GOOGLE REQUIREMENT: Google extracts schema exclusively from the mobile version under mobile-first indexing. If your mobile page omits JSON-LD, your website will lose rich snippets (stars, FAQs, breadcrumbs, prices) and Knowledge Graph visibility.',
      recommendation:
        'Add the exact same JSON-LD structured data markup to the mobile version.',
    });
  } else if (!dSchema.hasStructuredData && mSchema.hasStructuredData) {
    schemaStatus = 'Difference';
  } else {
    // Both have schema: compare schema types
    const missingOnMobile = dSchema.types.filter((t) => !mSchema.types.includes(t));
    const mobileOnly = mSchema.types.filter((t) => !dSchema.types.includes(t));

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
          `The schema type(s) [${missingOnMobile.join(', ')}] will not be indexed by Google because they are missing from the mobile payload.`,
        recommendation: `Include [${missingOnMobile.join(', ')}] structured data on the mobile version.`,
      });
    } else if (mobileOnly.length > 0) {
      schemaStatus = 'Difference';
    } else {
      // Types match: compare entity counts and properties
      if (dSchema.entityCount !== mSchema.entityCount) {
        schemaStatus = 'Difference';
        discrepancies.push({
          id: 'schema-entity-count-mismatch',
          category: 'Structured Data',
          name: 'Structured Data Entity Count Discrepancy',
          severity: 'Medium',
          desktopEvidence: `Desktop: ${dSchema.entityCount} entities across ${dSchema.jsonLdBlocksCount} script blocks`,
          mobileEvidence: `Mobile: ${mSchema.entityCount} entities across ${mSchema.jsonLdBlocksCount} script blocks`,
          whyItMatters: 'Fewer schema entities on mobile may mean product variants, reviews, or FAQ questions are not being indexed.',
          recommendation: 'Ensure all entities declared on desktop are replicated on mobile.',
        });
      } else {
        schemaStatus = 'Match';
      }
    }
  }

  comparisonTable.push({
    category: 'Structured Data',
    element: 'Schema Markup (JSON-LD / Microdata)',
    desktop: dSchema.types.length > 0 ? `${dSchema.types.join(', ')} (${dSchema.entityCount} entities)` : '(None detected)',
    mobile: mSchema.types.length > 0 ? `${mSchema.types.join(', ')} (${mSchema.entityCount} entities)` : '(None detected)',
    status: schemaStatus,
    details:
      schemaStatus === 'Match'
        ? 'Structured data types match across both versions.'
        : 'Structured data discrepancy between desktop and mobile.',
    isImportant: true,
  });

  // ==========================================
  // 6. HREFLANG COMPARISON
  // ==========================================
  const dHreflang = desktop.hreflang;
  const mHreflang = mobile.hreflang;
  let hreflangStatus: ParityStatus = 'Match';

  if (dHreflang.count === 0 && mHreflang.count === 0) {
    hreflangStatus = 'Both Missing';
  } else if (dHreflang.count > 0 && mHreflang.count === 0) {
    hreflangStatus = 'Critical';
    discrepancies.push({
      id: 'hreflang-missing-on-mobile',
      category: 'Hreflang',
      name: 'Hreflang Annotations Present on Desktop but Missing on Mobile',
      severity: 'Critical',
      desktopEvidence: `Desktop: ${dHreflang.count} hreflang annotations found`,
      mobileEvidence: 'Mobile: 0 hreflang annotations found',
      whyItMatters:
        'Under mobile-first indexing, Google processes international targeting signals from the mobile version. If mobile omits hreflang, Google may rank the wrong language/regional URL in international search results.',
      recommendation:
        'Include all corresponding hreflang link elements in the mobile page <head> (or HTTP Link headers).',
    });
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

  let parityVerdict: MobileFirstAuditSummary['parityVerdict'] = 'Full Parity Passed';
  if (criticalCount > 0) {
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
    hasDifferences: discrepancies.length > 0,
    totalDiscrepancies: discrepancies.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
    textSimilarityPct: Math.round(textSimilarity * 100),
  };

  return {
    summary,
    comparisonTable,
    discrepancies,
  };
}
