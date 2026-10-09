import * as archiverNamespace from 'archiver';
import { GeneratedSitemapFile, SitemapValidationIssue } from './sitemapTypes.js';

interface DownloadPackage {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  createdAt: number;
}

// In-memory download store with automatic 30-minute expiration
const downloadStore = new Map<string, DownloadPackage>();
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 mins

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of downloadStore.entries()) {
    if (now - item.createdAt > TOKEN_TTL_MS) {
      downloadStore.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Stores a downloadable file buffer and returns a secure token
 */
export function storeDownload(filename: string, mimeType: string, buffer: Buffer): string {
  const downloadId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  downloadStore.set(downloadId, {
    filename,
    mimeType,
    buffer,
    createdAt: Date.now()
  });
  return downloadId;
}

/**
 * Retrieves a downloadable package if valid and not expired
 */
export function getDownload(downloadId: string): DownloadPackage | null {
  const item = downloadStore.get(downloadId);
  if (!item) return null;
  if (Date.now() - item.createdAt > TOKEN_TTL_MS) {
    downloadStore.delete(downloadId);
    return null;
  }
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
