import { safeFetch } from '../hreflang/safeFetch';

export interface ExtractedMetadata {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  description: string;
  canonical: string | null;
  siteName: string | null;
  favicon: string | null;
  status: number;
}

/**
 * Decodes standard HTML entities without external libraries.
 */
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _;
      }
    });
}

/**
 * Clean, decode entities, and collapse duplicate whitespace.
 */
function cleanText(str: string | null | undefined): string {
  if (!str) return '';
  const decoded = decodeHtmlEntities(str);
  return decoded.replace(/\s+/g, ' ').trim();
}

/**
 * Safely extracts tag text and attribute values without external dependencies.
 */
function extractHtmlTagContent(html: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = html.match(regex);
  return match ? match[1] : null;
}

function extractMetaContent(html: string, attrName: string, attrValue: string): string | null {
  const regex = new RegExp(`<meta[^>]*${attrName}=["']${attrValue}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];

  // Try reverse order: content="..." attrName="..."
  const reverseRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attrName}=["']${attrValue}["']`, 'i');
  const reverseMatch = html.match(reverseRegex);
  return reverseMatch ? reverseMatch[1] : null;
}

function extractLinkHref(html: string, relValue: string): string | null {
  const regex = new RegExp(`<link[^>]*rel=["'][^"']*${relValue}[^"']*["'][^>]*href=["']([^"']*)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];

  const reverseRegex = new RegExp(`<link[^>]*href=["']([^"']*)["'][^>]*rel=["'][^"']*${relValue}[^"']*["']`, 'i');
  const reverseMatch = html.match(reverseRegex);
  return reverseMatch ? reverseMatch[1] : null;
}

/**
 * Fetches HTML from a validated URL with SSRF checks, timeout, and response size capping.
 */
export async function fetchPageMetadata(targetUrl: string): Promise<ExtractedMetadata> {
  const fetchResult = await safeFetch(targetUrl, {
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    timeoutMs: 9000,
    maxBytes: 1.5 * 1024 * 1024,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });

  const contentType = fetchResult.headers.get('content-type') || '';
  if (
    !contentType.includes('text/html') &&
    !contentType.includes('application/xhtml+xml') &&
    !contentType.includes('text/plain')
  ) {
    throw new Error(`The URL returned an unsupported content type (${contentType.split(';')[0] || 'binary'}). Only HTML pages can be inspected.`);
  }

  const html = fetchResult.body;

    // Title extraction with priority: <title> then og:title then twitter:title
    let title = cleanText(extractHtmlTagContent(html, 'title'));
    if (!title) {
      title = cleanText(extractMetaContent(html, 'property', 'og:title') || extractMetaContent(html, 'name', 'og:title'));
    }
    if (!title) {
      title = cleanText(extractMetaContent(html, 'name', 'twitter:title') || extractMetaContent(html, 'property', 'twitter:title'));
    }

    // Description extraction with priority: meta[name="description"] then og:description then twitter:description
    let description = cleanText(extractMetaContent(html, 'name', 'description') || extractMetaContent(html, 'property', 'description'));
    if (!description) {
      description = cleanText(extractMetaContent(html, 'property', 'og:description') || extractMetaContent(html, 'name', 'og:description'));
    }
    if (!description) {
      description = cleanText(extractMetaContent(html, 'name', 'twitter:description') || extractMetaContent(html, 'property', 'twitter:description'));
    }

    // Canonical link
    const canonical = cleanText(extractLinkHref(html, 'canonical')) || null;

    // Site Name
    const siteName = cleanText(extractMetaContent(html, 'property', 'og:site_name') || extractMetaContent(html, 'name', 'og:site_name')) || null;

    // Favicon link
    let favicon: string | null = null;
    const faviconHref = extractLinkHref(html, 'icon') || extractLinkHref(html, 'shortcut icon') || extractLinkHref(html, 'apple-touch-icon');
    if (faviconHref) {
      try {
        favicon = new URL(faviconHref, fetchResult.finalUrl).toString();
      } catch {
        favicon = null;
      }
    }

    return {
      requestedUrl: targetUrl,
      finalUrl: fetchResult.finalUrl,
      title,
      description,
      canonical,
      siteName,
      favicon,
      status: fetchResult.status,
    };
}
