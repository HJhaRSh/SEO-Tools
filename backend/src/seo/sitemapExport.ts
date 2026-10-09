import * as crypto from 'crypto';
import * as archiverNamespace from 'archiver';
import { GeneratedSitemapFile, SitemapValidationIssue } from './sitemapTypes.js';

interface DownloadPackage {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  byteSize: number;
  createdAt: number;
}

// Bounded in-memory download store with automatic 15-minute expiration & LRU capacity control
const downloadStore = new Map<string, DownloadPackage>();
export const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 mins TTL
export const MAX_RETAINED_DOWNLOAD_JOBS = 50; // Max 50 active packages
export const MAX_TOTAL_RETAINED_BYTES = 100 * 1024 * 1024; // 100 MB max memory across all jobs
export const MAX_PER_JOB_BYTES = 55 * 1024 * 1024; // 55 MB max per single job

let totalRetainedBytes = 0;

/**
 * Removes expired tokens and trims memory
 */
export function pruneExpiredDownloads(): void {
  const now = Date.now();
  for (const [id, item] of downloadStore.entries()) {
    if (now - item.createdAt > TOKEN_TTL_MS) {
      totalRetainedBytes -= item.byteSize;
      downloadStore.delete(id);
    }
  }
}

// Periodic cleanup every 2 minutes
setInterval(pruneExpiredDownloads, 2 * 60 * 1000).unref();

/**
 * Evicts oldest items when capacity is reached (LRU)
 */
function evictOldestIfNeeded(incomingBytes: number): void {
  pruneExpiredDownloads();

  // Evict until both count and byte bounds are satisfied
  while (
    downloadStore.size >= MAX_RETAINED_DOWNLOAD_JOBS ||
    (totalRetainedBytes + incomingBytes > MAX_TOTAL_RETAINED_BYTES && downloadStore.size > 0)
  ) {
    const oldestKey = downloadStore.keys().next().value;
    if (!oldestKey) break;
    const oldItem = downloadStore.get(oldestKey);
    if (oldItem) {
      totalRetainedBytes -= oldItem.byteSize;
    }
    downloadStore.delete(oldestKey);
  }
}

/**
 * Stores a downloadable file buffer and returns a cryptographically secure token
 */
export function storeDownload(filename: string, mimeType: string, buffer: Buffer): string {
  if (buffer.length > MAX_PER_JOB_BYTES) {
    throw new Error(`Download package exceeds single-job limit of ${MAX_PER_JOB_BYTES / 1024 / 1024} MB.`);
  }

  evictOldestIfNeeded(buffer.length);

  // Cryptographically strong random token: dl_<random-hex-32> (unpredictable, no filesystem paths)
  const downloadId = `dl_${crypto.randomBytes(16).toString('hex')}`;
  downloadStore.set(downloadId, {
    filename,
    mimeType,
    buffer,
    byteSize: buffer.length,
    createdAt: Date.now()
  });
  totalRetainedBytes += buffer.length;

  return downloadId;
}

/**
 * Retrieves a downloadable package if valid and not expired.
 * Refreshes position in Map for LRU semantics.
 */
export function getDownload(downloadId: string): DownloadPackage | null {
  // Validate token format to prevent any path traversal attempts
  if (!downloadId || !/^dl_[a-f0-9]{32}$/i.test(downloadId)) {
    return null;
  }

  const item = downloadStore.get(downloadId);
  if (!item) return null;

  if (Date.now() - item.createdAt > TOKEN_TTL_MS) {
    totalRetainedBytes -= item.byteSize;
    downloadStore.delete(downloadId);
    return null;
  }

  // Refresh LRU order: delete and re-insert
  downloadStore.delete(downloadId);
  downloadStore.set(downloadId, item);

  return item;
}

/**
 * Helper to instantiate zip archiver across CJS/ESM environments
 */
