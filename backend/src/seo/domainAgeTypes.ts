export interface DomainAge {
  years: number;
  months: number;
  days: number;
}

export type DomainLookupStatus =
  | 'success'
  | 'partial_data'
  | 'not_found'
  | 'rate_limited'
  | 'unsupported'
  | 'timeout'
  | 'error'
  | 'invalid_input';

export interface DomainCheckResult {
  input: string;
  domain: string;
  status: DomainLookupStatus;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  age: DomainAge | null;
  totalAgeDays: number | null;
  daysUntilExpiry: number | null;
  expiryStatus: 'active' | 'passed' | 'unavailable';
  registrar: string | null;
  nameServers: string[];
  registrationStatuses: string[];
  source: 'RDAP' | 'IANA' | 'UNAVAILABLE';
  sourceUrl: string | null;
  cached: boolean;
  cachedAt?: string | null;
  error: string | null;
}

export interface DomainAgeCheckResponse {
  success: boolean;
  checkedAt: string;
  totalCount: number;
  successfulCount: number;
  failedCount: number;
  results: DomainCheckResult[];
  error?: string | null;
}

export interface DomainAgeCheckRequest {
  domain?: string;
  domains?: string[];
}

export interface RdapEvent {
  eventAction: string;
  eventDate: string;
  eventActor?: string;
}

export interface RdapEntity {
  handle?: string;
  roles?: string[];
  vcardArray?: any[];
  entities?: RdapEntity[];
  name?: string;
  publicIds?: { type: string; identifier: string }[];
}

export interface RdapNameserver {
  ldhName?: string;
  unicodeName?: string;
  handle?: string;
}

export interface RdapResponse {
  objectClassName?: string;
  handle?: string;
  ldhName?: string;
  unicodeName?: string;
  status?: string[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  links?: { value: string; rel: string; href: string; type?: string }[];
  notices?: { title?: string; description?: string[] }[];
  errorCode?: number;
  title?: string;
  description?: string[];
}
