import * as cheerio from 'cheerio';
import { extractSchemaTypes } from '../schema-checker/schemaExtractor';
import {
  ExtractedSeoSignals,
  SeoSignalDiffItem,
  DiagnosticItem,
  InitialFetchResult,
  RenderBrowserResult,
  FetchRenderRobotsInfo,
  SeoParityStatus
} from './fetchRenderTypes';

export function extractSeoSignals(html: string, baseUrl: string): ExtractedSeoSignals {
  if (!html || !html.trim()) {
    return {
      title: null,
      metaDescription: null,
      metaRobots: null,
      canonicalUrl: null,
      h1Headings: [],
      internalLinksCount: 0,
      externalLinksCount: 0,
      imagesCount: 0,
      imagesWithAltCount: 0,
      wordCount: 0,
      structuredDataTypes: [],
      structuredDataCount: 0,
      hreflangTags: []
    };
  }

  const $ = cheerio.load(html);

  // 1. Page Title
  const title = $('title').first().text().trim() || null;

  // 2. Meta Description
  let metaDescription: string | null = null;
  $('meta').each((_, el) => {
    const name = $(el).attr('name')?.toLowerCase().trim();
    const prop = $(el).attr('property')?.toLowerCase().trim();
    if (name === 'description' || prop === 'og:description') {
      const content = $(el).attr('content')?.trim();
      if (content && !metaDescription) {
        metaDescription = content;
      }
    }
  });

  // 3. Meta Robots
  let metaRobots: string | null = null;
  $('meta').each((_, el) => {
    const name = $(el).attr('name')?.toLowerCase().trim();
    if (name === 'robots' || name === 'googlebot') {
      const content = $(el).attr('content')?.trim();
      if (content && !metaRobots) {
        metaRobots = content;
      }
    }
  });

  // 4. Canonical URL
  let canonicalUrl: string | null = null;
  const directCanon = $('link[rel="canonical"]').attr('href') || $('link[rel="CANONICAL"]').attr('href');
  if (directCanon) {
    try {
      canonicalUrl = new URL(directCanon, baseUrl).toString();
    } catch {
      canonicalUrl = directCanon;
    }
  }
  if (!canonicalUrl) {
    $('link').each((_, el) => {
      const rel = $(el).attr('rel') || (el as any).attribs?.['rel'] || '';
      if (rel.toLowerCase().trim() === 'canonical') {
        const href = $(el).attr('href') || (el as any).attribs?.['href'];
        if (href && !canonicalUrl) {
          try {
            canonicalUrl = new URL(href.trim(), baseUrl).toString();
          } catch {
            canonicalUrl = href.trim();
          }
        }
      }
    });
  }

  // 5. H1 Headings
  const h1Headings: string[] = [];
  $('h1').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      h1Headings.push(text);
    }
  });

  // 6. Links (Internal vs External)
  let internalLinksCount = 0;
  let externalLinksCount = 0;
  let targetOrigin = '';
  try {
    targetOrigin = new URL(baseUrl).origin.toLowerCase();
  } catch {
    // Default origin
  }

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin.toLowerCase() === targetOrigin) {
        internalLinksCount++;
      } else {
        externalLinksCount++;
      }
    } catch {
      // Unparseable
    }
  });

  // 7. Images & Alt attributes
  let imagesCount = 0;
  let imagesWithAltCount = 0;
  $('img').each((_, el) => {
    imagesCount++;
    const alt = $(el).attr('alt');
    if (alt !== undefined && alt.trim().length > 0) {
      imagesWithAltCount++;
    }
  });

  // 8. Structured Data (JSON-LD, Microdata, RDFa, Next.js payloads)
  const structuredDataTypes = extractSchemaTypes(html);
  const structuredDataCount = structuredDataTypes.length;

  // 9. Hreflang Tags
  const hreflangTags: { lang: string; href: string }[] = [];
  $('link').each((_, el) => {
    const rel = $(el).attr('rel')?.toLowerCase().trim();
    const hreflang = $(el).attr('hreflang')?.trim();
    const href = $(el).attr('href')?.trim();
    if (rel === 'alternate' && hreflang && href) {
      try {
        hreflangTags.push({ lang: hreflang, href: new URL(href, baseUrl).toString() });
      } catch {
        hreflangTags.push({ lang: hreflang, href });
      }
    }
  });

  // 10. Word Count
  const $clone = cheerio.load($.html());
  $clone('script, style, noscript, svg, iframe').remove();
  const bodyText = $clone('body').text() || $clone('html').text() || '';
  const words = bodyText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  return {
    title,
    metaDescription,
    metaRobots,
    canonicalUrl,
    h1Headings,
    internalLinksCount,
    externalLinksCount,
    imagesCount,
    imagesWithAltCount,
    wordCount,
    structuredDataTypes,
    structuredDataCount,
    hreflangTags
  };
}

