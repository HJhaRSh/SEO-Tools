/**
 * Sitemap CSV and XLSX Parser
 * Tool 4 — XML Sitemap Generator
 *
 * Implements strict security controls:
 * - RFC 4180 CSV parsing with BOM handling and escaped quotes
 * - ExcelJS workbook parsing (disabling macros/formulas, enforcing memory bounds)
 * - Row limits (max 100,000) and column limits (max 100)
 * - File size boundary check
 */

import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { ColumnMapping, SpreadsheetParseResult, SitemapUrlEntry } from './sitemapTypes.js';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (consistent with gateway limit)
export const MAX_ALLOWED_ROWS = 100000;
export const MAX_ALLOWED_COLUMNS = 100;

/**
 * Remove UTF-8 Byte Order Mark if present
 */
export function stripBom(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  return content;
}

/**
 * Parse raw CSV string or Buffer
 */
export function parseCsvContent(
  rawContent: string | Buffer,
  maxPreviewRows: number = 25
): SpreadsheetParseResult {
  const text = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
  const cleanText = stripBom(text);

  if (!cleanText.trim()) {
    return {
      success: false,
      format: 'csv',
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: ['The uploaded CSV is empty.']
    };
  }

  let records: string[][];
  try {
    records = parseCsv(cleanText, {
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true
    });
  } catch (err: any) {
    return {
      success: false,
      format: 'csv',
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Failed to parse CSV: ${err.message}`]
    };
  }

  if (records.length === 0) {
    return {
      success: false,
      format: 'csv',
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: ['No data rows found in the CSV.']
    };
  }

  if (records.length > MAX_ALLOWED_ROWS + 1) {
    return {
      success: false,
      format: 'csv',
      headers: [],
      totalRows: records.length,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Spreadsheet contains ${records.length} rows, which exceeds the maximum limit of ${MAX_ALLOWED_ROWS} rows.`]
    };
  }

  const rawHeaders = records[0];
  if (rawHeaders.length > MAX_ALLOWED_COLUMNS) {
    return {
      success: false,
      format: 'csv',
      headers: [],
      totalRows: records.length,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Spreadsheet contains ${rawHeaders.length} columns, exceeding the maximum limit of ${MAX_ALLOWED_COLUMNS}.`]
    };
  }

  // Deduplicate headers and preserve physical positions
  const seenHeaderCounts = new Map<string, number>();
  const duplicateHeaderWarnings: string[] = [];

  const headers = rawHeaders.map((rawH, i) => {
    let clean = (rawH && rawH.trim()) ? rawH.trim() : `Column_${i + 1}`;
    const count = (seenHeaderCounts.get(clean.toLowerCase()) || 0) + 1;
    seenHeaderCounts.set(clean.toLowerCase(), count);
    if (count > 1) {
      duplicateHeaderWarnings.push(`Duplicate header "${clean}" detected at column ${i + 1}.`);
      clean = `${clean} (${count})`;
    }
    return clean;
  });

  const dataRows = records.slice(1);
  const allRows = dataRows.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });
  const previewRows = allRows.slice(0, maxPreviewRows);

  const { detectedMapping, suggestedType } = detectColumnMapping(headers);

  return {
    success: true,
    format: 'csv',
    headers,
    totalRows: dataRows.length,
    rows: allRows,
    previewRows,
    detectedMapping,
    suggestedType,
    warnings: duplicateHeaderWarnings.length > 0 ? duplicateHeaderWarnings : undefined
  };
}

/**
 * Parse XLSX workbook safely using ExcelJS
 */
export async function parseXlsxContent(
  buffer: Buffer,
  selectedSheetName?: string,
  maxPreviewRows: number = 25
): Promise<SpreadsheetParseResult> {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      format: 'xlsx',
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`XLSX file size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds limit of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`]
    };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch (err: any) {
    return {
      success: false,
      format: 'xlsx',
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Unable to parse Excel file: ${err.message}`]
    };
  }

  const sheetNames = workbook.worksheets.map(w => w.name);
  if (sheetNames.length === 0) {
    return {
      success: false,
      format: 'xlsx',
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: ['The Excel workbook contains no worksheets.']
    };
  }

  const worksheet = selectedSheetName
    ? workbook.getWorksheet(selectedSheetName) || workbook.worksheets[0]
    : workbook.worksheets[0];

  const totalRowCount = worksheet.rowCount;
  if (totalRowCount > MAX_ALLOWED_ROWS + 1) {
    return {
      success: false,
      format: 'xlsx',
      sheetNames,
      selectedSheet: worksheet.name,
      headers: [],
      totalRows: totalRowCount,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Worksheet "${worksheet.name}" has ${totalRowCount} rows, exceeding limit of ${MAX_ALLOWED_ROWS}.`]
    };
  }

  // Extract Header row (row 1) preserving physical column indexes
  const headerRow = worksheet.getRow(1);
  const rawHeaders: { colNumber: number; text: string }[] = [];
  const maxCol = Math.min(headerRow.cellCount || worksheet.columnCount || 0, MAX_ALLOWED_COLUMNS);

  const seenHeaderCounts = new Map<string, number>();
  const duplicateHeaderWarnings: string[] = [];

  for (let c = 1; c <= maxCol; c++) {
    const cell = headerRow.getCell(c);
    let cellText = String(cell.text || cell.value || '').trim();
    if (!cellText) {
      cellText = `Column_${c}`; // Preserve physical position c
    }

    const count = (seenHeaderCounts.get(cellText.toLowerCase()) || 0) + 1;
    seenHeaderCounts.set(cellText.toLowerCase(), count);
    if (count > 1) {
      duplicateHeaderWarnings.push(`Duplicate header "${cellText}" detected at column ${c}.`);
      cellText = `${cellText} (${count})`;
    }

    rawHeaders.push({ colNumber: c, text: cellText });
  }

  const headers = rawHeaders.map(h => h.text);

  if (headers.length === 0) {
    return {
      success: false,
      format: 'xlsx',
      sheetNames,
      selectedSheet: worksheet.name,
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Worksheet "${worksheet.name}" is empty or has no header row.`]
    };
  }

  // Collect data rows using physical column indexes
  const allRows: Record<string, any>[] = [];
  let validDataRows = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    validDataRows++;

    const obj: Record<string, string> = {};
    rawHeaders.forEach(({ colNumber, text }) => {
      const cell = row.getCell(colNumber);
      let val = '';
      if (cell.type === ExcelJS.ValueType.Date && cell.value instanceof Date) {
        val = cell.value.toISOString().split('T')[0];
      } else if (cell.value && typeof cell.value === 'object' && 'result' in (cell.value as any)) {
        // Formula evaluated result if available, otherwise empty string (never execute formulas)
        val = String((cell.value as any).result || '');
      } else if (cell.value !== null && cell.value !== undefined) {
        val = String(cell.text || cell.value).trim();
      }
      obj[text] = val;
    });
    allRows.push(obj);
  });

  const previewRows = allRows.slice(0, maxPreviewRows);
  const { detectedMapping, suggestedType } = detectColumnMapping(headers);

  return {
    success: true,
    format: 'xlsx',
    sheetNames,
    selectedSheet: worksheet.name,
    headers,
    totalRows: validDataRows,
    rows: allRows,
    previewRows,
    detectedMapping,
    suggestedType,
    warnings: duplicateHeaderWarnings.length > 0 ? duplicateHeaderWarnings : undefined
  };
}

