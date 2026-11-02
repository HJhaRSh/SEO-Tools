import { safeFetch } from '../safeFetch';
import * as cheerio from 'cheerio';
import type { ExtractedPage, PageSection } from './types';

const MAX_SECTIONS_DEFAULT = 30;
const MAX_WORDS_PER_SECTION = 500;
const SECTION_OVERLAP_WORDS = 50;
const MAX_FULL_TEXT_CHARS = 100000; // 100KB max text to avoid memory pressure

/**
 * Splits extracted content into cohesive sections bounded by headings.
 * Caps at maxSections (default 30), with max 500 words per section and overlap.
 */
export function splitIntoSections(
  title: string | null,
  h1: string | null,
  headings: { level: number; text: string }[],
  fullText: string,
  maxSections: number = MAX_SECTIONS_DEFAULT
): PageSection[] {
  const sections: PageSection[] = [];
  const normalizedText = fullText.trim();

  if (!normalizedText) {
    return sections;
  }

  // Helper to split long text into overlapping chunks
  function chunkText(
    text: string,
    baseHeading: string | null,
    level: number | null,
    startOffset: number
  ): PageSection[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    if (words.length <= MAX_WORDS_PER_SECTION) {
      return [{
        id: `section-${sections.length}`,
        heading: baseHeading,
        headingLevel: level,
        content: text.trim(),
        wordCount: words.length,
        charOffset: startOffset,
      }];
    }

    const chunks: PageSection[] = [];
    let wordIdx = 0;
    let partNum = 1;

    while (wordIdx < words.length && (sections.length + chunks.length) < maxSections) {
      const slice = words.slice(wordIdx, wordIdx + MAX_WORDS_PER_SECTION);
      const chunkContent = slice.join(' ');
      const chunkWordCount = slice.length;
      const partSuffix = words.length > MAX_WORDS_PER_SECTION ? ` (Part ${partNum})` : '';

      chunks.push({
        id: `section-${sections.length + chunks.length}`,
        heading: baseHeading ? `${baseHeading}${partSuffix}` : (partNum > 1 ? `Section (Part ${partNum})` : null),
        headingLevel: level,
        content: chunkContent,
        wordCount: chunkWordCount,
        charOffset: startOffset + Math.min(startOffset + wordIdx * 6, normalizedText.length),
      });

      partNum++;
      wordIdx += (MAX_WORDS_PER_SECTION - SECTION_OVERLAP_WORDS);
      if (wordIdx >= words.length) break;
    }

    return chunks;
  }

  // Filter meaningful headings (levels 1-4)
  const meaningfulHeadings = headings.filter(h => h.level <= 4 && h.text.trim().length > 0);

  // If no headings found, chunk the full text directly
  if (meaningfulHeadings.length === 0) {
    const rawChunks = chunkText(normalizedText, h1 || title || null, h1 ? 1 : null, 0);
    return rawChunks.slice(0, maxSections);
  }

  // Find occurrences of headings in fullText to determine boundaries
  interface HeadingBoundary {
    heading: { level: number; text: string };
    startIndex: number;
  }

  const boundaries: HeadingBoundary[] = [];
  const lowerFull = normalizedText.toLowerCase();
  let searchCursor = 0;

  for (const h of meaningfulHeadings) {
    const hLower = h.text.trim().toLowerCase();
    const foundIdx = lowerFull.indexOf(hLower, searchCursor);
    if (foundIdx !== -1) {
      boundaries.push({ heading: h, startIndex: foundIdx });
      searchCursor = foundIdx + hLower.length;
    }
  }

  // If none of the headings were found in the text, chunk fullText directly
  if (boundaries.length === 0) {
    const rawChunks = chunkText(normalizedText, h1 || title || null, h1 ? 1 : null, 0);
    return rawChunks.slice(0, maxSections);
  }

  // Introductory section before first heading (if substantial)
  const firstBoundary = boundaries[0];
  if (firstBoundary.startIndex > 60) {
    const introText = normalizedText.slice(0, firstBoundary.startIndex).trim();
    if (introText.length > 0) {
      const introChunks = chunkText(introText, h1 || title || 'Introduction', h1 ? 1 : null, 0);
      for (const ch of introChunks) {
        if (sections.length < maxSections) sections.push(ch);
      }
    }
  }

  // Iterate boundaries and slice content between headings
  for (let i = 0; i < boundaries.length; i++) {
    if (sections.length >= maxSections) break;

    const current = boundaries[i];
    const next = boundaries[i + 1];
    const headingTextLen = current.heading.text.length;

    // Slice content between end of this heading and start of next heading
    const contentStart = current.startIndex + headingTextLen;
    const contentEnd = next ? next.startIndex : normalizedText.length;
    const sectionBody = normalizedText.slice(contentStart, contentEnd).trim();

    // Even if body is short, keep heading text context
    const fullSectionText = sectionBody.length > 0
      ? sectionBody
      : current.heading.text;

    const chunks = chunkText(
      fullSectionText,
      current.heading.text,
      current.heading.level,
      current.startIndex
    );

    for (const ch of chunks) {
      if (sections.length < maxSections) {
        // Re-assign ID to ensure consecutive sequential numbering
        ch.id = `section-${sections.length}`;
        sections.push(ch);
      }
    }
  }

  return sections;
}

