import { HreflangAnnotation, HreflangIssue } from './types';
import { validateHreflangCode } from './validateLocale';

export interface ParsedHtmlResult {
  title: string | null;
  htmlLang: string | null;
  metaContentLanguage: string | null;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  annotations: HreflangAnnotation[];
  issues: HreflangIssue[];
}

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
 * Parses an HTML tag's attribute string into a key-value record, supporting
 * single quotes, double quotes, unquoted attributes, uppercase/lowercase, and extra whitespace.
 */
function parseTagAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Regex to match name="value", name='value', or name=unquoted
  const attrRegex = /([a-zA-Z0-9_\-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrString)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = decodeHtmlEntities(value.trim());
  }
  return attrs;
}

/**
 * Extracts head and body sections, handling casing and potential missing head tags.
 */
function extractHeadAndBody(html: string): { head: string; body: string } {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const headEndIndex = headMatch.index! + headMatch[0].length;
    return {
      head: headMatch[1],
      body: html.slice(headEndIndex),
    };
  }

  // If no formal <head></head> tag, treat content before <body as head
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch.index !== undefined) {
    return {
      head: html.slice(0, bodyMatch.index),
      body: bodyMatch[0],
    };
  }

  return { head: html, body: '' };
}

/**
 * Safely parses HTML and extracts hreflang link tags, canonical, robots directives,
 * html lang attribute, and meta content-language.
 */
export function parseHtmlHreflang(html: string, baseUrl: string): ParsedHtmlResult {
  const issues: HreflangIssue[] = [];
  const annotations: HreflangAnnotation[] = [];

  const { head, body } = extractHeadAndBody(html);

  // 1. Extract <html lang="...">
  let htmlLang: string | null = null;
  const htmlTagMatch = html.match(/<html([^>]*)>/i);
  if (htmlTagMatch) {
    const htmlAttrs = parseTagAttributes(htmlTagMatch[1]);
    if (htmlAttrs.lang) {
      htmlLang = htmlAttrs.lang;
    }
  }

  // 2. Extract <title>
  let title: string | null = null;
  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim());
  }

  // 3. Extract Canonical and Robots from Head
  let canonicalUrl: string | null = null;
  let robotsMeta: string | null = null;
  let metaContentLanguage: string | null = null;

  // Process all <meta> tags in head
  const metaRegex = /<meta\s+([^>]*?)>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaRegex.exec(head)) !== null) {
    const attrs = parseTagAttributes(metaMatch[1]);
    const name = (attrs.name || attrs['http-equiv'] || attrs.property || '').toLowerCase();
    const content = attrs.content || '';

    if (name === 'robots' || name === 'googlebot') {
      robotsMeta = robotsMeta ? `${robotsMeta}, ${content}` : content;
    }
    if (name === 'content-language') {
      metaContentLanguage = content;
    }
  }

  // Helper to extract links
  const linkRegex = /<link\s+([^>]*?)>/gi;
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkRegex.exec(head)) !== null) {
    const attrs = parseTagAttributes(linkMatch[1]);
    const rel = (attrs.rel || '').toLowerCase();
    const relTokens = rel.split(/\s+/).filter(Boolean);

    // Canonical link
    if (relTokens.includes('canonical') && attrs.href) {
      try {
        canonicalUrl = new URL(attrs.href, baseUrl).toString();
      } catch {
        canonicalUrl = attrs.href;
      }
    }

    // Hreflang alternate link
    if (relTokens.includes('alternate') && attrs.hreflang) {
      const rawHreflang = attrs.hreflang;
      const rawHref = attrs.href || '';

      if (!rawHref) {
        issues.push({
          code: 'MISSING_HREF',
          severity: 'error',
          message: `Hreflang tag for "${rawHreflang}" is missing the "href" attribute.`,
          hreflang: rawHreflang,
        });
        continue;
      }

      // Check for relative URL
      let resolvedHref = rawHref;
      const isAbsolute = /^https?:\/\//i.test(rawHref);
      if (!isAbsolute) {
        issues.push({
          code: 'RELATIVE_URL_USED',
          severity: 'warning',
          message: `Alternate URL "${rawHref}" is relative. Google requires fully qualified absolute URLs.`,
          hreflang: rawHreflang,
          alternateUrl: rawHref,
        });
        try {
          resolvedHref = new URL(rawHref, baseUrl).toString();
        } catch {
          resolvedHref = rawHref;
        }
      }

      const locale = validateHreflangCode(rawHreflang);
      const isSelf = resolvedHref === baseUrl || resolvedHref === baseUrl.replace(/\/$/, '') || baseUrl === resolvedHref.replace(/\/$/, '');

      annotations.push({
        hreflang: rawHreflang,
        normalizedHreflang: locale.isXDefault ? 'x-default' : (locale.region ? `${locale.language}-${locale.region}` : (locale.language || rawHreflang.toLowerCase())),
        language: locale.language,
        region: locale.region,
        script: locale.script,
        href: resolvedHref,
        source: 'HTML',
        sourceUrl: baseUrl,
        isSelfReference: isSelf,
        rawAttributes: attrs,
      });

      // Pass forward locale validation issues
      for (const iss of locale.issues) {
        issues.push({
          ...iss,
          alternateUrl: resolvedHref,
          hreflang: rawHreflang,
        });
      }
    }
  }

  // Check if hreflang tags were placed incorrectly in the <body>
  if (body) {
    const bodyLinkRegex = /<link\s+([^>]*?)>/gi;
    let bLinkMatch: RegExpExecArray | null;
    while ((bLinkMatch = bodyLinkRegex.exec(body)) !== null) {
      const attrs = parseTagAttributes(bLinkMatch[1]);
      if (attrs.hreflang) {
        issues.push({
          code: 'HREFLANG_IN_BODY',
          severity: 'warning',
          message: `hreflang tag ("${attrs.hreflang}") was found in the <body> instead of the <head>. Google may ignore hreflang tags outside the <head>.`,
          hreflang: attrs.hreflang,
          alternateUrl: attrs.href,
        });
      }
    }
  }

  return {
    title,
    htmlLang,
    metaContentLanguage,
    canonicalUrl,
    robotsMeta,
    annotations,
    issues,
  };
}
