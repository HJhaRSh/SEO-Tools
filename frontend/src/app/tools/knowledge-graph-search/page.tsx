'use client';

import React, { useState, useMemo, useRef } from 'react';
import ToolLayout from '@/components/ToolLayout';
import {
  KnowledgeGraphEntity,
  KnowledgeGraphApiResponse,
  KnowledgeGraphErrorCode,
} from '@/lib/seo/knowledge-graph/types';
import {
  VALID_TYPES,
  VALID_LANGUAGES,
  normalizeKnowledgeGraphId,
} from '@/lib/seo/knowledge-graph/validation';
import {
  generateKnowledgeGraphCsv,
  downloadCsvFile,
} from '@/lib/seo/knowledge-graph/export';

type SearchMode = 'query' | 'id';
type SortOption = 'default' | 'score-desc' | 'score-asc' | 'name-asc' | 'name-desc';

export default function KnowledgeGraphSearch() {
  // Input states
  const [searchMode, setSearchMode] = useState<SearchMode>('query');
  const [query, setQuery] = useState('');
  const [entityId, setEntityId] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [language, setLanguage] = useState<string>('en');
  const [limit, setLimit] = useState<number>(20);
  const [prefix, setPrefix] = useState<boolean>(false);

  // Status & Response states
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorCode, setErrorCode] = useState<KnowledgeGraphErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [results, setResults] = useState<KnowledgeGraphEntity[]>([]);
  const [searchedTerm, setSearchedTerm] = useState<string>('');

  // Selected Entity Modal/Detail view
  const [selectedEntity, setSelectedEntity] = useState<KnowledgeGraphEntity | null>(null);

  // Table filtering & sorting
  const [tableFilter, setTableFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('default');

  // Copy feedback tracking
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Abort controller ref to cancel ongoing searches
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCopy = async (text: string, key: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Graceful fallback
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const trimmedQuery = query.trim();
    const trimmedId = entityId.trim();

    if (searchMode === 'query' && !trimmedQuery) {
      setStatus('error');
      setErrorCode('EMPTY_QUERY');
      setErrorMessage('Please enter an entity name or keyword to search.');
      return;
    }

    if (searchMode === 'id') {
      if (!trimmedId) {
        setStatus('error');
        setErrorCode('INVALID_REQUEST');
        setErrorMessage('Please enter a Knowledge Graph entity ID.');
        return;
      }
      const parsed = normalizeKnowledgeGraphId(trimmedId);
      if (!parsed) {
        setStatus('error');
        setErrorCode('INVALID_REQUEST');
        setErrorMessage(
          'Invalid Knowledge Graph ID format. Supported formats: /m/... (e.g. /m/0dl567) or kg:/m/... or /g/...'
        );
        return;
      }
    }

    setStatus('loading');
    setErrorCode(null);
    setErrorMessage('');
    setSelectedEntity(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload: Record<string, any> = {
        language,
        limit,
        prefix,
      };

      if (searchMode === 'query') {
        payload.query = trimmedQuery;
        if (selectedType) {
          payload.types = [selectedType];
        }
      } else {
        payload.id = trimmedId;
      }

      const res = await fetch('/api/seo/knowledge-graph/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data: KnowledgeGraphApiResponse = await res.json();

      if (!data.success) {
        setStatus('error');
        setErrorCode(data.code || 'UPSTREAM_ERROR');
        setErrorMessage(data.error || 'Failed to retrieve Knowledge Graph entities.');
        setResults([]);
        return;
      }

      setStatus('success');
      setResults(data.results || []);
      setSearchedTerm(searchMode === 'query' ? trimmedQuery : trimmedId);
      if (data.results && data.results.length > 0) {
        setSelectedEntity(data.results[0]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // Search replaced or aborted
      }
      setStatus('error');
      setErrorCode('UPSTREAM_ERROR');
      setErrorMessage(err.message || 'Network error occurred while contacting the server.');
      setResults([]);
    }
  };

  // Filtered and sorted results
  const displayedResults = useMemo(() => {
    let list = [...results];

    // Local table filter
    if (tableFilter.trim()) {
      const q = tableFilter.trim().toLowerCase();
      list = list.filter((item) => {
        const inName = item.name.toLowerCase().includes(q);
        const inDesc = item.description?.toLowerCase().includes(q) ?? false;
        const inId = item.id.toLowerCase().includes(q);
        const inMid = item.mid?.toLowerCase().includes(q) ?? false;
        const inType = item.types.some((t) => t.toLowerCase().includes(q));
        return inName || inDesc || inId || inMid || inType;
      });
    }

    // Client-side sorting
    if (sortBy === 'score-desc') {
      list.sort((a, b) => (b.resultScore ?? 0) - (a.resultScore ?? 0));
    } else if (sortBy === 'score-asc') {
      list.sort((a, b) => (a.resultScore ?? 0) - (b.resultScore ?? 0));
    } else if (sortBy === 'name-asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name-desc') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    }

    return list;
  }, [results, tableFilter, sortBy]);

  const handleExportCsv = () => {
    if (displayedResults.length === 0) return;
    const csvContent = generateKnowledgeGraphCsv(displayedResults);
    const dateStr = new Date().toISOString().split('T')[0];
    const sanitizedTerm = (searchedTerm || 'search').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadCsvFile(csvContent, `knowledge-graph-${sanitizedTerm}-${dateStr}.csv`);
  };

  return (
    <ToolLayout
      title="Knowledge Graph Search"
      description="Search and inspect Google Knowledge Graph entities, schema types, MIDs, and API relevance scores."
      category="Search Appearance & Structured Data"
      breadcrumbs={[{ label: 'Knowledge Graph Search' }]}
      aboutText="Google's Knowledge Graph organizes information about real-world entities (people, places, organizations, things). This tool connects directly to Google's official Knowledge Graph Search API, allowing SEOs and content strategists to inspect recognized entities, verify Freebase/Wikidata Machine Identifiers (MIDs), inspect Schema.org entity categories, and evaluate API match scores."
      howItWorks={[
        "Choose 'Search by Name' to find an entity by its name, or 'Search by Entity ID' if you already have an ID.",
        "How to get an Entity ID: Just use the 'Search by Name' tab above! Type your brand or name, and if Google recognizes it, you'll see the Entity ID in the results.",
        "You can also find an Entity ID on Wikidata.org by searching your brand and looking for 'Google Knowledge Graph ID'.",
        "Optional: Filter results by category (Organization, Person, Place, etc.) and language.",
        "Click 'Search' to view entity details, official IDs, descriptions, and download results as CSV."
      ]}
      faq={[
        {
          question: "How do I find an entity's Google Knowledge Graph ID (MID)?",
          answer: "The easiest way is to use the 'Search by Name' tab right here in this tool! Just type in your brand, company, or person name. If Google has recognized your entity, this tool will find and show your official Entity ID (like /m/045c7b or /g/11b6tq5_3y). You can also search your brand on Wikidata.org and look for the 'Google Knowledge Graph ID' field."
        },
        {
          question: "What is an Entity ID (MID)?",
          answer: "An Entity ID (also called a Machine ID or MID) is a unique permanent ID that Google assigns to a real-world person, company, place, or brand. It usually starts with /m/ or /g/."
        },
        {
          question: "What does the API Relevance Score mean?",
          answer: "The resultScore is a number from Google indicating how closely an entity matched what you searched for. It is an internal match score, not an SEO ranking or domain authority score."
        },
        {
          question: "What if my entity doesn't show up in search?",
          answer: "If Google doesn't return an Entity ID for your brand, that means Google hasn't officially recognized it as an entity yet. You can help Google recognize your brand by adding Schema markup (Organization or Person) to your website, creating a Wikidata page, and getting consistent mentions on trusted websites."
        },
        {
          question: "Why does the tool show 'Google Knowledge Graph API credentials are not configured'?",
          answer: "The tool makes genuine server-side calls to Google's Knowledge Graph Search API. To enable live lookups, set the GOOGLE_KG_API_KEY environment variable in your Vercel project settings or .env.local."
        }
      ]}
    >
      {/* Search Input Card */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>SEARCH PARAMETERS</h2>
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setSearchMode('query')}
                className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  searchMode === 'query'
                    ? 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Search by Name
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('id')}
                className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  searchMode === 'id'
                    ? 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Search by Entity ID
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSearch}>
          {searchMode === 'query' ? (
            <div className="space-y-4">
              <div className="input-group">
                <label className="label">Search Entity Name or Keyword</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Indian Marketers, Sundar Pichai, Taj Mahal, Apple"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={300}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="label text-sm">Entity Type</label>
                  <select
                    className="select"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="">All Types (Default)</option>
                    {VALID_TYPES.filter((t) => t !== '').map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label text-sm">Language</label>
                  <select
                    className="select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {VALID_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label text-sm">Result Limit</label>
                  <select
                    className="select"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  >
                    <option value={10}>10 Entities</option>
                    <option value={20}>20 Entities (Default)</option>
                    <option value={50}>50 Entities</option>
                    <option value={100}>100 Entities (Max)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end pb-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={prefix}
                      onChange={(e) => setPrefix(e.target.checked)}
                      className="rounded border-slate-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Prefix match query</span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="input-group">
                <label className="label">Google Knowledge Graph ID or MID</label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="e.g. /m/0dl567 or kg:/m/02jx1"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Valid formats: <code>/m/...</code>, <code>/g/...</code>, <code>kg:/m/...</code>
                </p>
              </div>

              {/* Simple Guide: How to find an Entity ID */}
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200 text-sm">
                  <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  How to find your Entity ID:
                </div>
                <div className="text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    <strong>1. Use this tool (Easiest):</strong> Switch to the{' '}
                    <button
                      type="button"
                      onClick={() => setSearchMode('query')}
                      className="text-green-700 dark:text-green-400 font-bold underline hover:no-underline cursor-pointer"
                    >
                      Search by Name
                    </button>{' '}
                    tab above. Type your brand or name and click Search. If Google recognizes it, your Entity ID will appear in the results.
                  </p>
                  <p>
                    <strong>2. From Wikidata:</strong> Go to <span className="font-semibold text-slate-800 dark:text-slate-200">Wikidata.org</span>, search for your company or person, and look for the item called <strong>&quot;Google Knowledge Graph ID&quot;</strong>.
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                    💡 <em>Don&apos;t see your entity? That means Google hasn&apos;t added your brand to its Knowledge Graph yet. Adding Schema markup to your website and creating a Wikidata page helps Google recognize your entity.</em>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label text-sm">Language</label>
                  <select
                    className="select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {VALID_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === 'loading'}
            style={{ width: '100%', marginTop: '24px' }}
          >
            {status === 'loading' ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  ></path>
                </svg>
                Querying Google Knowledge Graph...
              </span>
            ) : (
              'Search Knowledge Graph'
            )}
          </button>
        </form>
      </div>

      {/* Error & Truthful Config Notice */}
      {status === 'error' && (
        <div className="card mb-8 border-l-4 border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-400 rounded-lg shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-rose-900 dark:text-rose-200 text-base mb-1">
                {errorCode === 'PROVIDER_NOT_CONFIGURED'
                  ? 'Google Knowledge Graph API Credentials Required'
                  : errorCode === 'RATE_LIMITED'
                  ? 'Request Quota Reached'
                  : 'Search Request Error'}
              </h3>
              <p className="text-sm text-rose-700 dark:text-rose-300 leading-relaxed">
                {errorMessage}
              </p>
              {errorCode === 'PROVIDER_NOT_CONFIGURED' && (
                <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900 text-xs text-slate-700 dark:text-slate-300 font-mono">
                  Setup Step: Add <code>GOOGLE_KG_API_KEY=&quot;your_api_key&quot;</code> to your Vercel or local environment variables, then enable &quot;Knowledge Graph Search API&quot; in Google Cloud Console.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results Section */}
      {status === 'success' && (
        <div className="space-y-8">
          {/* Active Entity Highlight Card */}
          {selectedEntity ? (
            <div className="card">
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }} className="flex items-center justify-between">
                <h2 style={{ fontSize: '18px', fontWeight: 800 }}>ENTITY RESULT DETAILS</h2>
                {selectedEntity.resultScore !== null && (
                  <span className="badge badge-neutral text-xs">
                    Match Score: {selectedEntity.resultScore.toLocaleString()}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                {/* Entity Image / Fallback */}
                <div
                  style={{
                    flexShrink: 0,
                    width: '130px',
                    height: '130px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: 'var(--radius-md, 12px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border-color)',
                    overflow: 'hidden',
                  }}
                >
                  {selectedEntity.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedEntity.image}
                      alt={selectedEntity.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Safe fallback on image load failure
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.parentElement) {
                          e.currentTarget.parentElement.innerHTML = `<span style="color:var(--text-muted);font-size:12px;text-align:center;">Image<br/>Unavailable</span>`;
                        }
                      }}
                    />
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
                      No Image<br />Provided
                    </span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <h3 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary-color)' }}>
                      {selectedEntity.name}
                    </h3>
                  </div>

                  {/* Schema Types */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {selectedEntity.types.length > 0 ? (
                      selectedEntity.types.map((type) => (
                        <span key={type} className="badge badge-neutral">
                          {type}
                        </span>
                      ))
                    ) : (
                      <span className="badge badge-neutral">Thing</span>
                    )}
                  </div>

                  {/* Description */}
                  <p style={{ color: 'var(--text-main)', marginBottom: '16px', lineHeight: 1.6 }}>
                    {selectedEntity.detailedDescription ||
                      selectedEntity.description ||
                      'No detailed description returned by Google Knowledge Graph for this entity.'}
                  </p>

                  {/* Key Entity Attributes Grid */}
                  <div style={{ display: 'grid', gap: '10px', fontSize: '14px' }}>
                    {selectedEntity.website && (
                      <div className="flex items-center flex-wrap gap-2">
                        <span style={{ width: '160px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Official Website:
                        </span>
                        <a
                          href={selectedEntity.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:underline break-all"
                        >
                          {selectedEntity.website}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedEntity.website || '', 'website')}
                          className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                        >
                          {copiedKey === 'website' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    )}

                    {selectedEntity.mid && (
                      <div className="flex items-center flex-wrap gap-2">
                        <span style={{ width: '160px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Google MID:
                        </span>
                        <code style={{ background: 'var(--bg-color)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                          {selectedEntity.mid}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedEntity.mid || '', 'mid')}
                          className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                        >
                          {copiedKey === 'mid' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center flex-wrap gap-2">
                      <span style={{ width: '160px', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Knowledge Graph ID:
                      </span>
                      <code style={{ background: 'var(--bg-color)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        {selectedEntity.id}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedEntity.id, 'id')}
                        className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                      >
                        {copiedKey === 'id' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>

                    {selectedEntity.sourceUrl && (
                      <div className="flex items-center flex-wrap gap-2">
                        <span style={{ width: '160px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Wikipedia Source:
                        </span>
                        <a
                          href={selectedEntity.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:underline break-all text-xs"
                        >
                          {selectedEntity.sourceUrl}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card text-center py-10">
              <p className="text-slate-500 font-medium">
                No matching entities were returned for this search.
              </p>
            </div>
          )}

          {/* Results Table & Controls */}
          {results.length > 0 && (
            <div className="card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Returned Entities ({displayedResults.length} of {results.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Results returned directly from Google Knowledge Graph API.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="btn btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Table Search & Sort Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Filter returned entities by name, type, or ID..."
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  className="input py-2 text-sm"
                />

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="select py-2 text-sm"
                >
                  <option value="default">Default Order (API Relevance)</option>
                  <option value="score-desc">Match Score: Highest First</option>
                  <option value="score-asc">Match Score: Lowest First</option>
                  <option value="name-asc">Entity Name: A to Z</option>
                  <option value="name-desc">Entity Name: Z to A</option>
                </select>
              </div>

              {/* Responsive Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3.5">Entity</th>
                      <th className="p-3.5">Types</th>
                      <th className="p-3.5">MID / ID</th>
                      <th className="p-3.5">Match Score</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {displayedResults.map((entity) => {
                      const isSelected = selectedEntity?.id === entity.id;
                      return (
                        <tr
                          key={entity.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                            isSelected ? 'bg-green-50/60 dark:bg-green-950/20' : ''
                          }`}
                        >
                          <td className="p-3.5">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {entity.name}
                            </div>
                            {entity.description && (
                              <div className="text-xs text-slate-500 line-clamp-1 max-w-xs sm:max-w-md">
                                {entity.description}
                              </div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {entity.types.slice(0, 2).map((t) => (
                                <span
                                  key={t}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                                >
                                  {t}
                                </span>
                              ))}
                              {entity.types.length > 2 && (
                                <span className="text-[11px] text-slate-500 font-medium">
                                  +{entity.types.length - 2}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                              {entity.mid || entity.id}
                            </code>
                          </td>
                          <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">
                            {entity.resultScore !== null
                              ? entity.resultScore.toLocaleString()
                              : 'Not provided'}
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleCopy(entity.mid || entity.id, `table-${entity.id}`)}
                                className="text-xs px-2.5 py-1 rounded font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                {copiedKey === `table-${entity.id}` ? 'Copied' : 'Copy MID'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedEntity(entity)}
                                className={`text-xs px-2.5 py-1 rounded font-semibold cursor-pointer ${
                                  isSelected
                                    ? 'bg-green-600 text-white'
                                    : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {isSelected ? 'Viewing' : 'Inspect'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolLayout>
  );
}
