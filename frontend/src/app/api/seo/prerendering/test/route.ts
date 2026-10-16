import { NextRequest, NextResponse } from 'next/server';
import { getUserAgentById, MAX_SELECTED_AGENTS, USER_AGENTS } from '@/lib/seo/prerendering/userAgents';
import { fetchWithUserAgent } from '@/lib/seo/prerendering/safeFetcher';
import { extractHtmlSignals, extractCanonicalFromHeaders, checkVaryUserAgent } from '@/lib/seo/prerendering/htmlParser';
import { compareAgentResults } from '@/lib/seo/prerendering/comparisonEngine';
import { AgentTestResult, PrerenderApiResponse } from '@/lib/seo/prerendering/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PER_REQUEST_TIMEOUT_MS = 10000;
const CONCURRENT_REQUESTS = 3;

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
    const { url, userAgents, allowLocalhostForTesting } = body;

    // Validate URL input
    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid website URL to test.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const cleanUrl = url.trim();

    // Validate userAgents array
    if (!Array.isArray(userAgents) || userAgents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please select at least one User-Agent to test.' },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (userAgents.length > MAX_SELECTED_AGENTS) {
      return NextResponse.json(
        { success: false, error: `Maximum allowed user agents per test is ${MAX_SELECTED_AGENTS}.` },
        { status: 400, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // Resolve user agents against allowlist strictly
    const resolvedAgents: { id: string; name: string; userAgent: string }[] = [];
    for (const rawId of userAgents) {
      if (typeof rawId !== 'string') continue;
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
            timeoutMs: PER_REQUEST_TIMEOUT_MS,
            maxBytes: 2 * 1024 * 1024,
            allowLocalhostForTesting: isLocalhostAllowed,
          });

          // Check if response is HTML
          const contentType = fetchRes.headers['content-type'] || '';
          const varyRaw = fetchRes.headers['vary'] || undefined;
          const varyStatus = checkVaryUserAgent(varyRaw);
          const xRobotsTag = fetchRes.headers['x-robots-tag'] || null;

          const parsed = extractHtmlSignals(fetchRes.body, fetchRes.finalUrl);

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
            title: parsed.title,
            metaDescription: parsed.metaDescription,
            h1: parsed.h1,
            wordCount: parsed.wordCount,
            imageCount: parsed.imageCount,
            linkCount: parsed.linkCount,
            internalLinkCount: parsed.internalLinkCount,
            externalLinkCount: parsed.externalLinkCount,
            varyUserAgent: varyStatus,
            varyHeaderRaw: varyRaw || null,
            md5: parsed.md5,
            sha256: parsed.sha256,
            metaRobots: parsed.metaRobots,
            xRobotsTag,
            canonical,
            contentType,
            contentLanguage: parsed.contentLanguage,
            durationMs: fetchRes.durationMs,
            htmlSize: Buffer.byteLength(fetchRes.body, 'utf-8'),
            hasStructuredData: parsed.hasStructuredData,
            rawHtml: fetchRes.body,
            error: null,
          };
        } catch (err: any) {
          return {
            userAgentId: agentDef.id,
            userAgentName: agentDef.name,
            status: 'error',
            statusCode: null,
            statusText: null,
            finalUrl: null,
            redirectChain: [],
            title: null,
            metaDescription: null,
            h1: [],
            wordCount: null,
            imageCount: null,
            linkCount: null,
            internalLinkCount: null,
            externalLinkCount: null,
            varyUserAgent: 'Not available',
            varyHeaderRaw: null,
            md5: null,
            sha256: null,
            metaRobots: null,
            xRobotsTag: null,
            canonical: null,
            contentType: null,
            contentLanguage: null,
            durationMs: null,
            htmlSize: null,
            hasStructuredData: false,
            error: err.message || 'Request failed.',
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
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An error occurred during pre-rendering analysis.',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
