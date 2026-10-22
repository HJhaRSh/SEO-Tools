/**
 * Schema Extractor
 * Pure HTML extraction logic for JSON-LD, Microdata, and RDFa schema types.
 * No network requests — unit-testable in isolation.
 */

import * as cheerio from 'cheerio';

const SCHEMA_ORG_PREFIXES = [
  'https://schema.org/',
  'http://schema.org/',
  'https://www.schema.org/',
  'http://www.schema.org/',
];

/**
 * Normalises a schema type value by stripping the schema.org URL prefix.
 * e.g. "https://schema.org/Organization" → "Organization"
 */
function normalizeType(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  for (const prefix of SCHEMA_ORG_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const local = trimmed.slice(prefix.length).trim();
      return local || null;
    }
  }
  // If it already looks like a bare type name (no slashes, no colon), return as-is
  if (trimmed && !trimmed.includes('/') && !trimmed.includes(':')) {
    return trimmed;
  }
  // Accept bare schema.org short forms without prefix
  return trimmed || null;
}

function extractTypesFromObject(obj: Record<string, unknown>, found: string[]): void {
  const typeVal = obj['@type'];
  if (Array.isArray(typeVal)) {
    for (const t of typeVal) {
      if (typeof t === 'string') {
        const norm = normalizeType(t);
        if (norm) found.push(norm);
      }
    }
  } else if (typeof typeVal === 'string') {
    const norm = normalizeType(typeVal);
    if (norm) found.push(norm);
  }
}

/**
 * Collects top-level entity schema types from a JSON-LD root value.
 * Only extracts primary entities (nodes of @graph, or root entity objects).
 * Does NOT collect nested property types (e.g. PostalAddress under Organization.address,
 * GeoCoordinates under Place, ImageObject, etc.) matching Schema.org validator behavior.
 */
function collectJsonLdTypes(value: unknown, found: string[]): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdTypes(item, found);
    }
    return;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // Handle @graph: each node in the graph is a top-level entity
    if (Array.isArray(obj['@graph'])) {
      for (const node of obj['@graph'] as unknown[]) {
        if (node && typeof node === 'object') {
          extractTypesFromObject(node as Record<string, unknown>, found);
        }
      }
      return;
    }

    // Direct top-level entity with @type
    if (obj['@type'] !== undefined) {
      extractTypesFromObject(obj, found);
      return;
    }

    // If neither @graph nor @type is present at this level (e.g. wrapper object like page_schema or props),
    // traverse into top-level keys to locate the entity or @graph
    for (const key of Object.keys(obj)) {
      if (key === '@context') continue;
      const child = obj[key];
      if (child !== null && typeof child === 'object') {
        collectJsonLdTypes(child, found);
      }
    }
  }
}

/**
 * Extracts schema types from JSON-LD <script> blocks.
 * Detects:
 * 1. Standard <script type="application/ld+json"> tags
 * 2. Next.js <Script type="application/ld+json"> component payloads (self.__next_s pushes)
 * 3. Next.js __NEXT_DATA__ props
 * 4. Inline <script> tags containing serialized JSON-LD or schema.org payloads
 * Silently skips malformed blocks and continues checking others.
 */
