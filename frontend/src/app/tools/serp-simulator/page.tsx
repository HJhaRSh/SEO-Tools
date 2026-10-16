'use client';

import React, { useState, useMemo, useId } from 'react';
import ToolLayout from '@/components/ToolLayout';
import {
  SerpDevice,
  SERP_LIMITS,
  SERP_FONTS,
  MetadataFetchResponse,
} from '@/lib/seo/serp/types';
import {
  getUnicodeLength,
  measureTextWidth,
  truncateToPixelWidth,
} from '@/lib/seo/serp/measureText';
import { parseDisplayUrl } from '@/lib/seo/serp/parseUrl';
import { highlightQueryMatches } from '@/lib/seo/serp/highlightQuery';

export default function SerpSimulator() {
  // Form input states
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [device, setDevice] = useState<SerpDevice>('desktop');
  const [showDate, setShowDate] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState('4.8');
  const [reviewCount, setReviewCount] = useState('142');

  // Metadata fetch states
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Accessible IDs
  const titleInputId = useId();
  const urlInputId = useId();
  const descInputId = useId();
  const queryInputId = useId();
  const ratingInputId = useId();
  const reviewCountInputId = useId();

  // Character counts (Unicode-safe)
  const titleLength = useMemo(() => getUnicodeLength(title), [title]);
  const descLength = useMemo(() => getUnicodeLength(description), [description]);

  // Pixel limits for current device
  const limits = SERP_LIMITS[device];
  const fonts = SERP_FONTS[device];

  // Title width and truncation calculation
  const titleMetrics = useMemo(() => {
    const rawWidth = isMounted
      ? measureTextWidth(title || 'Example Title for Your Webpage', fonts.title)
      : 294; // Consistent SSR baseline
    const truncation = truncateToPixelWidth(
      title || 'Example Title for Your Webpage',
      limits.titlePx,
      fonts.title
    );
    const isOverLimit = rawWidth > limits.titlePx;
    return {
      rawWidth,
      isOverLimit,
      truncatedText: truncation.truncatedText,
      isTruncated: truncation.isTruncated,
      maxPx: limits.titlePx,
    };
  }, [title, limits.titlePx, fonts.title, isMounted]);

  // Dynamic publication date for rich snippet simulation (defaults to today's date formatted)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const formattedDate = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, monthIndex, day);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      }
    } catch {
      // Fallback
    }
    return selectedDate;
  }, [selectedDate]);

  // Description preview text (with optional date prepended)
  const fullDescriptionText = useMemo(() => {
    const baseText = description || 'This is an example of a meta description. It should be concise and compelling, summarizing the content of the page and encouraging users to click.';
    if (showDate && formattedDate) {
      return `${formattedDate} — ${baseText}`;
    }
    return baseText;
  }, [description, showDate, formattedDate]);

  // Description width and wrapping estimation
  const descMetrics = useMemo(() => {
    // During SSR/initial hydration, provide an exact deterministic baseline (911px / 75.9%)
    const width = isMounted
      ? measureTextWidth(fullDescriptionText, fonts.description)
      : (description ? Math.round(getUnicodeLength(fullDescriptionText) * 6.3) : 911);
    const maxCapacityPx = limits.descriptionLineWidthPx * limits.descriptionLines;
    const isOverLimit = width > maxCapacityPx;
    return {
      width,
      isOverLimit,
      approxLines: Math.max(1, Math.ceil(width / limits.descriptionLineWidthPx)),
      maxCapacityPx,
    };
  }, [fullDescriptionText, limits, fonts.description, isMounted, description]);

  // URL parsing and breadcrumbs
  const parsedUrl = useMemo(() => parseDisplayUrl(url), [url]);

  // Star rating generator
  const ratingValueNum = Math.min(5, Math.max(0, parseFloat(rating) || 0));
  const reviewCountNum = Math.max(0, parseInt(reviewCount, 10) || 0);

  // Fetch URL metadata from API
  const handleFetchMetadata = async () => {
    if (!url.trim()) {
      setFetchError('Please enter a URL first.');
      return;
    }

    setIsFetching(true);
    setFetchError(null);
    setFetchSuccess(null);

    try {
      const res = await fetch('/api/seo/serp-simulator/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json: MetadataFetchResponse = await res.json();

      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Failed to fetch page metadata.');
      }

      if (json.data.title) {
        setTitle(json.data.title);
      }
      if (json.data.description) {
        setDescription(json.data.description);
      }
      if (json.data.finalUrl && json.data.finalUrl !== url) {
        setUrl(json.data.finalUrl);
      }

      setFetchSuccess('Successfully fetched title and meta description!');
      setTimeout(() => setFetchSuccess(null), 4000);
    } catch (err: any) {
      setFetchError(err.message || 'An error occurred while fetching the URL.');
    } finally {
      setIsFetching(false);
    }
  };

  // Reset all fields
  const handleReset = () => {
    setUrl('');
    setTitle('');
    setDescription('');
    setQuery('');
    setDevice('desktop');
    setShowDate(false);
    setShowRating(false);
    setRating('4.8');
    setReviewCount('142');
    setFetchError(null);
    setFetchSuccess(null);
  };

  return (
    <ToolLayout
      title="SERP Simulator"
      description="Preview your title tag, meta description, and URL in Google search results with pixel-accurate truncation."
      category="Search Appearance & Structured Data"
      breadcrumbs={[{ label: 'SERP Simulator' }]}
      aboutText="The Search Engine Results Page (SERP) is your primary storefront in search engine results. Google restricts snippet elements based on container pixel widths rather than simple character counts. This Google SERP Simulator measures actual text pixel rendering, simulates Google's word-boundary truncation, supports desktop and mobile viewports, query term highlighting, date stamps, and rich review stars."
      howItWorks={[
        "Type or paste your target webpage URL (or click 'Fetch' to extract existing metadata automatically).",
        "Enter your page Title tag and Meta Description to observe real-time pixel meter feedback.",
        "Optionally enter a Search Query to test keyword bolding in search snippets.",
        "Toggle between Desktop and Mobile views to test viewport truncation differences.",
        "Simulate rich snippets with publication dates and review star ratings."
      ]}
      faq={[
        {
          question: "Why does pixel width matter more than character count?",
          answer: "Google calculates title cutoffs using a container width (typically ~600px on desktop), not a fixed 60-character count. Because proportional fonts have varying character widths (for instance, 'W' is much wider than 'i'), a 55-character title with wide letters can be truncated while a 65-character title with narrow letters fits cleanly."
        },
        {
          question: "Does this guarantee how Google will display my snippet?",
          answer: "No. This tool is a visual simulator. Google frequently rewrites titles or dynamically selects alternate text from the page content based on the user's specific query."
        },
        {
          question: "Can I fetch any live URL?",
          answer: "Yes, publicly accessible HTML pages can be fetched via our secure proxy. Note that pages requiring JavaScript execution or sites that block crawlers might not return server-rendered meta tags."
        }
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ========================================================
            INPUT CONTROLS SECTION (Left Column)
            ======================================================== */}
        <div className="lg:col-span-6 space-y-6">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4 mb-5">
              <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Snippet Inputs
              </h2>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                title="Reset all inputs"
              >
                Clear All
              </button>
            </div>

            {/* Fetch Status Messages */}
            {fetchError && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-2.5">
                <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{fetchError}</span>
              </div>
            )}
            {fetchSuccess && (
              <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2.5">
                <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{fetchSuccess}</span>
              </div>
            )}

            {/* URL Input with Fetch Button */}
            <div className="input-group">
              <label htmlFor={urlInputId} className="label flex items-center justify-between">
                <span>Page URL</span>
                <span className="text-xs font-normal text-slate-500">Supports live metadata fetch</span>
              </label>
              <div className="flex gap-2">
                <input
                  id={urlInputId}
                  type="url"
                  className="input flex-1"
                  placeholder="https://example.com/your-page-slug"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (fetchError) setFetchError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={handleFetchMetadata}
                  disabled={isFetching || !url.trim()}
                  className="btn btn-primary px-4 py-2.5 text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isFetching ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Fetching...
                    </span>
                  ) : (
                    'Fetch'
                  )}
                </button>
              </div>
            </div>

            {/* SEO Title Input */}
            <div className="input-group">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor={titleInputId} className="label mb-0">Page Title</label>
                <div className="text-xs font-bold flex items-center gap-2">
                  <span
                    suppressHydrationWarning
                    className={titleMetrics.isOverLimit ? 'text-rose-600 font-black' : 'text-slate-500'}
                  >
                    {titleMetrics.rawWidth} / {limits.titlePx} px
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500 font-medium">
                    {titleLength} chars
                  </span>
                </div>
              </div>
              <input
                id={titleInputId}
                type="text"
                className={`input ${titleMetrics.isOverLimit ? 'border-amber-400 focus:border-rose-500' : ''}`}
                placeholder="Enter title tag (e.g. Best SEO Tools for 2026)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              {/* Title Progress Bar */}
              <div
                suppressHydrationWarning
                className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden"
              >
                <div
                  suppressHydrationWarning
                  className={`h-full transition-all duration-150 ${
                    titleMetrics.isOverLimit ? 'bg-rose-500' : titleMetrics.rawWidth > limits.titlePx * 0.9 ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (titleMetrics.rawWidth / limits.titlePx) * 100)}%` }}
                />
              </div>

              {titleMetrics.isOverLimit && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5 flex items-center gap-1 font-medium">
                  <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Exceeds ~{limits.titlePx}px width on {device}. Google will likely truncate this title.
                </p>
              )}
            </div>

            {/* Meta Description Input */}
            <div className="input-group">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor={descInputId} className="label mb-0">Meta Description</label>
                <div className="text-xs font-bold flex items-center gap-2">
                  <span className={descMetrics.isOverLimit ? 'text-rose-600 font-black' : 'text-slate-500'}>
                    ~{descMetrics.approxLines} / {limits.descriptionLines} lines
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500 font-medium">
                    {descLength} chars
                  </span>
                </div>
              </div>
              <textarea
                id={descInputId}
                className={`textarea ${descMetrics.isOverLimit ? 'border-amber-400 focus:border-rose-500' : ''}`}
                rows={3}
                placeholder="Write a concise meta description summarizing the page content..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              {/* Description Progress Bar */}
              <div
                suppressHydrationWarning
                className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden"
              >
                <div
                  suppressHydrationWarning
                  className={`h-full transition-all duration-150 ${
                    descMetrics.isOverLimit ? 'bg-rose-500' : descMetrics.width > descMetrics.maxCapacityPx * 0.9 ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (descMetrics.width / descMetrics.maxCapacityPx) * 100)}%` }}
                />
              </div>

              {descMetrics.isOverLimit && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5 flex items-center gap-1 font-medium">
                  <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Description is longer than typical 2-line visible SERP capacity.
                </p>
              )}
            </div>

            {/* Search Query Input (for Keyword Bolding) */}
            <div className="input-group">
              <label htmlFor={queryInputId} className="label flex items-center justify-between">
                <span>Search Query (Keyword)</span>
                <span className="text-xs font-normal text-slate-500">Test keyword bolding</span>
              </label>
              <input
                id={queryInputId}
                type="text"
                className="input"
                placeholder="e.g. seo tools simulator"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1.5">
                Terms matching the query will be bolded in the SERP preview just like on Google.
              </p>
            </div>
          </div>

          {/* Optional Rich Snippet Additions */}
          <div className="card">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4">
              Rich Snippet Simulation
            </h3>
            
            <div className="space-y-4">
              {/* Date Option */}
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDate}
                    onChange={(e) => setShowDate(e.target.checked)}
                    className="w-4 h-4 rounded text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Include publication date</span>
                    <p className="text-xs text-slate-500">Prepends &quot;{formattedDate || 'Date'} —&quot; to the description snippet.</p>
                  </div>
                </label>
                {showDate && (
                  <div className="pl-7 pt-1">
                    <label htmlFor="pub-date-input" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Publication Date
                    </label>
                    <input
                      id="pub-date-input"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="input py-1.5 px-3 text-xs w-auto max-w-[200px]"
                    />
                  </div>
                )}
              </div>

              {/* Review / Rating Option */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={showRating}
                    onChange={(e) => setShowRating(e.target.checked)}
                    className="w-4 h-4 rounded text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Include review star rating</span>
                    <p className="text-xs text-slate-500">Simulate Product/Review Schema rich results.</p>
                  </div>
                </label>

                {showRating && (
                  <div className="grid grid-cols-2 gap-3 pl-7">
                    <div>
                      <label htmlFor={ratingInputId} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Rating (0.0 – 5.0)
                      </label>
                      <input
                        id={ratingInputId}
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={rating}
                        onChange={(e) => setRating(e.target.value)}
                        className="input py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor={reviewCountInputId} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Review Count
                      </label>
                      <input
                        id={reviewCountInputId}
                        type="number"
                        min="0"
                        value={reviewCount}
                        onChange={(e) => setReviewCount(e.target.value)}
                        className="input py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================
            PREVIEW SECTION (Right Column)
            ======================================================== */}
        <div className="lg:col-span-6 space-y-6">
          <div className="card sticky top-6">
            {/* Header + Device Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Live SERP Preview
                </h2>
                <p className="text-xs text-slate-500">
                  Simulated Google search result ({device} view)
                </p>
              </div>

              {/* Device Toggle Tabs */}
              <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setDevice('desktop')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    device === 'desktop'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  aria-pressed={device === 'desktop'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setDevice('mobile')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    device === 'mobile'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  aria-pressed={device === 'mobile'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Mobile
                </button>
              </div>
            </div>

            {/* Container representing Google SERP Viewport */}
            <div className="bg-slate-100/70 dark:bg-slate-950/40 p-4 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex justify-center overflow-x-auto">
              {/* DESKTOP SERP RESULT */}
              {device === 'desktop' ? (
                <div
                  className="w-full bg-white rounded-xl p-5 shadow-xs border border-slate-200/80 transition-all font-sans"
                  style={{ maxWidth: `${SERP_LIMITS.desktop.previewContainerPx}px` }}
                >
                  {/* Google Brand / URL line */}
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/60 overflow-hidden">
                      <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] text-[#202124] leading-tight font-medium truncate">
                        {parsedUrl.hostname}
                      </div>
                      <div className="text-[12px] text-[#4d5156] leading-tight truncate">
                        {parsedUrl.formattedDisplay}
                      </div>
                    </div>
                  </div>

                  {/* Title Link */}
                  <div className="mb-1.5">
                    <h3
                      className="text-[20px] text-[#1a0dab] hover:underline cursor-pointer leading-[1.3] font-normal"
                      style={{
                        fontFamily: 'Arial, sans-serif',
                        maxWidth: `${SERP_LIMITS.desktop.titlePx}px`,
                        wordBreak: 'break-word',
                      }}
                    >
                      {highlightQueryMatches(
                        titleMetrics.isTruncated ? titleMetrics.truncatedText : (title || 'Example Title for Your Webpage'),
                        query
                      )}
                    </h3>
                  </div>

                  {/* Optional Rating Line */}
                  {showRating && (
                    <div className="flex items-center gap-1.5 text-[12px] text-[#4d5156] mb-1.5">
                      <span className="text-[#fbbc04] font-bold text-sm tracking-tighter">
                        {'★'.repeat(Math.round(ratingValueNum))}
                        {'☆'.repeat(Math.max(0, 5 - Math.round(ratingValueNum)))}
                      </span>
                      <span className="font-semibold text-[#202124]">Rating: {ratingValueNum.toFixed(1)}</span>
                      <span>·</span>
                      <span>{reviewCountNum.toLocaleString()} reviews</span>
                    </div>
                  )}

                  {/* Description Snippet with 2-line clamping */}
                  <div
                    className="text-[14px] text-[#4d5156] leading-[1.58]"
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      maxWidth: `${SERP_LIMITS.desktop.descriptionLineWidthPx}px`,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: SERP_LIMITS.desktop.descriptionLines,
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                    }}
                  >
                    {highlightQueryMatches(fullDescriptionText, query)}
                  </div>
                </div>
              ) : (
                /* MOBILE SERP RESULT */
                <div
                  className="w-full bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 transition-all font-sans"
                  style={{ maxWidth: `${SERP_LIMITS.mobile.previewContainerPx}px` }}
                >
                  {/* Google Brand / URL line (Mobile layout) */}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/60 overflow-hidden">
                      <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-[#202124] leading-tight truncate">
                        {parsedUrl.hostname}
                      </div>
                      <div className="text-[11px] text-[#4d5156] leading-tight truncate">
                        {parsedUrl.formattedDisplay}
                      </div>
                    </div>
                  </div>

                  {/* Title Link (Mobile) */}
                  <div className="mb-2">
                    <h3
                      className="text-[18px] text-[#1a0dab] leading-[1.3] font-normal"
                      style={{
                        fontFamily: 'Roboto, Arial, sans-serif',
                        wordBreak: 'break-word',
                      }}
                    >
                      {highlightQueryMatches(
                        titleMetrics.isTruncated ? titleMetrics.truncatedText : (title || 'Example Title for Your Webpage'),
                        query
                      )}
                    </h3>
                  </div>

                  {/* Optional Rating Line */}
                  {showRating && (
                    <div className="flex items-center gap-1.5 text-[12px] text-[#4d5156] mb-1.5">
                      <span className="text-[#fbbc04] font-bold text-sm tracking-tighter">
                        {'★'.repeat(Math.round(ratingValueNum))}
                        {'☆'.repeat(Math.max(0, 5 - Math.round(ratingValueNum)))}
                      </span>
                      <span className="font-semibold text-[#202124]">{ratingValueNum.toFixed(1)}</span>
                      <span>({reviewCountNum})</span>
                    </div>
                  )}

                  {/* Description Snippet (Mobile ~3 lines) */}
                  <div
                    className="text-[14px] text-[#4d5156] leading-[1.58]"
                    style={{
                      fontFamily: 'Roboto, Arial, sans-serif',
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: SERP_LIMITS.mobile.descriptionLines,
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                    }}
                  >
                    {highlightQueryMatches(fullDescriptionText, query)}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <span className="text-slate-500 block mb-1">Title Rendered Width</span>
                <span
                  suppressHydrationWarning
                  className={`text-base font-black ${titleMetrics.isOverLimit ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}
                >
                  {titleMetrics.rawWidth} <span className="text-xs font-normal text-slate-500">/ {limits.titlePx} px</span>
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <span className="text-slate-500 block mb-1">Title Status</span>
                <span className={`text-xs font-black inline-flex items-center gap-1 mt-1 ${titleMetrics.isOverLimit ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {titleMetrics.isOverLimit ? '⚠️ Will Truncate' : '✓ Fits Well'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl col-span-2 sm:col-span-1">
                <span className="text-slate-500 block mb-1">Description Length</span>
                <span className={`text-base font-black ${descMetrics.isOverLimit ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>
                  {descLength} <span className="text-xs font-normal text-slate-500">chars</span>
                </span>
              </div>
            </div>

            {/* Simulation Disclaimer */}
            <p className="text-[11px] text-slate-400 mt-4 leading-normal text-center">
              Disclaimer: Google may rewrite titles, snippets, and breadcrumbs depending on search context and query intent. This preview estimates standard presentation.
            </p>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