/**
 * Heuristics to auto-detect columns: loc, lastmod, changefreq, priority, or hreflang formats
 */
export function detectColumnMapping(headers: string[]): {
  detectedMapping: Partial<ColumnMapping>;
  suggestedType: 'simple' | 'hreflang-wide' | 'hreflang-long';
} {
  const mapping: Partial<ColumnMapping> = {};
  const lowerMap = new Map<string, string>();
  for (const h of headers) {
    lowerMap.set(h.toLowerCase().trim(), h);
  }

  // URL / loc
  const locCandidates = ['loc', 'url', 'page', 'primary url', 'primary_url', 'address', 'link'];
  for (const c of locCandidates) {
    if (lowerMap.has(c)) {
      mapping.locColumn = lowerMap.get(c);
      break;
    }
  }
  if (!mapping.locColumn && headers.length > 0) {
    mapping.locColumn = headers[0]; // fallback to first column
  }

  // lastmod
  const lastmodCandidates = ['lastmod', 'last modified', 'last_modified', 'date', 'updated_at', 'modified'];
  for (const c of lastmodCandidates) {
    if (lowerMap.has(c)) {
      mapping.lastmodColumn = lowerMap.get(c);
      break;
    }
  }

  // changefreq
  const freqCandidates = ['changefreq', 'change_freq', 'frequency', 'change frequency'];
  for (const c of freqCandidates) {
    if (lowerMap.has(c)) {
      mapping.changefreqColumn = lowerMap.get(c);
      break;
    }
  }

  // priority
  const priorityCandidates = ['priority', 'weight', 'score'];
  for (const c of priorityCandidates) {
    if (lowerMap.has(c)) {
      mapping.priorityColumn = lowerMap.get(c);
      break;
    }
  }

  // Check long hreflang format
  const longCodeCandidates = ['hreflang', 'language', 'lang', 'locale', 'region'];
  const longUrlCandidates = ['alternate_url', 'alternate url', 'alternate', 'alt_url', 'alt url', 'target_url'];

  let longCodeCol: string | undefined;
  let longUrlCol: string | undefined;

  for (const c of longCodeCandidates) {
    if (lowerMap.has(c)) {
      longCodeCol = lowerMap.get(c);
      break;
    }
  }
  for (const c of longUrlCandidates) {
    if (lowerMap.has(c)) {
      longUrlCol = lowerMap.get(c);
      break;
    }
  }

  if (longCodeCol && longUrlCol) {
    mapping.longHreflangCodeColumn = longCodeCol;
    mapping.longHreflangUrlColumn = longUrlCol;
    return { detectedMapping: mapping, suggestedType: 'hreflang-long' };
  }

  // Check wide hreflang format: do columns look like language tags? (e.g. en, fr, de, es, en-US, x-default)
  const langTagRegex = /^([a-z]{2}(?:-[a-z]{2,4})?|x-default)$/i;
  const wideCols: Record<string, string> = {};
  for (const h of headers) {
    if (h === mapping.locColumn || h === mapping.lastmodColumn || h === mapping.changefreqColumn || h === mapping.priorityColumn) {
      continue;
    }
    const clean = h.trim();
    if (langTagRegex.test(clean)) {
      wideCols[clean] = clean.toLowerCase();
    }
  }

  if (Object.keys(wideCols).length > 0) {
    mapping.wideHreflangColumns = wideCols;
    return { detectedMapping: mapping, suggestedType: 'hreflang-wide' };
  }

  return { detectedMapping: mapping, suggestedType: 'simple' };
}

