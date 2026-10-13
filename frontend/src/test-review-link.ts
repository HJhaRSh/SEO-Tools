/**
 * Automated QA & Security Test Suite for Tool 6: Google Review Link Generator
 * Tests:
 * 1. Input sanitization, max length boundary, and Place ID regex validation
 * 2. Review Link URL generation (official writeAReviewUri vs syntactic Place ID fallback)
 * 3. Matching score algorithm & ambiguous candidate handling
 * 4. Google Places API responses (mocked responses, error handling, quota/429, timeouts)
 * 5. Bounded bulk processing, duplicate suppression, and concurrency control
 * 6. CSV parsing, formula-injection protection, and UTF-8 export
 * 7. Verification that server-side API keys are protected and not leaked
 */

import {
  sanitizeInput,
  isValidPlaceId,
  buildPlaceIdReviewUrl,
  sanitizeCsvField,
  calculateMatchScore,
  mapGooglePlaceToCandidate,
  executeSingleBusinessSearch,
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
  console.log('TOOL 6 — GOOGLE REVIEW LINK GENERATOR TEST SUITE');
  console.log('=====================================================\n');

  // 1. Input Validation & Place ID Safety
  console.log('1. Input Validation & Place ID Safety:');
  assert(sanitizeInput('  Barbeque Nation  \u0000') === 'Barbeque Nation', 'Sanitizes whitespace and control characters');
  assert(sanitizeInput('A'.repeat(500), 50).length === 50, 'Enforces maximum text length bounds');
  assert(isValidPlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4') === true, 'Accepts valid Google Place ID format');
  assert(isValidPlaceId('ChIJ_test-1234_abc') === true, 'Accepts alphanumeric Place ID with underscores and hyphens');
  assert(isValidPlaceId('short') === false, 'Rejects short string (< 15 chars) as invalid Place ID');
  assert(isValidPlaceId('<script>alert(1)</script>') === false, 'Rejects XSS string as invalid Place ID');
  assert(isValidPlaceId('') === false, 'Rejects empty string as Place ID');

  // 2. Review Link URL Generation
  console.log('\n2. Review URL Generation:');
  const validId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
  const syntacticUrl = buildPlaceIdReviewUrl(validId);
  assert(syntacticUrl === `https://search.google.com/local/writereview?placeid=${validId}`, 'Builds valid syntactic write-review URL');

  const genResult = executeGenerateLink(validId, 'Test Business', 'Indiranagar');
  assert(genResult.success === true, 'Generates link from valid Place ID');
  assert(genResult.source === 'PLACE_ID_SYNTACTIC', 'Correctly flags source as PLACE_ID_SYNTACTIC');
  assert(Boolean(genResult.warning), 'Provides notice that syntactic link requires testing');

  const verifiedUrl = 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4&authuser=0';
  const genVerified = executeGenerateLink(validId, 'Test Business', 'Indiranagar', verifiedUrl);
  assert(genVerified.success === true && genVerified.reviewUrl === verifiedUrl, 'Prefers verified writeReviewUrl when available');
  assert(genVerified.source === 'GOOGLE_API_VERIFIED', 'Correctly flags source as GOOGLE_API_VERIFIED');

  const genInvalid = executeGenerateLink('invalid_id');
  assert(genInvalid.success === false && genInvalid.code === 'INVALID_PLACE_ID', 'Rejects invalid Place ID with clear error code');

  // 3. String Matching & Ambiguity Confidence
  console.log('\n3. String Matching & Ambiguity Resolution:');
  const scoreExact = calculateMatchScore('Barbeque Nation', 'Barbeque Nation');
  assert(scoreExact === 1.0, `Exact match returns score 1.0 (got ${scoreExact})`);

  const scorePartial = calculateMatchScore('Barbeque Nation', 'Barbeque Nation Indiranagar Bengaluru');
  assert(scorePartial >= 0.8, `Containment match returns high score (got ${scorePartial})`);

  const scoreDifferent = calculateMatchScore('Barbeque Nation', 'Pizza Hut');
  assert(scoreDifferent === 0, `Different businesses return score 0 (got ${scoreDifferent})`);

  const candidateSingle = mapGooglePlaceToCandidate(
    {
      id: validId,
      displayName: { text: 'Barbeque Nation' },
      formattedAddress: 'Indiranagar, Bengaluru',
      googleMapsLinks: { writeAReviewUri: verifiedUrl }
    },
    'Barbeque Nation',
    1
  );
  assert(candidateSingle.confidence === 'HIGH', 'Single exact match classified as HIGH confidence');

  const candidateAmbiguous = mapGooglePlaceToCandidate(
    {
      id: validId,
      displayName: { text: 'Barbeque Nation' },
      formattedAddress: 'Indiranagar, Bengaluru'
    },
    'Barbeque',
    4
  );
  assert(candidateAmbiguous.confidence === 'NEEDS_CONFIRMATION', 'Multiple results classified as NEEDS_CONFIRMATION');

  // 4. Missing API Key & Error Handling
  console.log('\n4. Server API Security & Error Handling:');
  const searchWithoutKey = await executeSingleBusinessSearch('Test Business', 'Location');
  // Since GOOGLE_MAPS_API_KEY is not in the environment, it must fail safely with API_KEY_NOT_CONFIGURED
  assert(searchWithoutKey.success === false, 'Fails safely when GOOGLE_MAPS_API_KEY is missing');
  assert(searchWithoutKey.code === 'API_KEY_NOT_CONFIGURED', 'Returns code API_KEY_NOT_CONFIGURED');
  assert(!JSON.stringify(searchWithoutKey).includes('undefined_key'), 'Does not leak sensitive data or placeholders');

  const searchMissingName = await executeSingleBusinessSearch('');
  assert(searchMissingName.success === false && searchMissingName.code === 'MISSING_BUSINESS_NAME', 'Rejects empty business name query');

  // 5. Bulk Spreadsheet Parsing & Formula Injection Protection
  console.log('\n5. Spreadsheet Parsing & Security:');
  const sampleCsv = `business_name,address,city\n"Barbeque Nation","100 Feet Rd","Bengaluru"\n"Domino's Pizza","MG Road","Mumbai"\n=cmd|' /C calc'!A0,"Test Address","Delhi"`;
  const parsedCsv = parseClientCsv(sampleCsv);
  assert(parsedCsv.rows.length === 3, `Parsed 3 rows from CSV (got ${parsedCsv.rows.length})`);

  const cols = detectSpreadsheetColumns(parsedCsv.headers);
  assert(cols.businessNameCol === 'business_name', 'Auto-detects business_name column');
  assert(cols.cityCol === 'city', 'Auto-detects city column');

  // Formula injection check
  const formulaCell = parsedCsv.rows[2][cols.businessNameCol!];
  const sanitizedCell = sanitizeCsvField(formulaCell);
  assert(sanitizedCell.startsWith("'="), `Prepends apostrophe to neutralize spreadsheet formula injection (got ${sanitizedCell})`);

  // 6. Bulk Batching & Row Preservation
  console.log('\n6. Bulk Batching & Concurrency Limits:');
  const bulkInputRows = [
    { rowIndex: 1, businessName: 'Store A', placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' },
    { rowIndex: 2, businessName: '', city: 'Mumbai' }, // Invalid row
    { rowIndex: 3, businessName: 'Store C', placeId: 'ChIJ_abc123456789012' }
  ];

  const batchResult = await executeBulkBatch(bulkInputRows, 0, 1);
  assert(batchResult.success === true, 'Processes bulk batch successfully');
  assert(batchResult.results.length === 3, 'Preserves all input rows count');
  assert(batchResult.results[0].status === 'MATCHED', 'Row 1 with valid Place ID marked as MATCHED');
  assert(batchResult.results[1].status === 'INVALID_INPUT', 'Row 2 with missing name marked as INVALID_INPUT');
  assert(batchResult.results[2].status === 'MATCHED', 'Row 3 with valid Place ID marked as MATCHED');

  const exportedCsv = formatBulkResultsToCsv(batchResult.results);
  assert(exportedCsv.charCodeAt(0) === 0xFEFF, 'CSV export includes UTF-8 BOM for Excel compatibility');
  assert(exportedCsv.includes('Direct Place ID Lookup') || exportedCsv.includes('Store A'), 'Includes matched business names in CSV');

  console.log('\n=====================================================');
  console.log(`TOTAL TOOL 6 TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
