'use client';

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
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
      title="Free Google Knowledge Graph Search & Checker"
      description="Use Indian Marketers' free Google Knowledge Graph Search tool to find entities such as businesses, people and places. Search by name or entity ID, explore available Schema.org types, view Google Knowledge Graph identifiers and inspect API relevance scores."
      category="Search Appearance"
      breadcrumbs={[{ label: 'Knowledge Graph Search' }]}
      aboutTitle="What Is Google Knowledge Graph Search?"
      aboutText={
        <div className="space-y-4">
          <p>
            <strong>Google Knowledge Graph Search</strong> allows SEO professionals, marketers, and researchers to query Google&apos;s entity database directly. Google&apos;s Knowledge Graph understands real-world entities—including companies, people, places, creative works, and organizations—as interconnected concepts rather than isolated strings of text.
          </p>
          <p>
            Our free <strong>Knowledge Graph Checker</strong> connects directly to Google&apos;s official Knowledge Graph Search API. It enables you to search by entity name or exact Machine Identifier (MID), inspect recognized Schema.org entity categories, examine entity descriptions, and evaluate API match relevance scores without writing custom API scripts.
          </p>
          <div className="p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/70 text-xs text-slate-600 dark:text-slate-300">
            <strong>Entity SEO note:</strong> This tool retrieves matching entity records returned by Google&apos;s public API. An API entity match confirms record presence but is distinct from a Google Knowledge Panel, which is an algorithmic search feature generated on organic search results pages.
          </div>
        </div>
      }
      howItWorksTitle="How to Search Google Knowledge Graph Entities"
      howItWorks={[
        "Choose your search mode: select 'Search by Name' to look up entities by brand or keyword, or 'Search by Entity ID' if you have a Machine ID (/m/ or /g/).",
        "Enter your entity query or ID: input the natural language name (e.g. 'Sundar Pichai', 'Apple') or a formatted MID (e.g. '/m/045c7b').",
        "Refine search parameters: optionally restrict by Schema.org entity type (Organization, Person, Place, LocalBusiness, etc.), language code, and result limit.",
        "Enable prefix matching if needed: check 'Prefix match query' to find matching entities that begin with your entered keyword characters.",
        "Click 'Search Knowledge Graph': inspect returned entity records, copy verified entity IDs, review API relevance scores, or click 'Export CSV' for offline analysis."
      ]}
      relatedTools={[
        { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate Organization or Person JSON-LD markup referencing your official Google Entity MID.' },
        { name: 'Schema Checker', href: '/tools/schema-checker', desc: 'Audit your live pages to confirm that entity structured data is detected in source HTML.' },
        { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how brand entity titles and descriptions appear in desktop and mobile Google search.' }
      ]}
      extraSections={
        <div className="space-y-8">
          {/* Section: What Information Does Our Knowledge Graph Checker Display? */}
          <section>
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">
                What Information Does Our Knowledge Graph Checker Display?
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl">
                <h3 className="text-base font-bold text-[var(--im-heading)] mb-2">
                  Entity Identifiers &amp; Machine IDs (/m/ and /g/)
                </h3>
                <p className="text-sm text-[var(--im-text)] leading-relaxed">
                  Every entity in Google&apos;s Knowledge Graph is indexed with an alphanumeric Machine Identifier (MID). Legacy entities originating from Freebase feature <code>/m/</code> prefixes, whereas newer entries assigned natively within Google use <code>/g/</code>. These identifiers uniquely reconcile entities across languages and disambiguate identically named organizations, people, or products.
                </p>
              </div>

              <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl">
                <h3 className="text-base font-bold text-[var(--im-heading)] mb-2">
                  Schema.org Entity Types
                </h3>
                <p className="text-sm text-[var(--im-text)] leading-relaxed">
                  Google classifies Knowledge Graph entities into standardized Schema.org categories, such as <code>Organization</code>, <code>Person</code>, <code>Place</code>, or <code>LocalBusiness</code>. Note that these categories reflect Google&apos;s entity classification rather than validating whether the entity&apos;s website currently contains structured data markup.
                </p>
              </div>

              <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl">
                <h3 className="text-base font-bold text-[var(--im-heading)] mb-2">
                  Entity Descriptions &amp; Source URLs
                </h3>
                <p className="text-sm text-[var(--im-text)] leading-relaxed">
                  Returned entity cards display short descriptive summaries, detailed descriptions, official websites, and authoritative reference links (such as Wikipedia or Wikidata). When available, high-resolution thumbnail images indexed by Google are rendered with safe fallback handling.
                </p>
              </div>

              <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl">
                <h3 className="text-base font-bold text-[var(--im-heading)] mb-2">
                  Google API Relevance Scores (resultScore)
                </h3>
                <p className="text-sm text-[var(--im-text)] leading-relaxed">
                  The API <code>resultScore</code> represents how closely the returned record matches your specific search parameters within Google&apos;s query processing algorithm. It is strictly an API retrieval relevance metric—it is not an organic search ranking factor, Domain Authority score, or Knowledge Panel guarantee.
                </p>
              </div>
            </div>
          </section>

          {/* Section: Google Knowledge Graph vs Google Knowledge Panels */}
          <section className="p-5 sm:p-6 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-2xl sm:rounded-3xl">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)] mb-3">
              Google Knowledge Graph vs Google Knowledge Panels
            </h2>
            <p className="text-sm sm:text-base text-[var(--im-text)] leading-relaxed mb-4">
              Understanding the difference between the <strong>Google Knowledge Graph</strong> and a <strong>Google Knowledge Panel</strong> is vital for entity SEO strategy:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[var(--im-text)]">
              <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-[var(--im-border)]">
                <h4 className="font-bold text-[var(--im-heading)] mb-1.5">Google Knowledge Graph (Underlying Database)</h4>
                <p className="leading-relaxed text-xs sm:text-sm">
                  The Knowledge Graph is Google&apos;s foundational semantic database containing billions of facts, attributes, and relationships. Entities can exist in the Knowledge Graph and be accessible via the API without ever appearing in a dedicated visual panel on search results pages.
                </p>
              </div>
              <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-[var(--im-border)]">
                <h4 className="font-bold text-[var(--im-heading)] mb-1.5">Google Knowledge Panel (SERP Feature)</h4>
                <p className="leading-relaxed text-xs sm:text-sm">
                  A Knowledge Panel is a visual information card displayed on the right-hand side (desktop) or top (mobile) of organic search results. Google algorithmically decides whether to show a Knowledge Panel based on query intent, brand prominence, and user location.
                </p>
              </div>
            </div>
          </section>

          {/* Section: Practical Use Cases */}
          <section>
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">
                Practical Use Cases for Entity SEO and Research
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl">
                <h3 className="text-base font-bold text-[var(--im-heading)] mb-2">
                  1. Entity Reconciliation &amp; Disambiguation
                </h3>
                <p className="text-sm text-[var(--im-text)] leading-relaxed">
                  Confirm how Google categorizes your brand name against similarly named companies worldwide, and retrieve the exact Machine ID for precise entity disambiguation.
                </p>
              </div>

              <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl">
                <h3 className="text-base font-bold text-[var(--im-heading)] mb-2">
                  2. SameAs Schema Building
                </h3>
                <p className="text-sm text-[var(--im-text)] leading-relaxed">
                  Use discovered entity IDs to link your website&apos;s JSON-LD markup to Google&apos;s entity node using our{' '}
                  <Link href="/tools/schema-generator" className="text-[var(--im-primary-deep)] font-semibold hover:underline">
                    Schema Markup Generator
                  </Link>
                  . Validate your on-page markup with our{' '}
                  <Link href="/tools/schema-checker" className="text-[var(--im-primary-deep)] font-semibold hover:underline">
                    Bulk Schema Checker
                  </Link>
                  .
                </p>
              </div>

              <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl">
                <h3 className="text-base font-bold text-[var(--im-heading)] mb-2">
                  3. SERP &amp; Identity Monitoring
                </h3>
                <p className="text-sm text-[var(--im-text)] leading-relaxed">
                  Monitor entity match scores across target languages and evaluate how brand descriptions align with your organic search listings using our{' '}
                  <Link href="/tools/serp-simulator" className="text-[var(--im-primary-deep)] font-semibold hover:underline">
                    SERP Simulator
                  </Link>
                  .
                </p>
              </div>
            </div>
          </section>
        </div>
      }
      faq={[
        {
          question: "How do I find an entity's Google Knowledge Graph ID (MID)?",
          answer: "To find an entity's Knowledge Graph identifier using this tool, select the 'Search by Name' tab, enter the brand, company, or individual name, and click 'Search Knowledge Graph'. If a matching entity record is returned by Google's API, its Machine Identifier (such as /m/045c7b or /g/11b6tq5_3y) is displayed alongside its name, types, and description. You can also cross-reference entity IDs on Wikidata by checking the 'Google Knowledge Graph ID' statement on a corresponding item."
        },
        {
          question: "What is an Entity ID (MID) and what do /m/ and /g/ mean?",
          answer: "An Entity ID (or Machine Identifier / MID) is a unique alphanumeric identifier Google uses to reference specific entities in its Knowledge Graph database. Identifiers starting with '/m/' originated in the legacy Freebase database, while identifiers starting with '/g/' are newer records created directly within Google's Knowledge Graph. They distinguish entities with identical or similar names, such as distinguishing Apple the corporation from apple the fruit."
        },
        {
          question: "What is the difference between Google Knowledge Graph and a Knowledge Panel?",
          answer: "Google's Knowledge Graph is an underlying database containing billions of facts about real-world entities and their relationships. A Google Knowledge Panel is a visual search result box that may appear on Google Search engine results pages (SERPs) when users search for a well-recognized entity. Having an entity record in the Knowledge Graph does not guarantee that Google will display a public Knowledge Panel for any particular query."
        },
        {
          question: "Does finding an Entity ID guarantee a Google Knowledge Panel?",
          answer: "No. Finding a matching entity record and ID in Google's Knowledge Graph Search API confirms that Google has a record of the entity in its database, but it does not guarantee that a Knowledge Panel will be shown in search results. Knowledge Panel generation depends on search query intent, user location, algorithmic confidence, and search relevance."
        },
        {
          question: "What does Google's API Relevance Score (resultScore) mean?",
          answer: "The resultScore is a numerical value returned by Google's Knowledge Graph Search API indicating how closely an entity record matched the query parameters under the API's scoring criteria. It is purely an API query-match score—not a Google Search ranking factor, Domain Authority metric, Knowledge Panel eligibility threshold, or overall measure of brand reputation."
        },
        {
          question: "Why might a brand or business be missing from Knowledge Graph search results?",
          answer: "If a query returns no matching entity records, Google's public API may not have a record matching the exact term, selected type filter, or language. An absent API result does not conclusively prove that Google has no understanding of the entity. You can test alternate brand names, broader entity categories, or check related authoritative registries like Wikidata."
        },
        {
          question: "Can Schema.org structured data help Google recognize my entity?",
          answer: "Yes. Adding valid Schema.org structured data (such as Organization, LocalBusiness, or Person) to your website helps search engine crawlers understand your brand's official name, website, social profiles, and core identity. While schema markup provides clear machine-readable context, it does not guarantee Knowledge Graph inclusion, an immediate Entity ID, or higher organic rankings."
        },
        {
          question: "Is Indian Marketers' Google Knowledge Graph Search tool free to use?",
          answer: "Yes. The Google Knowledge Graph Search & Checker on Indian Marketers is completely free to use with no account creation or subscription required. You can search by entity name, look up specific MIDs, inspect Schema.org types, filter by language, and export entity results to CSV."
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
                    💡 <em>Don&apos;t see your entity? The API may not return a match for the exact query or filters. Try broader entity types or alternate names. Structured data and authoritative references help search engines understand entity relationships over time.</em>
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
              <div className="overflow-x-auto touch-scroll rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm min-w-[500px]">
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
