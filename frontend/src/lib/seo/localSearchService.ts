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
  googleSearchEmbedUrl: string;
  googleMapsUrl: string;
  googleMapsEmbedUrl: string;
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
  // India - Maharashtra
  { name: 'Mumbai, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Pune, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Nagpur, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Thane, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Nashik, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Aurangabad, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Navi Mumbai, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Solapur, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Kolhapur, Maharashtra, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Ahmednagar, Maharashtra, India', countryCode: 'in', languageCode: 'en' },

  // India - NCR & North
  { name: 'Delhi, Delhi, India', countryCode: 'in', languageCode: 'en' },
  { name: 'New Delhi, Delhi, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Noida, Uttar Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Gurgaon, Haryana, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Faridabad, Haryana, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Ghaziabad, Uttar Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Chandigarh, Chandigarh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Jaipur, Rajasthan, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Jodhpur, Rajasthan, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Udaipur, Rajasthan, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Kota, Rajasthan, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Lucknow, Uttar Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Kanpur, Uttar Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Varanasi, Uttar Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Agra, Uttar Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Prayagraj, Uttar Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Ludhiana, Punjab, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Amritsar, Punjab, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Jalandhar, Punjab, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Dehradun, Uttarakhand, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Shimla, Himachal Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Jammu, Jammu and Kashmir, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Srinagar, Jammu and Kashmir, India', countryCode: 'in', languageCode: 'en' },

  // India - South
  { name: 'Bengaluru, Karnataka, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Mysore, Karnataka, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Mangalore, Karnataka, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Hubli, Karnataka, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Hyderabad, Telangana, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Warangal, Telangana, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Chennai, Tamil Nadu, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Coimbatore, Tamil Nadu, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Madurai, Tamil Nadu, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Tiruchirappalli, Tamil Nadu, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Salem, Tamil Nadu, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Kochi, Kerala, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Thiruvananthapuram, Kerala, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Kozhikode, Kerala, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Visakhapatnam, Andhra Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Vijayawada, Andhra Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Guntur, Andhra Pradesh, India', countryCode: 'in', languageCode: 'en' },

  // India - West & Central
  { name: 'Ahmedabad, Gujarat, India', countryCode: 'in', languageCode: 'gu' },
  { name: 'Surat, Gujarat, India', countryCode: 'in', languageCode: 'gu' },
  { name: 'Vadodara, Gujarat, India', countryCode: 'in', languageCode: 'gu' },
  { name: 'Rajkot, Gujarat, India', countryCode: 'in', languageCode: 'gu' },
  { name: 'Indore, Madhya Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Bhopal, Madhya Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Gwalior, Madhya Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Jabalpur, Madhya Pradesh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Raipur, Chhattisgarh, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Panaji, Goa, India', countryCode: 'in', languageCode: 'en' },

  // India - East & Northeast
  { name: 'Kolkata, West Bengal, India', countryCode: 'in', languageCode: 'bn' },
  { name: 'Howrah, West Bengal, India', countryCode: 'in', languageCode: 'bn' },
  { name: 'Siliguri, West Bengal, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Patna, Bihar, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Gaya, Bihar, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Ranchi, Jharkhand, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Jamshedpur, Jharkhand, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Bhubaneswar, Odisha, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Cuttack, Odisha, India', countryCode: 'in', languageCode: 'en' },
  { name: 'Guwahati, Assam, India', countryCode: 'in', languageCode: 'en' },

  // United States
  { name: 'New York, NY, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Los Angeles, California, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Chicago, Illinois, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Houston, Texas, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'San Francisco, California, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Seattle, Washington, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Austin, Texas, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Miami, Florida, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Boston, Massachusetts, United States', countryCode: 'us', languageCode: 'en' },
  { name: 'Dallas, Texas, United States', countryCode: 'us', languageCode: 'en' },

  // United Kingdom
  { name: 'London, England, United Kingdom', countryCode: 'gb', languageCode: 'en' },
  { name: 'Manchester, England, United Kingdom', countryCode: 'gb', languageCode: 'en' },
  { name: 'Birmingham, England, United Kingdom', countryCode: 'gb', languageCode: 'en' },
  { name: 'Edinburgh, Scotland, United Kingdom', countryCode: 'gb', languageCode: 'en' },
  { name: 'Glasgow, Scotland, United Kingdom', countryCode: 'gb', languageCode: 'en' },
  { name: 'Leeds, England, United Kingdom', countryCode: 'gb', languageCode: 'en' },

  // Canada
  { name: 'Toronto, Ontario, Canada', countryCode: 'ca', languageCode: 'en' },
  { name: 'Vancouver, British Columbia, Canada', countryCode: 'ca', languageCode: 'en' },
  { name: 'Montreal, Quebec, Canada', countryCode: 'ca', languageCode: 'en' },
  { name: 'Calgary, Alberta, Canada', countryCode: 'ca', languageCode: 'en' },

  // Australia & New Zealand
  { name: 'Sydney, New South Wales, Australia', countryCode: 'au', languageCode: 'en' },
  { name: 'Melbourne, Victoria, Australia', countryCode: 'au', languageCode: 'en' },
  { name: 'Brisbane, Queensland, Australia', countryCode: 'au', languageCode: 'en' },
  { name: 'Perth, Western Australia, Australia', countryCode: 'au', languageCode: 'en' },
  { name: 'Auckland, Auckland, New Zealand', countryCode: 'nz', languageCode: 'en' },

  // Middle East & Asia
  { name: 'Dubai, Dubai, United Arab Emirates', countryCode: 'ae', languageCode: 'en' },
  { name: 'Abu Dhabi, Abu Dhabi, United Arab Emirates', countryCode: 'ae', languageCode: 'en' },
  { name: 'Singapore, Singapore', countryCode: 'sg', languageCode: 'en' },
  { name: 'Tokyo, Tokyo, Japan', countryCode: 'jp', languageCode: 'ja' },
  { name: 'Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia', countryCode: 'my', languageCode: 'en' },
  { name: 'Bangkok, Bangkok, Thailand', countryCode: 'th', languageCode: 'en' },

  // Europe
  { name: 'Berlin, Berlin, Germany', countryCode: 'de', languageCode: 'de' },
  { name: 'Munich, Bavaria, Germany', countryCode: 'de', languageCode: 'de' },
  { name: 'Frankfurt, Hesse, Germany', countryCode: 'de', languageCode: 'de' },
  { name: 'Paris, Île-de-France, France', countryCode: 'fr', languageCode: 'fr' },
  { name: 'Madrid, Community of Madrid, Spain', countryCode: 'es', languageCode: 'es' },
  { name: 'Barcelona, Catalonia, Spain', countryCode: 'es', languageCode: 'es' },
  { name: 'Rome, Lazio, Italy', countryCode: 'it', languageCode: 'it' },
  { name: 'Milan, Lombardy, Italy', countryCode: 'it', languageCode: 'it' },
  { name: 'Amsterdam, North Holland, Netherlands', countryCode: 'nl', languageCode: 'en' },
  { name: 'Dublin, County Dublin, Ireland', countryCode: 'ie', languageCode: 'en' }
];