/**
 * Extract structured SitemapUrlEntry rows from parsed table rows using user-specified ColumnMapping
 */
export function extractUrlEntriesFromRows(
  rows: Record<string, any>[],
  mapping: ColumnMapping,
  formatType: 'simple' | 'hreflang-wide' | 'hreflang-long'
): SitemapUrlEntry[] {
  const { locColumn, lastmodColumn, changefreqColumn, priorityColumn } = mapping;

  if (formatType === 'hreflang-long' && mapping.longHreflangCodeColumn && mapping.longHreflangUrlColumn) {
    // Long format: group by loc
    const grouped = new Map<string, SitemapUrlEntry>();

    for (const row of rows) {
      const locVal = String(row[locColumn] || '').trim();
      if (!locVal) continue;

      let entry = grouped.get(locVal);
      if (!entry) {
        entry = {
          loc: locVal,
          lastmod: lastmodColumn ? String(row[lastmodColumn] || '').trim() || null : null,
          changefreq: changefreqColumn ? String(row[changefreqColumn] || '').trim() as any : null,
          priority: priorityColumn ? String(row[priorityColumn] || '').trim() : null,
          alternates: []
        };
        grouped.set(locVal, entry);
      }

      const codeVal = String(row[mapping.longHreflangCodeColumn] || '').trim();
      const altUrlVal = String(row[mapping.longHreflangUrlColumn] || '').trim();
      if (codeVal && altUrlVal) {
        entry.alternates!.push({
          hreflang: codeVal,
          href: altUrlVal
        });
      }
    }

    return Array.from(grouped.values());
  }

  // Simple or Wide format: each row is one loc
  const entries: SitemapUrlEntry[] = [];

  for (const row of rows) {
    const locVal = String(row[locColumn] || '').trim();
    if (!locVal) continue;

    const entry: SitemapUrlEntry = {
      loc: locVal,
      lastmod: lastmodColumn ? String(row[lastmodColumn] || '').trim() || null : null,
      changefreq: changefreqColumn ? String(row[changefreqColumn] || '').trim() as any : null,
      priority: priorityColumn ? String(row[priorityColumn] || '').trim() : null,
      alternates: []
    };

    if (formatType === 'hreflang-wide' && mapping.wideHreflangColumns) {
      for (const [headerCol, code] of Object.entries(mapping.wideHreflangColumns)) {
        const altUrl = String(row[headerCol] || '').trim();
        if (altUrl) {
          entry.alternates!.push({
            hreflang: code,
            href: altUrl
          });
        }
      }
    }

    entries.push(entry);
  }

  return entries;
}
