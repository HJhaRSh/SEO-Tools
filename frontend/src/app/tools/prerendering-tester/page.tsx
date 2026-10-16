'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';
import {
  USER_AGENTS,
  CATEGORY_LABELS,
  MAX_SELECTED_AGENTS,
  UserAgentDefinition,
} from '@/lib/seo/prerendering/userAgents';
import {
  AgentTestResult,
  ComparisonFieldResult,
  AuditSummary,
  PrerenderApiResponse,
} from '@/lib/seo/prerendering/types';
import { generatePrerenderCsv, generatePrerenderXlsx } from '@/lib/seo/prerendering/exporter';

export default function PrerenderingTester() {
  // URL state
  const [url, setUrl] = useState('');

  // Multi-User-Agent state
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(
    USER_AGENTS.filter((ua) => ua.isDefault).map((ua) => ua.id)
  );
  const [agentSearch, setAgentSearch] = useState('');

  // Primary Mode execution state
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [results, setResults] = useState<AgentTestResult[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonFieldResult[]>([]);

  // Raw HTML viewer state
  const [viewingHtmlAgent, setViewingHtmlAgent] = useState<AgentTestResult | null>(null);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);

  // User-Agent Selection handlers
  const toggleAgent = (id: string) => {
    setSelectionWarning(null);
    if (selectedAgentIds.includes(id)) {
      setSelectedAgentIds(selectedAgentIds.filter((item) => item !== id));
    } else {
      if (selectedAgentIds.length >= MAX_SELECTED_AGENTS) {
        setSelectionWarning(`You can select up to ${MAX_SELECTED_AGENTS} user agents per test.`);
        return;
      }
      setSelectedAgentIds([...selectedAgentIds, id]);
    }
  };

  const handleSelectAll = () => {
    const allIds = USER_AGENTS.map((ua) => ua.id);
    setSelectedAgentIds(allIds.slice(0, MAX_SELECTED_AGENTS));
  };

  const handleClearSelection = () => {
    setSelectedAgentIds([]);
  };

  const handleResetDefaults = () => {
    setSelectedAgentIds(USER_AGENTS.filter((ua) => ua.isDefault).map((ua) => ua.id));
  };

  // Primary Mode Test Submission
  const handleTestUserAgents = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    if (selectedAgentIds.length === 0) {
      setStatus('error');
      setErrorMessage('Please select at least one user agent to test.');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);
    setSummary(null);
    setResults([]);
    setComparisons([]);
    setViewingHtmlAgent(null);

    try {
      const res = await fetch('/api/seo/prerendering/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          userAgents: selectedAgentIds,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: PrerenderApiResponse | null = null;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (!res.ok || !data || !data.success) {
        const rawText = !data ? await res.text().catch(() => '') : '';
        throw new Error(data?.error || `Failed to compare responses across user agents (HTTP ${res.status}). ${rawText && rawText.length < 150 ? rawText.trim() : ''}`.trim());
      }

      setSummary(data.summary || null);
      setResults(data.results || []);
      setComparisons(data.comparisons || []);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred during multi-user-agent HTTP testing.');
    }
  };

  // Export handlers
  const handleExportCsv = () => {
    if (results.length === 0) return;
    const csvContent = generatePrerenderCsv(url, results);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `prerender-comparison-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportXlsx = async () => {
    if (results.length === 0) return;
    const xlsxBuffer = await generatePrerenderXlsx(url, results);
    const blob = new Blob([xlsxBuffer as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `prerender-comparison-${new Date().toISOString().slice(0, 10)}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyRawHtml = async (rawHtml: string) => {
    try {
      await navigator.clipboard.writeText(rawHtml);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadRawHtml = (agent: AgentTestResult) => {
    if (!agent.rawHtml) return;
    const blob = new Blob([agent.rawHtml], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${agent.userAgentId}-source.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter user agents by search query
  const filteredAgents = USER_AGENTS.filter(
    (ua) =>
      ua.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
      ua.category.toLowerCase().includes(agentSearch.toLowerCase()) ||
      ua.id.toLowerCase().includes(agentSearch.toLowerCase())
  );

  const groupedAgents = filteredAgents.reduce((acc, ua) => {
    acc[ua.category] = acc[ua.category] || [];
    acc[ua.category].push(ua);
    return acc;
  }, {} as Record<string, UserAgentDefinition[]>);

  return (
    <ToolLayout
      title="Pre-rendering Tester"
      description="Test HTTP responses and compare SEO signals across multiple user agents to detect pre-rendering, dynamic rendering, and bot-specific HTML variations."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Pre-rendering Tester' }]}
      aboutText="Search engine crawlers and social media bots may receive different HTML payloads than standard web browsers due to pre-rendering middleware (such as Prerender.io or Rendertron), dynamic rendering, or bot mitigation. This tool performs genuine HTTP requests using distinct User-Agent headers, extracts critical SEO signals (Title, Meta Description, Headings, Word count, Canonical, Robots, and MD5 fingerprints), and highlights observable discrepancies."
      howItWorks={[
        'Enter any webpage URL and choose multiple user agents (Browsers, Search Crawlers, AI Bots, Social Crawlers).',
        'The server dispatches separate, genuine HTTP requests for each selected user agent with SSRF protection and connection-level security.',
        'It captures HTTP status, redirect chains, Vary headers, and computes cryptographic MD5 and SHA-256 byte fingerprints.',
        'Extracted SEO elements (Title, Headings, Canonicals, Robots directives, Word count, Links, Images) are benchmarked side-by-side with discrepancy detection and CSV/XLSX export.',
      ]}
      faq={[
        {
          question: 'What is Pre-rendering and Dynamic Rendering?',
          answer:
            'Pre-rendering intercepts incoming crawler requests (like Googlebot or Bingbot) and returns pre-rendered static HTML, while serving a standard JavaScript Single Page App (SPA) to human browsers. This ensures search engines discover content without relying on delayed client-side script execution.',
        },
        {
          question: 'Does this tool prove dynamic cloaking or SEO manipulation?',
          answer:
            'No. Differences in raw HTML or fingerprints alone do not indicate malicious cloaking. Serving pre-rendered HTML to crawlers is an established architectural pattern when the underlying content and signals remain substantially equivalent to what human users experience.',
        },
        {
          question: 'Does selecting Googlebot guarantee real Googlebot IP verification?',
          answer:
            'No. This tool sends requests with Googlebot user-agent strings, but does not originate from Google’s verified 1e100.net IP ranges. Websites employing reverse-DNS IP verification or Cloudflare Bot Management may treat these requests differently from genuine search engine crawlers.',
        },
      ]}
    >
      <div className="card mb-8">
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>MULTI-USER-AGENT AUDIT INPUT</h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter your target webpage URL and select up to {MAX_SELECTED_AGENTS} user agents to test separate HTTP responses.
              </p>
            </div>

            <form onSubmit={handleTestUserAgents}>
              <div className="input-group">
                <label className="label">
                  Website URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://example.com/page"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              {/* USER AGENT SELECTOR */}
              <div className="mt-6 mb-4">
                {selectionWarning && (
                  <div className="mb-3 p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center justify-between">
                    <span>{selectionWarning}</span>
                    <button
                      type="button"
                      onClick={() => setSelectionWarning(null)}
                      className="ml-2 text-amber-700 dark:text-amber-400 font-bold hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                  <label className="label m-0">
                    Select User Agents ({selectedAgentIds.length}/{MAX_SELECTED_AGENTS} selected){' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleResetDefaults}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold"
                    >
                      Default Set
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold"
                    >
                      Select All ({MAX_SELECTED_AGENTS} max)
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <input
                    type="text"
                    className="input text-xs py-2"
                    placeholder="Search or filter user agents..."
                    value={agentSearch}
                    onChange={(e) => setAgentSearch(e.target.value)}
                  />
                </div>

                {/* GROUPED AGENTS CHECKBOXES */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 max-h-72 overflow-y-auto">
                  {Object.entries(groupedAgents).map(([cat, agents]) => (
                    <div key={cat} className="space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1">
                        {CATEGORY_LABELS[cat] || cat}
                      </h4>
                      {agents.map((ua) => {
                        const isChecked = selectedAgentIds.includes(ua.id);
                        return (
                          <label
                            key={ua.id}
                            className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                              isChecked
                                ? 'bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200 font-semibold border border-green-200 dark:border-green-800'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAgent(ua.id)}
                              className="mt-0.5 rounded text-green-600 focus:ring-green-500 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="block truncate">{ua.name}</span>
                              <span className="block text-[10px] text-slate-400 font-mono truncate">{ua.id}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500 mt-2 italic">
                  <strong>Technical Disclaimer:</strong> Requests use exact user-agent headers but originate from this testing application, not verified crawler IP blocks. Some bot protection systems or CDNs with IP verification may respond with HTTP 403 or human challenge pages.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={status === 'loading' || !url.trim() || selectedAgentIds.length === 0}
                style={{ width: '100%', marginTop: '16px' }}
              >
                {status === 'loading'
                  ? `Testing HTTP Responses (${selectedAgentIds.length} agents)...`
                  : `Test Pre-rendering (${selectedAgentIds.length} Agents)`}
              </button>
            </form>
          </div>

          {/* ERROR NOTICE */}
          {status === 'error' && errorMessage && (
            <div className="card mb-8 p-4 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 text-sm">
              <strong>Test Notice:</strong> {errorMessage}
            </div>
          )}

          {/* SUCCESS RESULTS SECTION */}
          {status === 'success' && summary && (
            <div className="card space-y-8 mb-8">
              {/* HEADER WITH CONTROLS */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800 }}>MULTI-USER-AGENT COMPARISON AUDIT</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Target URL: <strong className="font-mono text-slate-800 dark:text-slate-200">{url}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                    title="Export results to CSV"
                  >
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportXlsx}
                    className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                    title="Export results to Excel spreadsheet"
                  >
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export XLSX
                  </button>
                </div>
              </div>

              {/* CLASSIFICATION VERDICT BANNER */}
              <div
                className={`p-4 rounded-xl border text-sm ${
                  summary.classification === 'Same HTML Response' || summary.classification === 'Different Raw HTML, Same SEO Signals'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : summary.classification === 'Possible Pre-rendering / Dynamic Rendering'
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                    : summary.classification === 'Potential SEO Signal Conflict'
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-base">
                  <span>Audit Verdict:</span>
                  <span className="badge badge-success bg-white dark:bg-slate-800">
                    {summary.classification}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-90">{summary.classificationReason}</p>
              </div>

              {/* AUDIT SUMMARY STATS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Agents Tested</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {summary.userAgentsTested}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Successful / Failed</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    <span className="text-emerald-600">{summary.successfulResponses}</span>
                    <span className="text-slate-400 text-sm font-normal"> / </span>
                    <span className={summary.failedResponses > 0 ? 'text-rose-600' : 'text-slate-400'}>
                      {summary.failedResponses}
                    </span>
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Status Codes</p>
                  <p className="text-sm font-bold mt-1.5">
                    {summary.differentHttpStatuses ? (
                      <span className="badge badge-warning text-[10px]">Different</span>
                    ) : (
                      <span className="badge badge-success text-[10px]">Identical</span>
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Titles / Descriptions</p>
                  <p className="text-sm font-bold mt-1.5">
                    {summary.differentTitles || summary.differentMetaDescriptions ? (
                      <span className="badge badge-warning text-[10px]">Variance</span>
                    ) : (
                      <span className="badge badge-success text-[10px]">Consistent</span>
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Canonical & Robots</p>
                  <p className="text-sm font-bold mt-1.5">
                    {summary.canonicalConflicts || summary.robotsConflicts ? (
                      <span className="badge badge-error text-[10px]">Conflict</span>
                    ) : (
                      <span className="badge badge-success text-[10px]">Consistent</span>
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">HTML Byte Fingerprint</p>
                  <p className="text-sm font-bold mt-1.5">
                    {summary.rawHtmlDifferences ? (
                      <span className="badge bg-purple-100 text-purple-800 border border-purple-300 text-[10px]">
                        Differs
                      </span>
                    ) : (
                      <span className="badge badge-success text-[10px]">Identical</span>
                    )}
                  </p>
                </div>
              </div>

              {/* CORE RESULTS COMPARISON TABLE (Matching Reference TechnicalSEO tool) */}
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-3">
                  USER-AGENT RESPONSE COMPARISON TABLE
                </h3>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold whitespace-nowrap">
                        <th className="py-3 px-3.5">User Agent</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Redirect</th>
                        <th className="py-3 px-3.5">Page Title</th>
                        <th className="py-3 px-3.5">Meta Description</th>
                        <th className="py-3 px-3">H1 Headings</th>
                        <th className="py-3 px-3">Words</th>
                        <th className="py-3 px-3">Images</th>
                        <th className="py-3 px-3">Links</th>
                        <th className="py-3 px-3">Vary: UA</th>
                        <th className="py-3 px-3">MD5 Fingerprint</th>
                        <th className="py-3 px-3">Meta Robots</th>
                        <th className="py-3 px-3.5">Link Canonical</th>
                        <th className="py-3 px-3 text-center">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {results.map((row) => {
                        const isSuccess = row.status === 'success';
                        return (
                          <tr
                            key={row.userAgentId}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                              !isSuccess ? 'bg-rose-50/40 dark:bg-rose-950/10' : ''
                            }`}
                          >
                            {/* User Agent */}
                            <td className="py-3 px-3.5 whitespace-nowrap font-sans">
                              <span className="font-bold text-slate-900 dark:text-white block">
                                {row.userAgentName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">{row.userAgentId}</span>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              {isSuccess ? (
                                <span
                                  className={`badge text-[10px] ${
                                    row.statusCode === 200
                                      ? 'badge-success'
                                      : row.statusCode && row.statusCode >= 300 && row.statusCode < 400
                                      ? 'badge-warning'
                                      : 'badge-error'
                                  }`}
                                >
                                  {row.statusCode} {row.statusText || ''}
                                </span>
                              ) : (
                                <span className="badge badge-error text-[10px]">Error</span>
                              )}
                            </td>

                            {/* Redirect */}
                            <td className="py-3 px-3 max-w-[160px] truncate" title={row.finalUrl || ''}>
                              {row.redirectChain.length > 0 ? (
                                <span className="text-amber-600 font-bold">
                                  {row.redirectChain.length} hop(s)
                                </span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>

                            {/* Title */}
                            <td
                              className="py-3 px-3.5 max-w-[180px] truncate font-sans"
                              title={row.title || '(none)'}
                            >
                              {row.title ? (
                                <span className="text-slate-800 dark:text-slate-200">{row.title}</span>
                              ) : (
                                <span className="text-slate-400 italic font-sans">(none)</span>
                              )}
                            </td>

                            {/* Meta Description */}
                            <td
                              className="py-3 px-3.5 max-w-[200px] truncate font-sans"
                              title={row.metaDescription || '(none)'}
                            >
                              {row.metaDescription ? (
                                <span className="text-slate-700 dark:text-slate-300">{row.metaDescription}</span>
                              ) : (
                                <span className="text-slate-400 italic font-sans">(none)</span>
                              )}
                            </td>

                            {/* H1 */}
                            <td
                              className="py-3 px-3 max-w-[160px] truncate font-sans"
                              title={row.h1.join(' | ') || '(none)'}
                            >
                              {row.h1.length > 0 ? (
                                <span>
                                  <strong>({row.h1.length})</strong> {row.h1[0]}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">(none)</span>
                              )}
                            </td>

                            {/* Word Count */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              {row.wordCount !== null ? row.wordCount.toLocaleString() : '-'}
                            </td>

                            {/* Image Count */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              {row.imageCount !== null ? row.imageCount : '-'}
                            </td>

                            {/* Link Count */}
                            <td className="py-3 px-3 whitespace-nowrap" title={`${row.internalLinkCount || 0} int / ${row.externalLinkCount || 0} ext`}>
                              {row.linkCount !== null ? row.linkCount : '-'}
                            </td>

                            {/* Vary: User-Agent */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={`badge text-[10px] ${
                                  row.varyUserAgent === 'Present'
                                    ? 'badge-success'
                                    : row.varyUserAgent === 'Absent'
                                    ? 'badge-warning'
                                    : 'badge-neutral'
                                }`}
                              >
                                {row.varyUserAgent}
                              </span>
                            </td>

                            {/* MD5 Fingerprint */}
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px]" title={row.md5 || ''}>
                              {row.md5 ? (
                                <span className="text-slate-700 dark:text-slate-300">
                                  {row.md5.slice(0, 10)}...
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>

                            {/* Meta Robots */}
                            <td
                              className="py-3 px-3 max-w-[140px] truncate font-sans"
                              title={row.metaRobots || row.xRobotsTag || 'default (index, follow)'}
                            >
                              {row.metaRobots || row.xRobotsTag || 'default'}
                            </td>

                            {/* Canonical */}
                            <td
                              className="py-3 px-3.5 max-w-[180px] truncate font-sans"
                              title={row.canonical || '(none)'}
                            >
                              {row.canonical ? (
                                <span className="text-slate-700 dark:text-slate-300">{row.canonical}</span>
                              ) : (
                                <span className="text-slate-400 italic">(none)</span>
                              )}
                            </td>

                            {/* Source button */}
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {row.rawHtml ? (
                                <button
                                  type="button"
                                  onClick={() => setViewingHtmlAgent(row)}
                                  className="text-[11px] font-sans font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200"
                                >
                                  View HTML
                                </button>
                              ) : (
                                <span className="text-rose-500 font-sans text-[11px]">Failed</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DETAILED SIGNAL COMPARISON ENGINE FINDINGS */}
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-3">
                  DISCREPANCY DETECTION & COMPARISON SIGNALS
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisons.map((c, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-2xl border transition-all ${
                        c.status === 'different'
                          ? c.severity === 'error'
                            ? 'bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/60'
                            : 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/60'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">{c.label}</h4>
                        <span
                          className={`badge text-[10px] ${
                            c.status === 'matched'
                              ? 'badge-success'
                              : c.status === 'different'
                              ? c.severity === 'error'
                                ? 'badge-error'
                                : 'badge-warning'
                              : 'badge-neutral'
                          }`}
                        >
                          {c.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{c.explanation}</p>
                      
                      {/* Breakdown by user agent */}
                      <div className="space-y-1 text-[11px] font-mono border-t border-slate-200 dark:border-slate-800 pt-2">
                        {Object.entries(c.values).map(([agentId, val]) => (
                          <div key={agentId} className="flex justify-between gap-2 py-0.5">
                            <span className="text-slate-500 font-sans truncate">{agentId}:</span>
                            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[220px]">
                              {Array.isArray(val) ? val.join(' | ') || '(none)' : String(val ?? '(none)')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RAW HTML INSPECTOR MODAL / DRAWER */}
              {viewingHtmlAgent && (
                <div className="p-6 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-900 text-slate-100 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                    <div>
                      <h4 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Raw HTML Response:</span>
                        <span className="text-emerald-400 font-mono">{viewingHtmlAgent.userAgentName}</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        HTTP {viewingHtmlAgent.statusCode} | Byte size:{' '}
                        {((viewingHtmlAgent.htmlSize || 0) / 1024).toFixed(1)} KB | MD5:{' '}
                        <span className="font-mono">{viewingHtmlAgent.md5}</span>
                        {viewingHtmlAgent.isTruncatedSource && (
                          <span className="ml-2 text-amber-400 font-semibold">(Display truncated to first 100 KB)</span>
                        )}
                        {!viewingHtmlAgent.isHtml && (
                          <span className="ml-2 text-rose-400 font-semibold">(Non-HTML Content: {viewingHtmlAgent.contentType})</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyRawHtml(viewingHtmlAgent.rawHtml || '')}
                        className="btn btn-secondary text-xs py-1.5 px-3"
                      >
                        {copiedHtml ? 'Copied!' : 'Copy Source'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadRawHtml(viewingHtmlAgent)}
                        className="btn btn-secondary text-xs py-1.5 px-3"
                      >
                        Download HTML
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingHtmlAgent(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-300 border border-slate-800">
                    <pre className="whitespace-pre-wrap break-all">{viewingHtmlAgent.rawHtml}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
    </ToolLayout>
  );
}
