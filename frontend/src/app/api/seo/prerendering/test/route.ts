import { NextRequest, NextResponse } from 'next/server';
import { getUserAgentById, MAX_SELECTED_AGENTS } from '@/lib/seo/prerendering/userAgents';
import { fetchWithUserAgent, DEFAULT_TIMEOUT_MS } from '@/lib/seo/prerendering/safeFetcher';
import {
  extractHtmlSignals,
  extractCanonicalFromHeaders,
  checkVaryUserAgent,
  isSupportedHtmlContentType,
} from '@/lib/seo/prerendering/htmlParser';
import { compareAgentResults } from '@/lib/seo/prerendering/comparisonEngine';
import { AgentTestResult, PrerenderApiResponse } from '@/lib/seo/prerendering/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONCURRENT_REQUESTS = 3;
const MAX_RAW_HTML_EXCERPT_CHARS = 100 * 1024; // 100 KB excerpt for safe Vercel JSON payload response size
const MAX_URL_LENGTH = 2048;

/**
 * Maps internal or network error messages to safe user-facing error codes.
 */
function mapSanitizedError(err: any): { message: string; code: string } {
  const msg = String(err?.message || err || '');
  if (msg.includes('REQUEST_TIMEOUT') || msg.includes('timed out')) {
    return { message: 'The request timed out before the server completed its response.', code: 'REQUEST_TIMEOUT' };
  }
  if (msg.includes('RESPONSE_TOO_LARGE')) {
    return { message: 'The response payload exceeded the 2MB safety threshold.', code: 'RESPONSE_TOO_LARGE' };
  }
  if (msg.includes('TOO_MANY_REDIRECTS') || msg.includes('Redirect loop')) {
    return { message: 'The destination encountered a redirect loop or exceeded redirect hop limits.', code: 'TOO_MANY_REDIRECTS' };
  }
  if (msg.includes('forbidden') || msg.includes('blocked') || msg.includes('private')) {
    return { message: 'Access to internal, private, or loopback network addresses is prohibited.', code: 'BLOCKED_DESTINATION' };
  }
  if (msg.includes('ENOTFOUND') || msg.includes('DNS lookup error') || msg.includes('getaddrinfo')) {
    return { message: 'DNS resolution failed. The domain name could not be resolved.', code: 'DNS_FAILURE' };
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('Connection refused')) {
    return { message: 'Connection refused by the destination host.', code: 'CONNECTION_REFUSED' };
  }
  return { message: 'Unable to complete HTTP request to the target destination.', code: 'NETWORK_ERROR' };
}

/**
 * Executes async tasks with bounded concurrency limit.
 */
