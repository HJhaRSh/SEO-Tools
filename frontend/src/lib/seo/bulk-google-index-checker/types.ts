export type GoogleIndexVerdict =
  | 'indexed'
  | 'not_indexed'
  | 'canonicalized'
  | 'unknown'
  | 'check_failed';

export interface GscProperty {
  siteUrl: string;
  permissionLevel: string;
  isDomainProperty: boolean;
}

export interface AuthStatusResponse {
  configured: boolean;
  connected: boolean;
  userEmail?: string | null;
  properties?: GscProperty[];
}

export interface GoogleInspectionFields {
  googleIndexStatus: GoogleIndexVerdict;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  pageFetchState: string | null;
  robotsTxtState: string | null;
  crawledAs: 'MOBILE' | 'DESKTOP' | 'UNKNOWN' | null;
  lastGoogleCrawl: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  sitemap: string[];
  referringUrls: string[];
  inspectionCheckedAt: string | null;
}

export interface InspectionRowResult extends GoogleInspectionFields {
  id: string;
  url: string;
  metaTitle: string | null;
  titleLength: number;
  metaDescription: string | null;
  descriptionLength: number;
  metadataStatus: 'success' | 'missing' | 'error';
  checkedAt: string;
  error: string | null;
}

export interface InspectionSummary {
  total: number;
  indexedCount: number;
  notIndexedCount: number;
  canonicalizedCount: number;
  unknownCount: number;
  failedCount: number;
  missingTitleCount: number;
  missingDescriptionCount: number;
}

export interface InspectBatchRequest {
  urls: string[];
  siteUrl: string;
}

export interface InspectBatchResponse {
  success: boolean;
  results: InspectionRowResult[];
  error?: string;
  code?: string;
}

export interface MetadataResultItem {
  url: string;
  metaTitle: string | null;
  titleLength: number;
  metaDescription: string | null;
  descriptionLength: number;
  fetchStatus: 'success' | 'missing' | 'error';
  error: string | null;
}

export interface MetadataCheckResponse {
  success: boolean;
  results: MetadataResultItem[];
  summary: {
    total: number;
    successCount: number;
    errorCount: number;
    missingTitles: number;
    missingDescriptions: number;
  };
  error?: string;
  code?: string;
}

export const VERDICT_LABELS: Record<GoogleIndexVerdict, string> = {
  indexed: 'Indexed',
  not_indexed: 'Not Indexed',
  canonicalized: 'Alternate / Canonicalized',
  unknown: 'Unknown',
  check_failed: 'Check Failed',
};
