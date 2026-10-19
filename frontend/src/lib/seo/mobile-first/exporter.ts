import ExcelJS from 'exceljs';
import { MobileFirstAuditResponse } from './types';

/**
 * Neutralizes spreadsheet formula injection (=, +, -, @, \t, \r).
 */
export function sanitizeSpreadsheetField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Generates an RFC 4180 compliant UTF-8 CSV with BOM for Mobile-First Index results.
 */
export function generateMobileFirstCsv(audit: MobileFirstAuditResponse): string {
  const escapeCell = (val: unknown): string => {
    const sanitized = sanitizeSpreadsheetField(val);
    const escaped = sanitized.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const lines: string[] = [];

  // Metadata block
  lines.push(['Tool', 'Mobile-First Index Checker — Indian Marketers SEO Tools'].map(escapeCell).join(','));
  lines.push(['Execution Mode', audit.executionMode].map(escapeCell).join(','));
  lines.push(['Tested URL', audit.requestedDesktopUrl].map(escapeCell).join(','));
  lines.push(['Mobile URL', audit.requestedMobileUrl || '(Same as desktop)'].map(escapeCell).join(','));
  lines.push(['Desktop Final Destination', audit.desktop.finalUrl].map(escapeCell).join(','));
  lines.push(['Mobile Final Destination', audit.mobile.finalUrl].map(escapeCell).join(','));
  lines.push(['Desktop HTTP Status', `${audit.desktop.statusCode} ${audit.desktop.statusText}`].map(escapeCell).join(','));
  lines.push(['Mobile HTTP Status', `${audit.mobile.statusCode} ${audit.mobile.statusText}`].map(escapeCell).join(','));
  lines.push(['Overall Parity Verdict', audit.summary.parityVerdict].map(escapeCell).join(','));
  lines.push(['Discrepancies Count', audit.summary.totalDiscrepancies].map(escapeCell).join(','));
  lines.push(['Audit Timestamp', audit.testedAt].map(escapeCell).join(','));
  lines.push(''); // blank line

  // Comparison Table Section
  lines.push(['--- COMPARISON MATRIX ---'].map(escapeCell).join(','));
  lines.push(['Category', 'SEO Element', 'Desktop Response', 'Mobile Response', 'Parity Status', 'Details'].map(escapeCell).join(','));
  for (const row of audit.comparisonTable) {
    lines.push([
      row.category,
      row.element,
      row.desktop,
      row.mobile,
      row.status,
      row.details || '',
    ].map(escapeCell).join(','));
  }

  lines.push(''); // blank line

  // Discrepancy Findings Section
  lines.push(['--- DISCREPANCIES & RECOMMENDATIONS ---'].map(escapeCell).join(','));
  lines.push(['Severity', 'Category', 'Issue Title', 'Desktop Evidence', 'Mobile Evidence', 'Why It Matters', 'Recommended Action'].map(escapeCell).join(','));
  for (const disc of audit.discrepancies) {
    lines.push([
      disc.severity,
      disc.category,
      disc.name,
      disc.desktopEvidence,
      disc.mobileEvidence,
      disc.whyItMatters,
      disc.recommendation,
    ].map(escapeCell).join(','));
  }

  // Prepend UTF-8 BOM
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Generates a professionally formatted multi-worksheet XLSX workbook.
 */
export async function generateMobileFirstXlsx(audit: MobileFirstAuditResponse): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Indian Marketers SEO Tools';
  workbook.created = new Date();

  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };
  const headerFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FF16A34A' }, // emerald-600
  };

  // 1. Worksheet: Summary
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Property', key: 'property', width: 30 },
    { header: 'Value', key: 'value', width: 60 },
  ];
  const summaryHeader = summarySheet.getRow(1);
  summaryHeader.font = headerFont;
  summaryHeader.fill = headerFill;

  const summaryItems = [
    { property: 'Audit Tool', value: 'Mobile-First Index Checker' },
    { property: 'Execution Mode', value: audit.executionMode },
    { property: 'Requested Desktop URL', value: audit.requestedDesktopUrl },
    { property: 'Requested Mobile URL', value: audit.requestedMobileUrl || '(Identical to desktop)' },
    { property: 'Desktop Final URL', value: audit.desktop.finalUrl },
    { property: 'Mobile Final URL', value: audit.mobile.finalUrl },
    { property: 'Desktop Status', value: `HTTP ${audit.desktop.statusCode} ${audit.desktop.statusText}` },
    { property: 'Mobile Status', value: `HTTP ${audit.mobile.statusCode} ${audit.mobile.statusText}` },
    { property: 'Parity Verdict', value: audit.summary.parityVerdict },
    { property: 'Total Discrepancies', value: audit.summary.totalDiscrepancies },
    { property: 'Critical Issues', value: audit.summary.criticalCount },
    { property: 'High Severity Issues', value: audit.summary.highCount },
    { property: 'Medium Severity Issues', value: audit.summary.mediumCount },
    { property: 'Low Severity Issues', value: audit.summary.lowCount },
    { property: 'Informational Findings', value: audit.summary.infoCount },
    { property: 'Text Similarity', value: `${audit.summary.textSimilarityPct}%` },
    { property: 'Separate Mobile URL Setup', value: audit.summary.isSeparateMobileUrl ? 'Yes' : 'No' },
    { property: 'Audit Timestamp', value: audit.testedAt },
  ];

  for (const item of summaryItems) {
    summarySheet.addRow({
      property: sanitizeSpreadsheetField(item.property),
      value: sanitizeSpreadsheetField(item.value),
    });
  }

  // 2. Worksheet: Comparison Matrix
  const matrixSheet = workbook.addWorksheet('Comparison Matrix');
  matrixSheet.columns = [
    { header: 'Category', key: 'category', width: 22 },
    { header: 'SEO Element', key: 'element', width: 26 },
    { header: 'Desktop Response', key: 'desktop', width: 45 },
    { header: 'Mobile Response', key: 'mobile', width: 45 },
    { header: 'Parity Status', key: 'status', width: 16 },
    { header: 'Notes & Context', key: 'details', width: 45 },
  ];
  const matrixHeader = matrixSheet.getRow(1);
  matrixHeader.font = headerFont;
  matrixHeader.fill = headerFill;

  for (const row of audit.comparisonTable) {
    const addedRow = matrixSheet.addRow({
      category: sanitizeSpreadsheetField(row.category),
      element: sanitizeSpreadsheetField(row.element),
      desktop: sanitizeSpreadsheetField(row.desktop),
      mobile: sanitizeSpreadsheetField(row.mobile),
      status: sanitizeSpreadsheetField(row.status),
      details: sanitizeSpreadsheetField(row.details || ''),
    });

    if (row.status === 'Critical') {
      addedRow.getCell('status').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' },
      };
      addedRow.getCell('status').font = { color: { argb: 'FF991B1B' }, bold: true };
    } else if (row.status === 'Warning') {
      addedRow.getCell('status').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' },
      };
      addedRow.getCell('status').font = { color: { argb: 'FF92400E' }, bold: true };
    } else if (row.status === 'Match') {
      addedRow.getCell('status').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDCFCE7' },
      };
      addedRow.getCell('status').font = { color: { argb: 'FF166534' } };
    }
  }

  // 3. Worksheet: Issues & Recommendations
  const issuesSheet = workbook.addWorksheet('Issues & Recommendations');
  issuesSheet.columns = [
    { header: 'Severity', key: 'severity', width: 14 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Issue Title', key: 'name', width: 32 },
    { header: 'Desktop Evidence', key: 'desktopEvidence', width: 40 },
    { header: 'Mobile Evidence', key: 'mobileEvidence', width: 40 },
    { header: 'Why It Matters', key: 'whyItMatters', width: 45 },
    { header: 'Recommended Action', key: 'recommendation', width: 50 },
  ];
  const issuesHeader = issuesSheet.getRow(1);
  issuesHeader.font = headerFont;
  issuesHeader.fill = headerFill;

  for (const disc of audit.discrepancies) {
    issuesSheet.addRow({
      severity: sanitizeSpreadsheetField(disc.severity),
      category: sanitizeSpreadsheetField(disc.category),
      name: sanitizeSpreadsheetField(disc.name),
      desktopEvidence: sanitizeSpreadsheetField(disc.desktopEvidence),
      mobileEvidence: sanitizeSpreadsheetField(disc.mobileEvidence),
      whyItMatters: sanitizeSpreadsheetField(disc.whyItMatters),
      recommendation: sanitizeSpreadsheetField(disc.recommendation),
    });
  }

  // 4. Worksheet: Structured Data
  const schemaSheet = workbook.addWorksheet('Structured Data');
  schemaSheet.columns = [
    { header: 'Agent', key: 'agent', width: 14 },
    { header: 'Schema Type', key: 'type', width: 25 },
    { header: 'Name / Headline', key: 'name', width: 35 },
    { header: '@id Identifier', key: 'id', width: 40 },
    { header: 'Description', key: 'description', width: 45 },
    { header: 'Author / Publisher', key: 'author', width: 25 },
  ];
  const schemaHeader = schemaSheet.getRow(1);
  schemaHeader.font = headerFont;
  schemaHeader.fill = headerFill;

  for (const ent of audit.desktop.structuredData.entities) {
    schemaSheet.addRow({
      agent: 'Desktop',
      type: sanitizeSpreadsheetField(ent.type),
      name: sanitizeSpreadsheetField(ent.name || ent.headline || ''),
      id: sanitizeSpreadsheetField(ent.id || ''),
      description: sanitizeSpreadsheetField(ent.description || ''),
      author: sanitizeSpreadsheetField(ent.author || ent.publisher || ''),
    });
  }

  for (const ent of audit.mobile.structuredData.entities) {
    schemaSheet.addRow({
      agent: 'Mobile',
      type: sanitizeSpreadsheetField(ent.type),
      name: sanitizeSpreadsheetField(ent.name || ent.headline || ''),
      id: sanitizeSpreadsheetField(ent.id || ''),
      description: sanitizeSpreadsheetField(ent.description || ''),
      author: sanitizeSpreadsheetField(ent.author || ent.publisher || ''),
    });
  }

  // 5. Worksheet: Hreflang
  const hreflangSheet = workbook.addWorksheet('Hreflang');
  hreflangSheet.columns = [
    { header: 'Agent', key: 'agent', width: 14 },
    { header: 'Language Code', key: 'code', width: 18 },
    { header: 'Target Alternate URL', key: 'href', width: 50 },
    { header: 'Declaration Source', key: 'source', width: 18 },
  ];
  const hreflangHeader = hreflangSheet.getRow(1);
  hreflangHeader.font = headerFont;
  hreflangHeader.fill = headerFill;

  for (const item of audit.desktop.hreflang.items) {
    hreflangSheet.addRow({
      agent: 'Desktop',
      code: sanitizeSpreadsheetField(item.hreflang),
      href: sanitizeSpreadsheetField(item.resolvedHref),
      source: sanitizeSpreadsheetField(item.source),
    });
  }

  for (const item of audit.mobile.hreflang.items) {
    hreflangSheet.addRow({
      agent: 'Mobile',
      code: sanitizeSpreadsheetField(item.hreflang),
      href: sanitizeSpreadsheetField(item.resolvedHref),
      source: sanitizeSpreadsheetField(item.source),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
