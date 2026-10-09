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

import { parse as parseCsvStream } from 'csv-parse';
import { Readable } from 'stream';
import unzipper from 'unzipper';
import ExcelJS from 'exceljs';
import { ColumnMapping, SpreadsheetParseResult, SitemapUrlEntry } from './sitemapTypes.js';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (consistent with gateway limit)
export const MAX_ALLOWED_ROWS = 100000;
export const MAX_ALLOWED_COLUMNS = 100;
export const MAX_FIELD_LENGTH = 8192; // 8 KB per individual field
export const MAX_RECORD_LENGTH = 65536; // 64 KB per line/record
export const MAX_ARCHIVE_DECOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB max uncompressed ZIP entries
export const MAX_WORKSHEETS_COUNT = 20;
export const MAX_CELL_COUNT = 2000000; // 2 million total cells processed
export const MAX_CELL_TEXT_LENGTH = 8192; // 8 KB text per cell

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
 * Parse raw CSV incrementally using a streaming parser with strict resource limits
 */
export async function parseCsvContent(
  rawContent: string | Buffer,
  maxPreviewRows: number = 25
): Promise<SpreadsheetParseResult> {
  const byteLength = typeof rawContent === 'string' ? Buffer.byteLength(rawContent, 'utf-8') : rawContent.length;
  if (byteLength > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      format: 'csv',
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`CSV file size (${(byteLength / 1024 / 1024).toFixed(1)}MB) exceeds limit of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`]
    };
  }

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

  const parser = Readable.from([cleanText]).pipe(
    parseCsvStream({
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true
    })
  );

  let rawHeaders: string[] | null = null;
  let headers: string[] = [];
  const duplicateHeaderWarnings: string[] = [];
  const allRows: Record<string, string>[] = [];
  let dataRowCount = 0;

  try {
    for await (const record of parser) {
      if (!Array.isArray(record)) continue;

      // Check record length in bytes
      let recordByteLen = 0;
      for (const field of record) {
        const strField = String(field ?? '');
        if (strField.length > MAX_FIELD_LENGTH) {
          parser.destroy(new Error(`A field in row ${dataRowCount + 1} exceeds maximum field limit of ${MAX_FIELD_LENGTH} characters.`));
        }
        recordByteLen += strField.length;
      }
      if (recordByteLen > MAX_RECORD_LENGTH) {
        parser.destroy(new Error(`Row ${dataRowCount + 1} exceeds maximum record length of ${MAX_RECORD_LENGTH} characters.`));
      }

      // First record: headers
      if (!rawHeaders) {
        rawHeaders = record.map((h: any) => String(h ?? '').trim());
        if (rawHeaders.length > MAX_ALLOWED_COLUMNS) {
          parser.destroy(new Error(`Spreadsheet contains ${rawHeaders.length} columns, exceeding the maximum limit of ${MAX_ALLOWED_COLUMNS}.`));
        }

        const seenHeaderCounts = new Map<string, number>();
        headers = rawHeaders.map((rawH, i) => {
          let clean = rawH ? rawH : `Column_${i + 1}`;
          const count = (seenHeaderCounts.get(clean.toLowerCase()) || 0) + 1;
          seenHeaderCounts.set(clean.toLowerCase(), count);
          if (count > 1) {
            duplicateHeaderWarnings.push(`Duplicate header "${clean}" detected at column ${i + 1}.`);
            clean = `${clean} (${count})`;
          }
          return clean;
        });
        continue;
      }

      // Subsequent records: data rows
      dataRowCount++;
      if (dataRowCount > MAX_ALLOWED_ROWS) {
        parser.destroy(new Error(`Spreadsheet contains more than ${MAX_ALLOWED_ROWS} rows, which exceeds the permitted limit.`));
      }

      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = record[idx] !== undefined && record[idx] !== null ? String(record[idx]).trim() : '';
      });
      allRows.push(rowObj);
    }
  } catch (err: any) {
    return {
      success: false,
      format: 'csv',
      headers: headers.length > 0 ? headers : [],
      totalRows: dataRowCount,
      previewRows: [],
      suggestedType: 'simple',
      errors: [err.message || 'Failed to parse CSV stream.']
    };
  }

  if (!rawHeaders || headers.length === 0) {
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

  const previewRows = allRows.slice(0, maxPreviewRows);
  const { detectedMapping, suggestedType } = detectColumnMapping(headers);

  return {
    success: true,
    format: 'csv',
    headers,
    totalRows: dataRowCount,
    rows: allRows,
    previewRows,
    detectedMapping,
    suggestedType,
    warnings: duplicateHeaderWarnings.length > 0 ? duplicateHeaderWarnings : undefined
  };
}

