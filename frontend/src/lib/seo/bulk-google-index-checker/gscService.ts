import type {
  GoogleInspectionFields,
  GoogleIndexVerdict,
  GscProperty,
} from './types';

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_SITES_API = 'https://www.googleapis.com/webmasters/v3/sites';
export const GOOGLE_INSPECT_API = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const DEFAULT_PRODUCTION_ORIGIN = 'https://indianmarketers.in';

/**
 * Resolves and validates a trusted origin for OAuth redirects and callbacks.
 * In production, restricts to trusted domain (indianmarketers.in), preventing host
 * header manipulation and ensuring users are never redirected to internal Vercel deployment URLs.
 * In non-production environments (local dev / tests), permits localhost and loopback interfaces.
 */
export function getTrustedOrigin(candidate?: string | null): string {
  // If an explicit trusted public origin is configured in environment, use it
  const explicitAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_ORIGIN || process.env.APP_URL;
  if (explicitAppUrl) {
    try {
      const parsed = new URL(explicitAppUrl);
      return parsed.origin;
    } catch {
      // Fall through if misconfigured
    }
  }

  const isDev = process.env.NODE_ENV !== 'production';

  if (candidate) {
    try {
      const parsed = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
      const hostname = parsed.hostname.toLowerCase();

      // Permit localhost / loopback in local dev & test environments
      if (isDev && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')) {
        return parsed.origin;
      }

      // Permit production domain and any subdomains
      if (hostname === 'indianmarketers.in' || hostname.endsWith('.indianmarketers.in')) {
        return `https://${parsed.host}`;
      }
    } catch {
      // Ignore parse error and fall back to default
    }
  }

  // In development, default to localhost:3000
  if (isDev) {
    return 'http://localhost:3000';
  }

  // In production, unconditionally default to the public canonical domain
  return DEFAULT_PRODUCTION_ORIGIN;
}

/**
 * Retrieves configured Google OAuth credentials and resolves the exact redirect URI.
 * Validates that redirect URI always points to a trusted origin and rejects internal Vercel domains.
 */
export function getGoogleConfig(
  originCandidate?: string | null,
  options?: { allowVercelRollback?: boolean }
): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const allowRollback =
    options?.allowVercelRollback ||
    process.env.ALLOW_VERCEL_OAUTH_ROLLBACK === 'true' ||
    process.env.ALLOW_VERCEL_ROLLBACK === 'true';

  const isCandidateVercel =
    originCandidate && originCandidate.includes('vercel.app');

  const trustedOrigin = getTrustedOrigin(originCandidate);
  const canonicalCallback = `${trustedOrigin}/api/seo/bulk-google-index-checker/auth/callback`;

  let redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI;

  // Support Vercel rollback when explicitly permitted or when handling callback directly on Vercel
  if (allowRollback && (redirectUri?.includes('vercel.app') || isCandidateVercel)) {
    redirectUri = redirectUri && redirectUri.includes('vercel.app')
      ? redirectUri
      : `https://${new URL(originCandidate!).host}/api/seo/bulk-google-index-checker/auth/callback`;
  } else if (!redirectUri || redirectUri.includes('vercel.app')) {
    redirectUri = canonicalCallback;
  } else {
    // Ensure configured redirect URI adheres to a trusted domain
    try {
      const parsed = new URL(redirectUri);
      const isDev = process.env.NODE_ENV !== 'production';
      const hostname = parsed.hostname.toLowerCase();
      const isLocal = isDev && (hostname === 'localhost' || hostname === '127.0.0.1');
      const isProductionDomain = hostname === 'indianmarketers.in' || hostname.endsWith('.indianmarketers.in');

      if (!isLocal && !isProductionDomain) {
        redirectUri = canonicalCallback;
      }
    } catch {
      redirectUri = canonicalCallback;
    }
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

/**
 * Builds Google OAuth 2.0 authorization URL with PKCE and CSRF state parameter
 */
export function buildGoogleAuthUrl(
  config: GoogleOAuthConfig,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GSC_SCOPE,
    access_type: 'offline', // Requests refresh_token for background refreshes
    prompt: 'consent', // Ensures refresh token is provided on consent
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  config: GoogleOAuthConfig
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const params = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${errorBody}`);
  }

  const json = await res.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in || 3600,
  };
}

/**
 * Refreshes an expired access token using the refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: GoogleOAuthConfig
): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status})`);
  }

  const json = await res.json();
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in || 3600,
  };
}

/**
 * Fetches user's verified Search Console properties using webmasters.v3.sites endpoint
 */