/**
 * Parses raw manual text into an ExtractedPage object (for paste / manual analysis mode).
 */
export function parseManualText(text: string): ExtractedPage {
  const startTime = Date.now();
  const trimmed = text.trim();
  const isTruncated = trimmed.length > MAX_FULL_TEXT_CHARS;
  const processedText = isTruncated ? trimmed.slice(0, MAX_FULL_TEXT_CHARS) : trimmed;

  const lines = processedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const headings: { level: number; text: string }[] = [];
  let h1: string | null = null;
  let title: string | null = null;

  for (const line of lines) {
    const mdMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      const level = mdMatch[1].length;
      const textVal = mdMatch[2].trim();
      headings.push({ level, text: textVal });
      if (level === 1 && !h1) {
        h1 = textVal;
      }
    } else if (!title && line.length < 120) {
      // First short line as title candidate
      title = line;
    }
  }

  if (!title && lines.length > 0) {
    title = lines[0].slice(0, 80);
  }

  const sections = splitIntoSections(title, h1, headings, processedText);
  const wordCount = processedText.split(/\s+/).filter(Boolean).length;

  return {
    requestedUrl: 'manual://input',
    finalUrl: 'manual://input',
    statusCode: 200,
    title,
    metaDescription: null,
    canonicalUrl: null,
    language: null,
    h1,
    headings,
    sections,
    fullText: processedText,
    wordCount,
    extractionQuality: wordCount >= 50 ? 'high' : 'medium',
    extractionNote: isTruncated ? 'Manual text exceeded 100KB limit and was truncated.' : null,
    isTruncated,
    fetchDurationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extracts page content and metadata from a given URL using safeFetch and Cheerio.
 * Uses pure Cheerio extraction optimized for serverless environments.
 */
export function extractFromHtml(
  html: string,
  url: string,
  finalUrl: string,
  statusCode: number,
  fetchDurationMs: number,
  isFetchTruncated: boolean = false
): ExtractedPage {
  const $ = cheerio.load(html);

  // 1. Metadata extraction
  const title = $('title').first().text().replace(/\s+/g, ' ').trim() || null;
  const metaDescription =
    $('meta[name="description" i]').attr('content')?.trim() ||
    $('meta[property="og:description" i]').attr('content')?.trim() ||
    null;
  const canonicalUrl = $('link[rel="canonical" i]').attr('href')?.trim() || null;
  const language =
    $('html').attr('lang')?.trim() ||
    $('meta[http-equiv="content-language" i]').attr('content')?.trim() ||
    null;

  // 2. Extract Headings before DOM pruning
  const headings: { level: number; text: string }[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tagName = (el as any).tagName ? (el as any).tagName.toLowerCase() : '';
    const level = parseInt(tagName.replace('h', ''), 10) || 2;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && text.length > 1 && text.length < 200) {
      headings.push({ level, text });
    }
  });

  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim() || null;

  // 3. Remove boilerplate elements
  $(
    'script, style, noscript, iframe, svg, nav, footer, header, aside, form, ' +
    '.cookie-banner, #cookie, .gdpr, .cookie-consent, [aria-hidden="true"], ' +
    '[role="navigation"], [role="banner"], [role="contentinfo"], .ad, .ads, .sidebar'
  ).remove();

  // 4. Locate main content container
  const candidateSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.content',
    '.post-content',
    '.entry-content',
    '#content',
    '.article-body',
    '.article-content',
  ];

  let $contentContainer: cheerio.Cheerio<any> = $('body');
  let bestCandidateLength = 0;

  for (const selector of candidateSelectors) {
    const match = $(selector).first();
    if (match.length > 0) {
      const matchText = match.text().trim();
      if (matchText.length > bestCandidateLength && matchText.length > 100) {
        $contentContainer = match;
        bestCandidateLength = matchText.length;
      }
    }
  }

  // 5. Format text with paragraph boundaries
  $contentContainer.find('p, h1, h2, h3, h4, h5, h6, li, tr, blockquote, div, section').each((_, el) => {
    $(el).append('\n\n');
  });

  let rawFullText = $contentContainer.text();
  // Normalize whitespace: collapse consecutive horizontal spaces, limit newlines to at most 2
  rawFullText = rawFullText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  const isTruncated = isFetchTruncated || rawFullText.length > MAX_FULL_TEXT_CHARS;
  const fullText = isTruncated ? rawFullText.slice(0, MAX_FULL_TEXT_CHARS) : rawFullText;
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  // 6. Detect JS-only / SPA client-side rendering
  let extractionQuality: 'high' | 'medium' | 'low' | 'failed' = 'high';
  let extractionNote: string | null = null;

  if (statusCode >= 400) {
    extractionQuality = 'failed';
    extractionNote = `HTTP ${statusCode} status code returned by server.`;
  } else if (wordCount < 50) {
    const spaIndicators = [
      'react-root',
      'data-reactroot',
      'id="root"',
      'id="__next"',
      'id="__nuxt"',
      'ng-version',
      '<app-root>',
      'window.__INITIAL_STATE__',
    ];
    const isSpa = spaIndicators.some(indicator => html.includes(indicator));
    if (isSpa) {
      extractionQuality = 'low';
      extractionNote = 'Client-rendered SPA framework detected with minimal static HTML. Content is JavaScript-rendered and requires browser execution.';
    } else {
      extractionQuality = 'low';
      extractionNote = 'Very low word count extracted from page (< 50 words).';
    }
  } else if (wordCount < 100) {
    extractionQuality = 'medium';
    extractionNote = 'Sparse content extracted from page (< 100 words).';
  }

  if (isTruncated && !extractionNote) {
    extractionNote = 'Content exceeded 100KB limit and was truncated.';
  }

  // 7. Split into sections
  const sections = splitIntoSections(title, h1, headings, fullText);

  return {
    requestedUrl: url,
    finalUrl,
    statusCode,
    title,
    metaDescription,
    canonicalUrl,
    language,
    h1,
    headings,
    sections,
    fullText,
    wordCount,
    extractionQuality,
    extractionNote,
    isTruncated,
    fetchDurationMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetches and extracts content from a target URL.
 * Enforces SSRF safety and 1MB size limit via safeFetch.
 */
export async function extractPage(url: string, timeoutMs: number = 15000): Promise<ExtractedPage> {
  const fetchRes = await safeFetch(url, {
    timeoutMs,
    maxBytes: 1024 * 1024, // 1MB limit
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 IndianMarketersBot/1.0',
  });

  return extractFromHtml(
    fetchRes.body,
    fetchRes.requestedUrl,
    fetchRes.finalUrl,
    fetchRes.statusCode,
    fetchRes.durationMs,
    fetchRes.isTruncated
  );
}