/**
 * Filter curated locations based on user input for real-time autocomplete
 */
export function filterCuratedLocations(query: string, maxResults: number = 8): CuratedLocation[] {
  const clean = query.trim().toLowerCase();
  if (!clean) {
    return CURATED_LOCATIONS.slice(0, maxResults);
  }
  return CURATED_LOCATIONS.filter((loc) => {
    return loc.name.toLowerCase().includes(clean);
  }).slice(0, maxResults);
}

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
  adtest?: boolean;
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
    // Decouple user's physical IP address so Google prioritizes the UULE target location
    url.searchParams.set('ip', '0.0.0.0');
    url.searchParams.set('source_ip', '0.0.0.0');
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

  // Embed URL with igu=1 and adtest=off (matching TechnicalSEO reference) to permit iframe rendering and suppress physical IP override
  const googleSearchEmbedUrl = buildGoogleSearchUrl({
    query: sanitizedQuery,
    countryCode: countryCode || undefined,
    languageCode: languageCode || undefined,
    reducePersonalization,
    uule
  }) + '&igu=1&adtest=off';

  const mapsResult = buildGoogleMapsSearchUrl(sanitizedQuery, sanitizedLocation);
  const googleMapsEmbedUrl = `https://www.google.com/maps?output=embed&q=${encodeURIComponent(mapsResult.mapsQuery)}`;

  return {
    searchQuery: sanitizedQuery,
    searchLocation: sanitizedLocation,
    countryCode,
    languageCode,
    reducePersonalization,
    uule,
    uuleStatus,
    googleSearchUrl,
    googleSearchEmbedUrl,
    googleMapsUrl: mapsResult.url,
    googleMapsEmbedUrl,
    mapsQuery: mapsResult.mapsQuery,
    warning
  };
}