export async function fetchUserProperties(accessToken: string): Promise<GscProperty[]> {
  const res = await fetch(GOOGLE_SITES_API, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Search Console properties (${res.status})`);
  }

  const data = await res.json();
  const entries = data.siteEntry || [];

  return entries
    .filter((entry: any) => {
      // Exclude unverified accounts
      return entry.permissionLevel && entry.permissionLevel !== 'siteUnverifiedUser';
    })
    .map((entry: any) => {
      const siteUrl: string = entry.siteUrl;
      const isDomain = siteUrl.startsWith('sc-domain:');
      return {
        siteUrl,
        permissionLevel: entry.permissionLevel,
        isDomainProperty: isDomain,
      };
    });
}

/**
 * Verifies whether a given URL belongs to the selected Search Console property
 */
export function isUrlInProperty(targetUrl: string, siteUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const targetHost = parsed.hostname.toLowerCase();

    if (siteUrl.startsWith('sc-domain:')) {
      const domain = siteUrl.replace('sc-domain:', '').trim().toLowerCase();
      return targetHost === domain || targetHost.endsWith(`.${domain}`);
    } else {
      // URL-prefix property
      return targetUrl.startsWith(siteUrl);
    }
  } catch {
    return false;
  }
}

/**
 * Maps Search Console URL Inspection API response into normalized fields and verdict
 */
export function mapIndexStatusResult(indexResult: any): GoogleInspectionFields {
  if (!indexResult) {
    return {
      googleIndexStatus: 'unknown',
      verdict: null,
      coverageState: null,
      indexingState: null,
      pageFetchState: null,
      robotsTxtState: null,
      crawledAs: null,
      lastGoogleCrawl: null,
      googleCanonical: null,
      userCanonical: null,
      sitemap: [],
      referringUrls: [],
      inspectionCheckedAt: new Date().toISOString(),
    };
  }

  const verdict = indexResult.verdict || null;
  const coverageState = indexResult.coverageState || null;
  const indexingState = indexResult.indexingState || null;
  const pageFetchState = indexResult.pageFetchState || null;
  const robotsTxtState = indexResult.robotsTxtState || null;
  const crawledAsRaw = indexResult.crawledAs || null;
  const crawledAs = crawledAsRaw === 'MOBILE' ? 'MOBILE' : crawledAsRaw === 'DESKTOP' ? 'DESKTOP' : null;
  const lastGoogleCrawl = indexResult.lastCrawlTime || null;
  const googleCanonical = indexResult.googleCanonical || null;
  const userCanonical = indexResult.userCanonical || null;
  const sitemap = Array.isArray(indexResult.sitemap) ? indexResult.sitemap : [];
  const referringUrls = Array.isArray(indexResult.referringUrls) ? indexResult.referringUrls : [];

  let status: GoogleIndexVerdict = 'unknown';

  if (verdict === 'PASS' || coverageState === 'Submitted and indexed' || coverageState === 'Indexed, not submitted in sitemap') {
    status = 'indexed';
  } else if (
    coverageState &&
    (coverageState.toLowerCase().includes('alternate') ||
      coverageState.toLowerCase().includes('duplicate') ||
      coverageState.toLowerCase().includes('canonical'))
  ) {
    status = 'canonicalized';
  } else if (
    verdict === 'FAIL' ||
    verdict === 'NEUTRAL' ||
    indexingState === 'INDEXING_DISALLOWED' ||
    (coverageState && (
      coverageState.includes('not indexed') ||
      coverageState.includes('Excluded') ||
      coverageState.includes('noindex') ||
      coverageState.includes('Soft 404') ||
      coverageState.includes('Not found (404)')
    ))
  ) {
    status = 'not_indexed';
  }

  return {
    googleIndexStatus: status,
    verdict,
    coverageState,
    indexingState,
    pageFetchState,
    robotsTxtState,
    crawledAs,
    lastGoogleCrawl,
    googleCanonical,
    userCanonical,
    sitemap,
    referringUrls,
    inspectionCheckedAt: new Date().toISOString(),
  };
}

/**
 * Inspects a URL using official Google Search Console URL Inspection API
 * Retries on 429 quota or transient server errors with exponential backoff
 */
export async function inspectUrlWithGsc(
  accessToken: string,
  inspectionUrl: string,
  siteUrl: string,
  maxRetries = 2
): Promise<GoogleInspectionFields> {
  const payload = {
    inspectionUrl,
    siteUrl,
    languageCode: 'en-US',
  };

  let attempts = 0;
  while (attempts <= maxRetries) {
    attempts++;
    try {
      const res = await fetch(GOOGLE_INSPECT_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 429) {
        if (attempts <= maxRetries) {
          const waitMs = 1500 * attempts + Math.floor(Math.random() * 500);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        return {
          googleIndexStatus: 'check_failed',
          verdict: 'QUOTA_EXCEEDED',
          coverageState: 'Search Console URL Inspection API quota exceeded for this property.',
          indexingState: null,
          pageFetchState: null,
          robotsTxtState: null,
          crawledAs: null,
          lastGoogleCrawl: null,
          googleCanonical: null,
          userCanonical: null,
          sitemap: [],
          referringUrls: [],
          inspectionCheckedAt: new Date().toISOString(),
        };
      }

      if (!res.ok) {
        const errorText = await res.text();
        return {
          googleIndexStatus: 'check_failed',
          verdict: `HTTP_${res.status}`,
          coverageState: `Inspection API returned ${res.status}: ${errorText.substring(0, 150)}`,
          indexingState: null,
          pageFetchState: null,
          robotsTxtState: null,
          crawledAs: null,
          lastGoogleCrawl: null,
          googleCanonical: null,
          userCanonical: null,
          sitemap: [],
          referringUrls: [],
          inspectionCheckedAt: new Date().toISOString(),
        };
      }

      const json = await res.json();
      const indexResult = json.inspectionResult?.indexStatusResult;
      return mapIndexStatusResult(indexResult);
    } catch (err: any) {
      if (attempts <= maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempts));
        continue;
      }
      return {
        googleIndexStatus: 'check_failed',
        verdict: 'NETWORK_ERROR',
        coverageState: err.message || 'Inspection request failed',
        indexingState: null,
        pageFetchState: null,
        robotsTxtState: null,
        crawledAs: null,
        lastGoogleCrawl: null,
        googleCanonical: null,
        userCanonical: null,
        sitemap: [],
        referringUrls: [],
        inspectionCheckedAt: new Date().toISOString(),
      };
    }
  }

  return {
    googleIndexStatus: 'check_failed',
    verdict: 'UNKNOWN_ERROR',
    coverageState: 'Inspection could not complete.',
    indexingState: null,
    pageFetchState: null,
    robotsTxtState: null,
    crawledAs: null,
    lastGoogleCrawl: null,
    googleCanonical: null,
    userCanonical: null,
    sitemap: [],
    referringUrls: [],
    inspectionCheckedAt: new Date().toISOString(),
  };
}
