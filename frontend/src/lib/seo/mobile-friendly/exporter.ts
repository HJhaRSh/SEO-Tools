import ExcelJS from 'exceljs';
import { SingleUrlMobileAuditResult } from './types';

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
 * Generates an RFC 4180-compliant UTF-8 CSV string for Mobile-Friendly audit results.
 */
export function generateMobileFriendlyCsv(results: SingleUrlMobileAuditResult[]): string {
  const headers = [
    'Tested URL',
    'Final URL',
    'HTTP Status',
    'Overall Usability',
    'Execution Mode',
    'Configure Viewport',
    'Fixed Width Viewport',
    'Size Content To Viewport',
    'Legible Font Sizes',
    'Tap Targets',
    'Incompatible Plugins',
    'Total Issues',
    'Critical Issues',
    'Warning Issues',
    'Screenshot Available',
    'Tested At',
    'Detailed Issue Summaries',
  ];

  const escapeCsvCell = (val: unknown): string => {
    const sanitized = sanitizeSpreadsheetField(val);
    const escaped = sanitized.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const rows: string[] = [];
  rows.push(headers.map(escapeCsvCell).join(','));

  for (const r of results) {
    const issuesSummary = r.issues
      .map((i) => `[${i.severity}] ${i.title}: ${i.description}`)
      .join(' | ');

    const criticalCount = r.issues.filter((i) => i.severity === 'CRITICAL').length;
    const warningCount = r.issues.filter((i) => i.severity === 'WARNING').length;

    const row = [
      r.url,
      r.finalUrl || r.url,
      r.statusCode ? `${r.statusCode} ${r.statusText || ''}`.trim() : 'Error',
      r.overallStatus,
      r.executionMode,
      r.tests.configureViewport.status,
      r.tests.fixedWidthViewport.status,
      r.tests.sizeContentToViewport.status,
      r.tests.legibleFontSizes.status,
      r.tests.tapTargets.status,
      r.tests.incompatiblePlugins.status,
      r.issues.length,
      criticalCount,
      warningCount,
      r.screenshot?.available ? 'Yes' : 'No',
      r.testedAt,
      issuesSummary,
    ];

    rows.push(row.map(escapeCsvCell).join(','));
  }

  // Prepend UTF-8 BOM so Microsoft Excel cleanly loads Unicode characters
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Generates an Excel (.xlsx) workbook buffer using ExcelJS with formatted headers and styling.
 */
export async function generateMobileFriendlyXlsx(
  results: SingleUrlMobileAuditResult[]
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Indian Marketers SEO Tools';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Mobile-Friendly Test');

  worksheet.columns = [
    { header: 'Tested URL', key: 'url', width: 35 },
    { header: 'Final URL', key: 'finalUrl', width: 35 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Overall Usability', key: 'overallStatus', width: 18 },
    { header: 'Mode', key: 'mode', width: 22 },
    { header: 'Configure Viewport', key: 'configureViewport', width: 18 },
    { header: 'Fixed Width', key: 'fixedWidth', width: 15 },
    { header: 'Size Content', key: 'sizeContent', width: 15 },
    { header: 'Font Legibility', key: 'fontSizes', width: 16 },
    { header: 'Tap Targets', key: 'tapTargets', width: 15 },
    { header: 'Plugins', key: 'plugins', width: 14 },
    { header: 'Total Issues', key: 'totalIssues', width: 13 },
    { header: 'Critical', key: 'criticalIssues', width: 12 },
    { header: 'Warnings', key: 'warningIssues', width: 12 },
    { header: 'Screenshot', key: 'screenshot', width: 14 },
    { header: 'Tested At', key: 'testedAt', width: 22 },
    { header: 'Detailed Issue Report', key: 'issueReport', width: 50 },
  ];

  // Header row formatting
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF16A34A' }, // green-600
  };

  for (const r of results) {
    const issuesSummary = r.issues
      .map((i) => `[${i.severity}] ${i.title}: ${i.description}`)
      .join('\n');

    const criticalCount = r.issues.filter((i) => i.severity === 'CRITICAL').length;
    const warningCount = r.issues.filter((i) => i.severity === 'WARNING').length;

    worksheet.addRow({
      url: sanitizeSpreadsheetField(r.url),
      finalUrl: sanitizeSpreadsheetField(r.finalUrl || r.url),
      status: r.statusCode ? `${r.statusCode} ${r.statusText || ''}`.trim() : 'Error',
      overallStatus: r.overallStatus,
      mode: r.executionMode,
      configureViewport: r.tests.configureViewport.status,
      fixedWidth: r.tests.fixedWidthViewport.status,
      sizeContent: r.tests.sizeContentToViewport.status,
      fontSizes: r.tests.legibleFontSizes.status,
      tapTargets: r.tests.tapTargets.status,
      plugins: r.tests.incompatiblePlugins.status,
      totalIssues: r.issues.length,
      criticalIssues: criticalCount,
      warningIssues: warningCount,
      screenshot: r.screenshot?.available ? 'Yes' : 'No',
      testedAt: r.testedAt,
      issueReport: sanitizeSpreadsheetField(issuesSummary),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
