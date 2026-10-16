'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function LocalSearchTool() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [submittedQuery, setSubmittedQuery] = useState<{ query: string; location: string } | null>(null);

  const handleTest = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setStatus('loading');
    setSubmittedQuery({ query: query.trim(), location: location.trim() });
    setStatus('success');
  };

  const fullSearchQuery = submittedQuery
    ? [submittedQuery.query, submittedQuery.location].filter(Boolean).join(' ')
    : '';

  const googleSearchUrl = fullSearchQuery
    ? `https://www.google.com/search?q=${encodeURIComponent(fullSearchQuery)}`
    : '';

  const googleMapsUrl = fullSearchQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullSearchQuery)}`
    : '';

  return (
    <ToolLayout
      title="Local Search Tool"
      description="Simulate local search queries and inspect localized search engine results for specific locations."
      category="Local SEO"
      breadcrumbs={[{ label: 'Local Search Tool' }]}
      aboutText="This tool formulates direct location-targeted search queries to inspect how Google serves results when a specific geographic modifier is appended. Note: This tool generates targeted search links and location-biased queries; it does NOT simulate client-side GPS coordinates, retrieve automated rank-tracking positions, or scrape Google Maps in violation of access restrictions."
      howItWorks={[
        "Enter your target search query (e.g. 'best dental clinic').",
        "Specify a geographic location (City, Area, or Postal Code).",
        "Click 'Generate Local Search Links'.",
        "Open live Google Search or Google Maps localized queries in your browser to inspect actual ranking appearance."
      ]}
      faq={[
        { question: "Does this simulate exact searcher GPS location?", answer: "No. This tool generates location-biased search queries. Google combines GPS, Wi-Fi data, IP address, and query intent to determine local results. Appending a specific location modifier allows you to test localized queries without fabricated ranking data." },
        { question: "Does this perform automated rank tracking?", answer: "No. This tool is a localized query launcher and simulator. Automated SERP tracking requires specialized proxies or paid APIs (e.g. Google Places API with billing enabled)." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>INPUT SECTION</h2>
        </div>
        
        <form onSubmit={handleTest} className="space-y-4">
          <div className="input-group">
            <label className="label">Search Query <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="input"
              placeholder="e.g. best restaurants, dentist near me"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
          </div>
          
          <div className="input-group">
            <label className="label">Geographic Location / City</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Mumbai, Indiranagar Bengaluru, 400050"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          
          <button 
            type="submit"
            className="btn btn-primary" 
            disabled={!query.trim()}
            style={{ width: '100%', marginTop: '16px' }}
          >
            Simulate Local Search
          </button>
        </form>
      </div>

      {status === 'success' && submittedQuery && (
        <div className="card space-y-6">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>LOCALIZED SEARCH TARGETS</h2>
            <p className="text-xs text-slate-500 mt-1">
              Active Query: <strong className="text-slate-800 dark:text-slate-200">{fullSearchQuery}</strong>
            </p>
          </div>

          {/* Configuration & Honesty Notice */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-sm">
              <span>📍</span> Local Simulation Information
            </div>
            <p className="leading-relaxed">
              This tool formulates search links with location parameters and opens external Google Search and Google Maps queries. It does not simulate exact searcher GPS location, track automated local rankings, or guarantee the exact layout seen by a user physically situated in that city.
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3">
              <div className="font-black text-slate-900 dark:text-white text-base">
                Google Search (Localized)
              </div>
              <p className="text-xs text-slate-500">
                Opens Google organic web search with location intent &quot;{fullSearchQuery}&quot;.
              </p>
              <a
                href={googleSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary text-xs py-2.5 px-4 w-full inline-flex items-center justify-center gap-2"
              >
                <span>Launch Local Google Search ↗</span>
              </a>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3">
              <div className="font-black text-slate-900 dark:text-white text-base">
                Google Maps (Map Pack View)
              </div>
              <p className="text-xs text-slate-500">
                Opens Google Maps localized map pack view centered on &quot;{submittedQuery.location || submittedQuery.query}&quot;.
              </p>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary text-xs py-2.5 px-4 w-full inline-flex items-center justify-center gap-2"
              >
                <span>Launch Google Maps Search ↗</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
