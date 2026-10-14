import { HreflangValidationItem } from './types';

/**
 * Escapes values for safe CSV formatting and formula injection defense.
 */
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);

  // Prevent spreadsheet formula injection (=, +, -, @, tab, CR)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Double quotes escape
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generates an RFC 4180-compliant CSV string from hreflang results.
 */
export function generateHreflangCsv(items: HreflangValidationItem[]): string {
  const headers = [
    'Hreflang',
    'Language',
    'Region',
    'Alternate URL',
    'Source Type',
    'Source URL',
    'Self-Reference',
    'Return Tag',
    'HTTP Status',
    'Final URL',
    'Indexability',
    'Canonical URL',
    'HTML Lang',
    'Content-Language (Meta)',
    'Content-Language (Header)',
    'Error Count',
    'Warning Count',
    'Issues / Diagnostics',
  ];

  const rows = items.map((item) => {
    const errorIssues = item.issues.filter((i) => i.severity === 'error');
    const warningIssues = item.issues.filter((i) => i.severity === 'warning');
    const allIssueMessages = item.issues.map((i) => `[${i.severity.toUpperCase()}] ${i.message}`).join(' | ');

    const returnTagStatus =
      item.returnTagFound === true
        ? 'Verified'
        : item.returnTagFound === false
        ? 'Missing'
        : 'Untested / N/A';

    return [
      escapeCsvValue(item.annotation.hreflang),
      escapeCsvValue(item.annotation.language || '-'),
      escapeCsvValue(item.annotation.region || '-'),
      escapeCsvValue(item.annotation.href),
      escapeCsvValue(item.annotation.source),
      escapeCsvValue(item.annotation.sourceUrl),
      escapeCsvValue(item.selfReferencing ? 'Yes' : 'No'),
      escapeCsvValue(returnTagStatus),
      escapeCsvValue(item.statusCode ?? 'Not fetched'),
      escapeCsvValue(item.finalUrl || item.annotation.href),
      escapeCsvValue(item.indexability.toUpperCase()),
      escapeCsvValue(item.canonicalUrl || 'None'),
      escapeCsvValue(item.htmlLang || '-'),
      escapeCsvValue(item.contentLanguageMeta || '-'),
      escapeCsvValue(item.contentLanguageHeader || '-'),
      escapeCsvValue(errorIssues.length),
      escapeCsvValue(warningIssues.length),
      escapeCsvValue(allIssueMessages || 'None'),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Triggers a browser download of the generated CSV file.
 */
export function downloadCsvFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
