import { validateUrl } from './safeFetch';

export interface ValidatedHtaccessInput {
  validUrl: URL;
  rawUrl: string;
  cleanedHtaccess: string;
  lineCount: number;
}

const MAX_HTACCESS_BYTES = 64 * 1024; // 64 KiB
const MAX_LINES = 500;

export function validateHtaccessInput(urlInput: string, htaccessInput: string): ValidatedHtaccessInput {
  if (!urlInput || typeof urlInput !== 'string' || !urlInput.trim()) {
    throw new Error('Please enter a valid URL to test.');
  }

  let rawUrl = urlInput.trim();
  if (rawUrl.includes('://')) {
    const scheme = rawUrl.split('://')[0].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      throw new Error(`Unsupported URL protocol "${scheme}:". Only HTTP and HTTPS are permitted.`);
    }
  } else {
    rawUrl = 'https://' + rawUrl;
  }

  // Validate URL protocol, port, host using existing SSRF validateUrl
  const validUrl = validateUrl(rawUrl);

  if (typeof htaccessInput !== 'string') {
    throw new Error('Please enter .htaccess rules as text.');
  }

  const cleanedHtaccess = htaccessInput.trim();
  if (!cleanedHtaccess) {
    throw new Error('The .htaccess rule content is empty. Please provide at least one directive.');
  }

  if (Buffer.byteLength(cleanedHtaccess, 'utf8') > MAX_HTACCESS_BYTES) {
    throw new Error(`The .htaccess text exceeds the maximum permitted size of ${MAX_HTACCESS_BYTES / 1024} KB.`);
  }

  const lines = cleanedHtaccess.split(/\r\n|\r|\n/);
  if (lines.length > MAX_LINES) {
    throw new Error(`The .htaccess input contains ${lines.length} lines, exceeding the maximum limit of ${MAX_LINES} lines.`);
  }

  return {
    validUrl,
    rawUrl,
    cleanedHtaccess,
    lineCount: lines.length
  };
}
