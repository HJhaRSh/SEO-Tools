import { InspectionRowResult, VERDICT_LABELS } from './types';

/**
 * Escapes a single CSV cell value and mitigates spreadsheet formula injection.
 * If the value starts with '=', '+', '-', '@', '\t', or '\r', a leading single quote is added.
 */
export function sanitizeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);

  // Formula injection mitigation
  const safeStr = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;

  // If contains commas, double quotes, or line breaks, enclose in double quotes with escaped quotes
  if (safeStr.includes('"') || safeStr.includes(',') || safeStr.includes('\n') || safeStr.includes('\r')) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }

  return safeStr;
}

/**
 * Generates RFC 4180-compliant CSV content with UTF-8 BOM for GSC inspection results
 */
export function generateInspectionCsv(items: InspectionRowResult[]): string {
  const headers = [
    'URL',
    'Google Index Status',
    'Coverage Reason',
    'Meta Title',
    'Title Length',
    'Meta Description',
    'Description Length',
    'Last Google Crawl',
    'Google Canonical',
    'User Canonical',
    'Checked At',
    'Error',
  ];

  const rows = items.map((item) => [
    item.url,
    VERDICT_LABELS[item.googleIndexStatus] || item.googleIndexStatus,
    item.coverageState || '',
    item.metaTitle || '',
    item.metaTitle ? item.titleLength : 0,
    item.metaDescription || '',
    item.metaDescription ? item.descriptionLength : 0,
    item.lastGoogleCrawl || '',
    item.googleCanonical || '',
    item.userCanonical || '',
    item.checkedAt,
    item.error || '',
  ]);

  const csvRows = [
    headers.map((h) => sanitizeCsvField(h)).join(','),
    ...rows.map((row) => row.map((cell) => sanitizeCsvField(cell)).join(',')),
  ];

  return '\uFEFF' + csvRows.join('\r\n');
}

/**
 * Triggers a client-side file download of CSV content
 */
export function triggerCsvDownload(content: string, filename?: string): void {
  const today = new Date().toISOString().split('T')[0];
  const name = filename || `bulk-google-index-checker-${today}.csv`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', name);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats results into a clean tab-separated string suitable for clipboard pasting into Excel/Sheets
 */
export function formatTabularResults(items: InspectionRowResult[]): string {
  const headers = [
    'URL',
    'Google Index Status',
    'Coverage Reason',
    'Meta Title',
    'Title Length',
    'Meta Description',
    'Description Length',
    'Last Google Crawl',
    'Google Canonical',
    'User Canonical',
  ];

  const rows = items.map((item) => [
    item.url,
    VERDICT_LABELS[item.googleIndexStatus] || item.googleIndexStatus,
    item.coverageState || '(None)',
    item.metaTitle || '(None)',
    String(item.titleLength),
    item.metaDescription || '(None)',
    String(item.descriptionLength),
    item.lastGoogleCrawl || 'N/A',
    item.googleCanonical || 'N/A',
    item.userCanonical || 'N/A',
  ]);

  return [headers.join('\t'), ...rows.map((row) => row.join('\t'))].join('\n');
}

/**
 * Safely copies text to the clipboard with modern API and textarea fallback
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}
