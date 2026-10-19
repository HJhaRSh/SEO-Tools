import { safeFetch, validateUrl } from '../safeFetch';
import {
  AgentCrawlResult,
  MobileFirstAuditResponse,
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
    const fetchRes = await safeFetch(targetUrl, {
      userAgent: userAgentString,
      timeoutMs: 9000,
      maxBytes: 2 * 1024 * 1024, // 2MB bounded limit
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    // Check robots.txt for this URL and agent
    const robotsTxt = await checkRobotsCrawlability(
      fetchRes.finalUrl || targetUrl,
      agentToken,
      agentName
    );

    // Extract all SEO signals from HTML payload
    const extracted = extractSeoSignals(
      fetchRes.body,
      fetchRes.finalUrl || targetUrl,
      fetchRes.headers
    );

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
      responseSizeBytes: Buffer.byteLength(fetchRes.body, 'utf-8'),
      durationMs: fetchRes.durationMs,
      isTruncated: fetchRes.isTruncated,
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
