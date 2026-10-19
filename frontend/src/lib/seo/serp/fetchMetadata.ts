import dns from 'dns';
import { promisify } from 'util';
import { safeFetch } from '../hreflang/safeFetch';

const lookupAsync = promisify(dns.lookup);

/**
 * Checks if an IPv4 string belongs to private, loopback, link-local, or broadcast ranges.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP treated as unsafe
  }

  const [a, b] = parts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private network: 172.16 - 172.31)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local / AWS metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (Multicast)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 string belongs to loopback, unique local, or link-local ranges.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // Unique local addresses (fc00::/7) -> fc or fd
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // Link-local unicast (fe80::/10) -> fe8, fe9, fea, feb
  if (/^fe[89ab]/i.test(normalized)) return true;
  // IPv4-mapped IPv6 ::ffff:127.0.0.1
  if (normalized.startsWith('::ffff:')) {
    const ipv4 = normalized.replace('::ffff:', '');
    return isPrivateIPv4(ipv4);
  }
  return false;
}

/**
 * Validates a target URL against SSRF threats.
 * Throws an Error with a user-friendly message if the URL is dangerous or disallowed.
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Please enter a URL to fetch.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('The provided URL is invalid.');
  }

  // Only allow http and https protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block obvious localhost and local hostnames
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    throw new Error('Requests to localhost or internal network resources are blocked for security.');
  }

  // Direct IP checks
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new Error('Requests to private or reserved IP addresses are blocked for security.');
    }
  }

  if (hostname.includes(':')) {
    // IPv6 literal [::1]
    const cleanIpv6 = hostname.replace(/^\[|\]$/g, '');
    if (isPrivateIPv6(cleanIpv6)) {
      throw new Error('Requests to private or loopback IPv6 addresses are blocked for security.');
    }
  }

  // DNS lookup check to prevent DNS rebinding to internal addresses
  try {
    const lookupResult = await lookupAsync(hostname, { all: true });
    for (const entry of lookupResult) {
      if (entry.family === 4 && isPrivateIPv4(entry.address)) {
        throw new Error('The domain resolves to a private or restricted IP address.');
      }
      if (entry.family === 6 && isPrivateIPv6(entry.address)) {
        throw new Error('The domain resolves to a private or restricted IPv6 address.');
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('resolves to a private')) {
      throw err;
    }
    throw new Error(`Unable to resolve domain "${hostname}". Please check that the URL is accessible.`);
  }

  return parsed;
}

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
