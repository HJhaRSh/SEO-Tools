import { DisplayUrlResult } from './types';

/**
 * Normalizes user-entered URL strings safely without throwing uncaught exceptions.
 */
export function normalizeUrl(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Parses user URL string into Google SERP display elements:
 * e.g. hostname + breadcrumb segments (example.com › blog › google-serp-guide)
 */
export function parseDisplayUrl(input: string): DisplayUrlResult {
  const raw = (input || '').trim();
  if (!raw) {
    return {
      raw: '',
      normalized: '',
      hostname: 'example.com',
      origin: 'https://example.com',
      pathname: '/',
      breadcrumbSegments: [],
      formattedDisplay: 'example.com',
      isValid: false,
    };
  }

  const normalized = normalizeUrl(raw);

  try {
    const parsed = new URL(normalized);
    let hostname = parsed.hostname.toLowerCase();
    
    // Clean www. for clean SERP appearance
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }

    // Split pathname into clean segments, decoding %20 safely
    const pathParts = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map(part => {
        try {
          return decodeURIComponent(part);
        } catch {
          // If malformed URI sequence, return raw part safely
          return part;
        }
      })
      .map(part => part.replace(/[-_]/g, ' '));

    const breadcrumbs = [hostname, ...pathParts];
    const formattedDisplay = breadcrumbs.join(' › ');

    return {
      raw,
      normalized,
      hostname,
      origin: parsed.origin,
      pathname: parsed.pathname,
      breadcrumbSegments: pathParts,
      formattedDisplay,
      isValid: true,
    };
  } catch {
    // If URL parsing fails, format gracefully
    const cleanedRaw = raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '');
    
    const parts = cleanedRaw.split('/').filter(Boolean);
    const formattedDisplay = parts.length > 0 ? parts.join(' › ') : (cleanedRaw || 'example.com');

    return {
      raw,
      normalized,
      hostname: parts[0] || 'example.com',
      origin: 'https://example.com',
      pathname: '/',
      breadcrumbSegments: parts.slice(1),
      formattedDisplay,
      isValid: false,
    };
  }
}
