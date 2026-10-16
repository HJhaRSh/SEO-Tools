/**
 * Google UULE & Local Search URL Utility
 * 
 * Supports standard Google Canonical Name format for UULE:
 * Prefix: "w+CAIQICI"
 * Length Key: One character from secret key table representing length of the canonical place string
 * Base64: Standard Base64 encoded canonical location string
 * Format: "w+CAIQICI" + SECRET_KEY[canonicalLocation.length] + base64(canonicalLocation)
 * 
 * Google's canonical locations are usually:
 * "City,Region,Country" or "City,State,Country" e.g., "Mumbai,Maharashtra,India" or "San Francisco,California,United States"
 */

export const UULE_SECRET_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const UULE_CANONICAL_PREFIX = 'w+CAIQICI';

export interface LocalSearchOptions {
  query: string;
  location?: string;
  countryCode?: string;      // gl parameter (e.g. 'in', 'us', 'gb')
  languageCode?: string;     // hl parameter (e.g. 'en', 'hi', 'gu')
  reducePersonalization?: boolean; // pws=0
}

export interface LocalSearchResult {
  searchQuery: string;
  searchLocation: string;
  countryCode: string;
  languageCode: string;
  reducePersonalization: boolean;
  uule: string | null;
  uuleStatus: 'encoded' | 'empty' | 'fallback_length_exceeded';
  googleSearchUrl: string;
  googleMapsUrl: string;
  mapsQuery: string;
  warning?: string;
}

/**
 * Standard location suggestions for quick 1-click selection across major regions (India, US, UK, Global)
 */
export interface CuratedLocation {
  name: string;
  countryCode: string;
  languageCode: string;
}

export const CURATED_LOCATIONS: CuratedLocation[] = [
  { name: 'Mumbai, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Andheri West, Mumbai, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Bengaluru, Karnataka, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Delhi, Delhi, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Hyderabad, Telangana, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Pune, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Chennai, Tamil Nadu, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Ahmedabad, Gujarat, India', countryCode: 'in', languageCode: 'gu' },
  { name: 'New York, NY, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'San Francisco, California, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Chicago, Illinois, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'London, England, United Kingdom', countryCode: 'gb', languageCode: 'en' },
  { name: 'Manchester, England, United Kingdom', countryCode: 'gb', languageCode: 'en' },
  { name: 'Sydney, New South Wales, Australia', countryCode: 'au', languageCode: 'en' },
  { name: 'Toronto, Ontario, Canada', countryCode: 'ca', languageCode: 'en' },
  { name: 'Dubai, Dubai, United Arab Emirates', countryCode: 'ae', languageCode: 'en' },
  { name: 'Singapore, Singapore', countryCode: 'sg', languageCode: 'en' },
];

/**
 * Common popular country selections with gl code and primary language
 */
export const POPULAR_COUNTRIES = [
  { code: 'in', name: 'India (in)', defaultLang: 'en' },
  { code: 'us', name: 'United States (us)', defaultLang: 'en' },
  { code: 'gb', name: 'United Kingdom (gb)', defaultLang: 'en' },
  { code: 'au', name: 'Australia (au)', defaultLang: 'en' },
  { code: 'ca', name: 'Canada (ca)', defaultLang: 'en' },
  { code: 'ae', name: 'United Arab Emirates (ae)', defaultLang: 'en' },
  { code: 'sg', name: 'Singapore (sg)', defaultLang: 'en' },
  { code: 'de', name: 'Germany (de)', defaultLang: 'de' },
  { code: 'fr', name: 'France (fr)', defaultLang: 'fr' },
  { code: 'es', name: 'Spain (es)', defaultLang: 'es' },
  { code: 'it', name: 'Italy (it)', defaultLang: 'it' },
  { code: 'br', name: 'Brazil (br)', defaultLang: 'pt' },
  { code: 'jp', name: 'Japan (jp)', defaultLang: 'ja' },
];

/**
 * Common language selections for interface testing
 */
export const POPULAR_LANGUAGES = [
  { code: 'en', name: 'English (en)' },
  { code: 'hi', name: 'Hindi (hi)' },
  { code: 'gu', name: 'Gujarati (gu)' },
  { code: 'mr', name: 'Marathi (mr)' },
  { code: 'bn', name: 'Bengali (bn)' },
  { code: 'ta', name: 'Tamil (ta)' },
  { code: 'te', name: 'Telugu (te)' },
  { code: 'es', name: 'Spanish (es)' },
  { code: 'fr', name: 'French (fr)' },
  { code: 'de', name: 'German (de)' },
  { code: 'ar', name: 'Arabic (ar)' },
  { code: 'ja', name: 'Japanese (ja)' },
];

/**
 * Sanitize text input: strip non-printable characters, collapse excessive whitespace, enforce length limit
 */
export function sanitizeSearchInput(input: unknown, maxLength: number = 300): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

