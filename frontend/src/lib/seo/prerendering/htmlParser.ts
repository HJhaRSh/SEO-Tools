import * as cheerio from 'cheerio';
import crypto from 'crypto';

export interface ExtractedImageDetail {
  src: string;
  alt: string;
  loading?: string;
}

export interface ExtractedHtmlSignals {
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  wordCount: number;
  bodyTextNormalized: string;
  imageCount: number;
  imagesSample: ExtractedImageDetail[];
  linkCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  internalLinksSample: string[];
  externalLinksSample: string[];
  generalRobots: string | null;
  googlebotRobots: string | null;
  bingbotRobots: string | null;
  metaRobots: string | null;
  canonical: string | null;
  contentLanguage: string | null;
  hasStructuredData: boolean;
  md5: string;
  sha256: string;
}

/**
 * Validates whether an HTTP Content-Type indicates a parsable HTML document.
 */
export function isSupportedHtmlContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return mime === 'text/html' || mime === 'application/xhtml+xml';
}

/**
 * Calculates words from body text using Intl.Segmenter with standard regex fallback.
 */
export function calculateWordCount(text: string, lang = 'en'): number {
  const clean = text.trim();
  if (!clean) return 0;

  try {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      // Intl.Segmenter word boundary counter
      const segmenter = new (Intl as any).Segmenter(lang, { granularity: 'word' });
      let count = 0;
      for (const segment of segmenter.segment(clean)) {
        if (segment.isWordLike) {
          count++;
        }
      }
      return count;
    }
  } catch {
    // fallback
  }

  // Regex whitespace fallback
  return clean.split(/\s+/).filter(Boolean).length;
}

/**
 * Extracts comprehensive SEO signals from raw HTML using Cheerio parser.
 * Computes MD5 and SHA-256 fingerprints on raw bytes buffer directly if provided, or UTF-8 buffer.
 * Extracts general robots, googlebot-specific, and bingbot-specific directives separately.
 * Extracts normalized link destinations and image URLs/alt-texts for deep comparison.
 */