export function compareSeoSignals(
  initial: ExtractedSeoSignals,
  rendered?: ExtractedSeoSignals
): SeoSignalDiffItem[] {
  if (!rendered) {
    return [];
  }

  const diffs: SeoSignalDiffItem[] = [];

  // Title
  const titleInitial = initial.title || '(none)';
  const titleRendered = rendered.title || '(none)';
  if (titleInitial === titleRendered) {
    diffs.push({
      name: 'title',
      label: 'Page Title',
      initialValue: titleInitial,
      renderedValue: titleRendered,
      status: 'IDENTICAL',
      summary: 'Page title is unchanged after JavaScript rendering.',
      importance: 'HIGH'
    });
  } else {
    diffs.push({
      name: 'title',
      label: 'Page Title',
      initialValue: titleInitial,
      renderedValue: titleRendered,
      status: 'MODIFIED',
      summary: 'Page title changed after client-side JavaScript execution.',
      importance: 'HIGH'
    });
  }

  // Meta Description
  const descInitial = initial.metaDescription || '(none)';
  const descRendered = rendered.metaDescription || '(none)';
  if (descInitial === descRendered) {
    diffs.push({
      name: 'metaDescription',
      label: 'Meta Description',
      initialValue: descInitial,
      renderedValue: descRendered,
      status: 'IDENTICAL',
      summary: 'Meta description is identical.',
      importance: 'HIGH'
    });
  } else if (!initial.metaDescription && rendered.metaDescription) {
    diffs.push({
      name: 'metaDescription',
      label: 'Meta Description',
      initialValue: '(none)',
      renderedValue: descRendered,
      status: 'ADDED',
      summary: 'Meta description was injected by JavaScript.',
      importance: 'HIGH'
    });
  } else {
    diffs.push({
      name: 'metaDescription',
      label: 'Meta Description',
      initialValue: descInitial,
      renderedValue: descRendered,
      status: 'MODIFIED',
      summary: 'Meta description was modified by JavaScript.',
      importance: 'HIGH'
    });
  }

  // Meta Robots
  const robotsInitial = initial.metaRobots || '(none)';
  const robotsRendered = rendered.metaRobots || '(none)';
  if (robotsInitial === robotsRendered) {
    diffs.push({
      name: 'metaRobots',
      label: 'Meta Robots',
      initialValue: robotsInitial,
      renderedValue: robotsRendered,
      status: 'IDENTICAL',
      summary: 'Meta robots directives match.',
      importance: 'HIGH'
    });
  } else {
    diffs.push({
      name: 'metaRobots',
      label: 'Meta Robots',
      initialValue: robotsInitial,
      renderedValue: robotsRendered,
      status: 'DISCREPANCY',
      summary: 'Meta robots directive changed between initial response and rendered DOM.',
      importance: 'HIGH'
    });
  }

  // Canonical URL
  const canonInitial = initial.canonicalUrl || '(none)';
  const canonRendered = rendered.canonicalUrl || '(none)';
  if (canonInitial === canonRendered) {
    diffs.push({
      name: 'canonicalUrl',
      label: 'Canonical URL',
      initialValue: canonInitial,
      renderedValue: canonRendered,
      status: 'IDENTICAL',
      summary: 'Canonical tag is identical.',
      importance: 'HIGH'
    });
  } else if (!initial.canonicalUrl && rendered.canonicalUrl) {
    diffs.push({
      name: 'canonicalUrl',
      label: 'Canonical URL',
      initialValue: '(none)',
      renderedValue: canonRendered,
      status: 'ADDED',
      summary: 'Canonical tag was injected by JavaScript.',
      importance: 'HIGH'
    });
  } else {
    diffs.push({
      name: 'canonicalUrl',
      label: 'Canonical URL',
      initialValue: canonInitial,
      renderedValue: canonRendered,
      status: 'DISCREPANCY',
      summary: 'Canonical tag changed after client-side rendering.',
      importance: 'HIGH'
    });
  }

  // H1 Headings
  const h1InitialStr = initial.h1Headings.join(' | ') || '(none)';
  const h1RenderedStr = rendered.h1Headings.join(' | ') || '(none)';
  if (h1InitialStr === h1RenderedStr) {
    diffs.push({
      name: 'h1Headings',
      label: 'H1 Headings',
      initialValue: h1InitialStr,
      renderedValue: h1RenderedStr,
      status: 'IDENTICAL',
      summary: 'H1 headings match exactly.',
      importance: 'MEDIUM'
    });
  } else {
    diffs.push({
      name: 'h1Headings',
      label: 'H1 Headings',
      initialValue: h1InitialStr,
      renderedValue: h1RenderedStr,
      status: 'MODIFIED',
      summary: `H1 heading discrepancy detected (${initial.h1Headings.length} initial vs ${rendered.h1Headings.length} rendered).`,
      importance: 'MEDIUM'
    });
  }

  // Internal Links
  const linkDiff = rendered.internalLinksCount - initial.internalLinksCount;
  diffs.push({
    name: 'internalLinks',
    label: 'Internal Links Count',
    initialValue: initial.internalLinksCount,
    renderedValue: rendered.internalLinksCount,
    status: linkDiff === 0 ? 'IDENTICAL' : linkDiff > 0 ? 'ADDED' : 'REMOVED',
    summary: linkDiff === 0 ? 'Internal link counts match.' : `${Math.abs(linkDiff)} internal links were ${linkDiff > 0 ? 'added' : 'removed'} by JavaScript.`,
    importance: 'MEDIUM'
  });

  // External Links
  const extDiff = rendered.externalLinksCount - initial.externalLinksCount;
  diffs.push({
    name: 'externalLinks',
    label: 'External Links Count',
    initialValue: initial.externalLinksCount,
    renderedValue: rendered.externalLinksCount,
    status: extDiff === 0 ? 'IDENTICAL' : extDiff > 0 ? 'ADDED' : 'REMOVED',
    summary: extDiff === 0 ? 'External link counts match.' : `${Math.abs(extDiff)} external links were ${extDiff > 0 ? 'added' : 'removed'} by JavaScript.`,
    importance: 'LOW'
  });

  // Images
  const imgDiff = rendered.imagesCount - initial.imagesCount;
  diffs.push({
    name: 'imagesCount',
    label: 'Images Count',
    initialValue: initial.imagesCount,
    renderedValue: rendered.imagesCount,
    status: imgDiff === 0 ? 'IDENTICAL' : imgDiff > 0 ? 'ADDED' : 'REMOVED',
    summary: imgDiff === 0 ? 'Image counts match.' : `${Math.abs(imgDiff)} images were dynamically loaded.`,
    importance: 'LOW'
  });

  // Word Count
  const wordDiff = rendered.wordCount - initial.wordCount;
  diffs.push({
    name: 'wordCount',
    label: 'Visible Word Count',
    initialValue: initial.wordCount,
    renderedValue: rendered.wordCount,
    status: wordDiff === 0 ? 'IDENTICAL' : wordDiff > 0 ? 'ADDED' : 'REMOVED',
    summary: wordDiff === 0 ? 'Word count parity verified.' : `${Math.abs(wordDiff)} words were ${wordDiff > 0 ? 'injected' : 'omitted'} after rendering.`,
    importance: 'HIGH'
  });

  // Structured Data
  const schemaInitial = initial.structuredDataTypes.length > 0 ? initial.structuredDataTypes.join(', ') : '(none)';
  const schemaRendered = rendered.structuredDataTypes.length > 0 ? rendered.structuredDataTypes.join(', ') : '(none)';

  const initialSorted = [...initial.structuredDataTypes].sort();
  const renderedSorted = [...rendered.structuredDataTypes].sort();
  const isIdentical =
    initialSorted.length === renderedSorted.length &&
    initialSorted.every((t, i) => t.toLowerCase() === renderedSorted[i].toLowerCase());

  let schemaStatus: SeoParityStatus = 'IDENTICAL';
  let schemaSummary = 'Structured data types match.';

  if (isIdentical) {
    schemaStatus = 'IDENTICAL';
    schemaSummary =
      initial.structuredDataTypes.length > 0
        ? `Structured data types match (${initial.structuredDataTypes.join(', ')}).`
        : 'No structured data types found in either initial server HTML or rendered DOM.';
  } else if (initial.structuredDataTypes.length === 0 && rendered.structuredDataTypes.length > 0) {
    schemaStatus = 'ADDED';
    schemaSummary = `Structured data dynamically injected after client JavaScript execution: ${rendered.structuredDataTypes.join(', ')}.`;
  } else if (initial.structuredDataTypes.length > 0 && rendered.structuredDataTypes.length === 0) {
    schemaStatus = 'REMOVED';
    schemaSummary = `Structured data types present in initial HTML (${initial.structuredDataTypes.join(', ')}) were omitted after JavaScript rendering.`;
  } else {
    schemaStatus = 'MODIFIED';
    schemaSummary = 'Structured data types differ between initial server HTML and rendered JavaScript DOM.';
  }

  diffs.push({
    name: 'structuredData',
    label: 'Structured Data Types',
    initialValue: schemaInitial,
    renderedValue: schemaRendered,
    status: schemaStatus,
    summary: schemaSummary,
    importance: 'MEDIUM'
  });

  return diffs;
}

