/**
 * Client-side CSV parser compliant with RFC 4180
 * Handles commas inside quotes, escaped quotes (""), and multiple line breaks.
 */
export function parseClientCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip UTF-8 BOM if present
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < clean.length) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < clean.length && clean[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRecord.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < clean.length && clean[i + 1] === '\n') {
          i++;
        }
        currentRecord.push(currentField.trim());
        if (currentRecord.some(f => f.length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRecord.push(currentField.trim());
        if (currentRecord.some(f => f.length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Final field
  if (currentField.length > 0 || inQuotes) {
    currentRecord.push(currentField.trim());
  }
  if (currentRecord.some(f => f.length > 0)) {
    records.push(currentRecord);
  }

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = records[0].map(h => h.trim());
  const headers: string[] = [];
  const headerCounts = new Map<string, number>();

  // Ensure unique, non-empty headers
  for (let idx = 0; idx < rawHeaders.length; idx++) {
    let name = rawHeaders[idx] || `column_${idx + 1}`;
    const count = headerCounts.get(name.toLowerCase()) || 0;
    if (count > 0) {
      name = `${name}_${count + 1}`;
    }
    headerCounts.set(name.toLowerCase(), count + 1);
    headers.push(name);
  }

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const rowObj: Record<string, string> = {};
    let hasAnyData = false;

    for (let c = 0; c < headers.length; c++) {
      const val = rec[c] !== undefined ? rec[c] : '';
      rowObj[headers[c]] = val;
      if (val.trim()) hasAnyData = true;
    }

    if (hasAnyData) {
      rows.push(rowObj);
    }
  }

  return { headers, rows };
}

/**
 * Automatically identify business_name, address, city, and place_id columns
 */
export function detectSpreadsheetColumns(headers: string[]): {
  businessNameCol?: string;
  addressCol?: string;
  cityCol?: string;
  placeIdCol?: string;
} {
  const lowerMap = new Map<string, string>();
  for (const h of headers) {
    lowerMap.set(h.toLowerCase().trim(), h);
  }

  const findFirstMatch = (candidates: string[]): string | undefined => {
    for (const cand of candidates) {
      if (lowerMap.has(cand)) {
        return lowerMap.get(cand);
      }
    }
    return undefined;
  };

  const businessNameCol = findFirstMatch([
    'business_name',
    'business name',
    'business',
    'name',
    'company_name',
    'company',
    'store_name',
    'store',
    'location_name'
  ]);

  const addressCol = findFirstMatch([
    'address',
    'street_address',
    'street address',
    'street',
    'full_address',
    'full address',
    'location_address'
  ]);

  const cityCol = findFirstMatch([
    'city',
    'location',
    'town',
    'area',
    'locality',
    'state',
    'region'
  ]);

  const placeIdCol = findFirstMatch([
    'place_id',
    'place id',
    'placeid',
    'google_place_id',
    'google place id',
    'google_id'
  ]);

  return {
    businessNameCol,
    addressCol,
    cityCol,
    placeIdCol
  };
}