export function extractHtmlSignals(
  html: string,
  baseUrl: string,
  rawBuffer?: Buffer
): ExtractedHtmlSignals {
  // Fingerprints computed strictly on raw binary bytes
  const buffer = rawBuffer || Buffer.from(html, 'utf-8');
  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const $ = cheerio.load(html);

  // 1. Title
  const rawTitle = $('title').first().text();
  const title = rawTitle ? rawTitle.replace(/\s+/g, ' ').trim() : null;

  // 2. Meta description
  const metaDesc = $('meta[name="description" i]').attr('content') ||
    $('meta[property="description" i]').attr('content') ||
    null;
  const metaDescription = metaDesc ? metaDesc.replace(/\s+/g, ' ').trim() : null;

  // 3. H1 headings
  const h1: string[] = [];
  $('h1').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) {
      h1.push(text);
    }
  });

  // 4. Canonical
  let canonical: string | null = null;
  const linkCanon = $('link[rel="canonical" i]').attr('href');
  if (linkCanon && linkCanon.trim()) {
    try {
      canonical = new URL(linkCanon.trim(), baseUrl).toString();
    } catch {
      canonical = linkCanon.trim();
    }
  }

  // 5. Meta robots — Separate general and crawler-specific directives
  const genRobots = $('meta[name="robots" i]').attr('content') || null;
  const gBotRobots = $('meta[name="googlebot" i]').attr('content') || null;
  const bBotRobots = $('meta[name="bingbot" i]').attr('content') || null;

  const generalRobots = genRobots ? genRobots.replace(/\s+/g, ' ').trim() : null;
  const googlebotRobots = gBotRobots ? gBotRobots.replace(/\s+/g, ' ').trim() : null;
  const bingbotRobots = bBotRobots ? bBotRobots.replace(/\s+/g, ' ').trim() : null;

  // Aggregate active metaRobots string for backwards compatibility
  const metaRobotsParts = [
    generalRobots ? `robots: ${generalRobots}` : '',
    googlebotRobots ? `googlebot: ${googlebotRobots}` : '',
    bingbotRobots ? `bingbot: ${bingbotRobots}` : '',
  ].filter(Boolean);
  const metaRobots = metaRobotsParts.length > 0 ? metaRobotsParts.join(' | ') : generalRobots || googlebotRobots || null;

  // 6. Content language
  const htmlLang = $('html').attr('lang') ||
    $('meta[http-equiv="content-language" i]').attr('content') ||
    null;
  const contentLanguage = htmlLang ? htmlLang.trim() : null;

  // 7. Structured data
  let hasStructuredData = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).html();
    if (content && content.trim()) {
      hasStructuredData = true;
    }
  });

  // 8. Images extraction (src, alt, loading)
  const imagesSample: ExtractedImageDetail[] = [];
  let totalImagesCount = 0;

  $('img').each((_, el) => {
    totalImagesCount++;
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    const alt = $(el).attr('alt') || '';
    const loading = $(el).attr('loading') || undefined;
    if (imagesSample.length < 50) {
      let resolvedSrc = src.trim();
      if (resolvedSrc && !resolvedSrc.startsWith('data:')) {
        try {
          resolvedSrc = new URL(resolvedSrc, baseUrl).toString();
        } catch {
          // keep original
        }
      }
      imagesSample.push({
        src: resolvedSrc,
        alt: alt.replace(/\s+/g, ' ').trim(),
        loading,
      });
    }
  });

  // 9. Links extraction (internal vs external destinations)
  let origin = '';
  try {
    origin = new URL(baseUrl).origin.toLowerCase();
  } catch {
    origin = '';
  }

  let linkCount = 0;
  let internalLinkCount = 0;
  let externalLinkCount = 0;
  const internalLinksSet = new Set<string>();
  const externalLinksSet = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }
    linkCount++;
    try {
      const resolved = new URL(href, baseUrl).toString();
      const resolvedOrigin = new URL(resolved).origin.toLowerCase();
      if (origin && resolvedOrigin === origin) {
        internalLinkCount++;
        if (internalLinksSet.size < 100) {
          internalLinksSet.add(resolved);
        }
      } else {
        externalLinkCount++;
        if (externalLinksSet.size < 100) {
          externalLinksSet.add(resolved);
        }
      }
    } catch {
      // Relative or malformed
      internalLinkCount++;
      if (internalLinksSet.size < 100) {
        internalLinksSet.add(href);
      }
    }
  });

  // 10. Meaningful body text extraction & normalization
  const bodyClone = $('body').clone();
  let bodyText = '';
  if (bodyClone.length > 0) {
    bodyClone.find('script, style, noscript, svg, template, iframe, object, embed').remove();
    bodyText = bodyClone.text();
  } else {
    const cloneAll = $('*').clone();
    cloneAll.find('script, style, noscript, svg, template, iframe, object, embed').remove();
    bodyText = cloneAll.text();
  }

  const normalizedBodyText = bodyText.replace(/\s+/g, ' ').trim();
  const wordCount = calculateWordCount(normalizedBodyText, contentLanguage || 'en');

  return {
    title,
    metaDescription,
    h1,
    wordCount,
    bodyTextNormalized: normalizedBodyText.slice(0, 1000), // First 1000 chars for deterministic sample comparison
    imageCount: totalImagesCount,
    imagesSample,
    linkCount,
    internalLinkCount,
    externalLinkCount,
    internalLinksSample: Array.from(internalLinksSet),
    externalLinksSample: Array.from(externalLinksSet),
    generalRobots,
    googlebotRobots,
    bingbotRobots,
    metaRobots,
    canonical,
    contentLanguage,
    hasStructuredData,
    md5,
    sha256,
  };
}

/**
 * Parses HTTP Link header for rel="canonical"
 */
export function extractCanonicalFromHeaders(linkHeader: string | undefined, baseUrl: string): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel=["']?canonical["']?/i);
    if (match) {
      try {
        return new URL(match[1].trim(), baseUrl).toString();
      } catch {
        return match[1].trim();
      }
    }
  }
  return null;
}

/**
 * Parses Vary header tokens case-insensitively for "User-Agent"
 */
export function checkVaryUserAgent(varyHeader: string | undefined): 'Present' | 'Absent' | 'Not available' {
  if (!varyHeader) return 'Not available';
  const tokens = varyHeader.split(',').map((t) => t.trim().toLowerCase());
  return tokens.includes('user-agent') ? 'Present' : 'Absent';
}
