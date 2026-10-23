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
 * Checks whether a JSON-LD @context refers to Schema.org.
 * Supports string URLs, arrays of contexts, and { @vocab: "https://schema.org" } objects.
 */
function hasSchemaOrgContext(context: unknown): boolean {
  if (!context) return false;

  if (typeof context === 'string') {
    const c = context.trim().toLowerCase();
    return (
      c.startsWith('https://schema.org') ||
      c.startsWith('http://schema.org') ||
      c.startsWith('https://www.schema.org') ||
      c.startsWith('http://www.schema.org')
    );
  }

  if (Array.isArray(context)) {
    return context.some(item => hasSchemaOrgContext(item));
  }

  if (typeof context === 'object') {
    const obj = context as Record<string, unknown>;
    for (const val of Object.values(obj)) {
      if (hasSchemaOrgContext(val)) return true;
    }
  }

  return false;
}

/**
 * Normalises a schema type value to its bare type name.
 * - Accepts full Schema.org URLs (e.g. "https://schema.org/Product" → "Product").
 * - Accepts bare types ONLY when the surrounding context is Schema.org.
 * - Rejects arbitrary non-Schema.org URLs (e.g. "https://example.com/MyCustomThing" → null).
 */
function normalizeType(raw: string, isSchemaContext: boolean): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // Full Schema.org URLs: always recognized regardless of local context
  for (const prefix of SCHEMA_ORG_PREFIXES) {
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
      const local = trimmed.slice(prefix.length).trim();
      return (local && !local.includes('/') && !local.includes(':')) ? local : null;
    }
  }

  // Handle "schema:Type" CURIE
  if (trimmed.toLowerCase().startsWith('schema:')) {
    const local = trimmed.slice(7).trim();
    return (local && !local.includes('/') && !local.includes(':')) ? local : null;
  }

  // If it contains a protocol or path, it's an unrelated vocabulary URL — ignore!
  if (trimmed.includes('://') || trimmed.includes('/')) {
    return null;
  }

  // Bare type (e.g. "Product", "Organization"): only accept if surrounding context is Schema.org
  if (isSchemaContext && !trimmed.includes(':')) {
    return trimmed;
  }

  return null;
}

function extractTypesFromObject(
  obj: Record<string, unknown>,
  found: string[],
  inheritedSchemaContext: boolean
): void {
  const localContext = obj['@context'];
  const isSchemaContext =
    localContext !== undefined ? hasSchemaOrgContext(localContext) : inheritedSchemaContext;

  const typeVal = obj['@type'];
  if (Array.isArray(typeVal)) {
    for (const t of typeVal) {
      if (typeof t === 'string') {
        const norm = normalizeType(t, isSchemaContext);
        if (norm) found.push(norm);
      }
    }
  } else if (typeof typeVal === 'string') {
    const norm = normalizeType(typeVal, isSchemaContext);
    if (norm) found.push(norm);
  }
}

/**
 * Collects top-level entity schema types from a JSON-LD root value.
 * Only extracts primary entities (nodes of @graph, or root entity objects).
 * Does NOT collect nested property types (e.g. PostalAddress under Organization.address,
 * GeoCoordinates under Place, ImageObject, etc.) matching Schema.org validator behavior.
 */
function collectJsonLdTypes(
  value: unknown,
  found: string[],
  inheritedSchemaContext = false
): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdTypes(item, found, inheritedSchemaContext);
    }
    return;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const localContext = obj['@context'];
    const isSchemaContext =
      localContext !== undefined ? hasSchemaOrgContext(localContext) : inheritedSchemaContext;

    // Handle @graph: each node in the graph is a top-level entity
    if (Array.isArray(obj['@graph'])) {
      for (const node of obj['@graph'] as unknown[]) {
        if (node && typeof node === 'object') {
          extractTypesFromObject(node as Record<string, unknown>, found, isSchemaContext);
        }
      }
      return;
    }

    // Direct top-level entity with @type
    if (obj['@type'] !== undefined) {
      extractTypesFromObject(obj, found, isSchemaContext);
      return;
    }

    // If neither @graph nor @type is present at this level (e.g. wrapper object like page_schema or props),
    // traverse into top-level keys to locate the entity or @graph
    for (const key of Object.keys(obj)) {
      if (key === '@context') continue;
      const child = obj[key];
      if (child !== null && typeof child === 'object') {
        collectJsonLdTypes(child, found, isSchemaContext);
      }
    }
  }
}

/**
 * Checks whether a script type attribute represents application/ld+json.
 * Handles casing (e.g. "Application/LD+JSON") and MIME parameters (e.g. "; charset=utf-8").
 */
