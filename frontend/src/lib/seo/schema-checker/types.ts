/**
 * Schema Checker — Type Definitions
 * Minimal types for the Bulk Schema Checker tool.
 * Only presence and type detection — no validation, scoring, or recommendations.
 */

export interface SchemaCheckResult {
  url: string;
  schemaFound: boolean;
  types: string[];
}

export interface SchemaCheckRequest {
  urls: string[];
}

export interface SchemaCheckResponse {
  results: SchemaCheckResult[];
}
