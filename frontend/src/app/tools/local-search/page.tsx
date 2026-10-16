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
      aboutText="Search engine results pages (SERPs) are highly localized. What you see in New York is completely different from what a user sees in Mumbai. This tool generates verified localized search targets to help you simulate and verify your local presence without paid ranking proxies."
      howItWorks={[
        "Enter your target search query (e.g. 'best dental clinic').",
        "Specify a geographic location (City, Area, or Zip Code).",
        "Click 'Simulate Local Search'.",
        "Launch the live localized Google SERP or Google Maps direct search query in 1 click."
      ]}
      faq={[
        { question: "Why is tracking local search important?", answer: "Over 46% of all Google searches have local intent. If you have a physical storefront, ranking in the local 'Map Pack' is crucial for foot traffic." },
        { question: "Does this require Google Places API credentials?", answer: "No paid credentials are required. This tool generates direct location-biased query simulations. For automated enterprise ranking scrapes, dedicated Google Places API credentials would be required." }
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
              Google dynamically personalizes the Map Pack based on client IP, geolocation, and search history. To protect data authenticity without violating Google Terms of Service or requiring paid API mandates, use the verified localized targets below to inspect genuine Google results in real time.
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
