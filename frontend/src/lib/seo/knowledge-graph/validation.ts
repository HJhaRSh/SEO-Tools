import { SupportedEntityType } from './types';

export const VALID_TYPES: readonly SupportedEntityType[] = [
  '',
  'Book',
  'Corporation',
  'EducationalOrganization',
  'Event',
  'GovernmentOrganization',
  'LocalBusiness',
  'Movie',
  'MusicGroup',
  'Organization',
  'Person',
  'Place',
  'Product',
  'SportsTeam',
  'Thing',
];

export const VALID_LANGUAGES = [
  { code: 'en', label: 'English (en)' },
  { code: 'hi', label: 'Hindi (hi)' },
  { code: 'es', label: 'Spanish (es)' },
  { code: 'fr', label: 'French (fr)' },
  { code: 'de', label: 'German (de)' },
  { code: 'it', label: 'Italian (it)' },
  { code: 'pt', label: 'Portuguese (pt)' },
  { code: 'ja', label: 'Japanese (ja)' },
  { code: 'zh', label: 'Chinese (zh)' },
  { code: 'ar', label: 'Arabic (ar)' },
  { code: 'ru', label: 'Russian (ru)' },
];

export const VALID_LANGUAGE_CODES = new Set(VALID_LANGUAGES.map((l) => l.code));

export const MAX_QUERY_LENGTH = 300;
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;

/**
 * Normalizes Knowledge Graph ID and returns the canonical format or null if invalid.
 * Valid formats: /m/..., /g/..., kg:/m/..., kg:/g/...
 */
export function normalizeKnowledgeGraphId(val: string): { canonicalId: string; mid: string } | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();

  // Pattern matching: kg:/m/... or kg:/g/... or /m/... or /g/...
  const kgMatch = trimmed.match(/^(?:kg:)?(\/[mg]\/[a-zA-Z0-9_\-]+)$/);
  if (!kgMatch) {
    return null;
  }

  const mid = kgMatch[1];
  const canonicalId = `kg:${mid}`;
  return { canonicalId, mid };
}

/**
 * Validates search request input parameters
 */
export function validateSearchRequest(body: any): {
  isValid: boolean;
  error?: string;
  sanitized?: {
    query?: string;
    id?: string;
    types?: string[];
    language: string;
    limit: number;
    prefix: boolean;
  };
} {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Request body must be a JSON object.' };
  }

  const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
  const rawId = typeof body.id === 'string' ? body.id.trim() : '';

  if (!rawQuery && !rawId) {
    return {
      isValid: false,
      error: 'Either an entity query or a valid Knowledge Graph ID must be provided.',
    };
  }

  let sanitizedId: string | undefined = undefined;
  if (rawId) {
    const idInfo = normalizeKnowledgeGraphId(rawId);
    if (!idInfo) {
      return {
        isValid: false,
        error: `Invalid Knowledge Graph ID format "${rawId}". Expected format: /m/..., /g/..., or kg:/m/...`,
      };
    }
    sanitizedId = idInfo.mid; // Search API expects the mid for id parameter or /m/...
  }

  let sanitizedQuery: string | undefined = undefined;
  if (rawQuery) {
    if (rawQuery.length > MAX_QUERY_LENGTH) {
      return {
        isValid: false,
        error: `Query is too long. Maximum allowed length is ${MAX_QUERY_LENGTH} characters.`,
      };
    }
    sanitizedQuery = rawQuery;
  }

  // Types validation
  const types: string[] = [];
  if (Array.isArray(body.types)) {
    for (const t of body.types) {
      if (typeof t === 'string' && VALID_TYPES.includes(t as SupportedEntityType) && t.trim() !== '') {
        types.push(t.trim());
      }
    }
  } else if (typeof body.type === 'string' && VALID_TYPES.includes(body.type as SupportedEntityType) && body.type.trim() !== '') {
    types.push(body.type.trim());
  }

  // Language validation
  let language = 'en';
  if (typeof body.language === 'string' && VALID_LANGUAGE_CODES.has(body.language.trim().toLowerCase())) {
    language = body.language.trim().toLowerCase();
  }

  // Limit validation
  let limit = DEFAULT_LIMIT;
  if (typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0) {
    limit = Math.min(body.limit, MAX_LIMIT);
  } else if (typeof body.limit === 'string') {
    const parsed = parseInt(body.limit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const prefix = Boolean(body.prefix);

  return {
    isValid: true,
    sanitized: {
      query: sanitizedQuery,
      id: sanitizedId,
      types,
      language,
      limit,
      prefix,
    },
  };
}
