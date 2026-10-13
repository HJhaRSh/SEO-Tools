/**
 * Google Review Link Generator — Core Service (Zero-Cost / No-API Architecture)
 * Tool 6: Google Review Link Generator
 *
 * Implements:
 * - Direct Place ID validation & syntactic write-review link construction:
 *   https://search.google.com/local/writereview?placeid=PLACE_ID
 * - Direct Google Review URL validation & sanitization (search.google.com, g.page, maps.app.goo.gl, etc.)
 * - Extraction of Place ID from pasted review URLs if present (?placeid=...)
 * - Instant offline bulk processing of spreadsheets containing Place IDs or Review URLs
 * - Zero Google Cloud billing, zero external API keys, zero SSRF/scraping
 * - Full CSV formula-injection protection and UTF-8 BOM export
 */

import {
  GenerateLinkResponse,
  BulkInputRow,
  BulkProcessedRow,
  BulkBatchResponse
} from './reviewLinkTypes';

export const PLACE_ID_REGEX = /^[A-Za-z0-9_\-]{15,120}$/;
export const MAX_TEXT_LENGTH = 500;

/**
 * Sanitize user input strings: trim, strip control characters, limit length
 */
export function sanitizeInput(input: unknown, maxLength: number = MAX_TEXT_LENGTH): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Validate Google Place ID format
 */
export function isValidPlaceId(placeId: unknown): boolean {
  if (typeof placeId !== 'string') return false;
  return PLACE_ID_REGEX.test(placeId.trim());
}

/**
 * Construct Google Review URL using official Place ID syntax
 */
export function buildPlaceIdReviewUrl(placeId: string): string {
  const cleanId = encodeURIComponent(placeId.trim());
  return `https://search.google.com/local/writereview?placeid=${cleanId}`;
}

/**
 * Validate if a string is a plausible Google Review URL
 */
export function isValidGoogleReviewUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    return (
      (host.endsWith('google.com') && (parsed.pathname.includes('writereview') || parsed.pathname.includes('/maps'))) ||
      host === 'g.page' ||
      host === 'maps.app.goo.gl' ||
      host.endsWith('.google.com')
    );
  } catch {
    return false;
  }
}

/**
 * Try to extract Place ID from a Google URL if present
 */
export function extractPlaceIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const placeIdParam = parsed.searchParams.get('placeid') || parsed.searchParams.get('place_id');
    if (placeIdParam && isValidPlaceId(placeIdParam)) {
      return placeIdParam;
    }
  } catch {
    // not a valid URL or no param
  }
  return null;
}

/**
 * Build Google Maps search URL to open business search in new tab
 */
