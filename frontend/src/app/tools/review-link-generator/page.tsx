'use client';

import React, { useState, useRef } from 'react';
import ToolLayout from '@/components/ToolLayout';
import {
  PlaceCandidate,
  BulkProcessedRow,
  BulkInputRow,
  SingleSearchResponse,
  GenerateLinkResponse,
  BulkBatchResponse
} from '@/lib/seo/reviewLinkTypes';
import { parseClientCsv, detectSpreadsheetColumns } from '@/lib/seo/clientSpreadsheet';
import { formatBulkResultsToCsv } from '@/lib/seo/reviewLinkService';

export default function ReviewLinkGeneratorPage() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // ----------------------------------------------------
  // SINGLE BUSINESS STATE
  // ----------------------------------------------------
  const [businessName, setBusinessName] = useState('');
  const [location, setLocation] = useState('');
  const [manualPlaceId, setManualPlaceId] = useState('');
  const [showManualPlaceId, setShowManualPlaceId] = useState(false);

  const [isSearching, setIsSearching] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleErrorCode, setSingleErrorCode] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<PlaceCandidate | null>(null);
  const [generatedReviewLink, setGeneratedReviewLink] = useState<string | null>(null);
  const [linkSource, setLinkSource] = useState<'GOOGLE_API_VERIFIED' | 'PLACE_ID_SYNTACTIC' | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPlaceId, setCopiedPlaceId] = useState(false);

  // ----------------------------------------------------
  // BULK UPLOAD STATE
  // ----------------------------------------------------
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<BulkInputRow[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<{
    businessNameCol?: string;
    addressCol?: string;
    cityCol?: string;
    placeIdCol?: string;
  }>({});
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'parsed' | 'processing' | 'completed' | 'cancelled' | 'error'>('idle');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState<BulkProcessedRow[]>([]);
  const [activeReviewCandidateRow, setActiveReviewCandidateRow] = useState<BulkProcessedRow | null>(null);

  const cancelBulkRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // SINGLE BUSINESS HANDLERS
  // ----------------------------------------------------
  const handleSingleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSingleError(null);
    setSingleErrorCode(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setGeneratedReviewLink(null);
    setLinkSource(null);
    setLinkNotice(null);

    // If manual Place ID is provided directly
    if (manualPlaceId.trim()) {
      setIsSearching(true);
      try {
        const res = await fetch('/api/seo/review-link/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeId: manualPlaceId.trim(),
            businessName: businessName.trim() || undefined,
            address: location.trim() || undefined
          })
        });

        const data: GenerateLinkResponse = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to generate review link from Place ID');
        }

        setGeneratedReviewLink(data.reviewUrl);
        setLinkSource(data.source);
        if (data.warning) setLinkNotice(data.warning);
      } catch (err: any) {
        setSingleError(err.message || 'Error generating link');
      } finally {
        setIsSearching(false);
      }
      return;
    }

    if (!businessName.trim()) {
      setSingleError('Please enter a business name to search.');
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch('/api/seo/review-link/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          location: location.trim() || undefined
        })
      });

      const data: SingleSearchResponse = await res.json();

      if (!res.ok || !data.success) {
        setSingleErrorCode(data.code || null);
        throw new Error(data.error || 'Failed searching Google Places API');
      }

      if (data.candidates.length === 0) {
        setSingleError(data.warning || 'No listings found for this business name and location.');
        return;
      }

      setCandidates(data.candidates);

      // If exactly 1 candidate with high confidence, auto-select it
      if (data.candidates.length === 1 && data.candidates[0].confidence === 'HIGH') {
        handleSelectCandidate(data.candidates[0]);
      }
    } catch (err: any) {
      setSingleError(err.message || 'Network error reaching search service.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCandidate = async (cand: PlaceCandidate) => {
    setSelectedCandidate(cand);
    setSingleError(null);

    // Call generate endpoint to obtain direct link
    try {
      const res = await fetch('/api/seo/review-link/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: cand.placeId,
          businessName: cand.name,
          address: cand.address,
          writeReviewUrl: cand.writeReviewUrl
        })
      });

      const data: GenerateLinkResponse = await res.json();
      if (data.success) {
        setGeneratedReviewLink(data.reviewUrl);
        setLinkSource(data.source);
        setLinkNotice(data.warning || null);
      } else {
        setSingleError(data.error || 'Failed generating review link.');
      }
    } catch (err: any) {
      setSingleError(err.message || 'Error generating link');
    }
  };

  const copyToClipboard = async (text: string, type: 'link' | 'placeId') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      } else {
        setCopiedPlaceId(true);
        setTimeout(() => setCopiedPlaceId(false), 2500);
      }
    } catch {
      // Fallback
      alert('Copied to clipboard: ' + text);
    }
  };

  // ----------------------------------------------------
  // BULK UPLOAD HANDLERS
  // ----------------------------------------------------
  const handleFileUpload = async (uploadedFile: File) => {
    setBulkError(null);
    setBulkResults([]);
    setFile(uploadedFile);

    const isCsv = uploadedFile.name.toLowerCase().endsWith('.csv');
    const isXlsx = uploadedFile.name.toLowerCase().endsWith('.xlsx');

    if (!isCsv && !isXlsx) {
      setBulkError('Please upload a valid .csv or .xlsx spreadsheet.');
      setBulkStatus('error');
      return;
    }

    if (uploadedFile.size > 10 * 1024 * 1024) {
      setBulkError('File size exceeds the 10 MB limit.');
      setBulkStatus('error');
      return;
    }

    try {
      let headers: string[] = [];
      let rawRows: Record<string, string>[] = [];

      if (isCsv) {
        const text = await uploadedFile.text();
        const parsed = parseClientCsv(text);
        headers = parsed.headers;
        rawRows = parsed.rows;
      } else {
        // Reuse backend parse endpoint for Excel format if available
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = () => reject(new Error('Failed reading Excel file'));
          reader.readAsDataURL(uploadedFile);
        });

        const res = await fetch('/api/seo/sitemap/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'xlsx', content: base64 })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.errors?.join(', ') || 'Failed parsing Excel file');
        }
        headers = data.headers || [];
        rawRows = data.rows || data.previewRows || [];
      }

      if (rawRows.length === 0) {
        throw new Error('No data rows found in the uploaded file.');
      }

      const cols = detectSpreadsheetColumns(headers);
      if (!cols.businessNameCol && !cols.placeIdCol) {
        throw new Error('Could not identify a "business_name" or "place_id" column in spreadsheet headers.');
      }

      setDetectedColumns(cols);

      // Map rows to BulkInputRow
      const mapped: BulkInputRow[] = rawRows.map((r, idx) => ({
        rowIndex: idx + 1,
        businessName: cols.businessNameCol ? String(r[cols.businessNameCol] || '').trim() : '',
        address: cols.addressCol ? String(r[cols.addressCol] || '').trim() : undefined,
        city: cols.cityCol ? String(r[cols.cityCol] || '').trim() : undefined,
        placeId: cols.placeIdCol ? String(r[cols.placeIdCol] || '').trim() : undefined
      }));

      setParsedRows(mapped);
      setBulkStatus('parsed');
    } catch (err: any) {
      setBulkError(err.message || 'Error parsing spreadsheet file');
      setBulkStatus('error');
    }
  };

  const startBulkProcessing = async () => {
    if (parsedRows.length === 0) return;
    setBulkStatus('processing');
    setBulkError(null);
    cancelBulkRef.current = false;

    const BATCH_SIZE = 50;
    const allResults: BulkProcessedRow[] = [];
    const totalBatches = Math.ceil(parsedRows.length / BATCH_SIZE);

    setBulkProgress({ current: 0, total: parsedRows.length });

    for (let b = 0; b < totalBatches; b++) {
      if (cancelBulkRef.current) {
        setBulkStatus('cancelled');
        break;
      }

      const chunk = parsedRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

      try {
        const res = await fetch('/api/seo/review-link/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: chunk,
            batchIndex: b,
            totalBatches
          })
        });

        const data: BulkBatchResponse = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Batch ${b + 1} processing failed.`);
        }

        allResults.push(...data.results);
        setBulkResults([...allResults]);
        setBulkProgress({ current: allResults.length, total: parsedRows.length });

        if (data.rateLimited) {
          setBulkError('Google API rate limit reached. Remaining rows may be preserved or retried.');
          break;
        }
      } catch (err: any) {
        setBulkError(err.message || 'Error occurred during batch processing.');
        // Add synthetic error rows for the failed chunk to preserve order
        for (const item of chunk) {
          allResults.push({
            rowIndex: item.rowIndex,
            inputBusinessName: item.businessName,
            inputAddress: item.address || '',
            inputCity: item.city || '',
            status: 'API_ERROR',
            statusNote: err.message || 'Batch request failed',
            source: 'NONE'
          });
        }
        setBulkResults([...allResults]);
      }
    }

    if (!cancelBulkRef.current) {
      setBulkStatus('completed');
    }
  };

  const handleCancelBulk = () => {
    cancelBulkRef.current = true;
    setBulkStatus('cancelled');
  };

  const handleConfirmCandidateForBulk = (rowIndex: number, candidate: PlaceCandidate) => {
    setBulkResults(prev =>
      prev.map(row => {
        if (row.rowIndex === rowIndex) {
          return {
            ...row,
            matchedBusinessName: candidate.name,
            matchedAddress: candidate.address,
            googlePlaceId: candidate.placeId,
            googleReviewUrl: candidate.writeReviewUrl,
            googleMapsUrl: candidate.mapsUrl,
            status: 'MATCHED',
            statusNote: 'Confirmed by user',
            source: 'USER_CONFIRMED'
          };
        }
        return row;
      })
    );
    setActiveReviewCandidateRow(null);
  };

  const downloadBulkCsv = () => {
    if (bulkResults.length === 0) return;
    const csvContent = formatBulkResultsToCsv(bulkResults);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `google_review_links_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ToolLayout
      title="Google Review Link Generator"
      description="Find your business on Google Maps and generate direct review links customers can use to leave a 5-star review."
      category="Local SEO"
      breadcrumbs={[{ label: 'Review Link Generator' }]}
      aboutText="Getting customers to write a Google Review is much higher when there is zero friction. This tool queries the official Google Places API (New) to identify your Google Business Profile and produces a genuine direct write-review URL that opens the 5-star rating popup directly."
      howItWorks={[
        "Enter your business name and location, or provide an existing Google Place ID.",
        "Our server searches the Google Places API (New) to find matching verified listings.",
        "Select your listing or confirm ambiguous candidate matches.",
        "Copy your direct review link to share via SMS, email, WhatsApp, or print on receipts and QR codes."
      ]}
      faq={[
        {
          question: "How does the direct review link work?",
          answer: "It uses either the official Google-provided writeAReviewUri or Google's local write-review format (search.google.com/local/writereview?placeid=...). Customers click it and the 5-star review box opens instantly on desktop and mobile."
        },
        {
          question: "Can I generate links for multiple locations in bulk?",
          answer: "Yes! Switch to the 'Bulk Upload' tab, upload a CSV or Excel file containing your business names and cities, and the tool will batch-match them and provide a complete downloadable CSV."
        },
        {
          question: "What if Google finds multiple businesses with the same name?",
          answer: "We do not guess. If multiple plausible locations are returned, the tool marks them as 'Needs Review' and lets you select the exact branch."
        }
      ]}
    >
      {/* TABS NAVIGATION */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-8">
        <button
          onClick={() => setActiveTab('single')}
          className={`py-3 px-6 text-base font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'single'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Single Business Lookup
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`py-3 px-6 text-base font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'bulk'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Bulk Spreadsheet Upload
        </button>
      </div>

      {/* ==================================================== */}
      {/* TAB 1: SINGLE BUSINESS LOOKUP                        */}
      {/* ==================================================== */}
      {activeTab === 'single' && (
        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Find Business Listing
            </h2>

            <form onSubmit={handleSingleSearch} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Barbeque Nation"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    City or Location <span className="text-slate-400 text-xs font-normal">(Recommended)</span>
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Indiranagar, Bengaluru"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Expandable Manual Place ID Option */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualPlaceId(!showManualPlaceId)}
                  className="text-sm font-semibold text-green-600 dark:text-green-400 hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showManualPlaceId ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Already have a Google Place ID? (Bypass API search)
                </button>

                {showManualPlaceId && (
                  <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Direct Google Place ID
                    </label>
                    <input
                      type="text"
                      value={manualPlaceId}
                      onChange={(e) => setManualPlaceId(e.target.value)}
                      placeholder="e.g. ChIJN1t_tDeuEmsRUsoyG83frY4"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Entering a Place ID generates the direct review link immediately without requiring a Google Maps API search.
                    </p>
                  </div>
                )}
              </div>

              {/* ACTION BUTTON */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSearching}
                  className="w-full sm:w-auto px-8 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSearching ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Searching Google Places...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {manualPlaceId.trim() ? 'Generate Review Link' : 'Find Business'}
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* ERROR OR CONFIGURATION WARNING */}
            {singleError && (
              <div className="mt-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h4 className="font-bold text-sm">
                      {singleErrorCode === 'API_KEY_NOT_CONFIGURED' ? 'Google API Key Required' : 'Search Notice'}
                    </h4>
                    <p className="text-sm mt-0.5">{singleError}</p>
                    {singleErrorCode === 'API_KEY_NOT_CONFIGURED' && (
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-2">
                        Tip: You can still generate direct review links by clicking <strong>&quot;Already have a Google Place ID?&quot;</strong> above and entering your Place ID directly.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CANDIDATES LIST */}
          {candidates.length > 0 && !generatedReviewLink && (
            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Matching Google Business Listings ({candidates.length})
                </h3>
                <span className="text-xs text-slate-500">Please select your listing below</span>
              </div>

              <div className="space-y-3">
                {candidates.map((cand) => (
                  <div
                    key={cand.placeId}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-green-500 dark:hover:border-green-500 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{cand.name}</span>
                        {cand.confidence === 'HIGH' && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                            High Match
                          </span>
                        )}
                        {cand.confidence === 'NEEDS_CONFIRMATION' && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                            Review Match
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{cand.address}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                        <span>Place ID: {cand.placeId}</span>
                        {cand.rating && (
                          <span className="flex items-center gap-1 text-amber-600 font-sans font-bold">
                            ★ {cand.rating} ({cand.userRatingCount || 0})
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectCandidate(cand)}
                      className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl shrink-0 transition-all cursor-pointer"
                    >
                      Select Listing
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GENERATED RESULT CARD */}
          {generatedReviewLink && (
            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-green-500/30 shadow-lg space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">
                      Google Review Link Ready
                    </h3>
                    <p className="text-xs text-slate-500">
                      {linkSource === 'GOOGLE_API_VERIFIED'
                        ? 'Verified through Google Places API (writeAReviewUri)'
                        : 'Generated via verified Google Place ID'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setGeneratedReviewLink(null);
                    setSelectedCandidate(null);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                >
                  Search Again
                </button>
              </div>

              {/* DETAILS */}
              {selectedCandidate && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedCandidate.name}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedCandidate.address}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs font-mono bg-white dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">
                      Place ID: {selectedCandidate.placeId}
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedCandidate.placeId, 'placeId')}
                      className="text-xs text-green-600 dark:text-green-400 font-bold hover:underline cursor-pointer"
                    >
                      {copiedPlaceId ? 'Copied ID!' : 'Copy ID'}
                    </button>
                  </div>
                </div>
              )}

              {/* LINK INPUT AND BUTTONS */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Direct Google Review URL
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    readOnly
                    value={generatedReviewLink}
                    className="flex-1 px-4 py-3 rounded-xl border border-green-500/40 bg-green-50/30 dark:bg-slate-900 text-green-800 dark:text-green-300 font-mono text-sm select-all focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(generatedReviewLink, 'link')}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth="2" />
                      </svg>
                      {copiedLink ? 'Copied!' : 'Copy Link'}
                    </button>

                    <a
                      href={generatedReviewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                    >
                      Open Link
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>

                {linkNotice && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                    {linkNotice}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: BULK SPREADSHEET UPLOAD                       */}
      {/* ==================================================== */}
      {activeTab === 'bulk' && (
        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                Bulk Review Link Generation
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Upload a CSV or Excel spreadsheet containing your branch locations. Our system will process them in bounded batches.
              </p>
            </div>

            {/* DROPZONE */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 border-2 border-dashed rounded-3xl text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-green-500 bg-slate-50/50 dark:bg-slate-900/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 flex items-center justify-center">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">
                {file ? file.name : 'Click or drag spreadsheet file here'}
              </h3>
              <p className="text-xs text-slate-500">
                Supports .CSV and .XLSX (Max 10 MB). Expected columns: <code>business_name</code>, <code>city</code>, or <code>place_id</code>.
              </p>
            </div>

            {/* ERROR */}
            {bulkError && (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-sm">
                {bulkError}
              </div>
            )}

            {/* PARSED PREVIEW & ACTIONS */}
            {bulkStatus === 'parsed' && parsedRows.length > 0 && (
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/50">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm">
                      {parsedRows.length} locations detected
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
                      <span>Name Column: <strong>{detectedColumns.businessNameCol || 'N/A'}</strong></span>
                      <span>City/Address Column: <strong>{detectedColumns.cityCol || detectedColumns.addressCol || 'N/A'}</strong></span>
                      {detectedColumns.placeIdCol && <span>Place ID Column: <strong>{detectedColumns.placeIdCol}</strong></span>}
                    </div>
                  </div>

                  <button
                    onClick={startBulkProcessing}
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all text-sm"
                  >
                    Generate Review Links
                  </button>
                </div>
              </div>
            )}

            {/* PROCESSING PROGRESS */}
            {bulkStatus === 'processing' && (
              <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-800 dark:text-white">
                    Processing batches... ({bulkProgress.current} / {bulkProgress.total})
                  </span>
                  <button
                    onClick={handleCancelBulk}
                    className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Cancel Remaining
                  </button>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%`
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* RESULTS TABLE & EXPORT */}
            {bulkResults.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Results ({bulkResults.length} processed)
                    </h3>
                    <div className="text-xs text-slate-500 flex gap-3 mt-1">
                      <span className="text-green-600 dark:text-green-400 font-bold">
                        Matched: {bulkResults.filter(r => r.status === 'MATCHED').length}
                      </span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">
                        Needs Review: {bulkResults.filter(r => r.status === 'NEEDS_REVIEW').length}
                      </span>
                      <span className="text-red-500 font-bold">
                        Failed/Not Found: {bulkResults.filter(r => ['NOT_FOUND', 'INVALID_INPUT', 'API_ERROR', 'RATE_LIMITED'].includes(r.status)).length}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={downloadBulkCsv}
                    className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 font-bold rounded-xl shadow-md cursor-pointer transition-all text-sm flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download CSV
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                        <th className="p-3">#</th>
                        <th className="p-3">Input Business</th>
                        <th className="p-3">Matched Listing</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Review Link</th>
                        <th className="p-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-800 dark:text-slate-200">
                      {bulkResults.map((r) => (
                        <tr key={r.rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                          <td className="p-3 font-mono text-slate-500">{r.rowIndex}</td>
                          <td className="p-3">
                            <div className="font-bold">{r.inputBusinessName || '—'}</div>
                            <div className="text-xs text-slate-500">{[r.inputAddress, r.inputCity].filter(Boolean).join(', ')}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold">{r.matchedBusinessName || '—'}</div>
                            <div className="text-xs text-slate-500">{r.matchedAddress || '—'}</div>
                            {r.googlePlaceId && (
                              <div className="text-[11px] font-mono text-slate-400">ID: {r.googlePlaceId}</div>
                            )}
                          </td>
                          <td className="p-3">
                            {r.status === 'MATCHED' && (
                              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 font-bold text-xs">
                                Matched
                              </span>
                            )}
                            {r.status === 'NEEDS_REVIEW' && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-bold text-xs">
                                Needs Review
                              </span>
                            )}
                            {r.status === 'NOT_FOUND' && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-bold text-xs">
                                Not Found
                              </span>
                            )}
                            {['API_ERROR', 'RATE_LIMITED', 'INVALID_INPUT'].includes(r.status) && (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold text-xs">
                                {r.status}
                              </span>
                            )}
                          </td>
                          <td className="p-3 max-w-[200px]">
                            {r.googleReviewUrl ? (
                              <a
                                href={r.googleReviewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 dark:text-green-400 font-mono text-xs hover:underline truncate block"
                              >
                                {r.googleReviewUrl}
                              </a>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {r.status === 'NEEDS_REVIEW' && r.candidates && r.candidates.length > 0 && (
                              <button
                                onClick={() => setActiveReviewCandidateRow(r)}
                                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg cursor-pointer"
                              >
                                Choose ({r.candidates.length})
                              </button>
                            )}
                            {r.googleReviewUrl && (
                              <button
                                onClick={() => copyToClipboard(r.googleReviewUrl!, 'link')}
                                className="px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                              >
                                Copy
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* CANDIDATE CONFIRMATION MODAL FOR AMBIGUOUS BULK ROW */}
          {activeReviewCandidateRow && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                      Confirm Listing for Row #{activeReviewCandidateRow.rowIndex}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Query: &quot;{activeReviewCandidateRow.inputBusinessName}&quot; ({activeReviewCandidateRow.inputCity || activeReviewCandidateRow.inputAddress || 'No location'})
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveReviewCandidateRow(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {activeReviewCandidateRow.candidates?.map((cand) => (
                    <div
                      key={cand.placeId}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-green-500 flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-sm text-slate-900 dark:text-white">{cand.name}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">{cand.address}</div>
                        <div className="text-[11px] font-mono text-slate-400">ID: {cand.placeId}</div>
                      </div>
                      <button
                        onClick={() => handleConfirmCandidateForBulk(activeReviewCandidateRow.rowIndex, cand)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl cursor-pointer shrink-0"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolLayout>
  );
}
