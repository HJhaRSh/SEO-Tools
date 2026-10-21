/**
 * Automated QA & Security Test Suite for Tool 6: Google Review Link Generator (Zero-Cost / No-API Architecture)
 * Tests:
 * 1. Input sanitization, max length bounds, and Place ID regex validation
 * 2. Direct review link URL generation from Place ID
 * 3. Handling of pasted Google review URLs (search.google.com, g.page, maps.app.goo.gl)
 * 4. Place ID extraction from pasted review URLs
 * 5. Google Maps query URL generation for manual identification
 * 6. CSV parsing, formula-injection protection, and UTF-8 export
 * 7. Offline bulk processing with Place IDs and review URLs
 */

import {
  sanitizeInput,
  isValidPlaceId,
  buildPlaceIdReviewUrl,
  isValidGoogleReviewUrl,
  extractPlaceIdFromUrl,
  buildGoogleMapsSearchUrl,
  sanitizeCsvField,
  executeGenerateLink,
  executeBulkBatch,
  formatBulkResultsToCsv
} from './lib/seo/reviewLinkService';
import { parseClientCsv, detectSpreadsheetColumns } from './lib/seo/clientSpreadsheet';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=====================================================');
  console.log('TOOL 6 — GOOGLE REVIEW LINK GENERATOR (ZERO-COST)');
  console.log('=====================================================\n');

  // 1. Input Validation & Place ID Safety
  console.log('1. Input Validation & Place ID Safety:');
  assert(sanitizeInput('  Barbeque Nation  \u0000') === 'Barbeque Nation', 'Sanitizes whitespace and control characters');
  assert(sanitizeInput('A'.repeat(600), 50).length === 50, 'Enforces maximum text length bounds');
  assert(isValidPlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4') === true, 'Accepts valid Google Place ID format');
  assert(isValidPlaceId('ChIJ_test-1234_abc') === true, 'Accepts alphanumeric Place ID with underscores and hyphens');
  assert(isValidPlaceId('short') === false, 'Rejects short string (< 15 chars) as invalid Place ID');
  assert(isValidPlaceId('<script>alert(1)</script>') === false, 'Rejects XSS string as invalid Place ID');
  assert(isValidPlaceId('') === false, 'Rejects empty string as Place ID');

  // 2. Review URL Generation from Place ID
  console.log('\n2. Review URL Generation from Place ID:');
  const validId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
  const syntacticUrl = buildPlaceIdReviewUrl(validId);
  assert(syntacticUrl === `https://search.google.com/local/writereview?placeid=${validId}`, 'Builds official Google write-review URL');

  const genResult = executeGenerateLink(validId, undefined, 'Barbeque Nation', 'Indiranagar');
  assert(genResult.success === true, 'Generates review link from valid Place ID');
  assert(genResult.source === 'PLACE_ID_SYNTACTIC', 'Flags source as PLACE_ID_SYNTACTIC');
  assert(genResult.reviewUrl === syntacticUrl, 'Matches expected write-review URL');

  const genInvalid = executeGenerateLink('invalid_id');
  assert(genInvalid.success === false && genInvalid.code === 'INVALID_PLACE_ID', 'Rejects invalid Place ID with clear error code');

  // 3. Pasted Review Link Support & Place ID Extraction
  console.log('\n3. Pasted Review Link Support & Extraction:');
  const pastedGPage = 'https://g.page/r/Cb77_example/review';
  assert(isValidGoogleReviewUrl(pastedGPage) === true, 'Validates g.page review link format');

  const pastedSearch = `https://search.google.com/local/writereview?placeid=${validId}`;
  assert(isValidGoogleReviewUrl(pastedSearch) === true, 'Validates search.google.com review link format');
  assert(isValidGoogleReviewUrl('https://malicious-site.com/fake') === false, 'Rejects non-Google domain review URL');
  // Strict hostname validation — must reject domain names that merely end with 'google.com' as a substring
  assert(isValidGoogleReviewUrl('https://evilgoogle.com/maps/place/test') === false, 'Rejects evilgoogle.com spoofing google.com');
  assert(isValidGoogleReviewUrl('https://fakegoogle.com/local/writereview') === false, 'Rejects fakegoogle.com spoofing google.com');
  // Google subdomains without a review/maps path must also be rejected
  assert(isValidGoogleReviewUrl('https://accounts.google.com/') === false, 'Rejects accounts.google.com (no review path)');
  assert(isValidGoogleReviewUrl('https://mail.google.com/') === false, 'Rejects mail.google.com (no review path)');

  const extracted = extractPlaceIdFromUrl(pastedSearch);
  assert(extracted === validId, `Extracts Place ID from URL query parameters (got ${extracted})`);

  const genPasted = executeGenerateLink(undefined, pastedGPage, 'Barbeque Nation');
  assert(genPasted.success === true, 'Handles pasted review URL successfully');
  assert(genPasted.source === 'PASTED_REVIEW_URL', 'Flags source as PASTED_REVIEW_URL');

  // 4. Google Maps Search Helper URL Construction
  console.log('\n4. Google Maps Search Helper:');
  const mapsSearchUrl = buildGoogleMapsSearchUrl('Barbeque Nation', 'Indiranagar Bengaluru');
  assert(mapsSearchUrl.startsWith('https://www.google.com/maps/search/?api=1&query='), 'Constructs official Google Maps web search URL');
  assert(mapsSearchUrl.includes('Barbeque%20Nation'), 'Encodes business name in query parameter');

  // 5. CSV Parsing & Formula Injection Protection
  console.log('\n5. Spreadsheet Parsing & Security:');
  const sampleCsv = `business_name,place_id,location\n"Barbeque Nation","${validId}","Bengaluru"\n"Domino's Pizza","","Mumbai"\n=cmd|' /C calc'!A0,"${validId}","Delhi"`;
  const parsedCsv = parseClientCsv(sampleCsv);
  assert(parsedCsv.rows.length === 3, `Parsed 3 rows from CSV (got ${parsedCsv.rows.length})`);

  const cols = detectSpreadsheetColumns(parsedCsv.headers);
  assert(cols.businessNameCol === 'business_name', 'Auto-detects business_name column');
  assert(cols.placeIdCol === 'place_id', 'Auto-detects place_id column');

  const formulaCell = parsedCsv.rows[2][cols.businessNameCol!];
  const sanitizedCell = sanitizeCsvField(formulaCell);
  assert(sanitizedCell.startsWith("'="), `Neutralizes formula injection with prepended quote (got ${sanitizedCell})`);

  // 6. Bulk Offline Processing & CSV Export
  console.log('\n6. Bulk Offline Processing & Export:');
  const bulkInputRows = [
    { rowIndex: 1, businessName: 'Store A', placeId: validId, location: 'Bengaluru' },
    { rowIndex: 2, businessName: 'Store B', reviewUrl: pastedGPage, location: 'Mumbai' },
    { rowIndex: 3, businessName: 'Store C', placeId: 'short_invalid', location: 'Delhi' }
  ];

  const batchResult = executeBulkBatch(bulkInputRows);
  assert(batchResult.success === true, 'Processes batch successfully offline');
  assert(batchResult.matchedCount === 2, `Matches 2 valid rows (got ${batchResult.matchedCount})`);
  assert(batchResult.invalidCount === 1, `Flags 1 invalid row (got ${batchResult.invalidCount})`);
  assert(batchResult.results[0].status === 'MATCHED', 'Row 1 marked as MATCHED from Place ID');
  assert(batchResult.results[1].status === 'MATCHED', 'Row 2 marked as MATCHED from review URL');
  assert(batchResult.results[2].status === 'INVALID_INPUT', 'Row 3 marked as INVALID_INPUT');

  const exportedCsv = formatBulkResultsToCsv(batchResult.results);
  assert(exportedCsv.charCodeAt(0) === 0xFEFF, 'CSV export includes UTF-8 BOM');
  assert(exportedCsv.includes('Store A') && exportedCsv.includes(validId), 'Includes row details in CSV');

  console.log('\n=====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