export function generateDiagnostics(
  initial: InitialFetchResult,
  robots: FetchRenderRobotsInfo,
  rendered?: RenderBrowserResult,
  diffs?: SeoSignalDiffItem[]
): DiagnosticItem[] {
  const diagnostics: DiagnosticItem[] = [];

  // 1. HTTP Status check
  if (initial.statusCode >= 400) {
    const isCloudflare =
      (initial.headers['server'] || '').toLowerCase().includes('cloudflare') ||
      Boolean(initial.headers['cf-ray']) ||
      initial.rawHtml.includes('Attention Required! | Cloudflare') ||
      initial.rawHtml.includes('Sorry, you have been blocked') ||
      initial.rawHtml.includes('Cloudflare to restrict access') ||
      initial.rawHtml.includes('cloudflare-static');

    if (initial.statusCode === 403 && isCloudflare) {
      diagnostics.push({
        id: 'waf-bot-challenge',
        category: 'CRAWLABILITY',
        severity: 'WARNING',
        title: 'Cloudflare WAF Bot Protection Detected (HTTP 403)',
        description: 'The target website uses Cloudflare Bot Management. When requests simulate Googlebot from an IP address outside Google\'s ASN/reverse-DNS range, Cloudflare flags it as an unverified crawler and blocks access with HTTP 403.',
        seoImpact: 'Real Googlebot crawling from Google\'s verified infrastructure is usually allowed. To view and render the page as a regular visitor, switch the User Agent to "Google Chrome Desktop" or "Google Chrome Mobile".',
        source: 'INITIAL_HTTP',
        confidence: 'CONFIRMED'
      });
    }

    diagnostics.push({
      id: 'http-error',
      category: 'INDEXABILITY',
      severity: 'ERROR',
      title: `Server Response HTTP ${initial.statusCode}`,
      description: isCloudflare && initial.statusCode === 403
        ? 'Access denied by Cloudflare WAF challenge rule.'
        : `The page returned HTTP ${initial.statusCode} (${initial.statusText}).`,
      seoImpact: 'Search engine crawlers will not index pages returning 4xx or 5xx client/server errors.',
      source: 'INITIAL_HTTP',
      confidence: 'CONFIRMED'
    });
  } else if (initial.redirectHistory.length > 0) {
    diagnostics.push({
      id: 'http-redirect-chain',
      category: 'REDIRECT',
      severity: initial.redirectHistory.length > 2 ? 'WARNING' : 'INFO',
      title: `Redirect Chain Detected (${initial.redirectHistory.length} hops)`,
      description: `The request redirected from ${initial.requestedUrl} to ${initial.finalUrl}.`,
      seoImpact: 'Multiple redirect hops introduce crawler latency and can consume crawl budget.',
      source: 'INITIAL_HTTP',
      confidence: 'CONFIRMED'
    });
  }

  // 2. Robots.txt crawlability
  if (robots.explicitlyDisallowed) {
    diagnostics.push({
      id: 'robots-disallowed',
      category: 'CRAWLABILITY',
      severity: 'ERROR',
      title: 'Disallowed by robots.txt',
      description: robots.explanation || 'URL path is blocked by robots.txt directives.',
      seoImpact: 'Search crawlers are forbidden from fetching this URL, preventing HTML indexing.',
      source: 'ROBOTS_TXT',
      confidence: 'CONFIRMED'
    });
  } else if (robots.classification === 'UNAVAILABLE' && (robots.statusCode === 401 || robots.statusCode === 403)) {
    diagnostics.push({
      id: 'robots-auth-unavailable',
      category: 'CRAWLABILITY',
      severity: 'WARNING',
      title: `robots.txt Unavailable (HTTP ${robots.statusCode})`,
      description: `robots.txt returned HTTP ${robots.statusCode}. Under RFC 9309, 4xx responses mean robots.txt is unavailable. No explicit Disallow directive was evaluated.`,
      seoImpact: 'Search engine crawlers treat robots.txt as unavailable, but crawlability depends on whether target pages also require authentication.',
      source: 'ROBOTS_TXT',
      confidence: 'CONFIRMED'
    });
  } else if (robots.classification === 'RATE_LIMITED') {
    diagnostics.push({
      id: 'robots-rate-limited',
      category: 'CRAWLABILITY',
      severity: 'WARNING',
      title: 'robots.txt Rate Limited (HTTP 429)',
      description: 'The target origin returned HTTP 429 Too Many Requests on robots.txt.',
      seoImpact: 'Major search engines treat HTTP 429 as a crawl delay or temporary halt.',
      source: 'ROBOTS_TXT',
      confidence: 'CONFIRMED'
    });
  } else if (robots.classification === 'UNKNOWN' || robots.classification === 'UNREACHABLE' || robots.classification === 'NETWORK_ERROR') {
    diagnostics.push({
      id: 'robots-unknown',
      category: 'CRAWLABILITY',
      severity: 'WARNING',
      title: 'robots.txt Retrieval Unverified',
      description: 'The robots.txt file could not be retrieved successfully (e.g. server error, network timeout, or unreachable origin).',
      seoImpact: 'When robots.txt returns a 5xx error or times out, search engines temporarily halt crawling.',
      source: 'ROBOTS_TXT',
      confidence: 'POTENTIAL_RISK'
    });
  }

  // 3. X-Robots-Tag or Meta Robots blocking
  const xRobots = initial.headers['x-robots-tag'] || '';
  if (xRobots.toLowerCase().includes('noindex')) {
    diagnostics.push({
      id: 'header-noindex',
      category: 'INDEXABILITY',
      severity: 'ERROR',
      title: 'HTTP Header X-Robots-Tag: noindex',
      description: `Server sent header "X-Robots-Tag: ${xRobots}".`,
      seoImpact: 'Search engines are instructed not to display this page in search engine result pages.',
      source: 'INITIAL_HTTP',
      confidence: 'CONFIRMED'
    });
  }

  // 4. Browser rendering findings
  if (rendered) {
    if (rendered.renderStatus === 'FAILED') {
      diagnostics.push({
        id: 'rendering-failed',
        category: 'RENDERING',
        severity: 'ERROR',
        title: 'JavaScript Rendering Failure',
        description: rendered.errorMessage || 'Chromium failed to render the page within timeout limits.',
        seoImpact: 'If search engine crawlers encounter timeouts or uncaught exceptions, content parity is compromised.',
        source: 'NETWORK',
        confidence: 'CONFIRMED'
      });
    }

    // Blocked subresources
    const blockedRes = rendered.resources.filter(r => r.loadStatus === 'BLOCKED_ROBOTS');
    if (blockedRes.length > 0) {
      diagnostics.push({
        id: 'blocked-resources',
        category: 'CRAWLABILITY',
        severity: 'WARNING',
        title: `${blockedRes.length} Subresources Blocked by robots.txt`,
        description: `${blockedRes.length} scripts or stylesheets were blocked according to robots.txt rules.`,
        seoImpact: 'Blocking critical CSS or JS can prevent search engines from rendering the layout correctly.',
        source: 'ROBOTS_TXT',
        confidence: 'CONFIRMED'
      });
    }

    // Console errors
    const errorCount = rendered.consoleMessages.filter(m => m.type === 'error' || m.type === 'pageerror').length;
    if (errorCount > 0) {
      diagnostics.push({
        id: 'console-errors',
        category: 'RENDERING',
        severity: 'WARNING',
        title: `${errorCount} JavaScript Console Errors Detected`,
        description: 'Page threw uncaught exceptions or error events during rendering.',
        seoImpact: 'Runtime errors can halt script execution and prevent downstream content injection.',
        source: 'CONSOLE',
        confidence: 'CONFIRMED'
      });
    }
  }

  // 5. Diff-based diagnostics
  if (diffs) {
    const wordDiff = diffs.find(d => d.name === 'wordCount');
    if (wordDiff && wordDiff.status === 'ADDED') {
      diagnostics.push({
        id: 'js-dependent-content',
        category: 'RENDERING',
        severity: 'WARNING',
        title: 'Significant JavaScript-Dependent Content',
        description: `Content word count grew significantly after rendering (${wordDiff.initialValue} words -> ${wordDiff.renderedValue} words).`,
        seoImpact: 'Search engines must execute JavaScript to see this content. Verify rendering consistency in Google Search Console.',
        source: 'RENDERED_DOM',
        confidence: 'CONFIRMED'
      });
    }

    const canonDiff = diffs.find(d => d.name === 'canonicalUrl');
    if (canonDiff && (canonDiff.status === 'MODIFIED' || canonDiff.status === 'DISCREPANCY')) {
      diagnostics.push({
        id: 'canonical-discrepancy',
        category: 'INDEXABILITY',
        severity: 'WARNING',
        title: 'Canonical URL Discrepancy',
        description: `Canonical tag changed after client-side rendering (Initial: ${canonDiff.initialValue} vs Rendered: ${canonDiff.renderedValue}).`,
        seoImpact: 'Inconsistent canonicals can confuse search engine indexing signals.',
        source: 'RENDERED_DOM',
        confidence: 'CONFIRMED'
      });
    }

    const schemaDiff = diffs.find(d => d.name === 'structuredData');
    if (schemaDiff && schemaDiff.status === 'REMOVED') {
      diagnostics.push({
        id: 'structured-data-removed',
        category: 'INDEXABILITY',
        severity: 'WARNING',
        title: 'Structured Data Omitted After Client Rendering',
        description: `Structured data present in initial server HTML (${schemaDiff.initialValue}) was missing after JavaScript execution.`,
        seoImpact: 'If search engines render JavaScript and lose initial structured data entities, rich snippets may be lost.',
        source: 'RENDERED_DOM',
        confidence: 'CONFIRMED'
      });
    } else if (schemaDiff && schemaDiff.status === 'ADDED') {
      diagnostics.push({
        id: 'structured-data-js-injected',
        category: 'RENDERING',
        severity: 'INFO',
        title: 'Structured Data Injected by JavaScript',
        description: `Structured data types (${schemaDiff.renderedValue}) were dynamically created after JavaScript rendering.`,
        seoImpact: 'Search engine crawlers that do not execute JavaScript (or experience rendering timeouts) will not see these structured data types.',
        source: 'RENDERED_DOM',
        confidence: 'CONFIRMED'
      });
    }
  }

  return diagnostics;
}
