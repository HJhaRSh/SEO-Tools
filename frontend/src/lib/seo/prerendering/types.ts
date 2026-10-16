export interface RedirectHop {
  from: string;
  to: string;
  statusCode: number;
}

export interface AgentTestResult {
  userAgentId: string;
  userAgentName: string;
  status: 'success' | 'error';
  statusCode: number | null;
  statusText: string | null;
  finalUrl: string | null;
  redirectChain: RedirectHop[];
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  wordCount: number | null;
  imageCount: number | null;
  linkCount: number | null;
  internalLinkCount: number | null;
  externalLinkCount: number | null;
  varyUserAgent: 'Present' | 'Absent' | 'Not available';
  varyHeaderRaw: string | null;
  md5: string | null;
  sha256: string | null;
  metaRobots: string | null;
  xRobotsTag: string | null;
  canonical: string | null;
  contentType: string | null;
  contentLanguage: string | null;
  durationMs: number | null;
  htmlSize: number | null;
  hasStructuredData: boolean;
  rawHtml?: string;
  error: string | null;
}

export type FieldComparisonStatus = 'matched' | 'different' | 'missing' | 'not-tested';
export type ComparisonSeverity = 'error' | 'warning' | 'info';

export interface ComparisonFieldResult {
  field: string;
  label: string;
  status: FieldComparisonStatus;
  severity: ComparisonSeverity;
  values: Record<string, string | number | null | string[]>;
  explanation: string;
}

export type PrerenderingClassification =
  | 'Same HTML Response'
  | 'Different Raw HTML, Same SEO Signals'
  | 'Bot-Specific HTML Response'
  | 'Possible Pre-rendering / Dynamic Rendering'
  | 'Potential SEO Signal Conflict'
  | 'Unable to Determine';

export interface AuditSummary {
  userAgentsTested: number;
  successfulResponses: number;
  failedResponses: number;
  differentHttpStatuses: boolean;
  differentRedirects: boolean;
  differentTitles: boolean;
  differentMetaDescriptions: boolean;
  differentH1s: boolean;
  canonicalConflicts: boolean;
  robotsConflicts: boolean;
  rawHtmlDifferences: boolean;
  classification: PrerenderingClassification;
  classificationReason: string;
}

export interface PrerenderApiResponse {
  success: boolean;
  requestedUrl?: string;
  summary?: AuditSummary;
  results?: AgentTestResult[];
  comparisons?: ComparisonFieldResult[];
  error?: string;
}
