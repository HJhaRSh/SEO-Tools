/**
 * Sitemap XML Generator with Automatic Splitting
 * Tool 4 — XML Sitemap Generator
 *
 * Enforces strict limits:
 * - Max 50,000 URLs per sitemap
 * - Max 50 MB uncompressed UTF-8 XML per sitemap
 * - Automatic splitting into sitemap-1.xml, sitemap-2.xml, ...
 * - Deterministic, valid XML 1.0 output
 * - Entity escaping & accurate W3C dates
 */

import {
  SitemapUrlEntry,
  SitemapOptions,
  GeneratedSitemapFile,
  SitemapValidationIssue,
  SitemapValidationSummary
} from './sitemapTypes.js';
import {
  validateSitemapUrl,
  validateLastmodDate,
  validateChangeFreq,
  validatePriority,
  escapeXmlEntities
} from './sitemapValidation.js';
import {
  validateUrlAlternates,
  validateReciprocalHreflang,
  expandReciprocalEntries
} from './sitemapHreflang.js';
import { buildIndexEntriesFromFiles, buildSitemapIndexXml } from './sitemapIndex.js';

export const PROTOCOL_MAX_URLS = 50000;
export const PROTOCOL_MAX_BYTES = 50 * 1024 * 1024; // 50MB
// Safety margin buffer for splitting to ensure total file with header and closing tag never exceeds 50MB
const SPLIT_BYTE_SAFETY_BUFFER = 100 * 1024; // 100KB buffer

/**
 * Builds the XML opening tag for <urlset>
 */
function getUrlsetHeader(hasHreflang: boolean): string {
  if (hasHreflang) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
}

const URLSET_FOOTER = '</urlset>\n';

/**
 * Serializes a single <url> entry to XML string
 */
export function serializeUrlElement(
  entry: SitemapUrlEntry,
  options: SitemapOptions
): string {
  const parts: string[] = ['  <url>\n'];
  parts.push(`    <loc>${escapeXmlEntities(entry.loc)}</loc>\n`);

  if (options.includeLastmod && entry.lastmod) {
    parts.push(`    <lastmod>${escapeXmlEntities(entry.lastmod)}</lastmod>\n`);
  }

  if (options.includeChangefreq && entry.changefreq) {
    parts.push(`    <changefreq>${escapeXmlEntities(entry.changefreq)}</changefreq>\n`);
  }

  if (options.includePriority && entry.priority !== undefined && entry.priority !== null) {
    parts.push(`    <priority>${escapeXmlEntities(String(entry.priority))}</priority>\n`);
  }

  if (options.includeHreflang && entry.alternates && entry.alternates.length > 0) {
    for (const alt of entry.alternates) {
      parts.push(`    <xhtml:link rel="alternate" hreflang="${escapeXmlEntities(alt.hreflang)}" href="${escapeXmlEntities(alt.href)}" />\n`);
    }
  }

  parts.push('  </url>\n');
  return parts.join('');
}

/**
 * Complete XML Sitemap Generator Pipeline
 */
