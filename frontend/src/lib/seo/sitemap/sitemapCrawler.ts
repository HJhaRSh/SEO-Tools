/**
 * Full-Site Website Crawler for XML Sitemap Generation
 * Tool 4 — XML Sitemap Generator
 *
 * Capabilities:
 * - Recursive Breadth-First-Search (BFS) internal link traversal
 * - Secondary discovery via robots.txt and existing XML sitemaps (orphan page discovery)
 * - Strict SSRF protection via safeFetch
 * - Strict domain scope confinement
 * - URL normalization (hash stripping, tracking parameter removal, path deduplication)
 * - Exclusion of non-HTML assets (images, PDFs, media, scripts, stylesheets)
 * - Strict SEO indexability filtering:
 *     - Only HTTP 200 OK
 *     - Rejection of <meta name="robots" content="noindex"> and X-Robots-Tag
 *     - Canonical tag resolution (ignores pages canonicalized to other URLs)
 * - Automatic <lastmod> extraction from HTTP headers, <time> elements, and OpenGraph/Schema metadata
 * - Polite concurrency limiter with polite delays
 * - Streaming progress reporting and AbortSignal support
 */

import * as cheerio from 'cheerio';
import { safeFetch, SafeFetchResult } from '../safeFetch';
import { parseRobotsTxt } from '../robotsParser';
import { SitemapUrlEntry } from './sitemapTypes';

export interface CrawlReportEntry {
  url: string;
  status: 'indexed' | 'excluded' | 'redirected' | 'error';
  inSitemap: boolean;
  statusCode: number;
  finalUrl?: string;
  destinationUrl?: string;
  canonicalUrl?: string;
  reason: string;
  depth?: number;
  lastmod?: string | null;
}

export function generateCrawlReportCsv(report: CrawlReportEntry[]): string {
  const headers = [
    'URL',
    'Status',
    'In Sitemap',
    'HTTP Status Code',
    'Destination / Redirected To',
    'Canonical URL',
    'Reason / Directives',
    'Depth',
    'Last Modified'
  ];

  const escapeCsv = (val: any) => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = report.map(r => [
    escapeCsv(r.url),
    escapeCsv(r.status.toUpperCase()),
    escapeCsv(r.inSitemap ? 'YES' : 'NO'),
    escapeCsv(r.statusCode),
    escapeCsv(r.finalUrl || r.destinationUrl || ''),
    escapeCsv(r.canonicalUrl || ''),
    escapeCsv(r.reason),
    escapeCsv(r.depth ?? 0),
    escapeCsv(r.lastmod || '')
  ].join(','));

  return [headers.join(','), ...rows].join('\r\n');
}

export interface SitemapCrawlOptions {
  maxPages?: number; // Maximum pages to crawl (defaults to 50000 for full website crawl)
  maxDepth?: number; // Maximum link depth from root (defaults to 50)
  crawlDelayMs?: number; // Polite delay between requests (defaults to 50ms)
  includeSubdomains?: boolean; // Defaults to false
  discoverFromRobotsTxt?: boolean; // Defaults to true
  userAgent?: string;
  allowLocalhostForTesting?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: CrawlProgressEvent) => void;
}

export interface CrawlProgressEvent {
  type: 'start' | 'progress' | 'url_discovered' | 'url_skipped' | 'complete' | 'error';
  crawledCount: number;
  queueCount: number;
  validUrlsCount: number;
  currentUrl?: string;
  discoveredUrl?: {
    loc: string;
    depth: number;
    statusCode: number;
    lastmod?: string | null;
    isIndexable: boolean;
    skipReason?: string;
  };
  reportEntry?: CrawlReportEntry;
  validEntries?: SitemapUrlEntry[];
  crawlReport?: CrawlReportEntry[];
  summary?: {
    totalPagesCrawled: number;
    validUrlsFound: number;
    skippedUrls: number;
    durationMs: number;
  };
  error?: string;
}

/**
 * Standard non-HTML asset extensions to exclude from crawler queue
 */
const ASSET_EXTENSIONS_REGEX = /\.(jpg|jpeg|png|webp|avif|gif|svg|ico|bmp|tiff|mp4|webm|avi|mov|wmv|flv|mkv|mp3|wav|ogg|m4a|aac|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|css|js|map|json|xml|rss|atom|woff|woff2|ttf|eot|otf|exe|dmg|iso|apk)$/i;

/**
 * Tracking query parameters to strip for clean canonical URL normalization
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  '_ga',
  '_gl',
  'mc_eid',
  'zanpid'
]);

/**
 * Normalizes a URL and verifies it belongs to the target domain scope
 */
