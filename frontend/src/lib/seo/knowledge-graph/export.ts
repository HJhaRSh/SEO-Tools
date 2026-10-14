import { KnowledgeGraphEntity } from './types';

/**
 * Escapes a cell for CSV format, guarding against spreadsheet formula injection (=, +, -, @, \t, \r).
 */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = String(value);

  // Guard against spreadsheet formula injection
  if (/^[=\+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape inner double quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Exports Knowledge Graph entities into a compliant UTF-8 CSV string.
 */
export function generateKnowledgeGraphCsv(entities: KnowledgeGraphEntity[]): string {
  const headers = [
    'Entity Name',
    'Entity Types',
    'Knowledge Graph ID',
    'Google MID',
    'Description',
    'Detailed Description',
    'Website',
    'Source URL',
    'Relevance Score',
  ];

  const headerRow = headers.map((h) => sanitizeCsvCell(h)).join(',');

  const rows = entities.map((entity) => {
    return [
      sanitizeCsvCell(entity.name),
      sanitizeCsvCell(entity.types.join(', ')),
      sanitizeCsvCell(entity.id),
      sanitizeCsvCell(entity.mid || ''),
      sanitizeCsvCell(entity.description || ''),
      sanitizeCsvCell(entity.detailedDescription || ''),
      sanitizeCsvCell(entity.website || ''),
      sanitizeCsvCell(entity.sourceUrl || ''),
      sanitizeCsvCell(entity.resultScore !== null ? entity.resultScore : ''),
    ].join(',');
  });

  // UTF-8 BOM for Excel compatibility
  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
}

/**
 * Triggers browser download of the generated CSV file.
 */
export function downloadCsvFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