export function buildGoogleMapsSearchUrl(businessName: string, location?: string): string {
  const query = [businessName.trim(), location?.trim()].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Sanitize strings for CSV to prevent CSV formula injection attacks (=, +, -, @, \t, \r)
 */
export function sanitizeCsvField(field: unknown): string {
  if (field === null || field === undefined) return '';
  let str = String(field).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return str;
}

/**
 * Execute Generate Link from Place ID or Pasted Review URL
 */
export function executeGenerateLink(
  placeIdRaw?: unknown,
  reviewUrlRaw?: unknown,
  businessNameRaw?: unknown,
  locationRaw?: unknown
): GenerateLinkResponse {
  const placeId = sanitizeInput(placeIdRaw, 120);
  const reviewUrl = sanitizeInput(reviewUrlRaw, 500);
  const businessName = sanitizeInput(businessNameRaw);
  const location = sanitizeInput(locationRaw);

  // Mode 1: Direct Review URL pasted
  if (reviewUrl) {
    if (!isValidGoogleReviewUrl(reviewUrl)) {
      return {
        success: false,
        reviewUrl,
        source: 'PASTED_REVIEW_URL',
        error: 'Please provide a valid Google review link (e.g. https://search.google.com/local/writereview?placeid=... or https://g.page/r/...).',
        code: 'INVALID_REVIEW_URL'
      };
    }

    const extractedPlaceId = placeId || extractPlaceIdFromUrl(reviewUrl) || undefined;

    return {
      success: true,
      placeId: extractedPlaceId,
      businessName: businessName || undefined,
      location: location || undefined,
      reviewUrl,
      source: 'PASTED_REVIEW_URL'
    };
  }

  // Mode 2: Place ID provided
  if (placeId) {
    if (!isValidPlaceId(placeId)) {
      return {
        success: false,
        placeId,
        reviewUrl: '',
        source: 'PLACE_ID_SYNTACTIC',
        error: 'Invalid Google Place ID format. Place IDs are alphanumeric strings (15-120 characters).',
        code: 'INVALID_PLACE_ID'
      };
    }

    const constructedUrl = buildPlaceIdReviewUrl(placeId);
    return {
      success: true,
      placeId,
      businessName: businessName || undefined,
      location: location || undefined,
      reviewUrl: constructedUrl,
      source: 'PLACE_ID_SYNTACTIC'
    };
  }

  // Mode 3: Business Name provided (Zero-API automatic search-to-review query)
  if (businessName) {
    const fullQuery = [businessName, location].filter(Boolean).join(' ');
    // Google Maps direct place search query that brings up the business profile with direct review prompt
    const reviewSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullQuery)}`;

    return {
      success: true,
      businessName,
      location: location || undefined,
      reviewUrl: reviewSearchUrl,
      source: 'BUSINESS_NAME_SEARCH' as any,
      warning: 'Generated via Business Name & Location search link. For direct 5-star popup modal, you can optionally provide the Google Place ID.'
    };
  }

  return {
    success: false,
    reviewUrl: '',
    source: 'PLACE_ID_SYNTACTIC',
    error: 'Please enter a Business Name, Google Place ID, or paste an existing Google review link.',
    code: 'MISSING_INPUT'
  };
}

/**
 * Process a batch of spreadsheet rows offline (Zero-Cost / No API)
 */
export function executeBulkBatch(rows: BulkInputRow[]): BulkBatchResponse {
  if (!Array.isArray(rows)) {
    return {
      success: false,
      totalRows: 0,
      matchedCount: 0,
      invalidCount: 0,
      results: [],
      error: 'Invalid batch rows payload. Expected an array.'
    };
  }

  let matchedCount = 0;
  let invalidCount = 0;
  const results: BulkProcessedRow[] = [];

  for (const row of rows) {
    const cleanName = sanitizeInput(row.businessName);
    const cleanLocation = sanitizeInput(row.location || row.city);
    const cleanPlaceId = sanitizeInput(row.placeId);
    const cleanReviewUrl = sanitizeInput(row.reviewUrl);

    // Case 1: Place ID provided
    if (cleanPlaceId && isValidPlaceId(cleanPlaceId)) {
      const generatedUrl = buildPlaceIdReviewUrl(cleanPlaceId);
      matchedCount++;
      results.push({
        rowIndex: row.rowIndex,
        inputBusinessName: cleanName,
        inputLocation: cleanLocation,
        inputPlaceId: cleanPlaceId,
        inputReviewUrl: cleanReviewUrl || undefined,
        googlePlaceId: cleanPlaceId,
        googleReviewUrl: generatedUrl,
        status: 'MATCHED',
        statusNote: 'Generated from valid Place ID',
        source: 'PLACE_ID_SYNTACTIC'
      });
      continue;
    }

    // Case 2: Direct Review URL provided
    if (cleanReviewUrl && isValidGoogleReviewUrl(cleanReviewUrl)) {
      const extractedPlaceId = extractPlaceIdFromUrl(cleanReviewUrl) || cleanPlaceId || undefined;
      matchedCount++;
      results.push({
        rowIndex: row.rowIndex,
        inputBusinessName: cleanName,
        inputLocation: cleanLocation,
        inputPlaceId: extractedPlaceId,
        inputReviewUrl: cleanReviewUrl,
        googlePlaceId: extractedPlaceId,
        googleReviewUrl: cleanReviewUrl,
        status: 'MATCHED',
        statusNote: 'Verified Google review URL',
        source: 'PASTED_REVIEW_URL'
      });
      continue;
    }

    // Case 3: Missing or Invalid Place ID / Review URL
    invalidCount++;
    results.push({
      rowIndex: row.rowIndex,
      inputBusinessName: cleanName,
      inputLocation: cleanLocation,
      inputPlaceId: cleanPlaceId || undefined,
      inputReviewUrl: cleanReviewUrl || undefined,
      status: 'INVALID_INPUT',
      statusNote: cleanPlaceId
        ? 'Invalid Place ID format'
        : 'Missing valid Place ID or Google review URL',
      source: 'NONE'
    });
  }

  return {
    success: true,
    totalRows: results.length,
    matchedCount,
    invalidCount,
    results
  };
}

/**
 * Format bulk processed results into compliant CSV string
 */
export function formatBulkResultsToCsv(rows: BulkProcessedRow[]): string {
  const headers = [
    'Row',
    'Business Name',
    'Location',
    'Google Place ID',
    'Google Review Link',
    'Status',
    'Notes'
  ];

  const lines: string[] = [];
  lines.push(headers.map(h => `"${h}"`).join(','));

  for (const row of rows) {
    const fields = [
      row.rowIndex,
      sanitizeCsvField(row.inputBusinessName),
      sanitizeCsvField(row.inputLocation),
      sanitizeCsvField(row.googlePlaceId || row.inputPlaceId || ''),
      sanitizeCsvField(row.googleReviewUrl || row.inputReviewUrl || ''),
      sanitizeCsvField(row.status),
      sanitizeCsvField(row.statusNote || '')
    ];

    const escapedLine = fields
      .map(val => `"${String(val).replace(/"/g, '""')}"`)
      .join(',');

    lines.push(escapedLine);
  }

  // Prepend UTF-8 BOM for accurate opening in Excel
  return '\uFEFF' + lines.join('\r\n');
}