/**
 * Parse XLSX workbook safely using archive inspection and bounded ExcelJS reading
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

  // 1. Inspect ZIP archive structure and uncompressed dimensions before workbook materialization
  try {
    const zipDir = await unzipper.Open.buffer(buffer);
    if (!zipDir || !zipDir.files || zipDir.files.length === 0) {
      return {
        success: false,
        format: 'xlsx',
        headers: [],
        totalRows: 0,
        previewRows: [],
        suggestedType: 'simple',
        errors: ['Malformed or corrupt XLSX archive: no ZIP directory found.']
      };
    }

    let totalDecompressedBytes = 0;
    let worksheetXmlFiles = 0;

    for (const file of zipDir.files) {
      // Check for suspicious zip paths (zip slip)
      if (file.path.includes('..') || file.path.startsWith('/') || file.path.startsWith('\\')) {
        return {
          success: false,
          format: 'xlsx',
          headers: [],
          totalRows: 0,
          previewRows: [],
          suggestedType: 'simple',
          errors: ['Suspicious XLSX archive structure detected: path traversal detected.']
        };
      }

      const uncompressed = file.uncompressedSize ?? 0;
      totalDecompressedBytes += uncompressed;

      // Zip bomb / compression ratio check
      if (file.compressedSize && file.compressedSize > 0) {
        const ratio = uncompressed / file.compressedSize;
        if (ratio > 100 && uncompressed > 10 * 1024 * 1024) {
          return {
            success: false,
            format: 'xlsx',
            headers: [],
            totalRows: 0,
            previewRows: [],
            suggestedType: 'simple',
            errors: ['High compression ratio XLSX archive rejected for security (possible zip bomb).']
          };
        }
      }

      if (totalDecompressedBytes > MAX_ARCHIVE_DECOMPRESSED_BYTES) {
        return {
          success: false,
          format: 'xlsx',
          headers: [],
          totalRows: 0,
          previewRows: [],
          suggestedType: 'simple',
          errors: [`Decompressed XLSX archive exceeds safe limit of ${MAX_ARCHIVE_DECOMPRESSED_BYTES / 1024 / 1024}MB.`]
        };
      }

      if (/xl\/worksheets\/sheet\d+\.xml/i.test(file.path)) {
        worksheetXmlFiles++;
        if (worksheetXmlFiles > MAX_WORKSHEETS_COUNT) {
          return {
            success: false,
            format: 'xlsx',
            headers: [],
            totalRows: 0,
            previewRows: [],
            suggestedType: 'simple',
            errors: [`Workbook contains more than ${MAX_WORKSHEETS_COUNT} worksheets, exceeding maximum allowed.`]
          };
        }
      }
    }
  } catch (err: any) {
    return {
      success: false,
      format: 'xlsx',
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Invalid or malformed XLSX archive: ${err.message || 'Corrupt zip container'}`]
    };
  }

  // 2. Safe loading into ExcelJS
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

  if (sheetNames.length > MAX_WORKSHEETS_COUNT) {
    return {
      success: false,
      format: 'xlsx',
      sheetNames,
      headers: [],
      totalRows: 0,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Workbook contains ${sheetNames.length} worksheets, exceeding limit of ${MAX_WORKSHEETS_COUNT}.`]
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
  const maxCol = Math.min(headerRow.cellCount || worksheet.columnCount || 0, MAX_ALLOWED_COLUMNS + 1);

  if (headerRow.cellCount > MAX_ALLOWED_COLUMNS || (worksheet.columnCount && worksheet.columnCount > MAX_ALLOWED_COLUMNS)) {
    return {
      success: false,
      format: 'xlsx',
      sheetNames,
      selectedSheet: worksheet.name,
      headers: [],
      totalRows: totalRowCount,
      previewRows: [],
      suggestedType: 'simple',
      errors: [`Worksheet contains more columns than the allowed limit of ${MAX_ALLOWED_COLUMNS}.`]
    };
  }

  const seenHeaderCounts = new Map<string, number>();
  const duplicateHeaderWarnings: string[] = [];

  for (let c = 1; c <= maxCol; c++) {
    const cell = headerRow.getCell(c);
    let cellText = String(cell.text || cell.value || '').trim();
    if (cellText.length > MAX_CELL_TEXT_LENGTH) {
      return {
        success: false,
        format: 'xlsx',
        sheetNames,
        selectedSheet: worksheet.name,
        headers: [],
        totalRows: 0,
        previewRows: [],
        suggestedType: 'simple',
        errors: [`Header cell at column ${c} exceeds maximum text length of ${MAX_CELL_TEXT_LENGTH} characters.`]
      };
    }
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
  let totalProcessedCells = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (!row || !row.hasValues) continue;
    validDataRows++;

    if (validDataRows > MAX_ALLOWED_ROWS) {
      return {
        success: false,
        format: 'xlsx',
        sheetNames,
        selectedSheet: worksheet.name,
        headers,
        totalRows: validDataRows,
        previewRows: [],
        suggestedType: 'simple',
        errors: [`Worksheet "${worksheet.name}" exceeds limit of ${MAX_ALLOWED_ROWS} data rows.`]
      };
    }

    const obj: Record<string, string> = {};
    for (const { colNumber, text } of rawHeaders) {
      totalProcessedCells++;
      if (totalProcessedCells > MAX_CELL_COUNT) {
        return {
          success: false,
          format: 'xlsx',
          sheetNames,
          selectedSheet: worksheet.name,
          headers,
          totalRows: validDataRows,
          previewRows: [],
          suggestedType: 'simple',
          errors: [`Spreadsheet exceeded total cell processing limit of ${MAX_CELL_COUNT} cells.`]
        };
      }

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

      if (val.length > MAX_CELL_TEXT_LENGTH) {
        return {
          success: false,
          format: 'xlsx',
          sheetNames,
          selectedSheet: worksheet.name,
          headers,
          totalRows: validDataRows,
          previewRows: [],
          suggestedType: 'simple',
          errors: [`Cell at row ${rowNumber}, column ${colNumber} exceeds text length limit of ${MAX_CELL_TEXT_LENGTH} characters.`]
        };
      }

      obj[text] = val;
    }
    allRows.push(obj);
  }

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
