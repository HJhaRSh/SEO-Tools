import { safeFetch, validateUrl } from '../safeFetch';
import {
  AgentCrawlResult,
  MobileFirstAuditResponse,
  RobotsTxtCheckResult,
  MetaRobotsDirectives,
  CanonicalInfo,
  MobileAlternateInfo,
  VaryHeaderInfo,
  ContentInfo,
  LinksInfo,
  ImagesInfo,
  StructuredDataInfo,
  HreflangInfo,
} from './types';
import { USER_AGENT_PROFILES } from './userAgents';
import { extractSeoSignals } from './extractor';
import { checkRobotsCrawlability } from './robotsChecker';
import { compareDesktopAndMobile } from './comparator';

export interface RunMobileFirstAuditOptions {
  desktopUrl: string;
  mobileUrl?: string;
  profileId?: 'googlebot' | 'chrome';
}

/**
 * Checks whether an HTTP response is eligible for HTML SEO signal extraction.
 * Status must be 2xx and Content-Type must indicate HTML markup.
 */
export function checkHtmlEligibility(
  statusCode: number,
  contentType: string,
  body: string
): { isEligible: boolean; reason?: string } {
  if (statusCode < 200 || statusCode >= 300) {
    return {
      isEligible: false,
      reason: `HTTP ${statusCode} response code (non-2xx)`,
    };
  }

  const cleanContentType = (contentType || '').toLowerCase().trim();

  // Explicit non-HTML MIME types
  if (
    cleanContentType.includes('application/pdf') ||
    cleanContentType.includes('application/json') ||
    cleanContentType.includes('text/plain') ||
    cleanContentType.includes('image/') ||
    cleanContentType.includes('audio/') ||
    cleanContentType.includes('video/') ||
    cleanContentType.includes('application/zip') ||
    cleanContentType.includes('application/octet-stream')
  ) {
    return {
      isEligible: false,
      reason: `Non-HTML Content-Type (${contentType || 'binary/unsupported'})`,
    };
  }

  if (
    cleanContentType.includes('text/html') ||
    cleanContentType.includes('application/xhtml+xml')
  ) {
    return { isEligible: true };
  }

  // Handle missing or generic XML Content-Type by inspecting start of body
  if (!cleanContentType || cleanContentType.includes('text/xml') || cleanContentType.includes('application/xml')) {
    const trimmed = (body || '').trimStart();
    if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
      return { isEligible: true };
    }
    return {
      isEligible: false,
      reason: `Content-Type "${contentType || 'missing'}" does not declare HTML document`,
    };
  }

  return {
    isEligible: false,
    reason: `Unsupported Content-Type "${contentType}"`,
  };
}

interface EmptySignals {
  robotsTxt: RobotsTxtCheckResult;
  metaRobots: MetaRobotsDirectives;
  xRobotsTag: MetaRobotsDirectives;
  canonical: CanonicalInfo;
  mobileAlternate: MobileAlternateInfo;
  varyHeader: VaryHeaderInfo;
  content: ContentInfo;
  links: LinksInfo;
  images: ImagesInfo;
  structuredData: StructuredDataInfo;
  hreflang: HreflangInfo;
}

/**
 * Creates empty fallback SEO signal objects when a response is ineligible for HTML extraction.
 */