function extractJsonLdTypes($: cheerio.CheerioAPI): string[] {
  const found: string[] = [];

  // 1. Standard <script type="application/ld+json"> tags
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).html();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw.trim());
      collectJsonLdTypes(parsed, found);
    } catch {
      // Malformed JSON-LD — skip silently
    }
  });

  // 2. Inline scripts containing Next.js script payloads, __NEXT_DATA__, or embedded schema
  $('script:not([type="application/ld+json"])').each((_i, el) => {
    const raw = $(el).html();
    if (!raw) return;

    // Fast filter: only examine scripts that reference schema markup keywords
    if (!raw.includes('application/ld+json') && !raw.includes('schema.org') && !raw.includes('@context')) {
      return;
    }

    // A. Next.js __next_s script push:
    // e.g. (self.__next_s=self.__next_s||[]).push([0,{"type":"application/ld+json","children":"..."}])
    const nextSMatch = raw.match(/\(self\.__next_s=self\.__next_s\|\|\[\]\)\.push\(\[[^,]+,\s*(\{[\s\S]*?\})\s*\]\)/);
    if (nextSMatch) {
      try {
        const payload = JSON.parse(nextSMatch[1]);
        if (payload && payload.type === 'application/ld+json') {
          const content = payload.children || payload.dangerouslySetInnerHTML?.__html;
          if (content) {
            const inner = typeof content === 'string' ? JSON.parse(content) : content;
            collectJsonLdTypes(inner, found);
          }
        }
      } catch {
        // Skip malformed Next.js script push
      }
    }

    // B. Next.js __NEXT_DATA__
    if ($(el).attr('id') === '__NEXT_DATA__') {
      try {
        const nextData = JSON.parse(raw.trim());
        collectJsonLdTypes(nextData, found);
      } catch {
        // Skip malformed __NEXT_DATA__
      }
    }

    // C. Escaped JSON-LD objects inside script tags:
    // Match patterns like "type":"application/ld+json", "children":"..." or "dangerouslySetInnerHTML":{"__html":"..."}
    const escapedLdJsonRegex = /"type"\s*:\s*"application\/ld\+json"\s*,\s*"(?:children|dangerouslySetInnerHTML)"\s*:\s*(?:\{"__html"\s*:\s*)?"(\{[\s\S]*?\})"/g;
    let match: RegExpExecArray | null;
    while ((match = escapedLdJsonRegex.exec(raw)) !== null) {
      try {
        const unescaped = JSON.parse('"' + match[1] + '"');
        const parsed = JSON.parse(unescaped);
        collectJsonLdTypes(parsed, found);
      } catch {
        // Continue searching
      }
    }
  });

  return found;
}

/**
 * Extracts schema types from Microdata (itemscope + itemtype attributes).
 * Only extracts top-level items (elements without itemprop), ignoring sub-property schemas.
 */
function extractMicrodataTypes($: cheerio.CheerioAPI): string[] {
  const found: string[] = [];

  $('[itemscope][itemtype]:not([itemprop])').each((_i, el) => {
    const itemtype = $(el).attr('itemtype');
    if (!itemtype) return;

    // itemtype can be space-separated list of URIs
    const types = itemtype.trim().split(/\s+/);
    for (const t of types) {
      const norm = normalizeType(t);
      if (norm) found.push(norm);
    }
  });

  return found;
}

/**
 * Extracts schema types from RDFa attributes.
 * Checks for top-level typeof (without property) + vocab="https://schema.org" or resource with schema.org prefix.
 */
function extractRdfaTypes($: cheerio.CheerioAPI): string[] {
  const found: string[] = [];

  // Look for top-level elements with typeof attribute where vocab is schema.org
  // or where the typeof value itself contains schema.org URIs
  $('[typeof]:not([property])').each((_i, el) => {
    const typeofVal = $(el).attr('typeof');
    if (!typeofVal) return;

    // Check vocab on this element or ancestor
    const vocab = $(el).attr('vocab') || $(el).closest('[vocab]').attr('vocab') || '';
    const isSchemaOrg = SCHEMA_ORG_PREFIXES.some(p => vocab.startsWith(p.replace(/\/$/, '')));

    const types = typeofVal.trim().split(/\s+/);
    for (const t of types) {
      if (!t) continue;
      // If the typeof value itself is a schema.org URI
      const normDirect = normalizeType(t);
      if (normDirect && (t.includes('schema.org') || isSchemaOrg)) {
        found.push(normDirect.replace(/^.*\//, '')); // strip any remaining path segments
      } else if (isSchemaOrg && normDirect && !t.includes('/') && !t.includes(':')) {
        // Bare type name under schema.org vocab
        found.push(normDirect);
      }
    }
  });

  return found;
}

/**
 * Main extraction function — accepts raw HTML and returns deduplicated schema type names.
 * Detects: JSON-LD, Microdata, RDFa.
 */
export function extractSchemaTypes(html: string): string[] {
  if (!html || typeof html !== 'string') return [];

  const $ = cheerio.load(html);

  const allFound: string[] = [
    ...extractJsonLdTypes($),
    ...extractMicrodataTypes($),
    ...extractRdfaTypes($),
  ];

  // Deduplicate while preserving first-seen order (case-sensitive)
  const seen = new Set<string>();
  const deduplicated: string[] = [];
  for (const type of allFound) {
    if (type && !seen.has(type)) {
      seen.add(type);
      deduplicated.push(type);
    }
  }

  return deduplicated;
}
