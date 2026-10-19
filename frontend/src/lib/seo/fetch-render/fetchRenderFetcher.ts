import { safeFetch } from '../safeFetch';
import { InitialFetchResult } from './fetchRenderTypes';

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MiB limit for initial HTML capture

export async function fetchInitialHtml(
  url: string,
  userAgentString: string,
  timeoutMs: number = 15000,
  acceptLanguage: string = 'en-US,en;q=0.9',
  allowLocalhostForTesting: boolean = false
): Promise<InitialFetchResult> {
  const fetchRes = await safeFetch(url, {
    userAgent: userAgentString,
    timeoutMs,
    maxBytes: MAX_HTML_BYTES,
    maxRedirects: 5,
    allowLocalhostForTesting,
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': acceptLanguage
    }
  });

  return {
    requestedUrl: fetchRes.requestedUrl,
    finalUrl: fetchRes.finalUrl,
    statusCode: fetchRes.statusCode,
    statusText: fetchRes.statusText,
    headers: fetchRes.headers,
    rawHtml: fetchRes.body,
    byteSize: Buffer.byteLength(fetchRes.body, 'utf-8'),
    durationMs: fetchRes.durationMs,
    redirectHistory: fetchRes.redirectHistory,
    contentType: fetchRes.contentType,
    isTruncated: fetchRes.isTruncated
  };
}