/**
 * Clean & normalize country code (ISO 3166-1 alpha-2, lowercase)
 */
export function normalizeCountryCode(code?: string): string {
  if (!code) return '';
  const clean = code.trim().toLowerCase();
  return /^[a-z]{2}$/.test(clean) ? clean : '';
}

/**
 * Clean & normalize language code (ISO 639-1 or standard locale)
 */
export function normalizeLanguageCode(code?: string): string {
  if (!code) return '';
  const clean = code.trim().toLowerCase();
  return /^[a-z]{2}(-[a-z0-9]+)?$/.test(clean) ? clean : '';
}

/**
 * Helper to encode UTF-8 string to Base64 in isomorphic environment (browser & Node)
 */
export function encodeUtf8ToBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  // Browser fallback for full Unicode support
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Encodes a location name into Google's UULE parameter.
 * Returns null if location is empty or exceeds the 64-char key index table.
 */
export function encodeUule(canonicalLocation: string): { uule: string | null; warning?: string } {
  const clean = sanitizeSearchInput(canonicalLocation, 200);
  if (!clean) {
    return { uule: null };
  }

  // UULE canonical string length must fit in the secret key index (0 to 63)
  const len = clean.length;
  if (len >= UULE_SECRET_KEY.length) {
    return {
      uule: null,
      warning: `Location "${clean}" is ${len} characters long, which exceeds Google's standard canonical UULE length limit of ${UULE_SECRET_KEY.length - 1} characters. Location parameter will rely on query context instead of UULE.`
    };
  }

  const lengthKey = UULE_SECRET_KEY[len];
  const base64Location = encodeUtf8ToBase64(clean);
  const uule = `${UULE_CANONICAL_PREFIX}${lengthKey}${base64Location}`;

  return { uule };
}

/**
 * Build Google Search URL safely using the WHATWG URL and URLSearchParams APIs
 */
export function buildGoogleSearchUrl(options: {
  query: string;
  countryCode?: string;
  languageCode?: string;
  reducePersonalization?: boolean;
  uule?: string | null;
}): string {
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', options.query);

  if (options.countryCode) {
    url.searchParams.set('gl', options.countryCode);
  }
  if (options.languageCode) {
    url.searchParams.set('hl', options.languageCode);
  }
  if (options.reducePersonalization) {
    url.searchParams.set('pws', '0');
  }
  if (options.uule) {
    url.searchParams.set('uule', options.uule);
  }

  return url.toString();
}

/**
 * Build Google Maps public search URL safely using the WHATWG URL API
 * Public URL format: https://www.google.com/maps/search/?api=1&query=...
 */
export function buildGoogleMapsSearchUrl(query: string, location?: string): { url: string; mapsQuery: string } {
  const mapsQueryParts = [query.trim()];
  if (location && location.trim()) {
    // Only append location if query does not already contain it
    const locLower = location.trim().toLowerCase();
    const queryLower = query.toLowerCase();
    if (!queryLower.includes(locLower)) {
      mapsQueryParts.push(location.trim());
    }
  }
  const mapsQuery = mapsQueryParts.filter(Boolean).join(', ');

  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', mapsQuery);

  return { url: url.toString(), mapsQuery };
}

/**
 * Comprehensive generation and validation for Local Search
 */
export function generateLocalSearchResults(options: LocalSearchOptions): LocalSearchResult {
  const sanitizedQuery = sanitizeSearchInput(options.query, 300);
  if (!sanitizedQuery) {
    throw new Error('Search query is required.');
  }

  const sanitizedLocation = sanitizeSearchInput(options.location, 200);
  const countryCode = normalizeCountryCode(options.countryCode);
  const languageCode = normalizeLanguageCode(options.languageCode);
  const reducePersonalization = Boolean(options.reducePersonalization);

  let uule: string | null = null;
  let uuleStatus: 'encoded' | 'empty' | 'fallback_length_exceeded' = 'empty';
  let warning: string | undefined = undefined;

  if (sanitizedLocation) {
    const encoded = encodeUule(sanitizedLocation);
    if (encoded.uule) {
      uule = encoded.uule;
      uuleStatus = 'encoded';
    } else {
      uuleStatus = 'fallback_length_exceeded';
      warning = encoded.warning;
    }
  }

  const googleSearchUrl = buildGoogleSearchUrl({
    query: sanitizedQuery,
    countryCode: countryCode || undefined,
    languageCode: languageCode || undefined,
    reducePersonalization,
    uule
  });

  const mapsResult = buildGoogleMapsSearchUrl(sanitizedQuery, sanitizedLocation);

  return {
    searchQuery: sanitizedQuery,
    searchLocation: sanitizedLocation,
    countryCode,
    languageCode,
    reducePersonalization,
    uule,
    uuleStatus,
    googleSearchUrl,
    googleMapsUrl: mapsResult.url,
    mapsQuery: mapsResult.mapsQuery,
    warning
  };
}
