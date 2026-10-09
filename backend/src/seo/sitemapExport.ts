import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as archiverNamespace from 'archiver';
import { GeneratedSitemapFile, SitemapValidationIssue } from './sitemapTypes.js';

export interface DownloadPackage {
  filename: string;
  mimeType: string;
  buffer?: Buffer;
  filePath?: string; // If stored as a streaming temp file
  byteSize: number;
  createdAt: number;
}

// Dedicated secure temp dir for sitemap downloads
const SITEMAP_TEMP_DIR = path.join(os.tmpdir(), 'seo_sitemaps_cache');
if (!fs.existsSync(SITEMAP_TEMP_DIR)) {
  try {
    fs.mkdirSync(SITEMAP_TEMP_DIR, { recursive: true, mode: 0o700 });
  } catch {
    // Fallback handled gracefully
  }
}

// Bounded download store with automatic 15-minute expiration & LRU capacity control
const downloadStore = new Map<string, DownloadPackage>();
export const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 mins TTL
export const MAX_RETAINED_DOWNLOAD_JOBS = 50; // Max 50 active packages
export const MAX_TOTAL_RETAINED_BYTES = 100 * 1024 * 1024; // 100 MB max storage across all jobs
export const MAX_PER_JOB_BYTES = 55 * 1024 * 1024; // 55 MB max per single job

let totalRetainedBytes = 0;

/**
 * Removes expired tokens, cleans up temp files and trims storage
 */
export function pruneExpiredDownloads(): void {
  const now = Date.now();
  for (const [id, item] of downloadStore.entries()) {
    if (now - item.createdAt > TOKEN_TTL_MS) {
      if (item.filePath && fs.existsSync(item.filePath)) {
        try { fs.unlinkSync(item.filePath); } catch { /* ignore */ }
      }
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
      if (oldItem.filePath && fs.existsSync(oldItem.filePath)) {
        try { fs.unlinkSync(oldItem.filePath); } catch { /* ignore */ }
      }
      totalRetainedBytes -= oldItem.byteSize;
    }
    downloadStore.delete(oldestKey);
  }
}

/**
 * Stores a downloadable file buffer or temp file and returns a cryptographically secure token
 */
export function storeDownload(
  filename: string,
  mimeType: string,
  bufferOrPath: Buffer | { filePath: string; byteSize: number }
): string {
  const isFilePath = typeof bufferOrPath === 'object' && 'filePath' in bufferOrPath;
  const byteSize = isFilePath ? bufferOrPath.byteSize : (bufferOrPath as Buffer).length;

  if (byteSize > MAX_PER_JOB_BYTES) {
    if (isFilePath && fs.existsSync(bufferOrPath.filePath)) {
      try { fs.unlinkSync(bufferOrPath.filePath); } catch { /* ignore */ }
    }
    throw new Error(`Download package exceeds single-job limit of ${MAX_PER_JOB_BYTES / 1024 / 1024} MB.`);
  }

  evictOldestIfNeeded(byteSize);

  // Cryptographically strong random token: dl_<random-hex-32> (unpredictable, no filesystem paths)
  const downloadId = `dl_${crypto.randomBytes(16).toString('hex')}`;
  downloadStore.set(downloadId, {
    filename,
    mimeType,
    buffer: isFilePath ? undefined : (bufferOrPath as Buffer),
    filePath: isFilePath ? bufferOrPath.filePath : undefined,
    byteSize,
    createdAt: Date.now()
  });
  totalRetainedBytes += byteSize;

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
    if (item.filePath && fs.existsSync(item.filePath)) {
      try { fs.unlinkSync(item.filePath); } catch { /* ignore */ }
    }
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
 * Creates a ZIP archive by streaming directly to a secure temporary file on disk,
 * avoiding large in-memory Buffer.concat() arrays.
 * Returns the path to the temporary file and its byte size.
 */
export async function createSitemapsZip(
  files: GeneratedSitemapFile[],
  issues?: SitemapValidationIssue[]
): Promise<{ filePath: string; byteSize: number }> {
  const tempFileName = `dl_temp_${crypto.randomBytes(16).toString('hex')}.zip`;
  const tempFilePath = path.join(SITEMAP_TEMP_DIR, tempFileName);

  return new Promise((resolve, reject) => {
    let archive: any;
    try {
      archive = createZipInstance();
    } catch (e) {
      return reject(e);
    }

    const output = fs.createWriteStream(tempFilePath, { mode: 0o600 });

    output.on('close', () => {
      resolve({
        filePath: tempFilePath,
        byteSize: archive.pointer()
      });
    });

    archive.on('error', (err: any) => {
      output.destroy();
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
      }
      reject(err);
    });

    archive.pipe(output);

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
