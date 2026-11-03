/**
 * Common Crawl Visibility Checker Types
 * Tool #19 — Indian Marketers SEO Toolkit
 */

export type AnalysisMode = 'domain' | 'page';

export type ScopeSetting = 'exact' | 'include_www' | 'subdomains';

export interface CrawlCollection {
  id: string;
  name: string;
  timegate: string;
  cdxApi: string;
  from?: string;
  to?: string;
  isAvailable?: boolean;
}

export type CollectionQueryStatus = 
  | 'confirmed'
  | 'estimated'
  | 'no_records'
  | 'temporarily_unavailable'
  | 'rate_limited'
  | 'query_error';

export interface MonthlyCrawlRecord {
  collectionId: string;
  collectionName: string;
  dateRange: string;
  capturedCount: number;
  countType: 'exact' | 'estimated' | 'partial' | 'none' | 'unavailable';
  status: CollectionQueryStatus;
  statusMessage?: string;
  lastCapturedDate?: string;
  sampleSize?: number;
  estimationMethod?: string;
  uniqueHtmlUrls?: number;
  totalBlocks?: number;
  totalPages?: number;
  languages?: Array<{ lang: string; count: number }>;
  statuses?: Record<string, number>;
  samples?: Array<{ url: string; ts: string }>;
  urls?: Array<{ url: string; ts: string; status: number }>;
  robots?: any[];
  homepageRecord?: any;
  htmlCapturesCount?: number;
  robotsCount?: number;
  redirectsCount?: number;
  forbiddenCount?: number;
  otherResourcesCount?: number;
}

export interface DiscoveredUrlVariant {
  url: string;
  variantType: 'exact' | 'protocol' | 'www' | 'trailing_slash' | 'query';
  captureCount: number;
  latestTimestamp?: string;
  latestStatus?: number;
}

export interface PageCaptureRecord {
  timestamp: string;
  collectionId: string;
  url: string;
  status: number;
  mime: string;
  digest: string;
  length: number;
  offset: number;
  filename: string;
}

export interface HistoricalRobotsRecord {
  collectionId: string;
  collectionName: string;
  captureDate?: string;
  isAvailable: boolean;
  ccBotStatus: 'ALLOWED' | 'BLOCKED' | 'UNAVAILABLE';
  wildcardStatus: 'ALLOWED' | 'BLOCKED' | 'UNAVAILABLE';
  appliedRule?: {
    type: 'allow' | 'disallow';
    pattern: string;
    lineNumber: number;
    originalText: string;
  } | null;
  crawlDelay?: number;
  sitemapsCount: number;
  rawExcerpt?: string;
  firstObservedChange?: boolean;
}

export interface BlockSourceDetection {
  detectedPattern: string;
  likelyOrigin: 'Cloudflare' | 'Squarespace' | 'WordPress/CMS' | 'Known Blocklist' | 'Custom Rule' | 'Undetermined';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string[];
  suggestedAction: string;
}

export interface LiveProbeResult {
  profileName: string;
  userAgent: string;
  statusCode: number;
  statusText: string;
  durationMs: number;
  contentType: string;
  redirectDestination?: string;
  challengeIndicator?: 'NONE' | 'CLOUDFLARE_CHALLENGE' | 'CLOUDFLARE_BLOCKED' | 'BOT_MANAGEMENT' | 'CAPTCHA' | 'ACCESS_DENIED' | 'SERVER_ERROR';
  accessResult: 'SERVED_SUCCESSFULLY' | 'CHALLENGED' | 'BLOCKED' | 'ERROR' | 'UNAVAILABLE';
  relevantHeaders: Record<string, string>;
  limitationDisclaimer: string;
}

export interface SitemapComparisonUrl {
  url: string;
  status: 'ARCHIVED' | 'NOT_FOUND_IN_COLLECTION' | 'OUTSIDE_SITEMAP';
  captureTimestamp?: string;
  httpStatus?: number;
  mimeType?: string;
}

export interface SitemapCoverageAnalysis {
  sitemapUrl: string;
  collectionId: string;
  totalSitemapUrls: number;
  confirmedArchivedUrls: number;
  missingUrls: number;
  coveragePercentage: number;
  nonSitemapArchivedCount: number;
  isPartial: boolean;
  urls: SitemapComparisonUrl[];
}

export interface ContentHeading {
  level: number;
  text: string;
}

export interface ContentComparisonResult {
  url: string;
  captureDate: string;
  archivedTextLength: number;
  liveTextLength: number;
  archivedWordCount: number;
  liveWordCount: number;
  lengthRatio: number;
  isSpaEmptyShell: boolean;
  spaIndicators: string[];
  archivedHeadings: ContentHeading[];
  liveHeadings: ContentHeading[];
  headingParityScore: number;
  missingSections: string[];
  archivedExcerpt: string;
  liveExcerpt: string;
  limitations: string[];
}

export type RecommendationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface TechnicalRecommendation {
  id: string;
  title: string;
  priority: RecommendationPriority;
  finding: string;
  supportingEvidence: string;
  reason: string;
  suggestedAction: string;
  verificationMethod: string;
}

export type OverallDiagnosticStatus =
  | 'CAPTURES_CONFIRMED_NO_RESTRICTIONS'
  | 'CAPTURES_CONFIRMED_RESTRICTIONS_DETECTED'
  | 'HISTORICAL_RESTRICTIONS_OBSERVED'
  | 'NO_CAPTURES_FOUND'
  | 'MIXED_INCONCLUSIVE_EVIDENCE'
  | 'ANALYSIS_INCOMPLETE';

export interface CommonCrawlAuditReport {
  target: string;
  normalizedUrl: string;
  hostname: string;
  mode: AnalysisMode;
  scope: ScopeSetting;
  analyzedAt: string;
  overallStatus: OverallDiagnosticStatus;
  overallStatusLabel: string;
  overallStatusSummary: string;
  
  // Feature 1: Monthly Visibility
  monthlyTrend: MonthlyCrawlRecord[];
  trendSummary: {
    latestCollection?: string;
    latestCaptureCount: number;
    previousCaptureCount: number;
    absoluteChange: number;
    percentChange: number | null;
    highestCount: number;
    lowestCount: number;
    lastObservedCaptureDate?: string;
    totalAvailableCollections: number;
    successfulCollectionsCount: number;
  };

  // Feature 2: Historical Robots
  robotsHistory: HistoricalRobotsRecord[];
  historicalChangeObservation?: string;

  // Feature 3: Block Source
  blockSource: BlockSourceDetection;

  // Feature 4: Live Probe
  liveProbes: LiveProbeResult[];

  // Feature 5: Auto-detected Sitemap Coverage
  sitemapCoverage?: SitemapCoverageAnalysis;

  // Feature 6: Page Captures (when mode is page, or primary page of domain)
  pageHistory?: {
    checkedUrl: string;
    firstCapture?: string;
    lastCapture?: string;
    totalCapturesCount: number;
    collectionsWithCaptures: number;
    captures: PageCaptureRecord[];
    discoveredVariants: DiscoveredUrlVariant[];
  };

  // Feature 8: Recommendations
  recommendations: TechnicalRecommendation[];

  // Data transparency and limitations
  limitations: string[];
}