function isJsonLdMime(typeAttr: string | undefined): boolean {
  if (!typeAttr) return false;
  const mime = typeAttr.trim().toLowerCase().split(';')[0].trim();
  return mime === 'application/ld+json';
}

/**
 * Extracts schema types from JSON-LD <script> blocks.
 * Detects:
 * 1. Standard or case/parameterized <script type="application/ld+json"> tags
 * 2. Next.js <Script type="application/ld+json"> component payloads (self.__next_s pushes)
 * 3. Next.js __NEXT_DATA__ props
 * 4. Inline <script> tags containing serialized JSON-LD or schema.org payloads
 * Silently skips malformed blocks and continues checking others.
 */
type CheerioDoc = ReturnType<typeof cheerio.load>;

function extractJsonLdTypes($: CheerioDoc): string[] {
  const found: string[] = [];

  $('script').each((_i, el) => {
    const raw = $(el).html();
    if (!raw) return;

    const typeAttr = $(el).attr('type');

    // 1. Standard and parameterized application/ld+json MIME types
    if (isJsonLdMime(typeAttr)) {
      try {
        const parsed = JSON.parse(raw.trim());
        collectJsonLdTypes(parsed, found, false);
      } catch {
        // Malformed JSON-LD — skip silently
      }
      return;
    }

    // 2. Non-ld+json scripts (Next.js payloads, __NEXT_DATA__, or embedded schema)
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
        if (payload && isJsonLdMime(payload.type)) {
          const content = payload.children || payload.dangerouslySetInnerHTML?.__html;
          if (content) {
            const inner = typeof content === 'string' ? JSON.parse(content) : content;
            collectJsonLdTypes(inner, found, false);
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
        collectJsonLdTypes(nextData, found, false);
      } catch {
        // Skip malformed __NEXT_DATA__
      }
    }

    // C. Escaped JSON-LD objects inside script tags:
    // Match patterns like "type":"application/ld+json", "children":"..." or "dangerouslySetInnerHTML":{"__html":"..."}
    const escapedLdJsonRegex = /"type"\s*:\s*"application\/ld\+json[^"]*"\s*,\s*"(?:children|dangerouslySetInnerHTML)"\s*:\s*(?:\{"__html"\s*:\s*)?"(\{[\s\S]*?\})"/gi;
    let match: RegExpExecArray | null;
    while ((match = escapedLdJsonRegex.exec(raw)) !== null) {
      try {
        const unescaped = JSON.parse('"' + match[1] + '"');
        const parsed = JSON.parse(unescaped);
        collectJsonLdTypes(parsed, found, false);
      } catch {
        // Continue searching
      }
    }
  });

  return found;
}

/**
 * Extracts schema types from Microdata (itemscope + itemtype attributes).
 * Only extracts top-level items (elements without itemprop) with valid schema.org itemtype URLs.
 */
function extractMicrodataTypes($: CheerioDoc): string[] {
  const found: string[] = [];

  $('[itemscope][itemtype]:not([itemprop])').each((_i, el) => {
    const itemtype = $(el).attr('itemtype');
    if (!itemtype) return;

    // itemtype can be a space-separated list of URIs
    const types = itemtype.trim().split(/\s+/);
    for (const t of types) {
      for (const prefix of SCHEMA_ORG_PREFIXES) {
        if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
          const local = t.slice(prefix.length).trim();
          if (local && !local.includes('/') && !local.includes(':')) {
            found.push(local);
          }
        }
      }
    }
  });

  return found;
}

/**
 * Extracts schema types from RDFa attributes.
 * Checks for top-level typeof (without property) with clear Schema.org vocab or URLs.
 */
function extractRdfaTypes($: CheerioDoc): string[] {
  const found: string[] = [];

  $('[typeof]:not([property])').each((_i, el) => {
    const typeofVal = $(el).attr('typeof');
    if (!typeofVal) return;

    // Check vocab on this element or ancestor
    const vocab = $(el).attr('vocab') || $(el).closest('[vocab]').attr('vocab') || '';
    const isSchemaOrgVocab = SCHEMA_ORG_PREFIXES.some(p =>
      vocab.toLowerCase().startsWith(p.toLowerCase().replace(/\/$/, ''))
    );

    const types = typeofVal.trim().split(/\s+/);
    for (const t of types) {
      if (!t) continue;

      // 1. Direct schema.org URL in typeof attribute
      let matched = false;
      for (const prefix of SCHEMA_ORG_PREFIXES) {
        if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
          const local = t.slice(prefix.length).trim();
          if (local && !local.includes('/') && !local.includes(':')) {
            found.push(local);
            matched = true;
            break;
          }
        }
      }
      if (matched) continue;

      // 2. Bare type with schema.org vocab
      if (isSchemaOrgVocab && !t.includes('/') && !t.includes(':')) {
        found.push(t);
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
