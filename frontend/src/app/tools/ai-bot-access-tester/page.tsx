'use client';

import React, { useState, useMemo } from 'react';
import ToolLayout from '@/components/ToolLayout';
import { AI_BOT_REGISTRY, AiBotDefinition } from '@/lib/seo/aiBotRegistry';
import { AiBotAccessBatchResponse, SingleUrlBotResult } from '@/lib/seo/aiBotTesterService';

export default function AiBotAccessTester() {
  // Input states
  const [urlsInput, setUrlsInput] = useState('');
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>(() =>
    AI_BOT_REGISTRY.filter(b => b.defaultSelected).map(b => b.id)
  );


  // Status & Results
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultData, setResultData] = useState<AiBotAccessBatchResponse | null>(null);

  // Detail Modal state
  const [activeDetail, setActiveDetail] = useState<SingleUrlBotResult | null>(null);

  // Bot Selector Search Query
  const [botSearchQuery, setBotSearchQuery] = useState('');

  // Table Filters & Search
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [botCategoryFilter, setBotCategoryFilter] = useState<string>('all');

  // Multi-select Bot helpers
  const handleToggleBot = (botId: string) => {
    setSelectedBotIds(prev =>
      prev.includes(botId) ? prev.filter(id => id !== botId) : [...prev, botId]
    );
  };

  const handleSelectAllBots = () => {
    setSelectedBotIds(AI_BOT_REGISTRY.map(b => b.id));
  };

  const handleDeselectAllBots = () => {
    setSelectedBotIds([]);
  };

  const handleSelectByCategory = (cat: string) => {
    const idsInCat = AI_BOT_REGISTRY.filter(b => b.category === cat).map(b => b.id);
    setSelectedBotIds(Array.from(new Set([...selectedBotIds, ...idsInCat])));
  };

  // Filter bots by search query (matching name or token)
  const filteredBots = useMemo(() => {
    if (!botSearchQuery.trim()) return AI_BOT_REGISTRY;
    const query = botSearchQuery.toLowerCase().trim();
    return AI_BOT_REGISTRY.filter(
      b =>
        b.name.toLowerCase().includes(query) ||
        b.token.toLowerCase().includes(query) ||
        b.provider.toLowerCase().includes(query)
    );
  }, [botSearchQuery]);

  // URL count tracker
  const enteredUrls = useMemo(() => {
    return urlsInput
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean);
  }, [urlsInput]);

  // Main Test Runner
  const handleTest = async () => {
    if (enteredUrls.length === 0) {
      setErrorMessage('Please enter at least one URL to test.');
      setStatus('error');
      return;
    }

    if (enteredUrls.length > 100) {
      setErrorMessage('Maximum 100 URLs are supported per test.');
      setStatus('error');
      return;
    }

    if (selectedBotIds.length === 0) {
      setErrorMessage('Please select at least one AI bot to test.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/seo/ai-bot-access/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: enteredUrls,
          botIds: selectedBotIds,
          checks: {
            robotsTxt: true,
            httpStatus: true,
            content: true
          }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed testing AI bot access.');
      }

      setResultData(data);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.');
      setStatus('error');
    }
  };

  // Matrix construction: Distinct URLs as rows
  const matrixUrls = useMemo(() => {
    if (!resultData) return [];
    return Array.from(new Set(resultData.results.map(r => r.url)));
  }, [resultData]);

  // Filtered Results for comparison table
  const filteredMatrixUrls = useMemo(() => {
    if (!matrixUrls.length) return [];
    return matrixUrls.filter(u => {
      if (searchFilter && !u.toLowerCase().includes(searchFilter.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [matrixUrls, searchFilter]);

  // Quick lookup helper: map of `${url}__${botId}` -> SingleUrlBotResult
  const resultMap = useMemo(() => {
    const map = new Map<string, SingleUrlBotResult>();
    if (resultData) {
      for (const item of resultData.results) {
        map.set(`${item.url}__${item.botId}`, item);
      }
    }
    return map;
  }, [resultData]);

  // CSV Export Generator
  const handleExportCSV = () => {
    if (!resultData || !resultData.results.length) return;
    const headers = [
      'URL',
      'AI Bot',
      'Provider',
      'Category',
      'Robots.txt Status',
      'Matched Rule',
      'Rule Line',
      'HTTP Status',
      'Content Status',
      'Overall Result',
      'Explanation'
    ];

    const rows = resultData.results.map(r => [
      `"${r.url.replace(/"/g, '""')}"`,
      `"${r.botName}"`,
      `"${r.botProvider}"`,
      `"${r.botCategory}"`,
      r.robotsTxt.status,
      `"${(r.robotsTxt.appliedRule?.originalText || 'None').replace(/"/g, '""')}"`,
      r.robotsTxt.appliedRule?.lineNumber ?? '',
      r.http.statusCode ? `${r.http.statusCode} ${r.http.statusText}` : r.http.statusText,
      r.content.status,
      r.summaryLabel,
      `"${r.explanation.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ai-bot-access-report-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <ToolLayout
      title="AI Bot Access Tester"
      description="Evaluate whether AI crawlers (GPTBot, ClaudeBot, Perplexity, Meta, Apple) can crawl your URLs, test simulated HTTP responses, and detect content challenges."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'AI Bot Access Tester' }]}
      fullWidth={true}
      aboutText="The AI Bot Access Tester provides a comprehensive three-layer diagnostic to determine whether artificial intelligence crawlers can discover and extract your web content. By evaluating RFC 9309 robots.txt permissions, simulating HTTP requests with verified bot user-agent identities, and analyzing HTML responses for WAF bot shields (Cloudflare Turnstile, CAPTCHAs, or 403 Forbidden pages), this tool separates policy disallows from server-level blocks. It supports testing up to 100 bulk URLs against 17 major AI crawler identities with matrix comparisons and exportable reports."
      howItWorks={[
        "Enter up to 100 URLs (one per line) across one or multiple website origins.",
        "Select which AI crawlers to test (e.g. OpenAI GPTBot, Anthropic ClaudeBot, PerplexityBot, Meta, or Google-Extended).",
        "Click 'Check AI Bot Access' to dispatch server-side tests with controlled concurrency and origin-cached robots.txt.",
        "Inspect the 3-Layer Access results: Layer 1 (Robots.txt Rule), Layer 2 (HTTP Status Code), Layer 3 (Content & WAF Challenge Detection).",
        "Click on any cell in the comparison matrix for exact rule line numbers and download your complete report in CSV format."
      ]}
      faq={[
        {
          question: "What is the difference between robots.txt access and HTTP access?",
          answer: "Robots.txt represents policy permission: it tells well-behaved crawlers whether they are allowed to request a URL. HTTP access tests actual server response: even if robots.txt allows a bot, a web server firewall (WAF), Cloudflare, or CDN rule might block the bot's user-agent with HTTP 403 or a CAPTCHA challenge."
        },
        {
          question: "What are policy-only tokens like Google-Extended and Applebot-Extended?",
          answer: "Google-Extended and Applebot-Extended are control tokens recognized exclusively in robots.txt to opt out of generative AI model training. They do not send standalone HTTP requests from separate crawler identities. For these tokens, HTTP testing is reported as Not Applicable."
        },
        {
          question: "Does an 'Allowed' result guarantee my site appears in ChatGPT or Claude answers?",
          answer: "No. Permitting crawler access allows AI companies to download and index your page, but search citations and model training inclusions depend on the provider's proprietary ranking, freshness algorithms, and licensing policies."
        }
      ]}
    >
      <div className="space-y-8 w-full">

        {/* INPUT CONFIGURATION CARD */}
        <div className="card shadow-sm border-slate-200 bg-white p-6 sm:p-8">
          <div className="border-b border-slate-200 pb-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">AI Crawler Access Evaluation</h2>
              <p className="text-base text-slate-600 mt-1">Test bulk URLs against major AI model trainers, AI search bots, and user-initiated fetchers.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold px-3 py-1.5 rounded-full border ${enteredUrls.length > 100 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-800 border-slate-300'
                }`}>
                {enteredUrls.length} / 100 URLs Entered
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* 1. URLs Multi-line Input */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="label text-base font-bold text-slate-800 m-0">
                  Target URLs to Test (One URL per line, maximum 100)
                </label>
                {enteredUrls.length > 0 && (
                  <button
                    onClick={() => setUrlsInput('')}
                    className="text-xs text-slate-500 hover:text-rose-600 font-semibold cursor-pointer"
                  >
                    Clear URLs
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                className="input font-mono text-base py-3.5 px-4 leading-relaxed"
                placeholder="https://example.com/&#10;https://example.com/blog/&#10;https://example.com/products/&#10;https://example.com/private/"
                value={urlsInput}
                onChange={(e) => setUrlsInput(e.target.value)}
                disabled={status === 'loading'}
              />
            </div>

            {/* 2. AI Bot Multi-Select Section */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <label className="label text-base font-bold text-slate-800 m-0">
                  Select AI Bots to Test ({selectedBotIds.length} of {AI_BOT_REGISTRY.length} selected)
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <button
                    onClick={handleSelectAllBots}
                    className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAllBots}
                    className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    Deselect All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => handleSelectByCategory('training')}
                    className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer"
                  >
                    + Training Bots
                  </button>
                  <button
                    onClick={() => handleSelectByCategory('search')}
                    className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                  >
                    + AI Search
                  </button>
                </div>
              </div>

              {/* Search User Agents */}
              <div className="mb-2 relative">
                <input
                  type="text"
                  placeholder="Search user-agents by name or token (e.g. GPTBot, Claude, Omgili, Semrush)..."
                  value={botSearchQuery}
                  onChange={(e) => setBotSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-green-500 font-medium"
                />
                <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                {botSearchQuery && (
                  <button
                    onClick={() => setBotSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Bot Checkboxes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 max-h-64 overflow-y-auto">
                {filteredBots.map((bot) => {
                  const isChecked = selectedBotIds.includes(bot.id);

                  return (
                    <label
                      key={bot.id}
                      className={`flex items-start gap-2.5 p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${isChecked
                        ? 'bg-white border-green-500 shadow-xs text-slate-900'
                        : 'bg-transparent border-transparent text-slate-600 hover:bg-white/80'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleBot(bot.id)}
                        className="mt-0.5 rounded text-green-600 focus:ring-green-500 cursor-pointer w-4 h-4 shrink-0"
                      />
                      <div className="truncate min-w-0">
                        <span className="block truncate font-bold text-slate-900 text-xs">
                          {bot.name}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-500 truncate">
                          {bot.token}
                        </span>
                      </div>
                    </label>
                  );
                })}
                {filteredBots.length === 0 && (
                  <div className="col-span-full py-4 text-center text-xs text-slate-500 font-medium">
                    No user agents match &quot;{botSearchQuery}&quot;
                  </div>
                )}
              </div>
            </div>



            {/* Test Button */}
            <div className="pt-2">
              <button
                className="btn btn-primary w-full py-4 text-base font-extrabold shadow-sm hover:shadow-md transition-all cursor-pointer"
                onClick={handleTest}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Testing AI Crawlers ({enteredUrls.length} URLs &times; {selectedBotIds.length} Bots = {enteredUrls.length * selectedBotIds.length} Combinations)...
                  </span>
                ) : (
                  `Check AI Bot Access (${enteredUrls.length} URLs &bull; ${selectedBotIds.length} Bots)`
                )}
              </button>
            </div>

            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
                {errorMessage}
              </div>
            )}
          </div>
        </div>

        {/* RESULTS SECTION */}
        {status === 'success' && resultData && (
          <div className="space-y-8 w-full">

            {/* KPI STAT BANNER */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="card p-5 text-center">
                <span className="text-xs uppercase font-black text-slate-500 tracking-wider">Combinations</span>
                <span className="font-black text-2xl text-slate-900 block mt-1">{resultData.summary.totalCombinations}</span>
                <span className="text-xs text-slate-500 font-medium">{resultData.summary.totalUrls} URLs &bull; {resultData.summary.totalBots} Bots</span>
              </div>

              <div className="card p-5 text-center bg-emerald-50/40 border-emerald-200">
                <span className="text-xs uppercase font-black text-emerald-700 tracking-wider">Robots Allowed</span>
                <span className="font-black text-2xl text-emerald-800 block mt-1">{resultData.summary.robotsAllowed}</span>
                <span className="text-xs text-emerald-600 font-medium">
                  {Math.round((resultData.summary.robotsAllowed / (resultData.summary.totalCombinations || 1)) * 100)}% of total
                </span>
              </div>

              <div className="card p-5 text-center bg-rose-50/40 border-rose-200">
                <span className="text-xs uppercase font-black text-rose-700 tracking-wider">Robots Blocked</span>
                <span className="font-black text-2xl text-rose-800 block mt-1">{resultData.summary.robotsBlocked}</span>
                <span className="text-xs text-rose-600 font-medium">
                  {Math.round((resultData.summary.robotsBlocked / (resultData.summary.totalCombinations || 1)) * 100)}% of total
                </span>
              </div>

              <div className="card p-5 text-center bg-blue-50/40 border-blue-200">
                <span className="text-xs uppercase font-black text-blue-700 tracking-wider">HTTP Accessible</span>
                <span className="font-black text-2xl text-blue-800 block mt-1">{resultData.summary.httpAccessible}</span>
                <span className="text-xs text-blue-600 font-medium">200 OK + Content</span>
              </div>

              <div className="card p-5 text-center bg-amber-50/40 border-amber-200">
                <span className="text-xs uppercase font-black text-amber-700 tracking-wider">Challenges/WAF</span>
                <span className="font-black text-2xl text-amber-800 block mt-1">{resultData.summary.contentChallenges}</span>
                <span className="text-xs text-amber-600 font-medium">Turnstile/CAPTCHAs</span>
              </div>

              <div className="card p-5 text-center bg-slate-50 border-slate-200">
                <span className="text-xs uppercase font-black text-slate-600 tracking-wider">HTTP Denied (403)</span>
                <span className="font-black text-2xl text-slate-800 block mt-1">{resultData.summary.httpDenied}</span>
                <span className="text-xs text-slate-500 font-medium">Server firewalls</span>
              </div>
            </div>

            {/* URL SUBMISSION & DUPLICATE REPORT BANNER */}
            {resultData.urlStats && resultData.urlStats.duplicateCount > 0 && (
              <div className="p-3.5 px-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded">URL Notice</span>
                  <span>
                    Submitted: <strong>{resultData.urlStats.submittedCount}</strong> &bull; Unique Tested: <strong>{resultData.urlStats.uniqueCount}</strong> &bull; Duplicates Removed: <strong>{resultData.urlStats.duplicateCount}</strong>
                  </span>
                </div>
                <span className="text-[11px] text-amber-700 font-normal hidden sm:inline">
                  Redundant URLs were automatically deduplicated to optimize performance.
                </span>
              </div>
            )}

            {/* URL SELECTION HEADER / TABS (If multiple URLs tested) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {matrixUrls.length > 1 ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">Tested URL:</span>
                  {matrixUrls.map((u, i) => (
                    <button
                      key={u}
                      onClick={() => setSearchFilter(u)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${(searchFilter === u || (!searchFilter && i === 0))
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                    >
                      {u.replace(/^https?:\/\//, '')}
                    </button>
                  ))}
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter('')}
                      className="text-xs text-blue-600 hover:underline font-semibold ml-1 cursor-pointer"
                    >
                      Show All
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-500">
                  Showing access diagnostic per bot
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportCSV}
                  className="btn btn-secondary text-xs px-3.5 py-2 font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Export CSV
                </button>
              </div>
            </div>

            {/* TECHNICALSEO ACCORDION / LIST DISPLAY (Matching Screenshot) */}
            {filteredMatrixUrls.map((targetUrl) => {
              // Get all bot results for this URL
              const urlResults = resultData.results.filter(r => r.url === targetUrl);
              const domain = (() => {
                try { return new URL(targetUrl).hostname; } catch { return targetUrl; }
              })();

              return (
                <div key={targetUrl} className="rounded-2xl overflow-hidden shadow-xl bg-[#1e232a] border border-[#2b323c]">

                  {/* Top Header with Favicon + Target URL */}
                  <div className="py-5 px-6 flex items-center justify-center gap-3 bg-[#191d23] border-b border-[#2b323c]">
                    <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm border border-slate-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                        alt="Favicon"
                        className="w-4 h-4 object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <span className="text-lg font-bold text-slate-200 tracking-tight font-mono truncate max-w-xl">
                      {targetUrl}
                    </span>
                  </div>

                  {/* Dark Table Matching TechnicalSEO Reference */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[#2e3744] text-[#8e9aa8] text-xs font-semibold uppercase tracking-wider">
                          <th className="py-3.5 px-6 font-semibold w-1/4">
                            <span className="inline-flex items-center gap-1 text-slate-300">
                              User Agent
                              <span className="text-[10px] text-slate-400">&uarr;</span>
                            </span>
                          </th>
                          <th className="py-3.5 px-6 font-semibold text-center w-28">
                            robots.txt
                          </th>
                          <th className="py-3.5 px-6 font-semibold w-1/4">
                            Status code
                          </th>
                          <th className="py-3.5 px-6 font-semibold w-1/3">
                            Word count / Redirect URL
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#28303d] text-sm font-medium">
                        {urlResults.map((item) => {
                          const isRobotsAllowed = item.robotsTxt.status === 'ALLOWED';
                          const isRobotsBlocked = item.robotsTxt.status === 'BLOCKED';

                          // HTTP status formatting & color
                          const statusCode = item.http.statusCode;
                          let statusColor = 'text-slate-400';
                          let statusLabel = item.http.statusText || 'N/A';

                          if (item.http.isPolicyOnly) {
                            statusColor = 'text-blue-400';
                            statusLabel = 'Policy Token';
                          } else if (statusCode) {
                            if (statusCode >= 200 && statusCode < 300) {
                              statusColor = 'text-emerald-400';
                              statusLabel = `${statusCode} OK`;
                            } else if (statusCode >= 300 && statusCode < 400) {
                              statusColor = 'text-[#eab308]'; // Amber
                              statusLabel = `${statusCode} ${item.http.statusText || 'Moved'}`;
                            } else if (statusCode >= 400 && statusCode < 500) {
                              statusColor = 'text-rose-400';
                              statusLabel = `${statusCode} ${item.http.statusText || 'Denied'}`;
                            } else if (statusCode >= 500) {
                              statusColor = 'text-rose-500';
                              statusLabel = `${statusCode} Server Error`;
                            }
                          }

                          // 4th Column Content: Redirect URL OR Word count
                          let fourthColContent: React.ReactNode = null;
                          if (item.http.finalUrl && item.http.finalUrl !== item.url) {
                            // It redirected
                            fourthColContent = (
                              <a
                                href={item.http.finalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-300 hover:text-white underline font-mono text-xs truncate block max-w-lg"
                                title={item.http.finalUrl}
                              >
                                {item.http.finalUrl}
                              </a>
                            );
                          } else if (item.content.wordCount !== undefined && item.content.wordCount > 0) {
                            fourthColContent = (
                              <span className="text-slate-300 font-medium">
                                {item.content.wordCount.toLocaleString()} words
                              </span>
                            );
                          } else if (item.http.isPolicyOnly) {
                            fourthColContent = (
                              <span className="text-slate-500 italic text-xs">
                                N/A (Policy token only)
                              </span>
                            );
                          } else if (item.http.status === 'HTTP_DENIED' || statusCode === 403) {
                            fourthColContent = (
                              <span className="text-rose-300 text-xs">
                                Access Forbidden (403)
                              </span>
                            );
                          } else if (item.content.challengeDetected) {
                            fourthColContent = (
                              <span className="text-amber-400 text-xs">
                                {item.content.challengeType || 'Bot Challenge'}
                              </span>
                            );
                          } else {
                            fourthColContent = (
                              <span className="text-slate-500 text-xs">&mdash;</span>
                            );
                          }

                          return (
                            <tr
                              key={item.botId}
                              onClick={() => setActiveDetail(item)}
                              className="hover:bg-[#252c36] transition-colors cursor-pointer group"
                              title="Click to view full 3-layer diagnostic"
                            >
                              {/* 1. User Agent Column */}
                              <td className="py-3.5 px-6 font-semibold text-slate-200">
                                <div className="flex items-center gap-2">
                                  <span>{item.botName} ({item.token})</span>
                                </div>
                              </td>

                              {/* 2. robots.txt Column */}
                              <td className="py-3.5 px-6 text-center">
                                {isRobotsAllowed ? (
                                  <span className="inline-flex items-center justify-center text-emerald-400 font-bold text-lg leading-none" title="Allowed by robots.txt">
                                    &#10003;
                                  </span>
                                ) : isRobotsBlocked ? (
                                  <span className="inline-flex items-center justify-center text-rose-500 font-bold text-base leading-none" title="Disallowed by robots.txt">
                                    &#10005;
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-xs">&mdash;</span>
                                )}
                              </td>

                              {/* 3. Status code Column */}
                              <td className="py-3.5 px-6">
                                <span className={`font-semibold ${statusColor}`}>
                                  {statusLabel}
                                </span>
                              </td>

                              {/* 4. Word count / Redirect URL Column */}
                              <td className="py-3.5 px-6">
                                <div className="flex items-center justify-between">
                                  {fourthColContent}
                                  <span className="text-[11px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                                    Details &rarr;
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* DETAIL INSPECTION MODAL */}
        {activeDetail && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">

              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase mb-1">
                    {activeDetail.botProvider} &bull; {activeDetail.botCategory}
                  </div>
                  <h3 className="text-2xl font-black text-slate-900">{activeDetail.botName} Access Report</h3>
                  <a href={activeDetail.url} target="_blank" rel="noreferrer" className="text-sm font-mono text-blue-600 hover:underline break-all mt-1 block">
                    {activeDetail.url}
                  </a>
                </div>
                <button
                  onClick={() => setActiveDetail(null)}
                  className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl font-bold cursor-pointer"
                >
                  &times;
                </button>
              </div>

              {/* 3-Layer Diagnostic Stack */}
              <div className="space-y-4">
                {/* Layer 1 */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-extrabold text-slate-500">Layer 1: robots.txt Permission</span>
                    <span className={`badge ${activeDetail.robotsTxt.status === 'ALLOWED' ? 'badge-success' : activeDetail.robotsTxt.status === 'BLOCKED' ? 'badge-error' : 'badge-warning'
                      }`}>
                      {activeDetail.robotsTxt.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800">{activeDetail.robotsTxt.explanation}</p>
                  {activeDetail.robotsTxt.appliedRule && (
                    <div className="text-xs font-mono text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                      Rule: <strong>{activeDetail.robotsTxt.appliedRule.originalText}</strong> (Line #{activeDetail.robotsTxt.appliedRule.lineNumber})
                    </div>
                  )}
                </div>

                {/* Layer 2 */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-extrabold text-slate-500">Layer 2: Simulated HTTP Request</span>
                    <span className="font-mono text-xs font-extrabold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {activeDetail.http.statusCode ? `HTTP ${activeDetail.http.statusCode}` : activeDetail.http.statusText}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {activeDetail.http.isPolicyOnly
                      ? 'Policy-only token. Does not issue independent HTTP crawler requests.'
                      : `Observed status: ${activeDetail.http.statusText} (${activeDetail.http.durationMs || 0}ms latency).`}
                  </p>
                </div>

                {/* Layer 3 */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-extrabold text-slate-500">Layer 3: Content & Challenge Detection</span>
                    <span className={`badge ${activeDetail.content.status === 'CONTENT_RETRIEVED' ? 'badge-success' : activeDetail.content.status === 'POSSIBLE_CHALLENGE' ? 'badge-warning' : 'badge-neutral'
                      }`}>
                      {activeDetail.content.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {activeDetail.content.challengeDetected
                      ? `Challenge detected: ${activeDetail.content.challengeType}. Automated access restricted.`
                      : activeDetail.content.status === 'CONTENT_RETRIEVED'
                        ? `Content retrieved successfully (${activeDetail.content.bodyLength || 0} bytes). Document title: "${activeDetail.content.title || 'Untitled'}".`
                        : 'Content analysis not applicable or failed.'}
                  </p>
                </div>
              </div>

              {/* Synthesized Reason */}
              <div className="p-4 rounded-2xl bg-slate-100 border border-slate-300">
                <span className="text-xs uppercase font-black text-slate-500 block mb-1">Synthesized Technical Verdict</span>
                <p className="text-sm font-semibold text-slate-900">{activeDetail.explanation}</p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setActiveDetail(null)}
                  className="btn btn-primary text-sm px-6 py-2.5 font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </ToolLayout>
  );
}
