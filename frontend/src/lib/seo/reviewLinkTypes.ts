/**
 * Google Review Link Generator — Types and Data Models (Zero-Cost / No-API Architecture)
 * Tool 6: Google Review Link Generator
 */

export interface GenerateLinkResponse {
  success: boolean;
  placeId?: string;
  businessName?: string;
  location?: string;
  reviewUrl: string;
  source: 'PASTED_REVIEW_URL' | 'PLACE_ID_SYNTACTIC' | 'BUSINESS_NAME_SEARCH';
  warning?: string;
  error?: string;
  code?: string;
}

export type BulkRowStatus =
  | 'MATCHED'
  | 'INVALID_INPUT'
  | 'REVIEW_LINK_READY';

export interface BulkInputRow {
  rowIndex: number;
  businessName?: string;
  location?: string;
  city?: string;
  placeId?: string;
  reviewUrl?: string;
}

export interface BulkProcessedRow {
  rowIndex: number;
  inputBusinessName: string;
  inputLocation: string;
  inputPlaceId?: string;
  inputReviewUrl?: string;
  googlePlaceId?: string;
  googleReviewUrl?: string;
  status: BulkRowStatus;
  statusNote?: string;
  source?: 'PASTED_REVIEW_URL' | 'PLACE_ID_SYNTACTIC' | 'NONE';
}

export interface BulkBatchResponse {
  success: boolean;
  totalRows: number;
  matchedCount: number;
  invalidCount: number;
  results: BulkProcessedRow[];
  error?: string;
}
