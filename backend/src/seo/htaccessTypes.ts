export type TransformationType =
  | 'EXTERNAL_REDIRECT'
  | 'INTERNAL_REWRITE'
  | 'NO_CHANGE'
  | 'FORBIDDEN'
  | 'GONE'
  | 'INVALID_RULES'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export interface HtaccessServerVariables {
  HTTP_HOST?: string;
  HTTPS?: 'on' | 'off' | string;
  REQUEST_URI?: string;
  QUERY_STRING?: string;
  HTTP_REFERER?: string;
  HTTP_USER_AGENT?: string;
  SERVER_NAME?: string;
  SERVER_PORT?: string;
  REQUEST_METHOD?: string;
  DOCUMENT_ROOT?: string;
  REQUEST_FILENAME?: string;
  [key: string]: string | undefined;
}

export interface HtaccessPublicSettings {
  directoryContext?: string;
  maxRewritePasses?: number;
  useLocalOnly?: boolean;
}

export interface HtaccessTestRequest {
  url: string;
  htaccess: string;
  serverVariables?: HtaccessServerVariables;
  settings?: HtaccessPublicSettings;
}

export interface HtaccessTraceLine {
  lineNumber: number;
  originalText: string;
  directive: string;
  isValid: boolean;
  wasReached: boolean;
  isMet: boolean;
  isSupported?: boolean;
  message: string;
  subRun?: any;
}

export interface HtaccessTestResult {
  success: boolean;
  inputUrl: string;
  outputUrl: string;
  transformationType: TransformationType;
  statusCode: number | null;
  statusText: string | null;
  changed: boolean;
  fullyEvaluated: boolean;
  engineUsed: 'PRIMARY_API' | 'LOCAL_FALLBACK';
  appliedRule: {
    lineNumber: number;
    directive: string;
    originalText: string;
  } | null;
  trace: HtaccessTraceLine[];
  serverVariablesUsed: HtaccessServerVariables;
  warnings: string[];
  errors: string[];
  privacyNotice: string;
}

export interface HtaccessExampleTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  sampleUrl: string;
  rules: string;
}
