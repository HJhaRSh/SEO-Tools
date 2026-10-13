'use client';

import React, { useState, useRef } from 'react';
import ToolLayout from '@/components/ToolLayout';
import {
  BulkProcessedRow,
  BulkInputRow,
  GenerateLinkResponse,
  BulkBatchResponse
} from '@/lib/seo/reviewLinkTypes';
import { parseClientCsv, detectSpreadsheetColumns } from '@/lib/seo/clientSpreadsheet';
import {
  buildGoogleMapsSearchUrl,
  isValidPlaceId,
  isValidGoogleReviewUrl,
  formatBulkResultsToCsv
} from '@/lib/seo/reviewLinkService';

export default function ReviewLinkGeneratorPage() {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // ----------------------------------------------------
  // SINGLE BUSINESS STATE
  // ----------------------------------------------------
  const [singleInputMode, setSingleInputMode] = useState<'business' | 'placeId' | 'reviewUrl'>('business');
  const [businessName, setBusinessName] = useState('');
  const [location, setLocation] = useState('');
  const [placeId, setPlaceId] = useState('');
  const [pastedReviewUrl, setPastedReviewUrl] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [generatedReviewLink, setGeneratedReviewLink] = useState<string | null>(null);
  const [extractedPlaceId, setExtractedPlaceId] = useState<string | null>(null);
  const [linkSource, setLinkSource] = useState<'PASTED_REVIEW_URL' | 'PLACE_ID_SYNTACTIC' | 'BUSINESS_NAME_SEARCH' | null>(null);
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
    reviewUrlCol?: string;
  }>({});
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'parsed' | 'completed' | 'error'>('idle');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkProcessedRow[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // SINGLE BUSINESS HANDLERS
  // ----------------------------------------------------
  const handleOpenGoogleMapsSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setSingleError('Please enter a business name.');
      return;
    }
    const mapsUrl = buildGoogleMapsSearchUrl(businessName, location);
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const handleGenerateSingleLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSingleError(null);
    setGeneratedReviewLink(null);
    setExtractedPlaceId(null);
    setLinkSource(null);

    if (singleInputMode === 'business') {
      if (!businessName.trim()) {
        setSingleError('Please enter your Business Name to generate the review link.');
        return;
      }
    } else if (singleInputMode === 'placeId') {
      if (!placeId.trim()) {
        setSingleError('Please enter a valid Google Place ID (e.g. ChIJN1t_tDeuEmsRUsoyG83frY4).');
        return;
      }
      if (!isValidPlaceId(placeId.trim())) {
        setSingleError('Invalid Google Place ID format. Place IDs are alphanumeric strings (15–120 characters).');
        return;
      }
    } else {
      if (!pastedReviewUrl.trim()) {
        setSingleError('Please paste your existing Google review link (e.g. from Google Business Profile or g.page).');
        return;
      }
      if (!isValidGoogleReviewUrl(pastedReviewUrl.trim())) {
        setSingleError('Please enter a valid Google review link (e.g. search.google.com/local/writereview... or g.page/r/...).');
        return;
      }
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/seo/review-link/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: singleInputMode === 'placeId' ? placeId.trim() : undefined,
          reviewUrl: singleInputMode === 'reviewUrl' ? pastedReviewUrl.trim() : undefined,
          businessName: businessName.trim() || undefined,
          location: location.trim() || undefined
        })
      });

      const data: GenerateLinkResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate review link.');
      }

      setGeneratedReviewLink(data.reviewUrl);
      setExtractedPlaceId(data.placeId || null);
      setLinkSource(data.source);
    } catch (err: any) {
      setSingleError(err.message || 'Error generating review link.');
    } finally {
      setIsProcessing(false);
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
      if (!cols.placeIdCol && !cols.reviewUrlCol) {
        throw new Error('Could not identify a "place_id" or "review_url" column in spreadsheet headers.');
      }

      setDetectedColumns(cols);

      const mapped: BulkInputRow[] = rawRows.map((r, idx) => ({
        rowIndex: idx + 1,
        businessName: cols.businessNameCol ? String(r[cols.businessNameCol] || '').trim() : '',
        location: cols.cityCol
          ? String(r[cols.cityCol] || '').trim()
          : cols.addressCol
          ? String(r[cols.addressCol] || '').trim()
          : '',
        placeId: cols.placeIdCol ? String(r[cols.placeIdCol] || '').trim() : undefined,
        reviewUrl: cols.reviewUrlCol ? String(r[cols.reviewUrlCol] || '').trim() : undefined
      }));

      setParsedRows(mapped);
      setBulkStatus('parsed');
    } catch (err: any) {
      setBulkError(err.message || 'Error parsing spreadsheet file');
      setBulkStatus('error');
    }
  };

  const processBulkRows = async () => {
    if (parsedRows.length === 0) return;
    setBulkError(null);

    try {
      const res = await fetch('/api/seo/review-link/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows })
      });

      const data: BulkBatchResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to process bulk review links.');
      }

      setBulkResults(data.results);
      setBulkStatus('completed');
    } catch (err: any) {
      setBulkError(err.message || 'Error occurred during bulk processing.');
      setBulkStatus('error');
    }
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
      description="Create direct, 5-star Google Review links for your business using Google Place IDs or existing GBP links — with zero API costs."
      category="Local SEO"
      breadcrumbs={[{ label: 'Review Link Generator' }]}
      aboutText="Customers are significantly more likely to leave a 5-star Google review when all friction is removed. This tool creates or cleans direct Google review URLs that launch the rating box immediately on desktop and mobile — completely free without requiring Google Cloud billing or paid API keys."
      howItWorks={[
        "Option A: Enter your Google Place ID to generate the official direct write-review link.",
        "Option B: Paste your existing Google review link (from Google Business Profile) to format and bulk-export it.",
        "Need to find your business? Use the Google Maps Search helper above to open your listing and locate your Place ID.",
        "For multiple branches, upload a spreadsheet with Place IDs or links and download a clean CSV."
      ]}
      faq={[
        {
          question: "How does the direct Google review link work?",
          answer: "It uses Google's official local write-review format: https://search.google.com/local/writereview?placeid=PLACE_ID. When clicked by customers, it opens directly into the 5-star review dialog without requiring extra navigation."
        },
        {
          question: "How do I find my Google Place ID?",
          answer: "You can find your Place ID through Google's free Place ID Finder (developers.google.com/maps/documentation/places/web-service/place-id) or from your Google Business Profile dashboard under 'Ask for reviews'."
        },
        {
          question: "Does this require Google Cloud billing or API keys?",
          answer: "No! This tool operates at 100% zero cost. No Google Cloud project, billing accounts, credit cards, or paid APIs are required."
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
          Single Business Link Generator
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`py-3 px-6 text-base font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'bulk'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Bulk Spreadsheet Upload & Export
        </button>
      </div>

      {/* ==================================================== */}
      {/* TAB 1: SINGLE BUSINESS GENERATOR                     */}
      {/* ==================================================== */}
      {activeTab === 'single' && (
        <div className="space-y-8">
          {/* UNIFIED GENERATE REVIEW LINK FORM */}
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Generate Google Review Link
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Enter your business details below to generate a direct review link and QR code automatically.
              </p>
            </div>

            {/* Toggle Input Mode */}
            <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl max-w-lg">
              <button
                type="button"
                onClick={() => setSingleInputMode('business')}
                className={`flex-1 py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  singleInputMode === 'business'
                    ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Business Name & City
              </button>
              <button
                type="button"
                onClick={() => setSingleInputMode('placeId')}
                className={`flex-1 py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  singleInputMode === 'placeId'
                    ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Place ID
              </button>
              <button
                type="button"
                onClick={() => setSingleInputMode('reviewUrl')}
                className={`flex-1 py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  singleInputMode === 'reviewUrl'
                    ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Existing Link
              </button>
            </div>

            <form onSubmit={handleGenerateSingleLink} className="space-y-4">
              {singleInputMode === 'business' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Barbeque Nation"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      City / Area <span className="text-xs font-normal text-slate-400">(Recommended)</span>
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Indiranagar, Bengaluru"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              ) : singleInputMode === 'placeId' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Google Place ID <span className="text-red-500">*</span>
                    </label>
                    <a
                      href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      Find Place ID Free ↗
                    </a>
                  </div>
                  <input
                    type="text"
                    value={placeId}
                    onChange={(e) => setPlaceId(e.target.value)}
                    placeholder="e.g. ChIJv_QhFmTO5zsRqN_aE36E4l0"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Generates <code>https://search.google.com/local/writereview?placeid=...</code> directly.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Existing Google Review URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={pastedReviewUrl}
                    onChange={(e) => setPastedReviewUrl(e.target.value)}
                    placeholder="e.g. https://g.page/r/Cb77_example/review or https://search.google.com/local/writereview?placeid=..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Paste your review link from your Google Business Profile dashboard under &quot;Ask for reviews&quot;.
                  </p>
                </div>
              )}

              {/* ACTION BUTTON */}
              <div className="pt-2 flex flex-wrap gap-3 items-center">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-8 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Generate Direct Review Link
                </button>

                {singleInputMode === 'business' && businessName.trim() && (
                  <button
                    type="button"
                    onClick={handleOpenGoogleMapsSearch}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>View Listing on Google Maps ↗</span>
                  </button>
                )}
              </div>
            </form>

            {/* ERROR NOTICE */}
            {singleError && (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-sm">
                {singleError}
              </div>
            )}
          </div>

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
                      {linkSource === 'PLACE_ID_SYNTACTIC'
                        ? 'Built using official Place ID write-review direct popup structure'
                        : linkSource === 'BUSINESS_NAME_SEARCH'
                        ? 'Direct Google Maps business listing review search link (Zero API key needed)'
                        : 'Formatted and verified Google review link'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setGeneratedReviewLink(null);
                    setExtractedPlaceId(null);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                >
                  Clear Result
                </button>
              </div>

              {/* DETAILS */}
              {(businessName || location || extractedPlaceId) && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                  {businessName && (
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      {businessName}
                    </div>
                  )}
                  {location && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {location}
                    </div>
                  )}
                  {extractedPlaceId && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs font-mono bg-white dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">
                        Place ID: {extractedPlaceId}
                      </span>
                      <button
                        onClick={() => copyToClipboard(extractedPlaceId, 'placeId')}
                        className="text-xs text-green-600 dark:text-green-400 font-bold hover:underline cursor-pointer"
                      >
                        {copiedPlaceId ? 'Copied ID!' : 'Copy ID'}
                      </button>
                    </div>
                  )}
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
                Bulk Review Link Generation & Export
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Upload a spreadsheet (.csv or .xlsx) containing Place IDs or Google review URLs to generate and clean links for all locations at once.
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
                Supports .CSV and .XLSX (Max 10 MB). Columns detected automatically: <code>place_id</code> or <code>review_url</code>, with optional <code>business_name</code> and <code>city</code>.
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
                      {parsedRows.length} locations ready to process
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
                      {detectedColumns.placeIdCol && <span>Place ID: <strong>{detectedColumns.placeIdCol}</strong></span>}
                      {detectedColumns.reviewUrlCol && <span>Review URL: <strong>{detectedColumns.reviewUrlCol}</strong></span>}
                      {detectedColumns.businessNameCol && <span>Name: <strong>{detectedColumns.businessNameCol}</strong></span>}
                    </div>
                  </div>

                  <button
                    onClick={processBulkRows}
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all text-sm"
                  >
                    Generate All Review Links
                  </button>
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
                        Ready: {bulkResults.filter(r => r.status === 'MATCHED').length}
                      </span>
                      <span className="text-red-500 font-bold">
                        Invalid Input: {bulkResults.filter(r => r.status === 'INVALID_INPUT').length}
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
                        <th className="p-3">Business</th>
                        <th className="p-3">Location</th>
                        <th className="p-3">Place ID</th>
                        <th className="p-3">Review Link</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-800 dark:text-slate-200">
                      {bulkResults.map((r) => (
                        <tr key={r.rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                          <td className="p-3 font-mono text-slate-500">{r.rowIndex}</td>
                          <td className="p-3 font-bold">{r.inputBusinessName || '—'}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">{r.inputLocation || '—'}</td>
                          <td className="p-3 font-mono text-xs text-slate-500">{r.googlePlaceId || r.inputPlaceId || '—'}</td>
                          <td className="p-3 max-w-[220px]">
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
                            {r.status === 'MATCHED' ? (
                              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 font-bold text-xs">
                                Ready
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold text-xs">
                                Invalid
                              </span>
                            )}
                          </td>
                          <td className="p-3">
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
        </div>
      )}
    </ToolLayout>
  );
}
