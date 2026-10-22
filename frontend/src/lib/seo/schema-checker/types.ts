/**
 * Schema Checker — Type Definitions
 * Minimal types for the Bulk Schema Checker tool.
 * Only presence and type detection — no validation, scoring, or recommendations.
 */

export type SchemaCheckStatus = 'found' | 'not_found' | 'unable_to_check';

export interface SchemaCheckResult {
  url: string;
  schemaFound: boolean;
  status: SchemaCheckStatus;
  types: string[];
}

export interface SchemaCheckRequest {
  urls: string[];
}
