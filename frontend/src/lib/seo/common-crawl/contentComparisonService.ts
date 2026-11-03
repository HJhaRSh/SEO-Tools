/**
 * Common Crawl Archived Content vs Live Content Comparison
 * Feature 7 — HTML Preservation, Text Length Ratio & Client-Side SPA Detection
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import * as cheerio from 'cheerio';
import { ContentComparisonResult, ContentHeading } from './types';
import { safeFetch } from '../safeFetch';
import { fetchWarcRecord } from './warcReader';
import { formatCdxTimestamp } from './domainAnalysisService';

export interface ExtractedHtmlContent {
  readableText: string;
  wordCount: number;
  textLength: number;
  headings: ContentHeading[];
  isSpaEmptyShell: boolean;
  spaIndicators: string[];
  excerpt: string;
}

/**
 * Extracts clean readable text, headings, and SPA indicators from raw server HTML
 */
export function extractContentFromHtml(rawHtml: string): ExtractedHtmlContent {
  const $ = cheerio.load(rawHtml);

  // Check for SPA empty shell indicators before removing script tags
  const spaIndicators: string[] = [];
  const scriptSrcs: string[] = [];
  $('script').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (src) scriptSrcs.push(src);
  });

  const hasReactOrNextScript = scriptSrcs.some(s => 
    s.includes('chunk') || s.includes('react') || s.includes('_next') || s.includes('bundle') || s.includes('webpack')
  );

  const hasEmptyRootDiv = $('#root, #app, #__next').length > 0 && 
    ($('#root, #app, #__next').text().trim().length < 80);

  // Remove boilerplate & non-content tags
  $('script, style, noscript, svg, iframe, nav, header, footer').remove();

  // Extract headings
  const headings: ContentHeading[] = [];
  $('h1, h2, h3').each((_, el) => {
    const tagName = el.tagName.toLowerCase();
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text) {
      headings.push({
        level: parseInt(tagName.replace('h', ''), 10) || 2,
        text: text.slice(0, 150)
      });
    }
  });

  // Extract clean body text
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const words = bodyText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  if (wordCount < 60 && hasEmptyRootDiv) {
    spaIndicators.push('Container div (#root/#app) contains virtually no server-rendered markup.');
  }
  if (wordCount < 80 && hasReactOrNextScript) {
    spaIndicators.push('Client bundle scripts detected with under 80 words of server-delivered text.');
  }

  const isSpaEmptyShell = spaIndicators.length > 0 && wordCount < 100;
  const excerpt = bodyText.slice(0, 400);

  return {
    readableText: bodyText,
    wordCount,
    textLength: bodyText.length,
    headings,
    isSpaEmptyShell,
    spaIndicators,
    excerpt
  };
}

/**
 * Compares archived WARC HTML directly from official data.commoncrawl.org against live server-delivered HTML
 */
export async function compareArchivedVsLiveContent(
  targetUrl: string,
  warcFilename: string,
  offset: number,
  length: number,
  captureTimestamp: string
): Promise<ContentComparisonResult> {
  // 1. Fetch archived HTML directly from official WARC storage
  const warcPayload = await fetchWarcRecord(warcFilename, offset, length, 8000);
  const archivedContent = extractContentFromHtml(warcPayload.payloadText);

  // 2. Fetch live HTML via safeFetch
  let liveHtml = '';
  try {
    const liveRes = await safeFetch(targetUrl, {
      timeoutMs: 8000,
      maxBytes: 1024 * 1024,
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    liveHtml = liveRes.body;
  } catch (err: any) {
    liveHtml = `<html><body><p>Error retrieving live HTML: ${err.message}</p></body></html>`;
  }

  const liveContent = extractContentFromHtml(liveHtml);

  // Compute length ratio
  const lengthRatio = liveContent.textLength > 0 
    ? Math.round((archivedContent.textLength / liveContent.textLength) * 100) / 100
    : 1.0;

  // Compare headings and identify sections present in live but absent from archived
  const archivedHeadingTexts = new Set(archivedContent.headings.map(h => h.text.toLowerCase()));
  const missingSections: string[] = [];

  for (const liveH of liveContent.headings) {
    if (!archivedHeadingTexts.has(liveH.text.toLowerCase())) {
      missingSections.push(liveH.text);
    }
  }

  // Heading parity score
  const totalHeadings = Math.max(1, liveContent.headings.length);
  const matchedHeadings = liveContent.headings.length - missingSections.length;
  const headingParityScore = Math.max(0, Math.min(100, Math.round((matchedHeadings / totalHeadings) * 100)));

  const limitations = [
    'Both archived and live pages are compared as initial server-delivered HTML without client-side JavaScript rendering.',
    'Common Crawl (CCBot) captures raw HTTP payloads and does not execute heavy client-side scripts during archival.',
    'Presence in Common Crawl records reflects archival capture, not an assessment of whether an LLM incorporates the text.'
  ];

  if (liveContent.isSpaEmptyShell) {
    limitations.push('The live page appears to rely heavily on client-side rendering (SPA framework). Initial server HTML contains minimal indexable text.');
  }

  return {
    url: targetUrl,
    captureDate: formatCdxTimestamp(captureTimestamp) || captureTimestamp,
    archivedTextLength: archivedContent.textLength,
    liveTextLength: liveContent.textLength,
    archivedWordCount: archivedContent.wordCount,
    liveWordCount: liveContent.wordCount,
    lengthRatio,
    isSpaEmptyShell: liveContent.isSpaEmptyShell,
    spaIndicators: liveContent.spaIndicators,
    archivedHeadings: archivedContent.headings.slice(0, 15),
    liveHeadings: liveContent.headings.slice(0, 15),
    headingParityScore,
    missingSections: missingSections.slice(0, 10),
    archivedExcerpt: archivedContent.excerpt,
    liveExcerpt: liveContent.excerpt,
    limitations
  };
}

