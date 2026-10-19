/**
 * Type definitions for Mobile-First Index Checker
 * Parity audit comparing Desktop and Mobile SEO signals.
 */

export type ParityStatus = 'Match' | 'Difference' | 'Warning' | 'Critical' | 'Both Missing' | 'Not Applicable';

export type DiscrepancySeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';

export type DiscrepancyCategory =
  | 'Crawling & Indexing'
  | 'Canonicals & Alternates'
  | 'Meta Tags'
  | 'Headings & Content'
  | 'Links & Navigation'
  | 'Images & Media'
  | 'Structured Data'
  | 'Hreflang';

export interface DiscrepancyFinding {
  id: string;
  category: DiscrepancyCategory;
  name: string;
  severity: DiscrepancySeverity;
  desktopEvidence: string;
  mobileEvidence: string;
  whyItMatters: string;
  recommendation: string;
}

export interface ComparisonRow {
  category: DiscrepancyCategory;
  element: string;
  desktop: string;
  mobile: string;
  status: ParityStatus;
  details?: string;
  isImportant?: boolean;
}

export interface RobotsTxtCheckResult {
  origin: string;
  fetched: boolean;
  statusCode?: number;
  status: 'ALLOWED' | 'BLOCKED' | 'UNKNOWN' | 'ERROR';
  appliedRule?: {
    type: 'allow' | 'disallow';
    pattern: string;
    lineNumber: number;
    originalText: string;
  } | null;
  matchedGroup: string;
  explanation: string;
}

export interface MetaRobotsDirectives {
  raw: string | null;
  index: boolean;
  noindex: boolean;
  follow: boolean;
  nofollow: boolean;
  none: boolean;
  noarchive: boolean;
  nosnippet: boolean;
  noimageindex: boolean;
  googlebotDirectives: string[];
  allDirectives: string[];
}

export interface CanonicalInfo {
  raw: string | null;
  resolved: string | null;
  isMissing: boolean;
  isRelative: boolean;
  multipleCount: number;
  allFound: string[];
}

export interface MobileAlternateInfo {
  isPresent: boolean;
  raw: string | null;
  media: string | null;
  href: string | null;
  resolved: string | null;
}

export interface VaryHeaderInfo {
  isPresent: boolean;
  raw: string | null;
  includesUserAgent: boolean;
  explanation: string;
}

export interface SchemaEntitySummary {
  type: string;
  id?: string;
  name?: string;
  headline?: string;
  description?: string;
  author?: string;
  publisher?: string;
  rawNormalizedJson?: string;
}

export interface StructuredDataInfo {
  hasStructuredData: boolean;
  types: string[];
  entityCount: number;
  entities: SchemaEntitySummary[];
  jsonLdBlocksCount: number;
  microdataItemTypes: string[];
  rdfaTypes: string[];
  parseErrors: string[];
}

export interface HreflangItem {
  hreflang: string;
  href: string;
  resolvedHref: string;
  source: 'HTML' | 'HTTP_HEADER';
}

export interface HreflangInfo {
  count: number;
  items: HreflangItem[];
  duplicateCodes: string[];
  hasXDefault: boolean;
}

export interface LinkSample {
  href: string;
  text: string;
  isInternal: boolean;
  isNofollow: boolean;
}

export interface LinksInfo {
  totalCount: number;
  internalCount: number;
  externalCount: number;
  nofollowCount: number;
  uniqueInternalDestinations: number;
  uniqueExternalDestinations: number;
  sampleInternal: string[];
  sampleExternal: string[];
}

export interface ImageSample {
  src: string;
  alt: string;
  isResponsive: boolean; // picture or srcset
}

export interface ImagesInfo {
  totalCount: number;
  withAltCount: number;
  missingAltCount: number;
  responsiveMarkupCount: number;
  samples: ImageSample[];
}

export interface ContentInfo {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  h1Primary: string | null;
  h1Count: number;
  allH1s: string[];
  wordCount: number;
  characterCount: number;
  textSnippet: string;
  textNormalizedHash: string;
}

export interface AgentCrawlResult {
  agentName: string;
  agentToken: string;
  userAgentString: string;
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  statusText: string;
  redirectChain: { from: string; to: string; statusCode: number }[];
  contentType: string;
  responseHeaders: Record<string, string>;
  responseSizeBytes: number;
  durationMs: number;
  isTruncated: boolean;
  fetchError?: string;
  // Extracted signals
  robotsTxt: RobotsTxtCheckResult;
  metaRobots: MetaRobotsDirectives;
  xRobotsTag: MetaRobotsDirectives;
  canonical: CanonicalInfo;
  mobileAlternate: MobileAlternateInfo;
  varyHeader: VaryHeaderInfo;
  content: ContentInfo;
  links: LinksInfo;
  images: ImagesInfo;
  structuredData: StructuredDataInfo;
  hreflang: HreflangInfo;
}

export interface MobileFirstAuditSummary {
  desktopFinalUrl: string;
  mobileFinalUrl: string;
  desktopStatus: number;
  mobileStatus: number;
  isSeparateMobileUrl: boolean;
  parityVerdict: 'Full Parity Passed' | 'Minor Discrepancies Detected' | 'Significant SEO Parity Issues' | 'Critical Discrepancies Detected';
  hasDifferences: boolean;
  totalDiscrepancies: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  textSimilarityPct: number;
}

export interface MobileFirstAuditResponse {
  success: boolean;
  error?: string;
  testedAt: string;
  executionMode: 'Raw HTML Comparison';
  requestedDesktopUrl: string;
  requestedMobileUrl?: string;
  userAgentProfile: 'googlebot' | 'chrome';
  desktop: AgentCrawlResult;
  mobile: AgentCrawlResult;
  summary: MobileFirstAuditSummary;
  comparisonTable: ComparisonRow[];
  discrepancies: DiscrepancyFinding[];
  screenshots: {
    desktop: { available: boolean; reason: string };
    mobile: { available: boolean; reason: string };
  };
}
