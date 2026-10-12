import { FetchRenderRequestOptions, FetchRenderMode } from './fetchRenderTypes.js';
import { validateUrl } from './safeFetch.js';
import { findFetchRenderUserAgent } from './fetchRenderUserAgents.js';

export interface ValidatedFetchRenderInput {
  isValid: boolean;
  error?: string;
  url: string;
  mode: FetchRenderMode;
  userAgentId: string;
  respectRobots: boolean;
  postLoadWaitMs: number;
  timeoutMs: number;
  acceptLanguage: string;
  captureScreenshot: boolean;
}

const DEFAULT_POST_LOAD_WAIT_MS = 2000;
const MAX_POST_LOAD_WAIT_MS = 5000;
const MIN_POST_LOAD_WAIT_MS = 0;

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 5000;

export function validateFetchRenderRequest(body: any, options?: { allowLocalhostForTesting?: boolean }): ValidatedFetchRenderInput {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      error: 'Request body must be a valid JSON object.',
      url: '',
      mode: 'fetch-and-render',
      userAgentId: 'googlebot-smartphone',
      respectRobots: true,
      postLoadWaitMs: DEFAULT_POST_LOAD_WAIT_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      acceptLanguage: 'en-US,en;q=0.9',
      captureScreenshot: true
    };
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return {
      isValid: false,
      error: 'URL is required. Please provide a valid HTTP or HTTPS page URL.',
      url: '',
      mode: 'fetch-and-render',
      userAgentId: 'googlebot-smartphone',
      respectRobots: true,
      postLoadWaitMs: DEFAULT_POST_LOAD_WAIT_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      acceptLanguage: 'en-US,en;q=0.9',
      captureScreenshot: true
    };
  }

  try {
    const parsed = validateUrl(rawUrl, options?.allowLocalhostForTesting);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        isValid: false,
        error: `Protocol "${parsed.protocol}" is not supported. Only http:// and https:// are permitted.`,
        url: '',
        mode: 'fetch-and-render',
        userAgentId: 'googlebot-smartphone',
        respectRobots: true,
        postLoadWaitMs: DEFAULT_POST_LOAD_WAIT_MS,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        acceptLanguage: 'en-US,en;q=0.9',
        captureScreenshot: true
      };
    }
  } catch (err: any) {
    return {
      isValid: false,
      error: err.message || 'Invalid URL supplied.',
      url: '',
      mode: 'fetch-and-render',
      userAgentId: 'googlebot-smartphone',
      respectRobots: true,
      postLoadWaitMs: DEFAULT_POST_LOAD_WAIT_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      acceptLanguage: 'en-US,en;q=0.9',
      captureScreenshot: true
    };
  }

  // Mode
  let mode: FetchRenderMode = 'fetch-and-render';
  if (body.mode === 'fetch-only' || body.mode === 'fetch-and-render') {
    mode = body.mode;
  }

  // User-Agent ID validation
  let userAgentId = 'googlebot-smartphone';
  if (typeof body.userAgent === 'string' && body.userAgent.trim()) {
    const requestedUa = body.userAgent.trim();
    const resolvedUa = findFetchRenderUserAgent(requestedUa);
    if (!resolvedUa) {
      return {
        isValid: false,
        error: `Unknown User-Agent ID: "${requestedUa}". Please select a valid User-Agent.`,
        url: '',
        mode: 'fetch-and-render',
        userAgentId: 'googlebot-smartphone',
        respectRobots: true,
        postLoadWaitMs: DEFAULT_POST_LOAD_WAIT_MS,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        acceptLanguage: 'en-US,en;q=0.9',
        captureScreenshot: true
      };
    }
    userAgentId = resolvedUa.id;
  }

  // respectRobots (default true)
  const respectRobots = body.respectRobots !== false;

  // postLoadWaitMs
  let postLoadWaitMs = DEFAULT_POST_LOAD_WAIT_MS;
  if (typeof body.postLoadWaitMs === 'number' && !isNaN(body.postLoadWaitMs)) {
    postLoadWaitMs = Math.max(MIN_POST_LOAD_WAIT_MS, Math.min(MAX_POST_LOAD_WAIT_MS, body.postLoadWaitMs));
  } else if (body.options && typeof body.options.postLoadWaitMs === 'number') {
    postLoadWaitMs = Math.max(MIN_POST_LOAD_WAIT_MS, Math.min(MAX_POST_LOAD_WAIT_MS, body.options.postLoadWaitMs));
  }

  // timeoutMs
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (typeof body.timeoutMs === 'number' && !isNaN(body.timeoutMs)) {
    timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, body.timeoutMs));
  } else if (body.options && typeof body.options.timeoutMs === 'number') {
    timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, body.options.timeoutMs));
  }

  // acceptLanguage
  const acceptLanguage = typeof body.acceptLanguage === 'string' && body.acceptLanguage.trim()
    ? body.acceptLanguage.trim().slice(0, 100)
    : 'en-US,en;q=0.9';

  // captureScreenshot
  let captureScreenshot = true;
  if (typeof body.captureScreenshot === 'boolean') {
    captureScreenshot = body.captureScreenshot;
  } else if (body.options && typeof body.options.captureScreenshot === 'boolean') {
    captureScreenshot = body.options.captureScreenshot;
  }

  return {
    isValid: true,
    url: rawUrl,
    mode,
    userAgentId,
    respectRobots,
    postLoadWaitMs,
    timeoutMs,
    acceptLanguage,
    captureScreenshot
  };
}
