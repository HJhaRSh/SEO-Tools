import {
  KnowledgeGraphApiResponse,
  KnowledgeGraphErrorCode,
} from './types';
import { normalizeGoogleKnowledgeGraphResponse } from './normalize';

const KG_API_ENDPOINT = 'https://kgsearch.googleapis.com/v1/entities:search';
const REQUEST_TIMEOUT_MS = 10000;

export async function searchKnowledgeGraphProvider(params: {
  query?: string;
  id?: string;
  types?: string[];
  language?: string;
  limit?: number;
  prefix?: boolean;
}): Promise<KnowledgeGraphApiResponse> {
  const apiKey = process.env.GOOGLE_KG_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      code: 'PROVIDER_NOT_CONFIGURED',
      error:
        'Google Knowledge Graph API credentials are not configured. Please set GOOGLE_KG_API_KEY in your server environment variables.',
    };
  }

  const url = new URL(KG_API_ENDPOINT);
  url.searchParams.set('key', apiKey.trim());

  if (params.query) {
    url.searchParams.set('query', params.query);
  }

  if (params.id) {
    url.searchParams.set('ids', params.id);
  }

  if (params.types && params.types.length > 0) {
    for (const t of params.types) {
      url.searchParams.append('types', t);
    }
  }

  if (params.language) {
    url.searchParams.set('languages', params.language);
  }

  if (params.limit) {
    url.searchParams.set('limit', String(params.limit));
  }

  if (params.prefix) {
    url.searchParams.set('prefix', 'true');
  }

  url.searchParams.set('indent', 'false');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const status = response.status;
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {
        // Ignored if not json
      }

      const upstreamMessage = errorData?.error?.message || response.statusText;

      let code: KnowledgeGraphErrorCode = 'UPSTREAM_ERROR';
      let userFriendlyError = `Google Knowledge Graph API returned status ${status}: ${upstreamMessage}`;

      if (status === 400 && upstreamMessage.includes('API key not valid')) {
        code = 'API_KEY_INVALID';
        userFriendlyError = 'The configured GOOGLE_KG_API_KEY is invalid or expired.';
      } else if (status === 403) {
        if (upstreamMessage.includes('has not been used') || upstreamMessage.includes('disabled')) {
          code = 'API_DISABLED';
          userFriendlyError =
            'The Knowledge Graph Search API is not enabled on this Google Cloud project. Please enable it in the Google Cloud Console.';
        } else if (upstreamMessage.includes('quota') || upstreamMessage.includes('Quota')) {
          code = 'RATE_LIMITED';
          userFriendlyError = 'Google Knowledge Graph API quota exceeded. Please try again later.';
        } else {
          code = 'API_DISABLED';
          userFriendlyError = `Google API access was denied: ${upstreamMessage}`;
        }
      } else if (status === 429) {
        code = 'RATE_LIMITED';
        userFriendlyError = 'Rate limit exceeded for Google Knowledge Graph API. Please wait a moment and try again.';
      }

      return {
        success: false,
        code,
        error: userFriendlyError,
      };
    }

    const data = await response.json();
    const results = normalizeGoogleKnowledgeGraphResponse(data);

    return {
      success: true,
      provider: 'google-knowledge-graph',
      query: params.query || params.id || '',
      totalReturned: results.length,
      results,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      return {
        success: false,
        code: 'UPSTREAM_TIMEOUT',
        error: 'The request to Google Knowledge Graph API timed out. Please try again.',
      };
    }

    return {
      success: false,
      code: 'UPSTREAM_ERROR',
      error: err.message || 'Failed to connect to Google Knowledge Graph Search API.',
    };
  }
}
