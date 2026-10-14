export type SupportedEntityType =
  | ''
  | 'Book'
  | 'Corporation'
  | 'EducationalOrganization'
  | 'Event'
  | 'GovernmentOrganization'
  | 'LocalBusiness'
  | 'Movie'
  | 'MusicGroup'
  | 'Organization'
  | 'Person'
  | 'Place'
  | 'Product'
  | 'SportsTeam'
  | 'Thing';

export interface KnowledgeGraphEntity {
  id: string; // e.g. "kg:/m/0dl567"
  mid: string | null; // e.g. "/m/0dl567"
  name: string;
  types: string[];
  description: string | null;
  detailedDescription: string | null;
  website: string | null;
  image: string | null;
  sourceUrl: string | null;
  sourceLicense: string | null;
  resultScore: number | null;
}

export interface KnowledgeGraphSearchRequest {
  query?: string;
  id?: string;
  types?: string[];
  language?: string;
  limit?: number;
  prefix?: boolean;
}

export interface KnowledgeGraphSearchSuccessResponse {
  success: true;
  provider: 'google-knowledge-graph';
  query: string;
  totalReturned: number;
  results: KnowledgeGraphEntity[];
}

export type KnowledgeGraphErrorCode =
  | 'INVALID_REQUEST'
  | 'EMPTY_QUERY'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'API_KEY_INVALID'
  | 'API_DISABLED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_SERVER_ERROR';

export interface KnowledgeGraphSearchErrorResponse {
  success: false;
  code: KnowledgeGraphErrorCode;
  error: string;
}

export type KnowledgeGraphApiResponse =
  | KnowledgeGraphSearchSuccessResponse
  | KnowledgeGraphSearchErrorResponse;
