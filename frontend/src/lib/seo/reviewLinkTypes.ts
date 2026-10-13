/**
 * Google Review Link Generator — Types and Data Models
 * Tool 6: Google Review Link Generator
 */

export type MatchConfidence = 'HIGH' | 'NEEDS_CONFIRMATION' | 'NO_MATCH';

export interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string;
  mapsUrl?: string;
  writeReviewUrl?: string;
  rating?: number;
  userRatingCount?: number;
  confidence: MatchConfidence;
  matchScore: number;
}

export interface SingleSearchRequest {
  businessName: string;
  location?: string;
}

export interface SingleSearchResponse {
  success: boolean;
  query: {
    businessName: string;
    location?: string;
  };
  totalCandidates: number;
  candidates: PlaceCandidate[];
  recommendedCandidate?: PlaceCandidate;
  warning?: string;
  error?: string;
  code?: string;
}

export interface GenerateLinkRequest {
  placeId: string;
  businessName?: string;
  address?: string;
  writeReviewUrl?: string;
}

export interface GenerateLinkResponse {
  success: boolean;
  placeId: string;
  businessName?: string;
  address?: string;
  reviewUrl: string;
  source: 'GOOGLE_API_VERIFIED' | 'PLACE_ID_SYNTACTIC';
  warning?: string;
  error?: string;
  code?: string;
}

export type BulkRowStatus =
  | 'MATCHED'
  | 'NEEDS_REVIEW'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'API_ERROR'
  | 'RATE_LIMITED';

export interface BulkInputRow {
  rowIndex: number;
  businessName: string;
  address?: string;
  city?: string;
  placeId?: string;
}

export interface BulkProcessedRow {
  rowIndex: number;
  inputBusinessName: string;
  inputAddress: string;
  inputCity: string;
  inputPlaceId?: string;
  matchedBusinessName?: string;
  matchedAddress?: string;
  googlePlaceId?: string;
  googleReviewUrl?: string;
  googleMapsUrl?: string;
  status: BulkRowStatus;
  statusNote?: string;
  candidates?: PlaceCandidate[];
  source?: 'GOOGLE_API_VERIFIED' | 'PLACE_ID_SYNTACTIC' | 'USER_CONFIRMED' | 'NONE';
}

export interface BulkBatchRequest {
  rows: BulkInputRow[];
  batchIndex?: number;
  totalBatches?: number;
}

export interface BulkBatchResponse {
  success: boolean;
  batchIndex: number;
  totalBatches: number;
  processedCount: number;
  matchedCount: number;
  needsReviewCount: number;
  notFoundCount: number;
  errorCount: number;
  results: BulkProcessedRow[];
  rateLimited?: boolean;
  error?: string;
}