function createEmptySignals(ineligibilityReason?: string): EmptySignals {
  return {
    robotsTxt: {
      origin: '',
      fetched: false,
      status: 'UNKNOWN' as const,
      matchedGroup: '*',
      explanation: ineligibilityReason || 'Not checked',
    },
    metaRobots: {
      raw: null,
      index: false,
      noindex: false,
      follow: false,
      nofollow: false,
      none: false,
      noarchive: false,
      nosnippet: false,
      noimageindex: false,
      googlebotDirectives: [],
      allDirectives: [],
    },
    xRobotsTag: {
      raw: null,
      index: false,
      noindex: false,
      follow: false,
      nofollow: false,
      none: false,
      noarchive: false,
      nosnippet: false,
      noimageindex: false,
      googlebotDirectives: [],
      allDirectives: [],
    },
    canonical: {
      raw: null,
      resolved: null,
      isMissing: true,
      isRelative: false,
      multipleCount: 0,
      allFound: [],
    },
    mobileAlternate: {
      isPresent: false,
      raw: null,
      media: null,
      href: null,
      resolved: null,
    },
    varyHeader: {
      isPresent: false,
      raw: null,
      includesUserAgent: false,
      explanation: ineligibilityReason || 'Not applicable',
    },
    content: {
      title: null,
      titleLength: 0,
      metaDescription: null,
      metaDescriptionLength: 0,
      ogDescription: null,
      ogDescriptionLength: 0,
      h1Primary: null,
      h1Count: 0,
      allH1s: [],
      wordCount: 0,
      characterCount: 0,
      textSnippet: '',
      textNormalizedHash: '',
    },
    links: {
      totalCount: 0,
      internalCount: 0,
      externalCount: 0,
      nofollowCount: 0,
      uniqueInternalDestinations: 0,
      uniqueExternalDestinations: 0,
      sampleInternal: [],
      sampleExternal: [],
    },
    images: {
      totalCount: 0,
      withAltCount: 0,
      missingAltCount: 0,
      responsiveMarkupCount: 0,
      samples: [],
    },
    structuredData: {
      hasStructuredData: false,
      types: [],
      entityCount: 0,
      entities: [],
      jsonLdBlocksCount: 0,
      microdataItemTypes: [],
      rdfaTypes: [],
      parseErrors: [],
    },
    hreflang: {
      count: 0,
      items: [],
      duplicateCodes: [],
      hasXDefault: false,
    },
  };
}

/**
 * Runs a complete desktop vs mobile Mobile-First Index audit.
 */
