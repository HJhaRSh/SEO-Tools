import ExcelJS from 'exceljs';
import { AgentTestResult } from './types';

/**
 * Sanitizes spreadsheet cell strings to prevent CSV and Excel formula injection (=, +, -, @, \t, \r).
 */
export function sanitizeSpreadsheetField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Neutralize formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Generates an RFC 4180-compliant UTF-8 CSV string with formula injection protection.
 */
export function generatePrerenderCsv(url: string, results: AgentTestResult[]): string {
  const headers = [
    'URL',
    'User Agent ID',
    'User Agent Name',
    'Status Code',
    'Status Text',
    'Final URL',
    'Redirect Chain',
    'Page Title',
    'Meta Description',
    'H1',
    'Word Count',
    'Image Count',
    'Link Count',
    'Vary User-Agent',
    'MD5',
    'SHA-256',
    'Meta Robots',
    'X-Robots-Tag',
    'Canonical',
    'Content-Type',
    'Error',
  ];

  const escapeCsvCell = (val: unknown): string => {
    const sanitized = sanitizeSpreadsheetField(val);
    const escaped = sanitized.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const rows: string[] = [];
  rows.push(headers.map(escapeCsvCell).join(','));

  for (const r of results) {
    const redirectSummary = r.redirectChain.map((h) => `${h.statusCode}: ${h.from} -> ${h.to}`).join('; ');
    const h1Summary = r.h1.join(' | ');

    const row = [
      url,
      r.userAgentId,
      r.userAgentName,
      r.statusCode ?? '',
      r.statusText ?? '',
      r.finalUrl ?? '',
      redirectSummary,
      r.title ?? '',
      r.metaDescription ?? '',
      h1Summary,
      r.wordCount ?? '',
      r.imageCount ?? '',
      r.linkCount ?? '',
      r.varyUserAgent,
      r.md5 ?? '',
      r.sha256 ?? '',
      r.metaRobots ?? '',
      r.xRobotsTag ?? '',
      r.canonical ?? '',
      r.contentType ?? '',
      r.error ?? '',
    ];

    rows.push(row.map(escapeCsvCell).join(','));
  }

  // Prepend UTF-8 BOM so Excel opens with proper unicode characters
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Generates a styled Excel (.xlsx) workbook buffer using ExcelJS.
 */
export async function generatePrerenderXlsx(url: string, results: AgentTestResult[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Indian Marketers SEO Tools';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Pre-rendering Test');

  worksheet.columns = [
    { header: 'URL', key: 'url', width: 30 },
    { header: 'User Agent', key: 'userAgentName', width: 25 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Final URL', key: 'finalUrl', width: 30 },
    { header: 'Redirect Chain', key: 'redirectChain', width: 30 },
    { header: 'Page Title', key: 'title', width: 30 },
    { header: 'Meta Description', key: 'metaDescription', width: 35 },
    { header: 'H1 Headings', key: 'h1', width: 30 },
    { header: 'Word Count', key: 'wordCount', width: 14 },
    { header: 'Image Count', key: 'imageCount', width: 14 },
    { header: 'Link Count', key: 'linkCount', width: 14 },
    { header: 'Vary: User-Agent', key: 'varyUserAgent', width: 18 },
    { header: 'MD5 Fingerprint', key: 'md5', width: 34 },
    { header: 'Meta Robots', key: 'metaRobots', width: 20 },
    { header: 'Canonical', key: 'canonical', width: 30 },
    { header: 'Error', key: 'error', width: 25 },
  ];

  // Header row style
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF16A34A' }, // green-600
  };

  for (const r of results) {
    const redirectSummary = r.redirectChain.map((h) => `${h.statusCode}: ${h.from} -> ${h.to}`).join('; ');
    const h1Summary = r.h1.join(' | ');

    worksheet.addRow({
      url: sanitizeSpreadsheetField(url),
      userAgentName: sanitizeSpreadsheetField(r.userAgentName),
      status: r.statusCode ? `${r.statusCode} ${r.statusText || ''}`.trim() : 'Error',
      finalUrl: sanitizeSpreadsheetField(r.finalUrl || ''),
      redirectChain: sanitizeSpreadsheetField(redirectSummary),
      title: sanitizeSpreadsheetField(r.title || ''),
      metaDescription: sanitizeSpreadsheetField(r.metaDescription || ''),
      h1: sanitizeSpreadsheetField(h1Summary),
      wordCount: r.wordCount ?? '',
      imageCount: r.imageCount ?? '',
      linkCount: r.linkCount ?? '',
      varyUserAgent: r.varyUserAgent,
      md5: sanitizeSpreadsheetField(r.md5 || ''),
      metaRobots: sanitizeSpreadsheetField(r.metaRobots || r.xRobotsTag || ''),
      canonical: sanitizeSpreadsheetField(r.canonical || ''),
      error: sanitizeSpreadsheetField(r.error || ''),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
