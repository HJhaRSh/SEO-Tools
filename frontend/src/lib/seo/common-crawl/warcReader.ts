/**
 * Common Crawl WARC Reader Service
 * Feature 7 & Historical WARC record extraction
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import zlib from 'zlib';
import { commonCrawlCache } from './cacheService';

const DATA_COMMON_CRAWL_BASE = 'https://data.commoncrawl.org';
const MAX_WARC_RANGE_BYTES = 5 * 1024 * 1024; // 5 MB max compressed range
const MAX_DECOMPRESSED_BYTES = 10 * 1024 * 1024; // 10 MB max decompressed payload

export interface WarcRecordPayload {
  warcHeaders: Record<string, string>;
  httpHeaders: Record<string, string>;
  httpStatusCode: number;
  contentType: string;
  payloadText: string;
  warcTargetUri?: string;
  warcDate?: string;
}

/**
 * Validates and sanitizes a WARC filename returned from Common Crawl index
 */
export function validateWarcFilename(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  // Must match standard Common Crawl path structure e.g. crawl-data/CC-MAIN-2026-43/.../CC-MAIN-....warc.gz
  return /^crawl-data\/CC-MAIN-[0-9]{4}-[0-9]{2}\/segments\/[0-9.]+\/(warc|robotstxt)\/[A-Za-z0-9._-]+\.(warc|gz)$/.test(filename) ||
         filename.startsWith('crawl-data/');
}

/**
 * Fetches and decompresses a specific WARC byte range
 */
export async function fetchWarcRecord(
  filename: string,
  offset: number,
  length: number,
  timeoutMs = 9000
): Promise<WarcRecordPayload> {
  if (!validateWarcFilename(filename)) {
    throw new Error(`Invalid or untrusted WARC filename path: "${filename}"`);
  }

  if (offset < 0 || length <= 0 || length > MAX_WARC_RANGE_BYTES) {
    throw new Error(`Invalid WARC byte range: offset ${offset}, length ${length}`);
  }

  const cacheKey = `warc:${filename}:${offset}:${length}`;
  const cached = commonCrawlCache.warcContent.get(cacheKey);
  if (cached) {
    return cached;
  }

  const warcUrl = `${DATA_COMMON_CRAWL_BASE}/${filename}`;
  const endByte = offset + length - 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(warcUrl, {
      signal: controller.signal,
      headers: {
        'Range': `bytes=${offset}-${endByte}`,
        'User-Agent': 'IndianMarketers-SEO-Tool/1.0 (+https://indianmarketers.in/tools/common-crawl-checker)'
      }
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`Common Crawl WARC storage returned HTTP ${res.status}`);
  }

  const rawBuffer = Buffer.from(await res.arrayBuffer());
  if (rawBuffer.length === 0) {
    throw new Error('Received empty byte range from WARC archive');
  }

  // Decompress GZIP payload
  let decompressed: Buffer;
  try {
    decompressed = zlib.gunzipSync(rawBuffer, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
  } catch (gzipErr: any) {
    try {
      // Fallback to inflateRaw if raw deflate block
      decompressed = zlib.inflateRawSync(rawBuffer);
    } catch {
      throw new Error(`Failed to decompress WARC record gzip member: ${gzipErr.message}`);
    }
  }

  const rawString = decompressed.toString('utf8');

  // Parse WARC/1.0 envelope
  // Structure:
  // WARC/1.0\r\n
  // Header: Value\r\n
  // \r\n
  // HTTP/1.1 200 OK\r\n
  // Http-Header: Value\r\n
  // \r\n
  // Payload Body
  const warcHeaderEnd = rawString.indexOf('\r\n\r\n');
  const warcHeaderPart = warcHeaderEnd !== -1 ? rawString.substring(0, warcHeaderEnd) : rawString;
  const warcRemaining = warcHeaderEnd !== -1 ? rawString.substring(warcHeaderEnd + 4) : '';

  const warcHeaders: Record<string, string> = {};
  for (const line of warcHeaderPart.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const k = line.substring(0, colon).trim().toLowerCase();
      const v = line.substring(colon + 1).trim();
      warcHeaders[k] = v;
    }
  }

  // Parse HTTP response part inside WARC
  const httpHeaderEnd = warcRemaining.indexOf('\r\n\r\n');
  let httpHeaders: Record<string, string> = {};
  let httpStatusCode = 200;
  let payloadText = '';

  if (httpHeaderEnd !== -1) {
    const httpHeaderPart = warcRemaining.substring(0, httpHeaderEnd);
    payloadText = warcRemaining.substring(httpHeaderEnd + 4);

    const httpLines = httpHeaderPart.split(/\r?\n/);
    if (httpLines.length > 0) {
      const statusLine = httpLines[0];
      const statusMatch = statusLine.match(/HTTP\/[0-9.]+\s+([0-9]{3})/i);
      if (statusMatch) {
        httpStatusCode = parseInt(statusMatch[1], 10);
      }
    }

    for (let i = 1; i < httpLines.length; i++) {
      const line = httpLines[i];
      const colon = line.indexOf(':');
      if (colon > 0) {
        const k = line.substring(0, colon).trim().toLowerCase();
        const v = line.substring(colon + 1).trim();
        httpHeaders[k] = v;
      }
    }
  } else {
    payloadText = warcRemaining;
  }

  const result: WarcRecordPayload = {
    warcHeaders,
    httpHeaders,
    httpStatusCode,
    contentType: httpHeaders['content-type'] || warcHeaders['content-type'] || 'text/html',
    payloadText,
    warcTargetUri: warcHeaders['warc-target-uri'],
    warcDate: warcHeaders['warc-date']
  };

  commonCrawlCache.warcContent.set(cacheKey, result);
  return result;
}