async function asyncPool<T, R>(
  items: T[],
  limit: number,
  iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (limit <= items.length) {
      const e: Promise<void> = p.then(() => {
        executing.splice(executing.indexOf(e), 1);
      });
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(ret);
}

export async function POST(req: NextRequest): Promise<NextResponse<PrerenderApiResponse>> {
  try {
    const body = await req.json().catch(() => ({}));
    const { url, userAgents, allowLocalhostForTesting, includeFullSource } = body;

    // Validate URL input
    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid website URL to test.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const cleanUrl = url.trim();
    if (cleanUrl.length > MAX_URL_LENGTH) {
      return NextResponse.json(
        { success: false, error: `URL length exceeds maximum limit of ${MAX_URL_LENGTH} characters.` },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Validate userAgents array
    if (!Array.isArray(userAgents) || userAgents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please select at least one User-Agent to test.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Deduplicate user agent IDs safely
    const uniqueAgentIds = Array.from(new Set(userAgents.filter((id): id is string => typeof id === 'string')));

    if (uniqueAgentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please select at least one valid User-Agent identifier.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (uniqueAgentIds.length > MAX_SELECTED_AGENTS) {
      return NextResponse.json(
        { success: false, error: `Maximum allowed user agents per test is ${MAX_SELECTED_AGENTS}.` },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Resolve user agents against allowlist strictly
    const resolvedAgents: { id: string; name: string; userAgent: string }[] = [];
    for (const rawId of uniqueAgentIds) {
      const def = getUserAgentById(rawId);
      if (def) {
        resolvedAgents.push({
          id: def.id,
          name: def.name,
          userAgent: def.userAgent,
        });
      }
    }

    if (resolvedAgents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'None of the provided User-Agent identifiers match allowlisted crawlers or browsers.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Fetch and analyze each user agent safely with bounded concurrency
    const isLocalhostAllowed = Boolean(allowLocalhostForTesting && process.env.NODE_ENV !== 'production');

    const results: AgentTestResult[] = await asyncPool(
      resolvedAgents,
      CONCURRENT_REQUESTS,
      async (agentDef): Promise<AgentTestResult> => {
        try {
          const fetchRes = await fetchWithUserAgent(cleanUrl, {
            userAgent: agentDef.userAgent,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            maxBytes: 2 * 1024 * 1024,
            allowLocalhostForTesting: isLocalhostAllowed,
          });

          const contentType = fetchRes.headers['content-type'] || '';
          const varyRaw = fetchRes.headers['vary'] || undefined;
          const varyStatus = checkVaryUserAgent(varyRaw);
          const xRobotsTag = fetchRes.headers['x-robots-tag'] || null;

          const isHtml = isSupportedHtmlContentType(contentType);
          const isErrorResponse = fetchRes.statusCode >= 400;

          // Prepare bounded source representation
          const bodyString = fetchRes.body;
          const isTruncatedSource = bodyString.length > MAX_RAW_HTML_EXCERPT_CHARS;
          const boundedSource = isTruncatedSource
            ? bodyString.slice(0, MAX_RAW_HTML_EXCERPT_CHARS)
            : bodyString;

          // Only parse SEO signals if response is HTML
          if (!isHtml) {
            return {
              userAgentId: agentDef.id,
              userAgentName: agentDef.name,
              status: 'success',
              statusCode: fetchRes.statusCode,
              statusText: fetchRes.statusText,
              finalUrl: fetchRes.finalUrl,
              redirectChain: fetchRes.redirectHistory,
              isHtml: false,
              unsupportedContentType: true,
              isErrorResponse,
              title: null,
              metaDescription: null,
              h1: [],
              wordCount: null,
              imageCount: null,
              linkCount: null,
              internalLinkCount: null,
              externalLinkCount: null,
              internalLinksSample: [],
              externalLinksSample: [],
              imagesSample: [],
              varyUserAgent: varyStatus,
              varyHeaderRaw: varyRaw || null,
              md5: fetchRes.md5,
              sha256: fetchRes.sha256,
              generalRobots: null,
              googlebotRobots: null,
              bingbotRobots: null,
              metaRobots: null,
              xRobotsTag,
              canonical: null,
              contentType,
              contentLanguage: null,
              durationMs: fetchRes.durationMs,
              htmlSize: fetchRes.rawBuffer.length,
              hasStructuredData: false,
              rawHtml: includeFullSource ? bodyString : boundedSource,
              rawHtmlExcerpt: boundedSource,
              isTruncatedSource,
              error: null,
            };
          }

          // Parse HTML signals
          const parsed = extractHtmlSignals(bodyString, fetchRes.finalUrl, fetchRes.rawBuffer);

          // Header Link canonical fallback if not in HTML
          const headerCanonical = extractCanonicalFromHeaders(fetchRes.headers['link'], fetchRes.finalUrl);
          const canonical = parsed.canonical || headerCanonical;

          return {
            userAgentId: agentDef.id,
            userAgentName: agentDef.name,
            status: 'success',
            statusCode: fetchRes.statusCode,
            statusText: fetchRes.statusText,
            finalUrl: fetchRes.finalUrl,
            redirectChain: fetchRes.redirectHistory,
            isHtml: true,
            unsupportedContentType: false,
            isErrorResponse,
            title: parsed.title,
            metaDescription: parsed.metaDescription,
            h1: parsed.h1,
            wordCount: parsed.wordCount,
            imageCount: parsed.imageCount,
            linkCount: parsed.linkCount,
            internalLinkCount: parsed.internalLinkCount,
            externalLinkCount: parsed.externalLinkCount,
            internalLinksSample: parsed.internalLinksSample,
            externalLinksSample: parsed.externalLinksSample,
            imagesSample: parsed.imagesSample,
            varyUserAgent: varyStatus,
            varyHeaderRaw: varyRaw || null,
            md5: fetchRes.md5,
            sha256: fetchRes.sha256,
            generalRobots: parsed.generalRobots,
            googlebotRobots: parsed.googlebotRobots,
            bingbotRobots: parsed.bingbotRobots,
            metaRobots: parsed.metaRobots,
            xRobotsTag,
            canonical,
            contentType,
            contentLanguage: parsed.contentLanguage,
            durationMs: fetchRes.durationMs,
            htmlSize: fetchRes.rawBuffer.length,
            hasStructuredData: parsed.hasStructuredData,
            rawHtml: includeFullSource ? bodyString : boundedSource,
            rawHtmlExcerpt: boundedSource,
            isTruncatedSource,
            error: null,
          };
        } catch (err: any) {
          const { message, code } = mapSanitizedError(err);
          return {
            userAgentId: agentDef.id,
            userAgentName: agentDef.name,
            status: 'error',
            statusCode: null,
            statusText: null,
            finalUrl: null,
            redirectChain: [],
            isHtml: false,
            unsupportedContentType: false,
            isErrorResponse: true,
            title: null,
            metaDescription: null,
            h1: [],
            wordCount: null,
            imageCount: null,
            linkCount: null,
            internalLinkCount: null,
            externalLinkCount: null,
            internalLinksSample: [],
            externalLinksSample: [],
            imagesSample: [],
            varyUserAgent: 'Not available',
            varyHeaderRaw: null,
            md5: null,
            sha256: null,
            generalRobots: null,
            googlebotRobots: null,
            bingbotRobots: null,
            metaRobots: null,
            xRobotsTag: null,
            canonical: null,
            contentType: null,
            contentLanguage: null,
            durationMs: null,
            htmlSize: null,
            hasStructuredData: false,
            error: message,
            errorCode: code,
          };
        }
      }
    );

    const { comparisons, summary } = compareAgentResults(results);

    return NextResponse.json(
      {
        success: true,
        requestedUrl: cleanUrl,
        summary,
        results,
        comparisons,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (err: any) {
    const { message } = mapSanitizedError(err);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