export async function runMobileFirstAudit(
  options: RunMobileFirstAuditOptions
): Promise<MobileFirstAuditResponse> {
  const profileKey = options.profileId === 'chrome' ? 'chrome' : 'googlebot';
  const profile = USER_AGENT_PROFILES[profileKey];

  const rawDesktopUrl = (options.desktopUrl || '').trim();
  const rawMobileUrl = (options.mobileUrl || '').trim();

  if (!rawDesktopUrl) {
    throw new Error('Please enter a valid webpage URL to audit.');
  }

  // SSRF protocol & structure validation
  validateUrl(rawDesktopUrl);
  if (rawMobileUrl) {
    validateUrl(rawMobileUrl);
  }

  const effectiveMobileUrl = rawMobileUrl || rawDesktopUrl;
  const isSeparateMobileUrl = Boolean(rawMobileUrl && rawMobileUrl !== rawDesktopUrl);

  // Independent fetch function for each profile
  const fetchAgentData = async (
    targetUrl: string,
    agentName: string,
    agentToken: string,
    userAgentString: string
  ): Promise<AgentCrawlResult> => {
    try {
      const fetchRes = await safeFetch(targetUrl, {
        userAgent: userAgentString,
        timeoutMs: 9000,
        maxBytes: 2 * 1024 * 1024, // 2MB bounded limit
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      // Fallback token for robots.txt: only use googlebot fallback if crawler token is googlebot
      const fallbackToken = agentToken.toLowerCase().includes('googlebot') ? 'googlebot' : undefined;

      // Check robots.txt for this URL origin and agent
      const robotsTxt = await checkRobotsCrawlability(
        fetchRes.finalUrl || targetUrl,
        agentToken,
        agentName,
        fallbackToken
      );

      // Evaluate whether the response body is eligible for HTML SEO signal extraction
      const eligibility = checkHtmlEligibility(
        fetchRes.statusCode,
        fetchRes.contentType,
        fetchRes.body
      );

      let extracted;
      if (eligibility.isEligible) {
        extracted = extractSeoSignals(
          fetchRes.body,
          fetchRes.finalUrl || targetUrl,
          fetchRes.headers
        );
      } else {
        const empty = createEmptySignals(eligibility.reason);
        // Even for non-HTML / error responses, inspect X-Robots-Tag from response headers if present
        const xRobotsHeader = fetchRes.headers['x-robots-tag'] || '';
        const xRobotsParts = xRobotsHeader
          ? xRobotsHeader.toLowerCase().split(',').map((p) => p.trim()).filter(Boolean)
          : [];
        empty.xRobotsTag = {
          raw: xRobotsHeader || null,
          index: !xRobotsParts.includes('noindex') && !xRobotsParts.includes('none'),
          noindex: xRobotsParts.includes('noindex') || xRobotsParts.includes('none'),
          follow: !xRobotsParts.includes('nofollow') && !xRobotsParts.includes('none'),
          nofollow: xRobotsParts.includes('nofollow') || xRobotsParts.includes('none'),
          none: xRobotsParts.includes('none'),
          noarchive: xRobotsParts.includes('noarchive'),
          nosnippet: xRobotsParts.includes('nosnippet'),
          noimageindex: xRobotsParts.includes('noimageindex'),
          googlebotDirectives: xRobotsParts.filter((p) => p.startsWith('googlebot:')),
          allDirectives: xRobotsParts,
        };
        extracted = empty;
      }

      const downloadedBytes = fetchRes.downloadedBytes ?? Buffer.byteLength(fetchRes.body, 'utf-8');

      return {
        agentName,
        agentToken,
        userAgentString,
        requestedUrl: targetUrl,
        finalUrl: fetchRes.finalUrl || targetUrl,
        statusCode: fetchRes.statusCode,
        statusText: fetchRes.statusText,
        redirectChain: fetchRes.redirectHistory,
        contentType: fetchRes.contentType,
        responseHeaders: fetchRes.headers,
        responseSizeBytes: downloadedBytes,
        downloadedBytes,
        decodedCharCount: fetchRes.body ? fetchRes.body.length : 0,
        durationMs: fetchRes.durationMs,
        isTruncated: fetchRes.isTruncated,
        isEligibleForSeoExtraction: eligibility.isEligible,
        ineligibilityReason: eligibility.reason,
        robotsTxt,
        metaRobots: extracted.metaRobots,
        xRobotsTag: extracted.xRobotsTag,
        canonical: extracted.canonical,
        mobileAlternate: extracted.mobileAlternate,
        varyHeader: extracted.varyHeader,
        content: extracted.content,
        links: extracted.links,
        images: extracted.images,
        structuredData: extracted.structuredData,
        hreflang: extracted.hreflang,
      };
    } catch (err: any) {
      // Preserve technical data when a fetch failure or timeout occurs on one agent
      const empty = createEmptySignals(err.message || 'Fetch failed');
      return {
        agentName,
        agentToken,
        userAgentString,
        requestedUrl: targetUrl,
        finalUrl: targetUrl,
        statusCode: 0,
        statusText: err.message || 'Network Fetch Failed',
        redirectChain: [],
        contentType: '',
        responseHeaders: {},
        responseSizeBytes: 0,
        downloadedBytes: 0,
        decodedCharCount: 0,
        durationMs: 0,
        isTruncated: false,
        fetchError: err.message || 'Network Fetch Failed',
        isEligibleForSeoExtraction: false,
        ineligibilityReason: `Network request failed: ${err.message || 'Error'}`,
        robotsTxt: empty.robotsTxt,
        metaRobots: empty.metaRobots,
        xRobotsTag: empty.xRobotsTag,
        canonical: empty.canonical,
        mobileAlternate: empty.mobileAlternate,
        varyHeader: empty.varyHeader,
        content: empty.content,
        links: empty.links,
        images: empty.images,
        structuredData: empty.structuredData,
        hreflang: empty.hreflang,
      };
    }
  };

  // Perform separate, independent HTTP requests concurrently
  const [desktopResult, mobileResult] = await Promise.all([
    fetchAgentData(
      rawDesktopUrl,
      profile.desktop.name,
      profile.desktop.token,
      profile.desktop.userAgent
    ),
    fetchAgentData(
      effectiveMobileUrl,
      profile.mobile.name,
      profile.mobile.token,
      profile.mobile.userAgent
    ),
  ]);

  // Run deep parity comparison
  const { summary, comparisonTable, discrepancies } = compareDesktopAndMobile(
    desktopResult,
    mobileResult,
    isSeparateMobileUrl
  );

  return {
    success: true,
    testedAt: new Date().toISOString(),
    executionMode: 'Raw HTML Comparison',
    requestedDesktopUrl: rawDesktopUrl,
    requestedMobileUrl: rawMobileUrl || undefined,
    userAgentProfile: profileKey,
    desktop: desktopResult,
    mobile: mobileResult,
    summary,
    comparisonTable,
    discrepancies,
    screenshots: {
      desktop: {
        available: false,
        reason: 'Raw HTML Comparison mode — Browser rendering / screenshot capture not executed to ensure fast, reliable serverless performance.',
      },
      mobile: {
        available: false,
        reason: 'Raw HTML Comparison mode — Browser rendering / screenshot capture not executed to ensure fast, reliable serverless performance.',
      },
    },
  };
}
