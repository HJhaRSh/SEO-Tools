'use client';

import React, { useState, useEffect } from 'react';
import ToolLayout from '@/components/ToolLayout';
import { GenerateLinkResponse } from '@/lib/seo/reviewLinkTypes';
import {
  buildGoogleMapsSearchUrl,
  isValidPlaceId,
  isValidGoogleReviewUrl
} from '@/lib/seo/reviewLinkService';

export default function ReviewLinkGeneratorPage() {
  // ----------------------------------------------------
  // SINGLE BUSINESS STATE
  // ----------------------------------------------------
  const [singleInputMode, setSingleInputMode] = useState<'business' | 'placeId'>('business');
  const [businessName, setBusinessName] = useState('');
  const [location, setLocation] = useState('');
  const [placeId, setPlaceId] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [generatedReviewLink, setGeneratedReviewLink] = useState<string | null>(null);
  const [extractedPlaceId, setExtractedPlaceId] = useState<string | null>(null);
  const [linkSource, setLinkSource] = useState<'PLACE_ID_SYNTACTIC' | 'BUSINESS_NAME_SEARCH' | 'PASTED_REVIEW_URL' | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPlaceId, setCopiedPlaceId] = useState(false);

  const [isFinderModalOpen, setIsFinderModalOpen] = useState(false);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [queryCopiedNotice, setQueryCopiedNotice] = useState(false);
  const [autoDetectedNotice, setAutoDetectedNotice] = useState(false);

  // Auto-detect Place ID when user returns/focuses back on this window
  useEffect(() => {
    const handleWindowFocus = async () => {
      if (!isFinderModalOpen && singleInputMode !== 'placeId') return;
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          const clean = (text || '').trim();
          if (isValidPlaceId(clean) && clean !== placeId) {
            setPlaceId(clean);
            setAutoDetectedNotice(true);
            setTimeout(() => setAutoDetectedNotice(false), 5000);
          }
        }
      } catch {
        // Clipboard read permission might not be granted by browser, silently ignore
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [isFinderModalOpen, singleInputMode, placeId]);

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
    } else {
      if (!placeId.trim()) {
        setSingleError('Please enter a valid Google Place ID (e.g. ChIJN1t_tDeuEmsRUsoyG83frY4).');
        return;
      }
      if (!isValidPlaceId(placeId.trim())) {
        setSingleError('Invalid Google Place ID format. Place IDs are alphanumeric strings (15–120 characters).');
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

  return (
    <ToolLayout
      title="Google Review Link Generator"
      description="Create direct, 5-star Google Review links for your business with instant QR code, WhatsApp, and SMS sharing — 100% free."
      category="Local SEO"
      breadcrumbs={[{ label: 'Review Link Generator' }]}
      aboutText="Customers are significantly more likely to leave a 5-star Google review when all friction is removed. This tool creates official direct Google review URLs that launch the 5-star rating popup immediately on desktop and mobile — completely free without requiring Google Cloud billing or paid API keys."
      howItWorks={[
        "Step 1: Enter your business name and location, or switch to Place ID / Existing Link.",
        "Step 2: Use the 1-click Place ID helper to quickly identify your business and copy its Place ID.",
        "Step 3: Generate the official 5-star direct write-review link: https://search.google.com/local/writereview?placeid=...",
        "Step 4: Download your print-ready QR code or share directly via WhatsApp, SMS, or email."
      ]}
      faq={[
        {
          question: "How does the direct Google review link work?",
          answer: "It uses Google's official local write-review format: https://search.google.com/local/writereview?placeid=PLACE_ID. When clicked by customers, it opens directly into the 5-star review dialog without requiring extra navigation."
        },
        {
          question: "How do I find my Google Place ID?",
          answer: "Click the 'Find Place ID in 1 Click' button right above the form. It auto-copies your business name to your clipboard and opens Google's free Place ID finder tool."
        },
        {
          question: "Does this require Google Cloud billing or API keys?",
          answer: "No! This tool operates at 100% zero cost. No Google Cloud project, billing accounts, credit cards, or paid APIs are required."
        }
      ]}
    >
      <div className="space-y-8">
        {/* UNIFIED GENERATE REVIEW LINK FORM */}
        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Generate Google Review Link
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Enter your business details below to generate a direct review link, QR code, and customer request templates automatically.
            </p>
          </div>

          {/* Toggle Input Mode */}
          <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl max-w-sm">
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
          </div>

            <form onSubmit={handleGenerateSingleLink} className="space-y-4">
              {singleInputMode === 'business' ? (
                <div className="space-y-4">
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

                  {/* 1-CLICK PLACE ID HELPER CARD */}
                  <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white uppercase tracking-wider">
                          Official Direct 5-Star Popup
                        </span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Requires Google Place ID
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {businessName.trim()
                          ? `Lookup "${businessName}${location ? ` ${location}` : ''}" in Google's official Place ID finder:`
                          : 'Click below to open Google\'s official Place ID locator free:'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const q = [businessName.trim(), location.trim()].filter(Boolean).join(' ');
                          setModalSearchTerm(q || 'Barbeque Nation');
                          setIsFinderModalOpen(true);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Find Place ID in 1 Click 🎯
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSingleInputMode('placeId');
                        }}
                        className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl text-xs transition-all cursor-pointer"
                      >
                        I Have The Place ID →
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Google Place ID <span className="text-red-500">*</span>
                    </label>
                    <a
                      href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      Open Google Place ID Finder ↗
                    </a>
                  </div>
                  <input
                    type="text"
                    value={placeId}
                    onChange={(e) => setPlaceId(e.target.value)}
                    placeholder="e.g. ChIJv_QhFmTO5zsRqN_aE36E4l0"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Instantly generates the official direct 5-star review modal: <code>https://search.google.com/local/writereview?placeid=...</code>
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
                        ? 'Official direct 5-star Google review popup URL'
                        : linkSource === 'BUSINESS_NAME_SEARCH'
                        ? 'Google Maps business profile search URL'
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

              {/* QR CODE & SHARING TEMPLATES SECTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                {/* QR CODE BOX */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    Scan QR Code for Reviews
                  </div>
                  <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-200">
                    {/* Free SVG QR Code generator via standard api */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        generatedReviewLink
                      )}&format=svg`}
                      alt="Google Review QR Code"
                      width={180}
                      height={180}
                      className="w-40 h-40 object-contain"
                    />
                  </div>
                  <a
                    href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(
                      generatedReviewLink
                    )}&format=png`}
                    download="google-review-qr.png"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-green-500 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download High-Res QR (Print Ready)
                  </a>
                </div>

                {/* WHATSAPP & SMS TEMPLATES */}
                <div className="space-y-4">
                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    1-Click Customer Request Templates
                  </div>

                  {/* WHATSAPP TEMPLATE */}
                  <div className="p-3.5 rounded-xl bg-green-50/50 dark:bg-green-950/20 border border-green-200/60 dark:border-green-800/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
                        </svg>
                        WhatsApp Message Template
                      </span>
                      <button
                        onClick={() => {
                          const name = businessName.trim() || 'our business';
                          const msg = `Hi! Thank you for choosing ${name}. Would you mind taking 30 seconds to share your experience on Google? We'd truly appreciate it: ${generatedReviewLink}`;
                          copyToClipboard(msg, 'link');
                        }}
                        className="text-[11px] text-green-700 dark:text-green-400 font-bold hover:underline cursor-pointer"
                      >
                        Copy Text
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      &quot;Hi! Thank you for choosing {businessName.trim() || 'our business'}. Would you mind taking 30 seconds to share your experience on Google? We&apos;d truly appreciate it: {generatedReviewLink}&quot;
                    </p>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Hi! Thank you for choosing ${businessName.trim() || 'our business'}. Would you mind taking 30 seconds to share your experience on Google? We'd truly appreciate it: ${generatedReviewLink}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 font-bold hover:underline pt-1"
                    >
                      Share via WhatsApp ↗
                    </a>
                  </div>

                  {/* SMS / EMAIL TEMPLATE */}
                  <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        SMS / Email Template
                      </span>
                      <button
                        onClick={() => {
                          const name = businessName.trim() || 'us';
                          const msg = `Thanks for visiting ${name}! If you had a good experience, please leave us a 5-star Google review: ${generatedReviewLink}`;
                          copyToClipboard(msg, 'link');
                        }}
                        className="text-[11px] text-slate-600 dark:text-slate-400 font-bold hover:underline cursor-pointer"
                      >
                        Copy Text
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      &quot;Thanks for visiting {businessName.trim() || 'us'}! If you had a good experience, please leave us a 5-star Google review: {generatedReviewLink}&quot;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>
      {/* ==================================================== */}
      {/* IN-PAGE GOOGLE PLACE ID FINDER MODAL                 */}
      {/* ==================================================== */}
      {isFinderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* MODAL HEADER */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg">
                  📍
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Google Place ID Finder
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Get your official Place ID directly without leaving this page
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFinderModalOpen(false)}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* STEPS CARD */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 space-y-3">
                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚡ 2-Step Quick Guide</span>
                </div>
                <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>
                    Click <strong className="text-emerald-700 dark:text-emerald-400">“Launch Official Google Tool”</strong> below.
                  </li>
                  <li>
                    In the search bar above the map, type your business name (e.g. <em>&quot;{modalSearchTerm}&quot;</em>) and click it. Copy the <strong>Place ID</strong> (starts with <code>ChIJ...</code>).
                  </li>
                </ol>
              </div>

              {/* SEARCH QUERY PRE-FILL */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Target Business Query
                  </label>
                  {queryCopiedNotice && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-pulse">
                      ✓ Business Name Copied to Clipboard!
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    placeholder="e.g. Barbeque Nation Indiranagar Bangalore"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const query = modalSearchTerm.trim();
                      try {
                        await navigator.clipboard.writeText(query);
                        setQueryCopiedNotice(true);
                        setTimeout(() => setQueryCopiedNotice(false), 4000);
                      } catch {
                        // ignore clipboard write failure
                      }
                      const searchUrl = 'https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder';
                      window.open(searchUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                  >
                    <span>Launch Google Tool ↗</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ⚡ Clicking automatically copies <strong>&quot;{modalSearchTerm}&quot;</strong> to your clipboard. Once the Google tab opens, simply press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[10px]">Ctrl+V</kbd> in the search bar.
                </p>
              </div>

              {/* AUTO-DETECT NOTIFICATION BANNER */}
              {autoDetectedNotice && (
                <div className="p-3 rounded-xl bg-green-100 dark:bg-green-950/40 border border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 text-xs font-semibold flex items-center gap-2 animate-bounce">
                  <span>🎯</span>
                  <span>We automatically detected and pasted your Place ID from your clipboard!</span>
                </div>
              )}

              {/* PASTE PLACE ID INPUT */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Paste Place ID Here
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="e.g. ChIJK7aICxoVrjsRnjZbF0TjvNo"
                    value={placeId}
                    onChange={(e) => setPlaceId(e.target.value.trim())}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    disabled={!isValidPlaceId(placeId.trim())}
                    onClick={() => {
                      setSingleInputMode('placeId');
                      setIsFinderModalOpen(false);
                      handleGenerateSingleLink();
                    }}
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                  >
                    <span>Generate Review Link</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
                {placeId && !isValidPlaceId(placeId) && (
                  <p className="text-xs text-red-500">
                    Place ID must be a valid Google ID (alphanumeric, 15-120 chars, e.g. ChIJ...)
                  </p>
                )}
                {isValidPlaceId(placeId) && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                    ✓ Valid Place ID recognized! Click &quot;Generate Review Link&quot; above.
                  </p>
                )}
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsFinderModalOpen(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
