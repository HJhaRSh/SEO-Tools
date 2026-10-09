/**
 * Sitemap Types & Interfaces
 * Tool 4 — XML Sitemap Generator
 */

export type SitemapChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export interface AlternateEntry {
  hreflang: string;
  href: string;
}

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string | null;
  changefreq?: SitemapChangeFreq | null;
  priority?: string | number | null;
  alternates?: AlternateEntry[];
}

export interface ColumnMapping {
  locColumn: string;
  lastmodColumn?: string;
  changefreqColumn?: string;
  priorityColumn?: string;
  // If hreflang format is 'wide', this maps column header -> hreflang code (e.g. { "en": "en", "es": "es-ES" })
  wideHreflangColumns?: Record<string, string>;
  // If hreflang format is 'long', specify the column with the code and the column with the URL
  longHreflangCodeColumn?: string;
  longHreflangUrlColumn?: string;
}

export interface SitemapOptions {
  includeLastmod?: boolean;
  includeHreflang?: boolean;
  includeChangefreq?: boolean;
  includePriority?: boolean;
  deduplicate?: boolean;
  generateIndex?: boolean;
  publicBaseUrl?: string; // Required if generateIndex is true or splitting occurs
  autoExpandReciprocalHreflang?: boolean;
  maxUrlsPerSitemap?: number; // Defaults to 50,000
  maxBytesPerSitemap?: number; // Defaults to 50 * 1024 * 1024 (50MB)
}

export type Severity = 'error' | 'warning' | 'info';

export interface SitemapValidationIssue {
  rowNumber?: number;
  url?: string;
  field?: string;
  code: string;
  message: string;
  severity: Severity;
}

export interface SitemapValidationSummary {
  submittedRows: number;
  validUrls: number;
  invalidUrls: number;
  duplicateUrls: number;
  hreflangAnnotations: number;
  warningsCount: number;
  errorsCount: number;
  estimatedFileCount: number;
}

export interface GeneratedSitemapFile {
  filename: string;
  type: 'urlset' | 'sitemapindex';
  urlCount: number;
  byteSize: number;
  content: string; // XML string (or preview/download key for very large sets)
  downloadId: string;
}

export interface SitemapGenerationResult {
  success: boolean;
  summary: SitemapValidationSummary;
  files: GeneratedSitemapFile[];
  zipDownloadId?: string;
  xmlPreview: string;
  isPreviewTruncated: boolean;
  warnings: SitemapValidationIssue[];
  errors: SitemapValidationIssue[];
}

export interface SpreadsheetParseResult {
  success: boolean;
  format: 'csv' | 'xlsx' | 'manual';
  sheetNames?: string[];
  selectedSheet?: string;
  headers: string[];
  totalRows: number;
  previewRows: Record<string, any>[];
  detectedMapping?: Partial<ColumnMapping>;
  suggestedType: 'simple' | 'hreflang-wide' | 'hreflang-long';
  errors?: string[];
}
