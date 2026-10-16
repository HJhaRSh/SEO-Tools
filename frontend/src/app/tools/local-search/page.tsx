'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';
import {
  generateLocalSearchResults,
  LocalSearchResult,
  CURATED_LOCATIONS,
  POPULAR_COUNTRIES,
  POPULAR_LANGUAGES
} from '@/lib/seo/localSearchService';

export default function LocalSearchTool() {
  // Primary Form State
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [countryCode, setCountryCode] = useState('in');
  const [languageCode, setLanguageCode] = useState('en');
  const [reducePersonalization, setReducePersonalization] = useState(true);

  // Advanced section toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Active Embedded Viewer View
  const [activeTab, setActiveTab] = useState<'search' | 'maps'>('search');
  const [deviceViewport, setDeviceViewport] = useState<'desktop' | 'mobile'>('desktop');

  // Execution & Feedback State
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LocalSearchResult | null>(null);
  const [copiedType, setCopiedType] = useState<'search' | 'maps' | null>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!query.trim()) {
      setError('Please enter a search keyword or query.');
      return;
    }

    try {
      const generated = generateLocalSearchResults({
        query: query.trim(),
        location: location.trim() || undefined,
        countryCode: countryCode.trim() || undefined,
        languageCode: languageCode.trim() || undefined,
        reducePersonalization
      });
      setResult(generated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while formulating search targets.');
    }
  };

  const handleSelectCuratedLocation = (curated: typeof CURATED_LOCATIONS[0]) => {
    setLocation(curated.name);
    setCountryCode(curated.countryCode);
    setLanguageCode(curated.languageCode);
    setError(null);
  };

  const handleCopy = async (text: string, type: 'search' | 'maps') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-standard clipboard contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      // Ignore clipboard write failures gracefully
    }
  };

  const activeEmbedUrl = result
    ? activeTab === 'search'
      ? result.googleSearchEmbedUrl
      : result.googleMapsEmbedUrl
    : '';

  const activeExternalUrl = result
    ? activeTab === 'search'
      ? result.googleSearchUrl
      : result.googleMapsUrl
    : '';

  return (
    <ToolLayout
      title="Local Search Results Tool"
      description="Inspect geographically targeted Google Search and Google Maps queries in real-time right inside your browser window without paid APIs or cloud billing."
      category="Local SEO"
      breadcrumbs={[{ label: 'Local Search Results Tool' }]}
      aboutText="Search engine results pages (SERPs) vary significantly based on where a user searches from. Google tailors organic results, Local Map Packs, Knowledge Panels, and local business citations according to location signals. This free tool lets technical SEOs, local marketers, and business owners formulate authentic localized Google search URLs equipped with official canonical location parameters (Google UULE), country market bias (gl), language controls (hl), and reduced personalization (pws=0). You can inspect the live results directly in the embedded interactive browser pane or open them in external browser tabs."
      howItWorks={[
        "Enter your search keyword or phrase (e.g. 'best restaurants in Mumbai', 'dentist near me', 'digital marketing agency').",
        "Specify the search location (e.g. 'Mumbai, Maharashtra, India' or select from quick suggestions).",
        "Adjust advanced options if needed: target country (gl), interface language (hl), and personalization reduction (pws=0).",
        "Click 'Generate & Inspect Local Search'.",
        "View the live Google Search or Google Maps results directly in the embedded pane below, toggle between desktop and mobile viewport containers, or open in a new tab."
      ]}
      faq={[
        {
          question: "How does the embedded live browser pane work?",
          answer: "The live browser pane embeds the location-targeted Google Search (utilizing the reference 'igu=1' parameter) and Google Maps in an interactive container. This enables you to inspect the localized query directly inside this application without having to switch tabs. You can also toggle between desktop container width and mobile device container view."
        },
        {
          question: "How does Google determine location in these generated search URLs?",
          answer: "Google uses the canonical 'uule' parameter to associate search queries with a geographic location. This tool formats the location name into Google's standard length-keyed Base64 UULE specification. Combined with the country domain/market parameter (gl) and interface language (hl), Google serves results tailored to the designated region."
        },
        {
          question: "Does this simulate exact mobile GPS coordinates or IP addresses?",
          answer: "No. Emulating physical GPS signals or residential IP addresses requires specialized browser automation or paid residential proxy networks. This tool leverages Google's native location parameter (UULE) and geographic query parameters (gl, hl, pws=0), providing a free, highly effective way to audit localized SERPs without incurring API costs or sending automated traffic in violation of guidelines."
        },
        {
          question: "What does 'Reduce Personalized Search' (pws=0) do?",
          answer: "When enabled, Google appends 'pws=0' to the search request, which instructs Google to minimize user search history bias and personalization. While it reduces historical profile customization, modern Google results are still influenced by regional trends and active Google Account sessions."
        },
        {
          question: "Are any API keys or payment accounts required?",
          answer: "None. This tool is completely free, runs client-side, and requires no Google Cloud billing, Google Places API keys, or third-party paid subscriptions."
        }
      ]}
    >
      {/* SECTION 1: SEARCH & LOCATION CONFIGURATION */}
      <div className="card mb-8">
        <div className="border-b border-slate-200 pb-4 mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Configure Local Search</h2>
            <p className="text-sm text-slate-500 mt-0.5">Specify your target keyword, search territory, and geographic parameters.</p>
          </div>
          <span className="badge badge-success hidden sm:inline-flex">100% Free &amp; No API Mandate</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Keyword Input */}
          <div className="input-group mb-4">
            <label className="label" htmlFor="local-search-query">
              Search Keyword / Query <span className="text-rose-600">*</span>
            </label>
            <input
              id="local-search-query"
              type="text"
              className="input font-medium"
              placeholder="e.g. best restaurants in Mumbai, dentist near me, SEO services"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (error) setError(null);
              }}
              required
              maxLength={300}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Enter any query: local services, commercial keywords, or &quot;near me&quot; searches. Queries are preserved exactly without alteration.
            </p>
          </div>

          {/* Location Input & Curated Suggestions */}
          <div className="input-group mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0" htmlFor="local-search-location">
                Geographic Location
              </label>
              <span className="text-xs text-slate-400 font-medium">Canonical City / Region / Country</span>
            </div>
            <input
              id="local-search-location"
              type="text"
              className="input font-medium"
              placeholder="e.g. Mumbai, Maharashtra, India or New York, NY, United States"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
            />

            {/* Quick Pick Curated Locations */}
            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Quick-Select Target Markets:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CURATED_LOCATIONS.slice(0, 10).map((loc) => (
                  <button
                    key={loc.name}
                    type="button"
                    onClick={() => handleSelectCuratedLocation(loc)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all font-medium ${
                      location === loc.name
                        ? 'bg-green-600 text-white border-green-600 shadow-sm'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    📍 {loc.name.split(',')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ADVANCED SETTINGS ACCORDION */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left text-sm font-bold text-slate-800 hover:bg-slate-100/80 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>⚙️</span> Advanced Options (Country, Language &amp; Personalization)
              </span>
              <span className="text-xs text-slate-500">
                {showAdvanced ? '▲ Hide Advanced' : '▼ Show Advanced'}
              </span>
            </button>

            {showAdvanced && (
              <div className="p-5 border-t border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Country Code (gl) */}
                <div>
                  <label className="label text-sm" htmlFor="country-select">
                    Target Country / Market (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">gl</code>)
                  </label>
                  <select
                    id="country-select"
                    className="select text-sm"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                  >
                    <option value="">No Country Restriction</option>
                    {POPULAR_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Directs Google to serve country-specific regional index (e.g. <code className="text-xs">gl=in</code> for India).
                  </p>
                </div>

                {/* Interface Language (hl) */}
                <div>
                  <label className="label text-sm" htmlFor="language-select">
                    Google Language (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">hl</code>)
                  </label>
                  <select
                    id="language-select"
                    className="select text-sm"
                    value={languageCode}
                    onChange={(e) => setLanguageCode(e.target.value)}
                  >
                    <option value="">Default Language</option>
                    {POPULAR_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Sets Google interface &amp; snippet language (e.g. <code className="text-xs">hl=hi</code> for Hindi).
                  </p>
                </div>

                {/* Personalization Setting */}
                <div className="sm:col-span-2 pt-2 border-t border-slate-100 flex items-start gap-3">
                  <input
                    id="reduce-personalization"
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    checked={reducePersonalization}
                    onChange={(e) => setReducePersonalization(e.target.checked)}
                  />
                  <label htmlFor="reduce-personalization" className="text-sm font-semibold text-slate-800 cursor-pointer">
                    Reduce Personalized Search (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">pws=0</code>)
                    <span className="block text-xs text-slate-500 font-normal mt-0.5">
                      Minimizes historical profile bias in search results. While helpful, it cannot guarantee fully neutral or anonymous output if Google Account history or device telemetry is present.
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Validation Error Feedback */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Submit Action */}
          <button
            type="submit"
            className="btn btn-primary w-full text-base py-3.5 shadow-md flex items-center justify-center gap-2"
          >
            <span>🔍</span> Generate &amp; Inspect Local Search
          </button>
        </form>
      </div>

      {/* SECTION 2: RESULTS & EMBEDDED IN-PANE BROWSER */}
      {result && (
        <div className="card space-y-6 mb-8 border-green-200 shadow-md">
          {/* Header */}
          <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span>📍</span> Local Search Targets Ready
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Target Query: <strong className="text-slate-800">&quot;{result.searchQuery}&quot;</strong>
                {result.searchLocation && (
                  <span> • Market Location: <strong className="text-slate-800">&quot;{result.searchLocation}&quot;</strong></span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-success text-xs">Live Pane Ready</span>
            </div>
          </div>

          {/* Parameter Summary Panel */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="block font-semibold text-slate-500">Query:</span>
              <span className="font-bold text-slate-800 truncate block" title={result.searchQuery}>
                {result.searchQuery}
              </span>
            </div>
            <div>
              <span className="block font-semibold text-slate-500">Search Location:</span>
              <span className="font-bold text-slate-800 truncate block" title={result.searchLocation || 'None Specified'}>
                {result.searchLocation || 'None Specified'}
              </span>
            </div>
            <div>
              <span className="block font-semibold text-slate-500">Country &amp; Language:</span>
              <span className="font-bold text-slate-800">
                gl={result.countryCode || 'default'} • hl={result.languageCode || 'default'}
              </span>
            </div>
            <div>
              <span className="block font-semibold text-slate-500">Location Encoding:</span>
              <span className="font-bold">
                {result.uuleStatus === 'encoded' ? (
                  <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                    ✓ Google UULE Active
                  </span>
                ) : result.uuleStatus === 'fallback_length_exceeded' ? (
                  <span className="text-amber-700 font-extrabold">Query-based Fallback</span>
                ) : (
                  <span className="text-slate-500">Standard Query</span>
                )}
              </span>
            </div>
          </div>

          {/* Warning if any */}
          {result.warning && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
              <strong>Notice:</strong> {result.warning}
            </div>
          )}

          {/* EMBEDDED IN-PANE BROWSER VIEWER */}
          <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            {/* Viewer Bar Controls */}
            <div className="bg-slate-100 p-3 sm:px-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              {/* Tab Selector: Google Search vs Google Maps */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    activeTab === 'search'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🔍</span> Google Search (SERP)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('maps')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    activeTab === 'maps'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>📍</span> Google Maps
                </button>
              </div>

              {/* Viewport Dimension Toggle: Desktop vs Mobile */}
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setDeviceViewport('desktop')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      deviceViewport === 'desktop'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🖥️ Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceViewport('mobile')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      deviceViewport === 'mobile'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📱 Mobile View
                  </button>
                </div>

                {/* External Launch & Copy Quick Buttons */}
                <a
                  href={activeExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs py-1.5 px-3 bg-white text-slate-800 border-slate-300 hover:bg-slate-50 flex items-center gap-1"
                >
                  <span>Open Full Tab ↗</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleCopy(activeExternalUrl, activeTab)}
                  className="btn btn-secondary text-xs py-1.5 px-3 bg-white text-slate-800 border-slate-300 hover:bg-slate-50 flex items-center gap-1"
                >
                  {copiedType === activeTab ? (
                    <span className="text-emerald-700 font-bold">✓ Copied</span>
                  ) : (
                    <span>📋 Copy</span>
                  )}
                </button>
              </div>
            </div>

            {/* Embedded Browser Frame Display */}
            <div className="bg-slate-200/60 p-2 sm:p-4 flex items-center justify-center min-h-[550px]">
              <div
                className={`transition-all duration-300 bg-white rounded-xl shadow-md border border-slate-300 overflow-hidden ${
                  deviceViewport === 'mobile'
                    ? 'w-full max-w-[420px] h-[680px] rounded-3xl border-4 border-slate-800'
                    : 'w-full h-[620px]'
                }`}
              >
                {/* Simulated Device Header (if in mobile view) */}
                {deviceViewport === 'mobile' && (
                  <div className="bg-slate-800 px-4 py-1.5 text-[11px] font-medium text-slate-300 flex items-center justify-between">
                    <span>9:41</span>
                    <span className="flex items-center gap-1.5 text-[10px]">
                      <span>📶</span> <span>🔋 100%</span>
                    </span>
                  </div>
                )}

                <iframe
                  key={`${activeTab}-${result.searchQuery}-${result.searchLocation}-${result.countryCode}`}
                  src={activeEmbedUrl}
                  title="Localized Search Results"
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Frame Helper Bar */}
            <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
              <span className="truncate max-w-xl">
                Active Source: <code className="bg-white px-1 py-0.5 rounded border border-slate-200">{activeEmbedUrl}</code>
              </span>
              <span>
                Tip: If your browser blocks 3rd-party cookies/frames for Google, click <strong>Open Full Tab ↗</strong>
              </span>
            </div>
          </div>

          {/* Technical Accuracy & Transparency Notice */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>ℹ️</span> SEO Accuracy &amp; Location Targeting Transparency
            </div>
            <p>
              This tool formulates direct Google Search and Google Maps URLs using standard geographic parameters (<code className="text-xs">uule</code>, <code className="text-xs">gl</code>, <code className="text-xs">hl</code>, <code className="text-xs">pws=0</code>). The embedded browser pane displays the localized results directly inside the tool pane for convenient side-by-side inspection. It does <strong>not</strong> claim to simulate a physical GPS device or display fabricated rank positions. Real results may also be influenced by your active Google Account state and network provider IP.
            </p>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
