import { parse } from 'tldts';
import { isIP } from 'net';
import { isPrivateOrReservedIP } from './ssrf';

export interface NormalizedDomainResult {
  isValid: boolean;
  rawInput: string;
  registrableDomain: string | null;
  tld: string | null;
  asciiDomain: string | null;
  error?: string;
}

const DISALLOWED_SCHEMES = ['ftp:', 'javascript:', 'file:', 'data:', 'mailto:', 'ws:', 'wss:', 'ssh:', 'tel:'];
const INTERNAL_SUFFIXES = ['.local', '.internal', '.corp', '.lan', '.home', '.arpa', '.test', '.example', '.invalid'];

/**
 * Normalizes and validates user domain/URL input into an authoritative registrable domain.
 */
export function normalizeDomainInput(raw: string): NormalizedDomainResult {
  const trimmed = (raw || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      rawInput: raw,
      registrableDomain: null,
      tld: null,
      asciiDomain: null,
      error: 'Please enter a valid public domain name or website URL.'
    };
  }

  // Reject URLs with embedded credentials (e.g., http://user:pass@google.com)
  if (/@/.test(trimmed)) {
    return {
      isValid: false,
      rawInput: raw,
      registrableDomain: null,
      tld: null,
      asciiDomain: null,
      error: 'URLs with embedded user credentials are not supported.'
    };
  }

  // Check scheme if provided
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase() + ':';
    if (DISALLOWED_SCHEMES.includes(scheme) || (scheme !== 'http:' && scheme !== 'https:')) {
      return {
        isValid: false,
        rawInput: raw,
        registrableDomain: null,
        tld: null,
        asciiDomain: null,
        error: 'Please enter a valid public domain name or website URL.'
      };
    }
  }

  // Use tldts to parse domain and public suffix
  const parsed = parse(trimmed, { allowIcannDomains: true, allowPrivateDomains: false });

  // Direct IP address check
  const cleanHost = (parsed.hostname || trimmed).split('/')[0].split(':')[0].replace(/^\[|\]$/g, '').toLowerCase();
  if (parsed.isIp || isIP(cleanHost) !== 0) {
    return {
      isValid: false,
      rawInput: raw,
      registrableDomain: null,
      tld: null,
      asciiDomain: null,
      error: 'Please enter a valid public domain name or website URL.'
    };
  }

  // Check for internal/reserved domain suffixes (e.g. host.local, host.internal)
  for (const suffix of INTERNAL_SUFFIXES) {
    if (cleanHost.endsWith(suffix) || cleanHost === suffix.slice(1)) {
      return {
        isValid: false,
        rawInput: raw,
        registrableDomain: null,
        tld: null,
        asciiDomain: null,
        error: 'Please enter a valid public domain name or website URL.'
      };
    }
  }

  // Reject localhost and single label hosts
  if (cleanHost === 'localhost' || !cleanHost.includes('.')) {
    return {
      isValid: false,
      rawInput: raw,
      registrableDomain: null,
      tld: null,
      asciiDomain: null,
      error: 'Please enter a valid public domain name or website URL.'
    };
  }

  // Validate registrable domain
  const registrable = parsed.domain;
  if (!registrable || !parsed.publicSuffix || registrable === parsed.publicSuffix) {
    return {
      isValid: false,
      rawInput: raw,
      registrableDomain: null,
      tld: null,
      asciiDomain: null,
      error: 'Please enter a valid public domain name or website URL.'
    };
  }

  // Basic RFC 1035 / 1123 label syntax check
  const labels = registrable.split('.');
  if (labels.length < 2) {
    return {
      isValid: false,
      rawInput: raw,
      registrableDomain: null,
      tld: null,
      asciiDomain: null,
      error: 'Please enter a valid public domain name or website URL.'
    };
  }

  for (const label of labels) {
    if (!label || label.length > 63 || label.startsWith('-') || label.endsWith('-')) {
      return {
        isValid: false,
        rawInput: raw,
        registrableDomain: null,
        tld: null,
        asciiDomain: null,
        error: 'Please enter a valid public domain name or website URL.'
      };
    }
  }

  // Total domain length check (max 253 characters)
  if (registrable.length > 253) {
    return {
      isValid: false,
      rawInput: raw,
      registrableDomain: null,
      tld: null,
      asciiDomain: null,
      error: 'Domain name exceeds maximum permitted length (253 characters).'
    };
  }

  // Convert to IDNA ASCII form if internationalized
  let asciiDomain = registrable.toLowerCase();
  try {
    const urlObj = new URL(`http://${registrable}`);
    asciiDomain = urlObj.hostname.toLowerCase();
  } catch {
    // Keep as is if URL constructor fails
  }

  return {
    isValid: true,
    rawInput: raw,
    registrableDomain: registrable.toLowerCase(),
    tld: (parsed.publicSuffix || '').toLowerCase(),
    asciiDomain,
  };
}

/**
 * Deduplicates multiple domain inputs while preserving original order and tracking duplicates.
 */
export function normalizeAndDeduplicateDomains(inputs: string[]): {
  normalized: NormalizedDomainResult[];
  uniqueDomains: string[];
} {
  const normalized: NormalizedDomainResult[] = [];
  const seen = new Set<string>();
  const uniqueDomains: string[] = [];

  for (const raw of inputs) {
    const norm = normalizeDomainInput(raw);
    normalized.push(norm);

    if (norm.isValid && norm.registrableDomain) {
      if (!seen.has(norm.registrableDomain)) {
        seen.add(norm.registrableDomain);
        uniqueDomains.push(norm.registrableDomain);
      }
    }
  }

  return { normalized, uniqueDomains };
}
