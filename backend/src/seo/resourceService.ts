import { safeFetch } from './safeFetch';
import { validateUrl } from './safeFetch';
import { testRobotsTxt } from './robotsService';

export interface SitemapCheckResult {
  url: string;
  statusCode: number | null;
  statusText: string;
  contentType?: string;
  durationMs?: number;
  accessible: boolean;
  error?: string;
}

export interface ResourceItem {
  url: string;
  type: 'Document' | 'Stylesheet' | 'Script' | 'Image' | 'Font' | 'Media' | 'Other';
  host: string;
  crawlability: 'ALLOWED' | 'BLOCKED' | 'UNKNOWN';
  appliedRule?: {
    type: 'allow' | 'disallow';
    pattern: string;
    lineNumber: number;
    originalText: string;
  } | null;
  robotsTxtUrl: string;
  httpStatus?: number | null;
  statusText?: string;
  explanation: string;
}

export interface ResourceCheckResult {
  targetUrl: string;
  pageAccessible: boolean;
  pageStatusCode: number | null;
  resources: ResourceItem[];
  totalResources: number;
  blockedCount: number;
  allowedCount: number;
  unknownCount: number;
  error?: string;
}

/**
 * Checks a list of sitemap URLs for HTTP accessibility and status codes.
 */
export async function checkSitemaps(sitemapUrls: string[]): Promise<SitemapCheckResult[]> {
  const uniqueUrls = Array.from(new Set(sitemapUrls.map(u => u.trim()))).filter(Boolean);

  const results: SitemapCheckResult[] = [];

  // Limit concurrency to 5
  const concurrency = 5;
  for (let i = 0; i < uniqueUrls.length; i += concurrency) {
    const chunk = uniqueUrls.slice(i, i + concurrency);
    const chunkPromises = chunk.map(async (url) => {
      try {
        const fetchRes = await safeFetch(url, { timeoutMs: 8000, maxBytes: 1024 * 64 });
        return {
          url,
          statusCode: fetchRes.statusCode,
          statusText: fetchRes.statusText,
          contentType: fetchRes.contentType,
          durationMs: fetchRes.durationMs,
          accessible: fetchRes.statusCode >= 200 && fetchRes.statusCode < 400
        };
      } catch (err: any) {
        return {
          url,
          statusCode: null,
          statusText: err.message || 'Fetch failed',
          accessible: false,
          error: err.message
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Discovers and checks crawlability of resources referenced by a page's HTML.
 * Includes documents, stylesheets, scripts, fonts, images, media, and preload links.
 */
export async function checkPageResources(
  pageUrl: string,
  userAgent: string
): Promise<ResourceCheckResult> {
  const targetParsed = validateUrl(pageUrl);

  // 1. Fetch the HTML
  let html = '';
  let pageStatusCode: number | null = null;
  let pageStatusText = '';
  let finalUrl = pageUrl;
  let redirectHistory: { from: string; to: string; statusCode: number }[] = [];

  try {
    const pageFetch = await safeFetch(pageUrl, {
      timeoutMs: 12000,
      maxBytes: 2 * 1024 * 1024 // 2 MB limit for modern dense web applications
    });
    pageStatusCode = pageFetch.statusCode;
    pageStatusText = pageFetch.statusText;
    html = pageFetch.body;
    finalUrl = pageFetch.finalUrl;
    redirectHistory = pageFetch.redirectHistory;
  } catch (err: any) {
    return {
      targetUrl: pageUrl,
      pageAccessible: false,
      pageStatusCode,
      resources: [],
      totalResources: 0,
      blockedCount: 0,
      allowedCount: 0,
      unknownCount: 0,
      error: `Could not fetch target page to extract resources: ${err.message}`
    };
  }

  // Map to store discovered raw resources
  const discoveredMap = new Map<string, ResourceItem['type']>();

  // A. Include initial requested Document if redirected or tested
  discoveredMap.set(pageUrl, 'Document');
  if (finalUrl !== pageUrl) {
    discoveredMap.set(finalUrl, 'Document');
  }

  // B. Stylesheets & Preload links: <link ... rel="..." href="..."
  const linkMatches = html.matchAll(/<link\b[^>]*>/gi);
  for (const match of linkMatches) {
    const tag = match[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    const relMatch = tag.match(/rel=["']([^"']+)["']/i);
    const asMatch = tag.match(/as=["']([^"']+)["']/i);

    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const rel = (relMatch ? relMatch[1] : '').toLowerCase();
    const asType = (asMatch ? asMatch[1] : '').toLowerCase();

    if (rel.includes('stylesheet') || tag.includes('text/css')) {
      discoveredMap.set(href, 'Stylesheet');
    } else if (asType === 'font' || href.match(/\.(woff2?|ttf|otf|eot)(\?|$)/i)) {
      discoveredMap.set(href, 'Font');
    } else if (asType === 'script' || href.match(/\.js(\?|$)/i)) {
      discoveredMap.set(href, 'Script');
    } else if (asType === 'style') {
      discoveredMap.set(href, 'Stylesheet');
    } else if (asType === 'image' || href.match(/\.(png|jpe?g|webp|svg|gif|ico|avif)(\?|$)/i)) {
      discoveredMap.set(href, 'Image');
    } else if (rel.includes('icon')) {
      discoveredMap.set(href, 'Image');
    }
  }

  // C. Scripts: <script ... src="..."
  const scriptMatches = html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi);
  for (const match of scriptMatches) {
    if (match[1]) {
      discoveredMap.set(match[1], 'Script');
    }
  }

  // D. Images: <img ... src="..." and srcset="..."
  const imgMatches = html.matchAll(/<img\b[^>]*>/gi);
  for (const match of imgMatches) {
    const tag = match[0];
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      discoveredMap.set(srcMatch[1], 'Image');
    }
    const srcsetMatch = tag.match(/srcset=["']([^"']+)["']/i);
    if (srcsetMatch && srcsetMatch[1]) {
      // Parse comma-separated srcset entries
      const entries = srcsetMatch[1].split(',');
      for (const entry of entries) {
        const urlCandidate = entry.trim().split(/\s+/)[0];
        if (urlCandidate) discoveredMap.set(urlCandidate, 'Image');
      }
    }
  }

  // E. Picture/Source: <source ... srcset="..." or src="..."
  const sourceMatches = html.matchAll(/<source\b[^>]*>/gi);
  for (const match of sourceMatches) {
    const tag = match[0];
    const srcsetMatch = tag.match(/srcset=["']([^"']+)["']/i);
    if (srcsetMatch && srcsetMatch[1]) {
      const entries = srcsetMatch[1].split(',');
      for (const entry of entries) {
        const urlCandidate = entry.trim().split(/\s+/)[0];
        if (urlCandidate) discoveredMap.set(urlCandidate, 'Image');
      }
    }
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      discoveredMap.set(srcMatch[1], 'Image');
    }
  }

  // F. Inline style background-image and font URLs: url(...)
  const urlMatches = html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi);
  for (const match of urlMatches) {
    const candidate = match[1];
    if (!candidate || candidate.startsWith('data:')) continue;
    if (candidate.match(/\.(woff2?|ttf|otf|eot)(\?|$)/i)) {
      discoveredMap.set(candidate, 'Font');
    } else if (candidate.match(/\.(png|jpe?g|webp|svg|gif|avif)(\?|$)/i)) {
      discoveredMap.set(candidate, 'Image');
    } else {
      discoveredMap.set(candidate, 'Other');
    }
  }

  // G. Extract CSS @import or Next.js / framework static chunk patterns in HTML
  const nextChunkMatches = html.matchAll(/["'](\/_next\/static\/[^"']+)["']/gi);
  for (const match of nextChunkMatches) {
    const chunkPath = match[1];
    if (chunkPath.endsWith('.js')) {
      discoveredMap.set(chunkPath, 'Script');
    } else if (chunkPath.endsWith('.css')) {
      discoveredMap.set(chunkPath, 'Stylesheet');
    } else if (chunkPath.match(/\.(woff2?|ttf|otf)(\?|$)/i)) {
      discoveredMap.set(chunkPath, 'Font');
    } else if (chunkPath.match(/\.(png|jpe?g|webp|svg|gif)(\?|$)/i)) {
      discoveredMap.set(chunkPath, 'Image');
    }
  }

  // Deduplicate and resolve absolute URLs
  const resolvedResourcesMap = new Map<string, { type: ResourceItem['type']; url: string; host: string }>();

  for (const [rawUrl, type] of Array.from(discoveredMap.entries())) {
    const cleanRaw = rawUrl.trim();
    if (!cleanRaw || cleanRaw.startsWith('data:') || cleanRaw.startsWith('javascript:') || cleanRaw.startsWith('#')) {
      continue;
    }

    try {
      const resolved = new URL(cleanRaw, finalUrl).toString();
      const resolvedParsed = new URL(resolved);

      if (resolvedParsed.protocol === 'http:' || resolvedParsed.protocol === 'https:') {
        if (!resolvedResourcesMap.has(resolved)) {
          // Normalize type if it ends with common extensions
          let finalType = type;
          if (resolvedParsed.pathname.match(/\.(woff2?|ttf|otf|eot)(\?|$)/i)) finalType = 'Font';
          else if (resolvedParsed.pathname.match(/\.css(\?|$)/i)) finalType = 'Stylesheet';
          else if (resolvedParsed.pathname.match(/\.js(\?|$)/i)) finalType = 'Script';
          else if (resolvedParsed.pathname.match(/\.(png|jpe?g|webp|svg|gif|ico|avif)(\?|$)/i)) finalType = 'Image';

          resolvedResourcesMap.set(resolved, {
            type: finalType,
            url: resolved,
            host: resolvedParsed.host
          });
        }
      }
    } catch {
      // Ignore invalid URL structures
    }
  }

  // Increased limit up to 150 resources to capture all page scripts, fonts, stylesheets, and images
  const resourceList = Array.from(resolvedResourcesMap.values()).slice(0, 150);

  // Group resources by origin to batch robots.txt fetching and caching
  const resourcesByOrigin = new Map<string, typeof resourceList>();
  for (const res of resourceList) {
    const origin = new URL(res.url).origin;
    const existing = resourcesByOrigin.get(origin) || [];
    existing.push(res);
    resourcesByOrigin.set(origin, existing);
  }

  const finalItems: ResourceItem[] = [];
  let blockedCount = 0;
  let allowedCount = 0;
  let unknownCount = 0;

  // Evaluate crawlability per origin group
  for (const [origin, items] of Array.from(resourcesByOrigin.entries())) {
    for (const item of items) {
      const parsedItem = new URL(item.url);
      const testPath = parsedItem.pathname + parsedItem.search;

      try {
        const testRes = await testRobotsTxt({
          websiteUrl: origin,
          path: testPath,
          userAgent: userAgent
        });

        const status = testRes.result.status;
        if (status === 'BLOCKED') blockedCount++;
        else if (status === 'ALLOWED') allowedCount++;
        else unknownCount++;

        // Determine HTTP status for Document if available
        let httpStatusCode: number | null = null;
        let httpStatusText = '';
        if (item.url === pageUrl || item.url === finalUrl) {
          httpStatusCode = pageStatusCode;
          httpStatusText = pageStatusText;
        }

        finalItems.push({
          url: item.url,
          type: item.type,
          host: item.host,
          crawlability: status,
          appliedRule: testRes.result.appliedRule,
          robotsTxtUrl: testRes.robotsTxt.url,
          httpStatus: httpStatusCode,
          statusText: httpStatusText,
          explanation: testRes.result.explanation
        });
      } catch (err: any) {
        unknownCount++;
        finalItems.push({
          url: item.url,
          type: item.type,
          host: item.host,
          crawlability: 'UNKNOWN',
          robotsTxtUrl: `${origin}/robots.txt`,
          explanation: `Failed checking robots.txt for resource: ${err.message}`
        });
      }
    }
  }

  return {
    targetUrl: pageUrl,
    pageAccessible: pageStatusCode !== null && pageStatusCode >= 200 && pageStatusCode < 400,
    pageStatusCode,
    resources: finalItems,
    totalResources: finalItems.length,
    blockedCount,
    allowedCount,
    unknownCount
  };
}
