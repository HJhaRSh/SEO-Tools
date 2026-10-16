export type HreflangSource = 'HTML' | 'HTTP_HEADER' | 'XML_SITEMAP';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface HreflangIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  sourceUrl?: string;
  alternateUrl?: string;
  hreflang?: string;
}

export interface HreflangAnnotation {
  hreflang: string;
  normalizedHreflang: string;
  language: string | null;
  region: string | null;
  script?: string | null;
  href: string;
  source: HreflangSource;
  sourceUrl: string;
  isSelfReference: boolean;
  rawAttributes?: Record<string, string>;
}

export interface HreflangValidationItem {
  annotation: HreflangAnnotation;
  statusCode: number | null;
  finalUrl: string | null;
  redirectChain?: string[];
  returnTagFound: boolean | null; // null = not tested / unavailable
  returnTagDetails?: {
    expectedUrl: string;
    foundHreflang?: string;
    foundUrl?: string;
  } | null;
  selfReferencing: boolean | null;
  indexability: 'pass' | 'warning' | 'fail' | 'unknown';
  indexabilityDetails?: string;
  canonicalUrl: string | null;
  canonicalStatus: 'self' | 'different' | 'missing' | 'malformed' | 'unknown';
  detectedLanguage: string | null;
  htmlLang: string | null;
  contentLanguageMeta: string | null;
  contentLanguageHeader: string | null;
  issues: HreflangIssue[];
}

export interface HreflangSummary {
  urlsAnalyzed: number;
  totalAnnotations: number;
  validAnnotations: number;
  errorCount: number;
  warningCount: number;
  selfReferenceStatus: 'Present' | 'Missing' | 'Mixed' | 'N/A';
  xDefaultPresent: boolean;
  returnTagsVerified: number;
  missingReturnTags: number;
  untestedAlternates: number;
  brokenUrls: number;
  redirectsFound: number;
}

export interface HreflangTestUrlResponse {
  success: boolean;
  mode: 'url' | 'sitemap_url' | 'sitemap_upload';
  sourceUrl: string;
  pageStatus: number;
  contentType: string;
  pageSignals: {
    htmlLang: string | null;
    metaContentLanguage: string | null;
    headerContentLanguage: string | null;
    canonicalUrl: string | null;
    robotsMeta: string | null;
    xRobotsTag: string | null;
    title: string | null;
  };
  summary: HreflangSummary;
  results: HreflangValidationItem[];
  message?: string;
  error?: string;
}

export type UserAgentProfile = 'default' | 'desktop' | 'mobile' | 'googlebot';

export interface HreflangUrlRequest {
  url: string;
  checkReturnTags?: boolean;
  checkIndexability?: boolean;
  userAgent?: UserAgentProfile;
}

export interface HreflangSitemapRequest {
  sitemapUrl?: string;
  xmlContent?: string;
  checkLiveUrls?: boolean;
  maxUrlsToCheck?: number;
  userAgent?: UserAgentProfile;
}
