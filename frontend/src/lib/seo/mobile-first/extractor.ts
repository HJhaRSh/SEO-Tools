import * as cheerio from 'cheerio';
import crypto from 'crypto';
import {
  ContentInfo,
  LinksInfo,
  ImagesInfo,
  MetaRobotsDirectives,
  CanonicalInfo,
  MobileAlternateInfo,
  VaryHeaderInfo,
  StructuredDataInfo,
  SchemaEntitySummary,
  HreflangInfo,
  HreflangItem,
} from './types';
import { parseLinkHeaders } from '../hreflang/parseHeaders';

/**
 * Normalizes an object's keys recursively to allow deterministic comparison
 * regardless of key insertion order.
 */
function normalizeObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(normalizeObjectKeys);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const k of sortedKeys) {
    result[k] = normalizeObjectKeys(obj[k]);
  }
  return result;
}

/**
 * Extracts and stringifies a schema entity property (handling string or nested object with name/@id).
 */
function extractSchemaProp(val: any): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (typeof val.name === 'string') return val.name.trim();
    if (typeof val['@id'] === 'string') return val['@id'].trim();
  }
  return undefined;
}

/**
 * Extracts all SEO signals from an HTML document and HTTP response headers.
 */
export function extractSeoSignals(
  html: string,
  finalUrl: string,
  headers: Record<string, string>
) {
  const $ = cheerio.load(html || '');

  // Base URL resolution
  let baseOrigin = '';
  try {
    baseOrigin = new URL(finalUrl).origin.toLowerCase();
  } catch {
    baseOrigin = '';
  }

  // 1. Content Extraction
  const titleTag = $('title').first().text().replace(/\s+/g, ' ').trim();

  // Extract standard meta description strictly from <meta name="description">
  const standardDescAttr = $('meta[name="description" i]').attr('content');
  const metaDescription = standardDescAttr ? standardDescAttr.replace(/\s+/g, ' ').trim() : null;

  // Extract Open Graph description independently from <meta property="og:description">
  const ogDescAttr =
    $('meta[property="og:description" i]').attr('content') ||
    $('meta[name="og:description" i]').attr('content');
  const ogDescription = ogDescAttr ? ogDescAttr.replace(/\s+/g, ' ').trim() : null;

  const h1Elements: string[] = [];
  $('h1').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) h1Elements.push(text);
  });

  // Visible text extraction: remove scripts, styles, noscript, svg, canvas, hidden elements
  const bodyClone = $('body').clone();
  bodyClone
    .find('script, style, noscript, svg, canvas, iframe, object, embed, template, [hidden], [aria-hidden="true"]')
    .remove();
  const rawVisibleText = bodyClone.text().normalize('NFC').replace(/\s+/g, ' ').trim();
  const words = rawVisibleText ? rawVisibleText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const characterCount = rawVisibleText.length;
  const textSnippet = rawVisibleText.slice(0, 300);
  const textNormalizedHash = crypto
    .createHash('md5')
    .update(rawVisibleText.toLowerCase())
    .digest('hex');

  // Full-document comparison representation: bounded to 30,000 characters.
  // When documents exceed 30,000 chars, sample 5 distributed windows across the full document
  // (beginning, 25%, 50%, 75%, end) to evaluate parity across the whole document.
  let comparisonText = rawVisibleText;
  let isSampled = false;
  const MAX_COMPARISON_CHARS = 30000;
  if (rawVisibleText.length > MAX_COMPARISON_CHARS) {
    isSampled = true;
    const totalLen = rawVisibleText.length;
    const sliceLen = 6000;
    const slices = [
      rawVisibleText.slice(0, sliceLen),
      rawVisibleText.slice(Math.floor(totalLen * 0.25), Math.floor(totalLen * 0.25) + sliceLen),
      rawVisibleText.slice(Math.floor(totalLen * 0.50), Math.floor(totalLen * 0.50) + sliceLen),
      rawVisibleText.slice(Math.floor(totalLen * 0.75), Math.floor(totalLen * 0.75) + sliceLen),
      rawVisibleText.slice(Math.max(0, totalLen - sliceLen)),
    ];
    comparisonText = slices.join(' ');
  }

  const content: ContentInfo = {
    title: titleTag || null,
    titleLength: titleTag.length,
    metaDescription: metaDescription || null,
    metaDescriptionLength: metaDescription ? metaDescription.length : 0,
    ogDescription: ogDescription || null,
    ogDescriptionLength: ogDescription ? ogDescription.length : 0,
    h1Primary: h1Elements.length > 0 ? h1Elements[0] : null,
    h1Count: h1Elements.length,
    allH1s: h1Elements,
    wordCount,
    characterCount,
    textSnippet,
    textNormalizedHash,
    comparisonText,
    isSampled,
  };

  // 2. Links Extraction
  let totalLinks = 0;
  let internalCount = 0;
  let externalCount = 0;
  let nofollowCount = 0;
  const internalDestinations = new Set<string>();
  const externalDestinations = new Set<string>();
  const sampleInternal: string[] = [];
  const sampleExternal: string[] = [];

  $('a[href]').each((_, el) => {
    totalLinks++;
    const href = ($(el).attr('href') || '').trim();
    const rel = ($(el).attr('rel') || '').toLowerCase();
    const isNofollow = rel.includes('nofollow');
    if (isNofollow) nofollowCount++;

    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }

    try {
      const resolved = new URL(href, finalUrl);
      const isInternal = baseOrigin && resolved.origin.toLowerCase() === baseOrigin;
      const cleanHref = resolved.origin + resolved.pathname;

      if (isInternal) {
        internalCount++;
        internalDestinations.add(cleanHref);
        if (sampleInternal.length < 15 && !sampleInternal.includes(resolved.href)) {
          sampleInternal.push(resolved.href);
        }
      } else {
        externalCount++;
        externalDestinations.add(cleanHref);
        if (sampleExternal.length < 10 && !sampleExternal.includes(resolved.href)) {
          sampleExternal.push(resolved.href);
        }
      }
    } catch {
      // Ignore unparseable href
    }
  });

  const links: LinksInfo = {
    totalCount: totalLinks,
    internalCount,
    externalCount,
    nofollowCount,
    uniqueInternalDestinations: internalDestinations.size,
    uniqueExternalDestinations: externalDestinations.size,
    sampleInternal,
    sampleExternal,
  };

  // 3. Images Extraction (including responsive images)
  let totalImages = 0;
  let withAltCount = 0;
  let missingAltCount = 0;
  let responsiveMarkupCount = 0;
  const imageSamples: { src: string; alt: string; isResponsive: boolean }[] = [];

  $('img').each((_, el) => {
    totalImages++;
    const src = ($(el).attr('src') || $(el).attr('data-src') || '').trim();
    const alt = $(el).attr('alt');
    const srcset = $(el).attr('srcset') || $(el).attr('data-srcset');
    const isInsidePicture = $(el).parent('picture').length > 0;
    const isResponsive = Boolean(srcset || isInsidePicture);

    if (isResponsive) responsiveMarkupCount++;

    if (alt !== undefined && alt !== null && alt.trim().length > 0) {
      withAltCount++;
    } else {
      missingAltCount++;
    }

    if (imageSamples.length < 15 && src) {
      try {
        const resolvedSrc = new URL(src, finalUrl).toString();
        imageSamples.push({
          src: resolvedSrc,
          alt: (alt || '').trim(),
          isResponsive,
        });
      } catch {
        imageSamples.push({
          src,
          alt: (alt || '').trim(),
          isResponsive,
        });
      }
    }
  });

  // Also count standalone picture sources
  $('picture > source').each(() => {
    responsiveMarkupCount++;
  });

  const images: ImagesInfo = {
    totalCount: totalImages,
    withAltCount,
    missingAltCount,
    responsiveMarkupCount,
    samples: imageSamples,
  };

  // 4. Meta Robots & X-Robots-Tag
  const metaRobotsDirectivesList: string[] = [];
  const googlebotDirectivesList: string[] = [];

  $('meta[name="robots" i], meta[name="googlebot" i]').each((_, el) => {
    const name = ($(el).attr('name') || '').toLowerCase();
    const contentVal = ($(el).attr('content') || '').toLowerCase();
    const parts = contentVal.split(',').map((p) => p.trim()).filter(Boolean);

    if (name === 'googlebot') {
      googlebotDirectivesList.push(...parts);
    } else {
      metaRobotsDirectivesList.push(...parts);
    }
  });

  const allDirectives = [...new Set([...metaRobotsDirectivesList, ...googlebotDirectivesList])];
  const metaRobots: MetaRobotsDirectives = {
    raw: allDirectives.length > 0 ? allDirectives.join(', ') : null,
    index: !allDirectives.includes('noindex') && !allDirectives.includes('none'),
    noindex: allDirectives.includes('noindex') || allDirectives.includes('none'),
    follow: !allDirectives.includes('nofollow') && !allDirectives.includes('none'),
    nofollow: allDirectives.includes('nofollow') || allDirectives.includes('none'),
    none: allDirectives.includes('none'),
    noarchive: allDirectives.includes('noarchive'),
    nosnippet: allDirectives.includes('nosnippet'),
    noimageindex: allDirectives.includes('noimageindex'),
    googlebotDirectives: googlebotDirectivesList,
    allDirectives,
  };

  // X-Robots-Tag from HTTP headers
  const xRobotsHeader = headers['x-robots-tag'] || '';
  const xRobotsParts = xRobotsHeader
    ? xRobotsHeader
        .toLowerCase()
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const xRobotsTag: MetaRobotsDirectives = {
    raw: xRobotsHeader || null,
    index: !xRobotsParts.includes('noindex') && !xRobotsParts.includes('none'),
    noindex: xRobotsParts.includes('noindex') || xRobotsParts.includes('none'),
    follow: !xRobotsParts.includes('nofollow') && !xRobotsParts.includes('none'),
    nofollow: xRobotsParts.includes('nofollow') || xRobotsParts.includes('none'),
    none: xRobotsParts.includes('none'),
    noarchive: xRobotsParts.includes('noarchive'),
    nosnippet: xRobotsParts.includes('nosnippet'),
    noimageindex: xRobotsParts.includes('noimageindex'),
    googlebotDirectives: xRobotsParts.filter((p) => p.startsWith('googlebot:')),
    allDirectives: xRobotsParts,
  };

  // 5. Canonical Tag
  const canonicalLinks: string[] = [];
  $('link[rel~="canonical" i]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (href) canonicalLinks.push(href);
  });

  // Also check HTTP Link header for rel="canonical"
  const linkHeader = headers['link'] || '';
  if (linkHeader) {
    const parsedHeader = parseLinkHeaders(linkHeader, finalUrl);
    if (parsedHeader.canonicalUrl && !canonicalLinks.includes(parsedHeader.canonicalUrl)) {
      canonicalLinks.push(parsedHeader.canonicalUrl);
    }
  }

  const primaryCanonicalRaw = canonicalLinks[0] || null;
  let primaryCanonicalResolved: string | null = null;
  let isRelativeCanonical = false;

  if (primaryCanonicalRaw) {
    isRelativeCanonical = !/^https?:\/\//i.test(primaryCanonicalRaw);
    try {
      primaryCanonicalResolved = new URL(primaryCanonicalRaw, finalUrl).toString();
    } catch {
      primaryCanonicalResolved = primaryCanonicalRaw;
    }
  }

  const canonical: CanonicalInfo = {
    raw: primaryCanonicalRaw,
    resolved: primaryCanonicalResolved,
    isMissing: !primaryCanonicalRaw,
    isRelative: isRelativeCanonical,
    multipleCount: canonicalLinks.length,
    allFound: canonicalLinks,
  };

  // 6. Mobile Alternate Tag
  let mobileAltTag = $('link[rel~="alternate" i][media*="screen" i]').first();
  if (!mobileAltTag.length) {
    mobileAltTag = $('link[rel~="alternate" i][media*="640" i]').first();
  }
  const altHref = mobileAltTag.attr('href') || null;
  const altMedia = mobileAltTag.attr('media') || null;
  let resolvedAltHref: string | null = null;
  if (altHref) {
    try {
      resolvedAltHref = new URL(altHref, finalUrl).toString();
    } catch {
      resolvedAltHref = altHref;
    }
  }

  const mobileAlternate: MobileAlternateInfo = {
    isPresent: Boolean(altHref),
    raw: altHref,
    media: altMedia,
    href: altHref,
    resolved: resolvedAltHref,
  };

  // 7. Vary: User-Agent Header
  const varyHeaderVal = headers['vary'] || '';
  const includesUserAgent = varyHeaderVal.toLowerCase().includes('user-agent');
  const varyHeader: VaryHeaderInfo = {
    isPresent: Boolean(varyHeaderVal),
    raw: varyHeaderVal || null,
    includesUserAgent,
    explanation: includesUserAgent
      ? 'Vary: User-Agent header is present. Tells caching servers and Googlebot that responses differ based on the requesting client.'
      : varyHeaderVal
      ? `Vary header present (${varyHeaderVal}), but does not declare User-Agent.`
      : 'No Vary header declared. If dynamic serving is used to deliver different HTML to desktop and mobile on the same URL, Google recommends adding Vary: User-Agent.',
  };

  // 8. Structured Data (JSON-LD, Microdata, RDFa)
  const schemaTypes: string[] = [];
  const schemaEntities: SchemaEntitySummary[] = [];
  const parseErrors: string[] = [];
  let jsonLdBlocksCount = 0;

  $('script[type="application/ld+json" i]').each((_, el) => {
    jsonLdBlocksCount++;
    const text = $(el).text().trim();
    if (!text) return;

    try {
      const parsed = JSON.parse(text);

      const processEntity = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;

        if (obj['@type']) {
          const rawTypes = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
          for (const t of rawTypes) {
            if (typeof t === 'string' && !schemaTypes.includes(t)) {
              schemaTypes.push(t);
            }
          }
          const primaryType = typeof rawTypes[0] === 'string' ? rawTypes[0] : 'Thing';

          const normalized = normalizeObjectKeys(obj);
          const rawNormalizedJson = JSON.stringify(normalized);

          schemaEntities.push({
            type: primaryType,
            id: typeof obj['@id'] === 'string' ? obj['@id'] : undefined,
            name: extractSchemaProp(obj.name),
            headline: extractSchemaProp(obj.headline),
            description: extractSchemaProp(obj.description),
            author: extractSchemaProp(obj.author),
            publisher: extractSchemaProp(obj.publisher),
            rawNormalizedJson,
          });
        }

        if (Array.isArray(obj['@graph'])) {
          for (const item of obj['@graph']) {
            processEntity(item);
          }
        }
      };

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          processEntity(item);
        }
      } else {
        processEntity(parsed);
      }
    } catch (err: any) {
      parseErrors.push(`Malformed JSON-LD script block: ${err.message || 'SyntaxError'}`);
    }
  });

  // Microdata itemtypes
  const microdataItemTypes: string[] = [];
  $('[itemscope][itemtype]').each((_, el) => {
    const itype = $(el).attr('itemtype') || '';
    if (itype && !microdataItemTypes.includes(itype)) {
      microdataItemTypes.push(itype);
      const cleanType = itype.split('/').pop() || itype;
      if (!schemaTypes.includes(cleanType)) {
        schemaTypes.push(cleanType);
      }
    }
  });

  // RDFa types
  const rdfaTypes: string[] = [];
  $('[typeof]').each((_, el) => {
    const t = $(el).attr('typeof') || '';
    if (t && !rdfaTypes.includes(t)) {
      rdfaTypes.push(t);
      if (!schemaTypes.includes(t)) {
        schemaTypes.push(t);
      }
    }
  });

  const structuredData: StructuredDataInfo = {
    hasStructuredData: schemaTypes.length > 0 || schemaEntities.length > 0,
    types: schemaTypes.sort(),
    entityCount: schemaEntities.length,
    entities: schemaEntities,
    jsonLdBlocksCount,
    microdataItemTypes,
    rdfaTypes,
    parseErrors,
  };

  // 9. Hreflang Annotations (HTML + HTTP Link headers)
  const hreflangItems: HreflangItem[] = [];
  const hreflangCodes = new Map<string, number>();

  $('link[rel~="alternate" i][hreflang]').each((_, el) => {
    const code = ($(el).attr('hreflang') || '').trim();
    const href = ($(el).attr('href') || '').trim();
    if (!code) return;

    let resolvedHref = href;
    try {
      resolvedHref = new URL(href, finalUrl).toString();
    } catch {
      resolvedHref = href;
    }

    hreflangItems.push({
      hreflang: code.toLowerCase(),
      href,
      resolvedHref,
      source: 'HTML',
    });

    hreflangCodes.set(code.toLowerCase(), (hreflangCodes.get(code.toLowerCase()) || 0) + 1);
  });

  // Also check HTTP Link headers
  if (linkHeader) {
    const parsedHeader = parseLinkHeaders(linkHeader, finalUrl);
    for (const ann of parsedHeader.annotations) {
      const code = ann.hreflang.toLowerCase();
      hreflangItems.push({
        hreflang: code,
        href: ann.href,
        resolvedHref: ann.href,
        source: 'HTTP_HEADER',
      });
      hreflangCodes.set(code, (hreflangCodes.get(code) || 0) + 1);
    }
  }

  const duplicateCodes: string[] = [];
  for (const [code, count] of hreflangCodes.entries()) {
    if (count > 1) duplicateCodes.push(code);
  }

  const hreflang: HreflangInfo = {
    count: hreflangItems.length,
    items: hreflangItems,
    duplicateCodes,
    hasXDefault: hreflangItems.some((item) => item.hreflang === 'x-default'),
  };

  return {
    content,
    links,
    images,
    metaRobots,
    xRobotsTag,
    canonical,
    mobileAlternate,
    varyHeader,
    structuredData,
    hreflang,
  };
}