export function generateSitemapXml(
  rawEntries: SitemapUrlEntry[],
  options: SitemapOptions = {}
): {
  success: boolean;
  summary: SitemapValidationSummary;
  files: GeneratedSitemapFile[];
  xmlPreview: string;
  isPreviewTruncated: boolean;
  warnings: SitemapValidationIssue[];
  errors: SitemapValidationIssue[];
} {
  const opts: SitemapOptions = {
    includeLastmod: options.includeLastmod ?? true,
    includeHreflang: options.includeHreflang ?? true,
    includeChangefreq: options.includeChangefreq ?? false,
    includePriority: options.includePriority ?? false,
    deduplicate: options.deduplicate ?? true,
    generateIndex: options.generateIndex ?? false,
    publicBaseUrl: options.publicBaseUrl,
    autoExpandReciprocalHreflang: options.autoExpandReciprocalHreflang ?? false,
    maxUrlsPerSitemap: options.maxUrlsPerSitemap || PROTOCOL_MAX_URLS,
    maxBytesPerSitemap: options.maxBytesPerSitemap || PROTOCOL_MAX_BYTES
  };

  const allWarnings: SitemapValidationIssue[] = [];
  const allErrors: SitemapValidationIssue[] = [];

  const submittedRows = rawEntries.length;
  let validUrlCount = 0;
  let invalidUrlCount = 0;
  let duplicateUrlCount = 0;
  let totalHreflangAnnotations = 0;

  // Step 1: Pre-process and validate raw entries
  const seenLocs = new Set<string>();
  const cleanedEntries: SitemapUrlEntry[] = [];

  rawEntries.forEach((raw, idx) => {
    const rowNum = idx + 1;
    const urlVal = validateSitemapUrl(raw.loc, rowNum, 'loc');
    if (!urlVal.isValid || !urlVal.sanitizedUrl) {
      invalidUrlCount++;
      allErrors.push(...urlVal.issues);
      return;
    }

    if (urlVal.issues.length > 0) {
      allWarnings.push(...urlVal.issues);
    }

    const cleanLoc = urlVal.sanitizedUrl;

    if (seenLocs.has(cleanLoc)) {
      duplicateUrlCount++;
      if (opts.deduplicate) {
        allWarnings.push({
          rowNumber: rowNum,
          url: cleanLoc,
          field: 'loc',
          code: 'URL_DUPLICATE_SKIPPED',
          message: `Duplicate URL "${cleanLoc}" detected and excluded from sitemap.`,
          severity: 'warning'
        });
        return;
      }
    }
    seenLocs.add(cleanLoc);

    // Validate Lastmod
    let cleanLastmod: string | undefined = undefined;
    if (raw.lastmod) {
      const dateVal = validateLastmodDate(raw.lastmod, rowNum);
      if (dateVal.isValid && dateVal.formattedDate) {
        cleanLastmod = dateVal.formattedDate;
      }
      if (dateVal.issues.length > 0) {
        // Collect warnings or errors
        dateVal.issues.forEach(iss => {
          if (iss.severity === 'error') allErrors.push(iss);
          else allWarnings.push(iss);
        });
      }
    }

    // Validate Changefreq
    let cleanChangefreq = undefined;
    if (raw.changefreq) {
      const freqVal = validateChangeFreq(raw.changefreq, rowNum);
      if (freqVal.isValid) cleanChangefreq = freqVal.value;
      allWarnings.push(...freqVal.issues.filter(i => i.severity !== 'error'));
      allErrors.push(...freqVal.issues.filter(i => i.severity === 'error'));
    }

    // Validate Priority
    let cleanPriority = undefined;
    if (raw.priority !== undefined && raw.priority !== null && raw.priority !== '') {
      const prioVal = validatePriority(raw.priority, rowNum);
      if (prioVal.isValid) cleanPriority = prioVal.value;
      allWarnings.push(...prioVal.issues.filter(i => i.severity !== 'error'));
      allErrors.push(...prioVal.issues.filter(i => i.severity === 'error'));
    }

    // Validate Alternates / Hreflang
    let cleanAlternates = undefined;
    if (opts.includeHreflang && raw.alternates && raw.alternates.length > 0) {
      const altVal = validateUrlAlternates(cleanLoc, raw.alternates, rowNum);
      cleanAlternates = altVal.validAlternates;
      totalHreflangAnnotations += altVal.validAlternates.length;

      altVal.issues.forEach(iss => {
        if (iss.severity === 'error') allErrors.push(iss);
        else allWarnings.push(iss);
      });
    }

    validUrlCount++;
    cleanedEntries.push({
      loc: cleanLoc,
      lastmod: cleanLastmod,
      changefreq: cleanChangefreq,
      priority: cleanPriority,
      alternates: cleanAlternates
    });
  });

  // Step 2: Hreflang reciprocal checks or expansion
  let finalEntries = cleanedEntries;
  if (opts.includeHreflang) {
    if (opts.autoExpandReciprocalHreflang) {
      const expansion = expandReciprocalEntries(finalEntries);
      finalEntries = expansion.expandedEntries;
      if (expansion.addedCount > 0) {
        allWarnings.push({
          code: 'HREFLANG_RECIPROCAL_EXPANDED',
          message: `Auto-generated ${expansion.addedCount} reciprocal <url> entries for alternate language pages.`,
          severity: 'info'
        });
      }
    }

    const recipCheck = validateReciprocalHreflang(finalEntries);
    allWarnings.push(...recipCheck.issues);
  }

  // Step 3: Splitting into multiple sitemaps based on count and byte limits
  const maxUrls = opts.maxUrlsPerSitemap || PROTOCOL_MAX_URLS;
  const configuredMaxBytes = opts.maxBytesPerSitemap || PROTOCOL_MAX_BYTES;
  const safetyBuffer = Math.min(SPLIT_BYTE_SAFETY_BUFFER, Math.floor(configuredMaxBytes * 0.1));
  const maxBytes = configuredMaxBytes - safetyBuffer;
  const hasHreflangInEntries = finalEntries.some(e => e.alternates && e.alternates.length > 0);

  const headerStr = getUrlsetHeader(hasHreflangInEntries);
  const headerBytes = Buffer.byteLength(headerStr, 'utf-8');
  const footerBytes = Buffer.byteLength(URLSET_FOOTER, 'utf-8');

  interface CurrentSitemapBatch {
    entries: string[];
    byteSize: number;
    urlCount: number;
  }

  const batches: CurrentSitemapBatch[] = [];
  let currentBatch: CurrentSitemapBatch = {
    entries: [],
    byteSize: headerBytes + footerBytes,
    urlCount: 0
  };

  for (const entry of finalEntries) {
    const xmlFragment = serializeUrlElement(entry, opts);
    const fragmentBytes = Buffer.byteLength(xmlFragment, 'utf-8');

    // If single entry alone exceeds limit, report error
    if (fragmentBytes + headerBytes + footerBytes > (opts.maxBytesPerSitemap || PROTOCOL_MAX_BYTES)) {
      allErrors.push({
        url: entry.loc,
        code: 'ENTRY_EXCEEDS_MAX_SIZE',
        message: `URL entry for "${entry.loc}" has size ${(fragmentBytes / 1024).toFixed(1)}KB which exceeds single-file limits.`,
        severity: 'error'
      });
      continue;
    }

    // Check if adding this entry exceeds count or byte size
    const wouldExceedCount = currentBatch.urlCount + 1 > maxUrls;
    const wouldExceedBytes = currentBatch.byteSize + fragmentBytes > maxBytes;

    if ((wouldExceedCount || wouldExceedBytes) && currentBatch.urlCount > 0) {
      batches.push(currentBatch);
      currentBatch = {
        entries: [],
        byteSize: headerBytes + footerBytes,
        urlCount: 0
      };
    }

    currentBatch.entries.push(xmlFragment);
    currentBatch.byteSize += fragmentBytes;
    currentBatch.urlCount++;
  }

  if (currentBatch.urlCount > 0) {
    batches.push(currentBatch);
  }

  // If no entries at all (or all failed)
  if (batches.length === 0) {
    batches.push({
      entries: [],
      byteSize: headerBytes + footerBytes,
      urlCount: 0
    });
  }

  // Step 4: Create GeneratedSitemapFile list
  const generatedFiles: GeneratedSitemapFile[] = [];
  const isMultiple = batches.length > 1;

  batches.forEach((batch, idx) => {
    const filename = isMultiple ? `sitemap-${idx + 1}.xml` : 'sitemap.xml';
    const content = headerStr + batch.entries.join('') + URLSET_FOOTER;
    const byteSize = Buffer.byteLength(content, 'utf-8');

    generatedFiles.push({
      filename,
      type: 'urlset',
      urlCount: batch.urlCount,
      byteSize,
      content,
      downloadId: `sitemap_${Date.now()}_${idx + 1}`
    });
  });

  // Step 5: Sitemap Index handling
  if (isMultiple || opts.generateIndex) {
    if (opts.publicBaseUrl && opts.publicBaseUrl.trim()) {
      const filenames = generatedFiles.map(f => f.filename);
      const indexResult = buildIndexEntriesFromFiles(filenames, opts.publicBaseUrl);

      if (indexResult.success && indexResult.entries) {
        const indexXml = buildSitemapIndexXml(indexResult.entries);
        const indexBytes = Buffer.byteLength(indexXml, 'utf-8');

        // Prepend index file
        generatedFiles.unshift({
          filename: 'sitemap_index.xml',
          type: 'sitemapindex',
          urlCount: filenames.length,
          byteSize: indexBytes,
          content: indexXml,
          downloadId: `index_${Date.now()}`
        });
      } else if (indexResult.error) {
        allErrors.push({
          code: 'SITEMAP_INDEX_URL_ERROR',
          message: indexResult.error,
          severity: 'error'
        });
      }
    } else {
      // User required or splitting occurred but no publicBaseUrl provided
      allWarnings.push({
        code: 'SITEMAP_INDEX_SKIPPED_NO_BASE_URL',
        message: 'Multiple sitemap files were generated, but sitemap_index.xml could not be built because no public base URL (e.g. https://example.com/sitemaps/) was specified.',
        severity: 'warning'
      });
    }
  }

  // Step 6: Create preview (safely bounded)
  const primaryXml = generatedFiles[0]?.content || '';
  const PREVIEW_MAX_LINES = 120;
  const lines = primaryXml.split('\n');
  const isPreviewTruncated = lines.length > PREVIEW_MAX_LINES;
  const previewLines = isPreviewTruncated ? lines.slice(0, PREVIEW_MAX_LINES) : lines;
  const xmlPreview = previewLines.join('\n') + (isPreviewTruncated ? '\n\n<!-- ... Preview truncated. Download complete sitemap file to view all URLs ... -->' : '');

  const summary: SitemapValidationSummary = {
    submittedRows,
    validUrls: validUrlCount,
    invalidUrls: invalidUrlCount,
    duplicateUrls: duplicateUrlCount,
    hreflangAnnotations: totalHreflangAnnotations,
    warningsCount: allWarnings.length,
    errorsCount: allErrors.length,
    estimatedFileCount: generatedFiles.length
  };

  return {
    success: allErrors.length === 0,
    summary,
    files: generatedFiles,
    xmlPreview,
    isPreviewTruncated,
    warnings: allWarnings,
    errors: allErrors
  };
}
