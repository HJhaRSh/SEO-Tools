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

  return (
    <ToolLayout
      title="Local Search Results Tool"
      description="Inspect geographically targeted Google Search and Google Maps queries from any location without paid APIs or cloud billing."
      category="Local SEO"
      breadcrumbs={[{ label: 'Local Search Results Tool' }]}
      aboutText="Search engine results pages (SERPs) vary significantly based on where a user searches from. Google tailors organic results, Local Map Packs, Knowledge Panels, and local business citations according to location signals. This free tool lets technical SEOs, local marketers, and business owners formulate authentic localized Google search URLs equipped with official canonical location parameters (Google UULE), country market bias (gl), language controls (hl), and reduced personalization (pws=0). All generation runs transparently on your device without paid APIs or registration."
      howItWorks={[
        "Enter your search keyword or phrase (e.g. 'best restaurants in Mumbai', 'dentist near me', 'digital marketing agency').",
        "Specify the search location (e.g. 'Mumbai, Maharashtra, India' or select from quick suggestions).",
        "Adjust advanced options if needed: target country (gl), interface language (hl), and personalization reduction (pws=0).",
        "Click 'Generate Local Search Targets'.",
        "Launch Google Search to inspect organic SERP ranking, or launch Google Maps to check Map Pack local prominence."
      ]}
      faq={[
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
          <span className="badge badge-success hidden sm:inline-flex">100% Free & No API Mandate</span>
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
            <span>🔍</span> Generate Local Search Targets
          </button>
        </form>
      </div>

      {/* SECTION 2: RESULTS SECTION */}
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
              <span className="badge badge-success text-xs">URLs Generated</span>
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

          {/* Action Launch Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Google Search Card */}
            <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-green-500/60 transition-all flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                    <span className="text-blue-600">G</span> Google Search (Localized)
                  </h3>
                  <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded">
                    SERP &amp; Organic
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  Launches Google web search parameterized with market code (<code className="text-xs">gl={result.countryCode || 'none'}</code>), interface language (<code className="text-xs">hl={result.languageCode || 'none'}</code>), and canonical location encoding (<code className="text-xs">uule</code>).
                </p>

                {/* URL preview box */}
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 mb-4 font-mono text-[11px] text-slate-700 break-all select-all max-h-24 overflow-y-auto">
                  {result.googleSearchUrl}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <a
                  href={result.googleSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary text-xs py-2.5 px-3 flex items-center justify-center gap-1.5"
                >
                  <span>Open Search ↗</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleCopy(result.googleSearchUrl, 'search')}
                  className="btn btn-secondary text-xs py-2.5 px-3 flex items-center justify-center gap-1.5"
                >
                  {copiedType === 'search' ? (
                    <span className="text-emerald-700 font-bold">✓ Copied!</span>
                  ) : (
                    <span>📋 Copy Link</span>
                  )}
                </button>
              </div>
            </div>

            {/* Google Maps Card */}
            <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-green-500/60 transition-all flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                    <span className="text-red-500">📍</span> Google Maps (Map Pack)
                  </h3>
                  <span className="text-xs bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded">
                    Maps / Local Pack
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  Opens Google Maps search centered on the geographic target query (<code className="text-xs">&quot;{result.mapsQuery}&quot;</code>) to inspect business clusters and local pack visibility without Places API billing.
                </p>

                {/* URL preview box */}
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 mb-4 font-mono text-[11px] text-slate-700 break-all select-all max-h-24 overflow-y-auto">
                  {result.googleMapsUrl}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <a
                  href={result.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs py-2.5 px-3 flex items-center justify-center gap-1.5 bg-slate-900 text-white hover:bg-black border-slate-900"
                >
                  <span>Open Maps ↗</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleCopy(result.googleMapsUrl, 'maps')}
                  className="btn btn-secondary text-xs py-2.5 px-3 flex items-center justify-center gap-1.5"
                >
                  {copiedType === 'maps' ? (
                    <span className="text-emerald-700 font-bold">✓ Copied!</span>
                  ) : (
                    <span>📋 Copy Link</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Technical Accuracy & Transparency Notice */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>ℹ️</span> SEO Accuracy &amp; Location Targeting Transparency
            </div>
            <p>
              This tool formulates direct Google Search and Google Maps URLs using standard geographic parameters (<code className="text-xs">uule</code>, <code className="text-xs">gl</code>, <code className="text-xs">hl</code>, <code className="text-xs">pws=0</code>). It is designed for manual SERP inspection and ranking appearance testing. It does <strong>not</strong> claim to simulate a physical GPS device, intercept device telemetry, or display fabricated rank positions. Real results may also be influenced by your active Google Account state and network provider IP.
            </p>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