export function normalizeCrawlUrl(
  rawUrl: string,
  baseOrigin: string,
  baseHostname: string,
  includeSubdomains: boolean = false
): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('sms:')
  ) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, baseOrigin);

    // Only allow http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    // Verify domain boundary
    const host = parsed.hostname.toLowerCase();
    const bareHost = host.replace(/^www\./i, '');
    const bareBase = baseHostname.toLowerCase().replace(/^www\./i, '');

    if (includeSubdomains) {
      if (bareHost !== bareBase && !bareHost.endsWith('.' + bareBase)) {
        return null;
      }
    } else {
      // Seamlessly treat apex domain and www subdomain as the same website (e.g. hoabl.com === www.hoabl.com)
      if (bareHost !== bareBase) {
        return null;
      }
    }

    // Unify hostname to target baseHostname to avoid duplicate www/non-www entries
    parsed.hostname = baseHostname;
    try {
      parsed.protocol = new URL(baseOrigin).protocol;
    } catch {
      // Keep existing protocol
    }

    // Check for static asset file extensions
    if (ASSET_EXTENSIONS_REGEX.test(parsed.pathname)) {
      return null;
    }

    // Strip hash fragment
    parsed.hash = '';

    // Strip tracking parameters
    if (parsed.search) {
      const sp = new URLSearchParams(parsed.search);
      let modified = false;
      for (const p of Array.from(sp.keys())) {
        if (TRACKING_PARAMS.has(p.toLowerCase())) {
          sp.delete(p);
          modified = true;
        }
      }
      if (modified) {
        parsed.search = sp.toString() ? `?${sp.toString()}` : '';
      }
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Normalizes a URL for canonical and self-reference comparisons:
 * - Trims whitespaces and decodes encoded URI components
 * - Ignores www. prefix differences
 * - Strips trailing slashes from pathnames (keeping root /)
 * - Normalizes letter casing across hostname and pathname
 * - Strips protocol differences (http vs https)
 * - Normalizes query string
 */
export function cleanForCompare(u: string): string {
  if (!u || typeof u !== 'string') return '';
  try {
    const trimmed = u.trim();
    const p = new URL(trimmed);
    const host = p.hostname.toLowerCase().replace(/^www\./i, '');
    let pathname = decodeURIComponent(p.pathname || '/');
    pathname = pathname.replace(/\/+$/, '').trim().toLowerCase();
    if (!pathname) pathname = '/';
    const search = p.search ? p.search.toLowerCase() : '';
    return `${host}${pathname}${search}`;
  } catch {
    return u.trim().replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Parses HTML to extract:
 * 1. Internal links (<a href>, canonical, alternate, script manifests)
 * 2. Canonical tag (<link rel="canonical">)
 * 3. Alternate hreflang tags (<link rel="alternate">)
 * 4. Robots meta directives (noindex/nofollow)
 * 5. Last modified metadata (dates)
 */
export function extractPageMetadataAndLinks(
  html: string,
  currentUrl: string,
  baseOrigin: string,
  baseHostname: string,
  includeSubdomains: boolean = false
): {
  isIndexable: boolean;
  skipReason?: string;
  canonicalUrl?: string;
  links: string[];
  alternates: { hreflang: string; href: string }[];
  lastmod?: string;
} {
  const $ = cheerio.load(html);

  // 1. Check robots meta tags (e.g. <meta name="robots" content="noindex">)
  let isNoindex = false;
  $('meta[name="robots" i], meta[name="googlebot" i], meta[name="bingbot" i]').each((_, el) => {
    const content = ($(el).attr('content') || '').toLowerCase();
    if (content.includes('noindex')) {
      isNoindex = true;
    }
  });

  let skipReason: string | undefined = undefined;
  if (isNoindex) {
    skipReason = 'Page has meta robots noindex';
  }

  // 2. Check canonical tag (robust whitespace trimming and URL normalization)
  let canonicalUrl: string | undefined = undefined;
  const rawCanonicalHref = $('link[rel="canonical" i]').attr('href');
  if (rawCanonicalHref && typeof rawCanonicalHref === 'string') {
    const trimmedCanonical = rawCanonicalHref.trim();
    if (trimmedCanonical) {
      const normalizedCanonical = normalizeCrawlUrl(trimmedCanonical, baseOrigin, baseHostname, includeSubdomains);
      if (normalizedCanonical) {
        canonicalUrl = normalizedCanonical;
      }
    }
  }

  let isIndexable = !isNoindex;
  if (isIndexable && canonicalUrl && cleanForCompare(canonicalUrl) !== cleanForCompare(currentUrl)) {
    isIndexable = false;
    skipReason = `Canonical points to ${canonicalUrl}`;
  }

  // 3. Extract hreflang alternates
  const alternates: { hreflang: string; href: string }[] = [];
  $('link[rel="alternate" i][hreflang]').each((_, el) => {
    const code = ($(el).attr('hreflang') || '').trim();
    const href = ($(el).attr('href') || '').trim();
    if (code && href) {
      const normalizedHref = normalizeCrawlUrl(href, baseOrigin, baseHostname, includeSubdomains);
      if (normalizedHref) {
        alternates.push({ hreflang: code, href: normalizedHref });
      }
    }
  });

  // 4. Extract lastmod date hints
  let lastmod: string | undefined = undefined;
  const timeAttr = $('article time[datetime], time[datetime]').first().attr('datetime');
  const ogModified = $('meta[property="article:modified_time" i], meta[property="og:updated_time" i]').attr('content');
  const dateCandidate = timeAttr || ogModified;

  if (dateCandidate) {
    try {
      const parsedDate = new Date(dateCandidate);
      if (!isNaN(parsedDate.getTime())) {
        lastmod = parsedDate.toISOString().split('T')[0];
      }
    } catch {
      // Ignore unparseable dates
    }
  }

  // 5. Extract internal links from <a href="..."> and canonical
  const linksSet = new Set<string>();
  if (canonicalUrl) {
    linksSet.add(canonicalUrl);
  }

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const norm = normalizeCrawlUrl(href, baseOrigin, baseHostname, includeSubdomains);
    if (norm) {
      linksSet.add(norm);
    }
  });

  // 6. Discover Next.js and client-side SPA routes from scripts and JSON-LD
  $('script').each((_, el) => {
    const scriptContent = $(el).html() || '';
    if (!scriptContent) return;

    // JSON-LD structured data ("url": "https://...")
    if ($(el).attr('type')?.includes('json') || scriptContent.includes('"@context"')) {
      const urlMatches = scriptContent.match(/"url"\s*:\s*"([^"]+)"/g);
      if (urlMatches) {
        for (const m of urlMatches) {
          const val = m.replace(/^"url"\s*:\s*"/, '').replace(/"$/, '').replace(/\\"/g, '"');
          const norm = normalizeCrawlUrl(val, baseOrigin, baseHostname, includeSubdomains);
          if (norm) linksSet.add(norm);
        }
      }
    }

    // Next.js hydration payload or router manifests
    if (scriptContent.includes('__NEXT_DATA__') || scriptContent.includes('self.__next')) {
      const pathMatches = scriptContent.match(/"\/(?:blogs|projects|property|news-and-media|legal-documents)[^"'\s<>\\]+"/g);
      if (pathMatches) {
        for (const rawPath of pathMatches) {
          const cleanPath = rawPath.replace(/^"|"$/g, '').replace(/\\u0026/g, '&');
          const norm = normalizeCrawlUrl(cleanPath, baseOrigin, baseHostname, includeSubdomains);
          if (norm) linksSet.add(norm);
        }
      }
    }
  });

  return {
    isIndexable,
    skipReason,
    canonicalUrl,
    links: Array.from(linksSet),
    alternates,
    lastmod
  };
}

/**
 * Recursively fetches and parses sitemaps and sitemap index files
 */
async function discoverAndParseSitemaps(
  candidateUrls: string[],
  baseOrigin: string,
  baseHostname: string,
  includeSubdomains: boolean,
  allowLocalhostForTesting: boolean,
  signal?: AbortSignal
): Promise<Map<string, string | undefined>> {
  const discoveredMap = new Map<string, string | undefined>();
  const visitedSitemaps = new Set<string>();
  const queue = [...candidateUrls];

  while (queue.length > 0 && visitedSitemaps.size < 10) {
    if (signal?.aborted) break;
    const smUrl = queue.shift();
    if (!smUrl || visitedSitemaps.has(smUrl)) continue;
    visitedSitemaps.add(smUrl);

    try {
      const res = await safeFetch(smUrl, {
        timeoutMs: 3000,
        maxBytes: 5 * 1024 * 1024,
        allowLocalhostForTesting,
        headers: {
          'Accept': 'text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8'
        }
      }).catch(() => null);

      if (!res || res.statusCode !== 200 || !res.body) continue;

      const body = res.body;

      // 1. Check if this is a Sitemap Index with child sitemaps (<sitemap><loc>...</loc></sitemap>)
      const sitemapBlocks = body.match(/<sitemap>([\s\S]*?)<\/sitemap>/gi);
      if (sitemapBlocks && sitemapBlocks.length > 0) {
        for (const smBlock of sitemapBlocks) {
          const locMatch = smBlock.match(/<loc>\s*([^<>\s]+)\s*<\/loc>/i);
          if (locMatch) {
            const childSmUrl = locMatch[1].trim();
            if (!visitedSitemaps.has(childSmUrl) && visitedSitemaps.size + queue.length < 15) {
              queue.push(childSmUrl);
            }
          }
        }
      }

      // 2. Extract standard <url><loc>...</loc><lastmod>...</lastmod></url>
      const urlBlocks = body.match(/<url>([\s\S]*?)<\/url>/gi);
      if (urlBlocks && urlBlocks.length > 0) {
        for (const uBlock of urlBlocks) {
          const locMatch = uBlock.match(/<loc>\s*([^<>\s]+)\s*<\/loc>/i);
          if (!locMatch) continue;
          const loc = locMatch[1].trim();
          const lastmodMatch = uBlock.match(/<lastmod>\s*([^<>\s]+)\s*<\/lastmod>/i);
          const rawLastmod = lastmodMatch ? lastmodMatch[1].trim() : undefined;
          let parsedDate: string | undefined = undefined;
          if (rawLastmod) {
            try {
              const d = new Date(rawLastmod);
              if (!isNaN(d.getTime())) {
                parsedDate = d.toISOString().split('T')[0];
              }
            } catch {
              // Ignore invalid dates
            }
          }

          const norm = normalizeCrawlUrl(loc, baseOrigin, baseHostname, includeSubdomains);
          if (norm && !discoveredMap.has(norm)) {
            discoveredMap.set(norm, parsedDate);
          }
        }
      } else {
        // Fallback: simple <loc> matching if no <url> tags
        const simpleLocs = body.match(/<loc>\s*([^<>\s]+)\s*<\/loc>/gi);
        if (simpleLocs) {
          for (const lTag of simpleLocs) {
            const raw = lTag.replace(/<\/?loc>/gi, '').trim();
            if (raw.endsWith('.xml') || raw.includes('sitemap')) {
              if (!visitedSitemaps.has(raw)) queue.push(raw);
              continue;
            }
            const norm = normalizeCrawlUrl(raw, baseOrigin, baseHostname, includeSubdomains);
            if (norm && !discoveredMap.has(norm)) {
              discoveredMap.set(norm, undefined);
            }
          }
        }
      }
    } catch {
      // Non-fatal for individual sitemaps
    }
  }

  return discoveredMap;
}

/**
 * Full-Site Website Crawler Implementation
 */
export async function crawlWebsiteForSitemap(
  seedUrl: string,
  options: SitemapCrawlOptions = {}
): Promise<{
  success: boolean;
  validEntries: SitemapUrlEntry[];
  crawlReport: CrawlReportEntry[];
  summary: {
    totalPagesCrawled: number;
    validUrlsFound: number;
    skippedUrls: number;
    durationMs: number;
  };
  errors: string[];
}> {
  const startTime = Date.now();
  const maxPages = options.maxPages ?? 50000;
  const maxDepth = options.maxDepth ?? 50;
  const crawlDelayMs = options.crawlDelayMs ?? 40;
  const includeSubdomains = options.includeSubdomains ?? false;
  const discoverFromRobotsTxt = options.discoverFromRobotsTxt ?? true;
  const allowLocalhostForTesting = options.allowLocalhostForTesting ?? false;
  const signal = options.signal;

  let seedParsed: URL;
  try {
    seedParsed = new URL(seedUrl.trim());
    if (seedParsed.protocol !== 'http:' && seedParsed.protocol !== 'https:') {
      throw new Error('Only http:// and https:// URLs are supported.');
    }
  } catch (err: any) {
    return {
      success: false,
      validEntries: [],
      crawlReport: [],
      summary: { totalPagesCrawled: 0, validUrlsFound: 0, skippedUrls: 0, durationMs: 0 },
      errors: [err.message || 'Invalid seed URL provided.']
    };
  }

  let baseOrigin = seedParsed.origin;
  let baseHostname = seedParsed.hostname.toLowerCase();

  // Fast probe to detect apex-to-www or www-to-apex canonical domain redirects on root
  try {
    const probeRes = await safeFetch(seedUrl, {
      timeoutMs: 5000,
      maxRedirects: 3,
      allowLocalhostForTesting
    }).catch(() => null);

    if (probeRes && probeRes.finalUrl) {
      const probeParsed = new URL(probeRes.finalUrl);
      const bareProbe = probeParsed.hostname.toLowerCase().replace(/^www\./i, '');
      const bareSeed = seedParsed.hostname.toLowerCase().replace(/^www\./i, '');
      if (bareProbe === bareSeed) {
        baseOrigin = probeParsed.origin;
        baseHostname = probeParsed.hostname.toLowerCase();
      }
    }
  } catch {
    // Keep initial baseOrigin / baseHostname
  }

  const normalizedSeedUrl = normalizeCrawlUrl(seedUrl, baseOrigin, baseHostname, includeSubdomains) || seedUrl;

  const validEntriesMap = new Map<string, SitemapUrlEntry>();
  const crawlReportMap = new Map<string, CrawlReportEntry>();
  const visitedUrls = new Set<string>();
  const crawlQueue: { url: string; depth: number }[] = [{ url: normalizedSeedUrl, depth: 0 }];
  const queuedUrls = new Set<string>([normalizedSeedUrl]);
  const sitemapDates = new Map<string, string | undefined>();

  let totalPagesCrawled = 0;
  let skippedUrls = 0;
  const errors: string[] = [];

  // Notify start
  options.onProgress?.({
    type: 'start',
    crawledCount: 0,
    queueCount: crawlQueue.length,
    validUrlsCount: 0,
    currentUrl: normalizedSeedUrl
  });

  // Vector 2: Discover orphan pages from robots.txt & existing sitemaps
  if (discoverFromRobotsTxt && !signal?.aborted) {
    try {
      const candidateSitemaps: string[] = [];

      // Check robots.txt first
      const robotsUrl = `${baseOrigin}/robots.txt`;
      const robotsRes = await safeFetch(robotsUrl, {
        timeoutMs: 4000,
        maxBytes: 128 * 1024,
        allowLocalhostForTesting
      }).catch(() => null);

      if (robotsRes && robotsRes.statusCode === 200 && robotsRes.body) {
        const parsedRobots = parseRobotsTxt(robotsRes.body);
        if (parsedRobots.sitemaps && parsedRobots.sitemaps.length > 0) {
          for (const sm of parsedRobots.sitemaps) {
            if (sm.url && !candidateSitemaps.includes(sm.url)) {
              candidateSitemaps.push(sm.url);
            }
          }
        }
      }

      // Probe default sitemap paths on both baseOrigin and alternate www/apex
      const bareHost = baseHostname.replace(/^www\./i, '');
      const altOrigin = baseHostname.startsWith('www.') ? `https://${bareHost}` : `https://www.${bareHost}`;

      const defaultPaths = ['/sitemap.xml', '/sitemap_index.xml'];
      for (const p of defaultPaths) {
        const u1 = `${baseOrigin}${p}`;
        if (!candidateSitemaps.includes(u1)) candidateSitemaps.push(u1);
        const u2 = `${altOrigin}${p}`;
        if (!candidateSitemaps.includes(u2)) candidateSitemaps.push(u2);
      }

      // Parse all discovered candidate sitemaps and nested sitemaps without artificial slice
      const sitemapUrls = await discoverAndParseSitemaps(
        candidateSitemaps,
        baseOrigin,
        baseHostname,
        includeSubdomains,
        allowLocalhostForTesting,
        signal
      );

      for (const [smUrl, smDate] of sitemapUrls.entries()) {
        if (smDate) sitemapDates.set(smUrl, smDate);
        if (!queuedUrls.has(smUrl) && !visitedUrls.has(smUrl)) {
          queuedUrls.add(smUrl);
          crawlQueue.push({ url: smUrl, depth: 1 });
        }
      }
    } catch {
      // Non-fatal if robots or sitemaps fail to load
    }
  }

  // Main BFS Crawl Loop
  while (crawlQueue.length > 0 && totalPagesCrawled < maxPages) {
    if (signal?.aborted) {
      break;
    }

    const currentItem = crawlQueue.shift();
    if (!currentItem) break;

    const { url, depth } = currentItem;
    if (visitedUrls.has(url)) continue;
    visitedUrls.add(url);

    totalPagesCrawled++;

    // Polite crawl delay between pages
    if (crawlDelayMs > 0 && totalPagesCrawled > 1) {
      await new Promise(res => setTimeout(res, crawlDelayMs));
    }

    let fetchRes: SafeFetchResult | null = null;
    try {
      fetchRes = await safeFetch(url, {
        timeoutMs: 10000,
        maxBytes: 1024 * 1024, // 1MB HTML limit
        allowLocalhostForTesting,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Upgrade-Insecure-Requests': '1'
        }
      });
    } catch (err: any) {
      skippedUrls++;
      const repEntry: CrawlReportEntry = {
        url,
        status: 'error',
        inSitemap: false,
        statusCode: 0,
        reason: err.message || 'Fetch failed',
        depth
      };
      crawlReportMap.set(url, repEntry);

      options.onProgress?.({
        type: 'url_skipped',
        crawledCount: totalPagesCrawled,
        queueCount: crawlQueue.length,
        validUrlsCount: validEntriesMap.size,
        currentUrl: url,
        discoveredUrl: {
          loc: url,
          depth,
          statusCode: 0,
          isIndexable: false,
          skipReason: err.message || 'Fetch failed'
        },
        reportEntry: repEntry
      });
      continue;
    }

    // Check status code
    if (!fetchRes || fetchRes.statusCode !== 200) {
      skippedUrls++;
      const isRedir = Boolean(fetchRes && [301, 302, 307, 308].includes(fetchRes.statusCode));
      const isErr = !fetchRes || fetchRes.statusCode >= 400;
      const statusType: CrawlReportEntry['status'] = isRedir ? 'redirected' : (isErr ? 'error' : 'excluded');
      const reasonMsg = fetchRes
        ? (isRedir ? `Redirected (${fetchRes.statusCode}) to ${fetchRes.finalUrl}` : `HTTP status ${fetchRes.statusCode}`)
        : 'HTTP Error (No response)';

      const repEntry: CrawlReportEntry = {
        url,
        status: statusType,
        inSitemap: false,
        statusCode: fetchRes ? fetchRes.statusCode : 0,
        finalUrl: fetchRes && fetchRes.finalUrl !== url ? fetchRes.finalUrl : undefined,
        reason: reasonMsg,
        depth
      };
      crawlReportMap.set(url, repEntry);

      // If redirect, enqueue the final redirected destination
      if (fetchRes && (fetchRes.statusCode === 301 || fetchRes.statusCode === 302)) {
        const dest = normalizeCrawlUrl(fetchRes.finalUrl, baseOrigin, baseHostname, includeSubdomains);
        if (dest && !queuedUrls.has(dest) && !visitedUrls.has(dest) && depth < maxDepth) {
          queuedUrls.add(dest);
          crawlQueue.push({ url: dest, depth });
        }
      }

      options.onProgress?.({
        type: 'url_skipped',
        crawledCount: totalPagesCrawled,
        queueCount: crawlQueue.length,
        validUrlsCount: validEntriesMap.size,
        currentUrl: url,
        discoveredUrl: {
          loc: url,
          depth,
          statusCode: fetchRes ? fetchRes.statusCode : 0,
          isIndexable: false,
          skipReason: reasonMsg
        },
        reportEntry: repEntry
      });
      continue;
    }

    // Check Content-Type (must be HTML)
    const contentType = (fetchRes.contentType || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      skippedUrls++;
      const repEntry: CrawlReportEntry = {
        url,
        status: 'excluded',
        inSitemap: false,
        statusCode: fetchRes.statusCode,
        reason: `Non-HTML content type (${contentType})`,
        depth
      };
      crawlReportMap.set(url, repEntry);

      options.onProgress?.({
        type: 'url_skipped',
        crawledCount: totalPagesCrawled,
        queueCount: crawlQueue.length,
        validUrlsCount: validEntriesMap.size,
        currentUrl: url,
        discoveredUrl: {
          loc: url,
          depth,
          statusCode: fetchRes.statusCode,
          isIndexable: false,
          skipReason: `Non-HTML content type (${contentType})`
        },
        reportEntry: repEntry
      });
      continue;
    }

    // Check X-Robots-Tag header
    const xRobotsTag = (fetchRes.headers['x-robots-tag'] || '').toLowerCase();
    if (xRobotsTag.includes('noindex')) {
      skippedUrls++;
      const repEntry: CrawlReportEntry = {
        url,
        status: 'excluded',
        inSitemap: false,
        statusCode: fetchRes.statusCode,
        reason: 'HTTP header X-Robots-Tag specifies noindex',
        depth
      };
      crawlReportMap.set(url, repEntry);

      options.onProgress?.({
        type: 'url_skipped',
        crawledCount: totalPagesCrawled,
        queueCount: crawlQueue.length,
        validUrlsCount: validEntriesMap.size,
        currentUrl: url,
        discoveredUrl: {
          loc: url,
          depth,
          statusCode: fetchRes.statusCode,
          isIndexable: false,
          skipReason: 'X-Robots-Tag noindex'
        },
        reportEntry: repEntry
      });
      continue;
    }

    // Handle redirect when safeFetch followed redirect(s) to a different final URL
    const normFinalUrl = normalizeCrawlUrl(fetchRes.finalUrl, baseOrigin, baseHostname, includeSubdomains);
    const wasRedirected = Boolean(normFinalUrl && cleanForCompare(normFinalUrl) !== cleanForCompare(url));

    if (wasRedirected && normFinalUrl) {
      // 1. The requested `url` was a redirect hop. Exclude it from sitemap per Google guidelines.
      skippedUrls++;
      const redirectStatusCode = fetchRes.redirectHistory?.[0]?.statusCode || 301;
      const redirReport: CrawlReportEntry = {
        url,
        status: 'redirected',
        inSitemap: false,
        statusCode: redirectStatusCode,
        finalUrl: normFinalUrl,
        reason: `Redirected (${redirectStatusCode}) to ${normFinalUrl}`,
        depth
      };
      crawlReportMap.set(url, redirReport);

      options.onProgress?.({
        type: 'url_skipped',
        crawledCount: totalPagesCrawled,
        queueCount: crawlQueue.length,
        validUrlsCount: validEntriesMap.size,
        currentUrl: url,
        discoveredUrl: {
          loc: url,
          depth,
          statusCode: redirectStatusCode,
          isIndexable: false,
          skipReason: `Redirected to ${normFinalUrl}`
        },
        reportEntry: redirReport
      });

      // 2. Evaluate the live destination page `normFinalUrl` directly using the response body
      if (!visitedUrls.has(normFinalUrl)) {
        visitedUrls.add(normFinalUrl);

        const destXRobots = (fetchRes.headers['x-robots-tag'] || '').toLowerCase();
        if (!destXRobots.includes('noindex')) {
          const destParsed = extractPageMetadataAndLinks(
            fetchRes.body,
            normFinalUrl,
            baseOrigin,
            baseHostname,
            includeSubdomains
          );

          let destLastmod = destParsed.lastmod;
          if (!destLastmod && fetchRes.headers['last-modified']) {
            try {
              const d = new Date(fetchRes.headers['last-modified']);
              if (!isNaN(d.getTime())) {
                destLastmod = d.toISOString().split('T')[0];
              }
            } catch {}
          }
          if (!destLastmod && (sitemapDates.has(normFinalUrl) || sitemapDates.has(url))) {
            destLastmod = sitemapDates.get(normFinalUrl) || sitemapDates.get(url);
          }

          if (destParsed.isIndexable) {
            const destEntry: SitemapUrlEntry = {
              loc: normFinalUrl,
              lastmod: destLastmod || null,
              alternates: destParsed.alternates.length > 0 ? destParsed.alternates : undefined
            };
            validEntriesMap.set(normFinalUrl, destEntry);

            const destRepEntry: CrawlReportEntry = {
              url: normFinalUrl,
              status: 'indexed',
              inSitemap: true,
              statusCode: 200,
              canonicalUrl: destParsed.canonicalUrl || normFinalUrl,
              reason: 'Indexable (HTTP 200, self-canonical, noindex absent)',
              depth,
              lastmod: destLastmod
            };
            crawlReportMap.set(normFinalUrl, destRepEntry);

            options.onProgress?.({
              type: 'url_discovered',
              crawledCount: totalPagesCrawled,
              queueCount: crawlQueue.length,
              validUrlsCount: validEntriesMap.size,
              currentUrl: normFinalUrl,
              discoveredUrl: {
                loc: normFinalUrl,
                depth,
                statusCode: 200,
                lastmod: destLastmod,
                isIndexable: true
              },
              reportEntry: destRepEntry
            });
          } else {
            const destExcludedRep: CrawlReportEntry = {
              url: normFinalUrl,
              status: 'excluded',
              inSitemap: false,
              statusCode: 200,
              canonicalUrl: destParsed.canonicalUrl,
              reason: destParsed.skipReason || 'Page marked non-indexable',
              depth,
              lastmod: destLastmod
            };
            crawlReportMap.set(normFinalUrl, destExcludedRep);

            options.onProgress?.({
              type: 'url_skipped',
              crawledCount: totalPagesCrawled,
              queueCount: crawlQueue.length,
              validUrlsCount: validEntriesMap.size,
              currentUrl: normFinalUrl,
              discoveredUrl: {
                loc: normFinalUrl,
                depth,
                statusCode: 200,
                isIndexable: false,
                skipReason: destParsed.skipReason
              },
              reportEntry: destExcludedRep
            });
          }

          // Enqueue outgoing links from the destination page
          if (depth < maxDepth) {
            for (const nextLink of destParsed.links) {
              if (!queuedUrls.has(nextLink) && !visitedUrls.has(nextLink)) {
                queuedUrls.add(nextLink);
                crawlQueue.push({ url: nextLink, depth: depth + 1 });
              }
            }
          }
        } else {
          const destNoindexRep: CrawlReportEntry = {
            url: normFinalUrl,
            status: 'excluded',
            inSitemap: false,
            statusCode: 200,
            reason: 'HTTP header X-Robots-Tag specifies noindex',
            depth
          };
          crawlReportMap.set(normFinalUrl, destNoindexRep);
        }
      }

      continue;
    }

    // Parse HTML and extract metadata & outgoing links
    const parsedData = extractPageMetadataAndLinks(
      fetchRes.body,
      url,
      baseOrigin,
      baseHostname,
      includeSubdomains
    );

    // Header last-modified fallback
    let finalLastmod = parsedData.lastmod;
    if (!finalLastmod && fetchRes.headers['last-modified']) {
      try {
        const d = new Date(fetchRes.headers['last-modified']);
        if (!isNaN(d.getTime())) {
          finalLastmod = d.toISOString().split('T')[0];
        }
      } catch {
        // Ignore invalid dates
      }
    }
    if (!finalLastmod && sitemapDates.has(url)) {
      finalLastmod = sitemapDates.get(url);
    }

    if (parsedData.isIndexable) {
      const entry: SitemapUrlEntry = {
        loc: url,
        lastmod: finalLastmod || null,
        alternates: parsedData.alternates.length > 0 ? parsedData.alternates : undefined
      };
      validEntriesMap.set(url, entry);

      const repEntry: CrawlReportEntry = {
        url,
        status: 'indexed',
        inSitemap: true,
        statusCode: 200,
        canonicalUrl: parsedData.canonicalUrl || url,
        reason: 'Indexable (HTTP 200, self-canonical, noindex absent)',
        depth,
        lastmod: finalLastmod
      };
      crawlReportMap.set(url, repEntry);

      options.onProgress?.({
        type: 'url_discovered',
        crawledCount: totalPagesCrawled,
        queueCount: crawlQueue.length,
        validUrlsCount: validEntriesMap.size,
        currentUrl: url,
        discoveredUrl: {
          loc: url,
          depth,
          statusCode: 200,
          lastmod: finalLastmod,
          isIndexable: true
        },
        reportEntry: repEntry
      });
    } else {
      skippedUrls++;
      const repEntry: CrawlReportEntry = {
        url,
        status: 'excluded',
        inSitemap: false,
        statusCode: 200,
        canonicalUrl: parsedData.canonicalUrl,
        reason: parsedData.skipReason || 'Page marked non-indexable',
        depth,
        lastmod: finalLastmod
      };
      crawlReportMap.set(url, repEntry);

      options.onProgress?.({
        type: 'url_skipped',
        crawledCount: totalPagesCrawled,
        queueCount: crawlQueue.length,
        validUrlsCount: validEntriesMap.size,
        currentUrl: url,
        discoveredUrl: {
          loc: url,
          depth,
          statusCode: 200,
          isIndexable: false,
          skipReason: parsedData.skipReason
        },
        reportEntry: repEntry
      });
    }

    // Enqueue discovered links if within depth limit
    if (depth < maxDepth) {
      for (const nextLink of parsedData.links) {
        if (!queuedUrls.has(nextLink) && !visitedUrls.has(nextLink)) {
          queuedUrls.add(nextLink);
          crawlQueue.push({ url: nextLink, depth: depth + 1 });
        }
      }
    }

    // Periodic progress emission
    options.onProgress?.({
      type: 'progress',
      crawledCount: totalPagesCrawled,
      queueCount: crawlQueue.length,
      validUrlsCount: validEntriesMap.size,
      currentUrl: url
    });
  }

  const durationMs = Date.now() - startTime;
  const validEntries = Array.from(validEntriesMap.values());
  const crawlReport = Array.from(crawlReportMap.values());

  const summary = {
    totalPagesCrawled,
    validUrlsFound: validEntries.length,
    skippedUrls,
    durationMs
  };

  options.onProgress?.({
    type: 'complete',
    crawledCount: totalPagesCrawled,
    queueCount: 0,
    validUrlsCount: validEntries.length,
    validEntries,
    crawlReport,
    summary
  });

  return {
    success: true,
    validEntries,
    crawlReport,
    summary,
    errors
  };
}