function createZipInstance(): any {
  const anyArch: any = archiverNamespace;
  if (anyArch.ZipArchive) {
    return new anyArch.ZipArchive({ zlib: { level: 9 } });
  }
  if (typeof anyArch.default === 'function') {
    return anyArch.default('zip', { zlib: { level: 9 } });
  }
  if (typeof anyArch === 'function') {
    return anyArch('zip', { zlib: { level: 9 } });
  }
  if (anyArch.default && anyArch.default.ZipArchive) {
    return new anyArch.default.ZipArchive({ zlib: { level: 9 } });
  }
  throw new Error('Could not instantiate zip archiver module');
}

/**
 * Creates a ZIP archive containing all generated sitemap files and an optional validation report
 */
export async function createSitemapsZip(
  files: GeneratedSitemapFile[],
  issues?: SitemapValidationIssue[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let archive: any;
    try {
      archive = createZipInstance();
    } catch (e) {
      return reject(e);
    }

    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err: any) => reject(err));

    // Add each generated XML file
    for (const f of files) {
      archive.append(f.content, { name: f.filename });
    }

    // Add validation report CSV if issues exist
    if (issues && issues.length > 0) {
      const csvReport = generateIssuesCsv(issues);
      archive.append(csvReport, { name: 'validation-report.csv' });
    }

    archive.finalize();
  });
}

/**
 * Sanitizes CSV cell values to prevent formula injection (=, +, -, @)
 */
export function sanitizeCsvCell(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  let str = String(val).replace(/"/g, '""');
  // Formula injection check: if first char is =, +, -, @, \t, or \r, prefix with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str}"`;
}

/**
 * Generates CSV string for validation issues
 */
export function generateIssuesCsv(issues: SitemapValidationIssue[]): string {
  const headers = ['Row', 'URL', 'Field', 'Severity', 'Code', 'Message'];
  const lines: string[] = [headers.join(',')];

  for (const issue of issues) {
    const row = [
      issue.rowNumber ?? '',
      issue.url ?? '',
      issue.field ?? '',
      issue.severity,
      issue.code,
      issue.message
    ];
    lines.push(row.map(sanitizeCsvCell).join(','));
  }

  return lines.join('\r\n');
}

/**
 * Sample CSV Templates provided for user download
 */
export const SAMPLE_TEMPLATES: Record<string, { filename: string; content: string }> = {
  simple: {
    filename: 'template-simple-sitemap.csv',
    content: `loc,lastmod\r\nhttps://example.com/,2026-10-01\r\nhttps://example.com/about/,2026-09-28\r\nhttps://example.com/services/,2026-09-25\r\nhttps://example.com/contact/,2026-09-20\r\n`
  },
  'hreflang-wide': {
    filename: 'template-hreflang-wide.csv',
    content: `loc,en,fr,es,de\r\nhttps://example.com/en/page/,https://example.com/en/page/,https://example.com/fr/page/,https://example.com/es/page/,https://example.com/de/page/\r\nhttps://example.com/fr/page/,https://example.com/en/page/,https://example.com/fr/page/,https://example.com/es/page/,https://example.com/de/page/\r\nhttps://example.com/es/page/,https://example.com/en/page/,https://example.com/fr/page/,https://example.com/es/page/,https://example.com/de/page/\r\nhttps://example.com/de/page/,https://example.com/en/page/,https://example.com/fr/page/,https://example.com/es/page/,https://example.com/de/page/\r\n`
  },
  'hreflang-long': {
    filename: 'template-hreflang-long.csv',
    content: `loc,hreflang,alternate_url\r\nhttps://example.com/en/page/,en,https://example.com/en/page/\r\nhttps://example.com/en/page/,fr,https://example.com/fr/page/\r\nhttps://example.com/en/page/,es,https://example.com/es/page/\r\nhttps://example.com/fr/page/,en,https://example.com/en/page/\r\nhttps://example.com/fr/page/,fr,https://example.com/fr/page/\r\nhttps://example.com/fr/page/,es,https://example.com/es/page/\r\n`
  }
};
