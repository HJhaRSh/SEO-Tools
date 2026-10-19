'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';
import {
  MobileFirstAuditResponse,
  DiscrepancySeverity,
  ParityStatus,
} from '@/lib/seo/mobile-first/types';
import {
  generateMobileFirstCsv,
  generateMobileFirstXlsx,
} from '@/lib/seo/mobile-first/exporter';

export default function MobileFirstIndexPage() {
  const [url, setUrl] = useState('');
  const [mobileUrl, setMobileUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [profile, setProfile] = useState<'googlebot' | 'chrome'>('googlebot');

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [auditData, setAuditData] = useState<MobileFirstAuditResponse | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'crawling' | 'content' | 'links-images' | 'schema' | 'hreflang'>('overview');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | DiscrepancySeverity>('ALL');

  const handleTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setStatus('loading');
    setErrorMessage(null);
    setAuditData(null);

    try {
      const res = await fetch('/api/seo/mobile-first-index/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          mobileUrl: mobileUrl.trim() || undefined,
          profile,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to execute mobile-first index audit.');
      }

      setAuditData(data);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred while auditing mobile-first parity.');
    }
  };

  const handleExportCsv = () => {
    if (!auditData) return;
    const csvContent = generateMobileFirstCsv(auditData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `mobile-first-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportXlsx = async () => {
    if (!auditData) return;
    const xlsxBuffer = await generateMobileFirstXlsx(auditData);
    const blob = new Blob([xlsxBuffer as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `mobile-first-audit-${new Date().toISOString().slice(0, 10)}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (s: ParityStatus) => {
    switch (s) {
      case 'Match':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Match</span>;
      case 'Critical':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">Critical</span>;
      case 'Warning':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Warning</span>;
      case 'Difference':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">Difference</span>;
      case 'Both Missing':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Both Missing</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">N/A</span>;
    }
  };

  const getSeverityBadge = (sev: DiscrepancySeverity) => {
    switch (sev) {
      case 'Critical':
        return <span className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-rose-600 text-white">Critical</span>;
      case 'High':
        return <span className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-orange-500 text-white">High</span>;
      case 'Medium':
        return <span className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-amber-500 text-white">Medium</span>;
      case 'Low':
        return <span className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-blue-500 text-white">Low</span>;
      default:
        return <span className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-slate-500 text-white">Info</span>;
    }
  };

  const filteredDiscrepancies = auditData
    ? severityFilter === 'ALL'
      ? auditData.discrepancies
      : auditData.discrepancies.filter((d) => d.severity === severityFilter)
    : [];

  return (
    <ToolLayout
      title="Mobile-First Index Tool"
      description="Perform technical SEO parity audits comparing desktop and mobile responses to prevent ranking drops under Google's mobile-first indexing."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Mobile-First Index Tool' }]}
      aboutText="Google indexes and ranks webpages using Googlebot Smartphone. If your mobile version strips structured data, alters canonical URLs, hides content, or removes internal links compared to your desktop site, your search rankings will suffer. This tool performs genuine, independent crawls of both desktop and mobile versions to inspect crawlability, canonicals, content, headings, links, images, structured data, and hreflang annotations."
      howItWorks={[
        "Enter your webpage URL (and optionally a separate mobile URL if your site operates an m-dot domain).",
        "The server initiates two independent, secure HTTP crawls using verified Desktop Googlebot and Googlebot Smartphone user agents.",
        "Robots.txt rules are independently fetched and evaluated for both desktop and mobile origins under RFC 9309.",
        "SEO signals (titles, descriptions, H1s, text word counts, canonicals, schema JSON-LD, images, and links) are extracted and compared.",
        "A side-by-side comparison matrix and prioritized discrepancy report highlight issues that impact indexing.",
        "Export the complete audit report as an RFC 4180 CSV or formatted multi-worksheet XLSX spreadsheet."
      ]}
      faq={[
        {
          question: "What is Google Mobile-First Indexing?",
          answer: "Mobile-first indexing means Google predominantly uses the mobile version of a webpage's content for indexing and ranking. Previously, the desktop version was used. Today, if content or structured data exists only on your desktop version, Google will not index it."
        },
        {
          question: "Does changing the User-Agent header make requests come from Googlebot IPs?",
          answer: "No. This tool sends custom HTTP requests using Googlebot's official User-Agent header string to inspect the markup your server returns to mobile search engine crawlers. It does not originate from verified Google IP addresses."
        },
        {
          question: "How should canonical and alternate tags be configured for separate mobile (m-dot) sites?",
          answer: "According to Google's official guidelines, the desktop page must declare a rel=\"canonical\" tag pointing to itself, along with a rel=\"alternate\" tag pointing to the mobile URL. The mobile page must declare a rel=\"canonical\" tag pointing to the desktop URL (NOT to itself)."
        },
        {
          question: "Is this a mobile-friendly usability test or an indexing parity audit?",
          answer: "This is a technical Mobile-First Indexing parity audit. Mobile-friendly usability tools inspect touch target spacing and viewport sizing for human readers. This tool checks whether search crawlers receive equivalent HTML markup, content, canonicals, headings, and structured data across desktop and mobile."
        }
      ]}
    >
      {/* INPUT FORM CARD */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-xs mb-8">
        <form onSubmit={handleTest}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                Webpage URL <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="url"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm font-mono"
                  placeholder="https://www.example.com/page"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Primary URL to audit. For responsive websites, this URL is audited with both desktop and mobile user agents.
              </p>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <span>{showAdvanced ? '− Hide Advanced Settings' : '+ Show Advanced Settings (Separate Mobile URL & Crawler Profile)'}</span>
              </button>
            </div>

            {showAdvanced && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Separate Mobile URL (Optional — For m.example.com setups)
                  </label>
                  <input
                    type="url"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 text-xs font-mono"
                    placeholder="https://m.example.com/page"
                    value={mobileUrl}
                    onChange={(e) => setMobileUrl(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Leave blank for responsive websites. Enter only if your site serves mobile users from a separate subdomain or path.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Crawler Profile
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      profile === 'googlebot'
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}>
                      <input
                        type="radio"
                        name="profile"
                        value="googlebot"
                        checked={profile === 'googlebot'}
                        onChange={() => setProfile('googlebot')}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="text-xs">
                        <strong className="block text-slate-900 dark:text-white">Googlebot (Recommended)</strong>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Desktop Googlebot 2.1 vs Googlebot Smartphone</span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      profile === 'chrome'
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}>
                      <input
                        type="radio"
                        name="profile"
                        value="chrome"
                        checked={profile === 'chrome'}
                        onChange={() => setProfile('chrome')}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="text-xs">
                        <strong className="block text-slate-900 dark:text-white">Standard Chrome Browser</strong>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Desktop Windows Chrome vs Android Mobile Chrome</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading' || !url.trim()}
              className="w-full py-3.5 px-6 rounded-xl font-black text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'loading' ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Crawling Desktop & Mobile Payloads...</span>
                </>
              ) : (
                <span>Run Mobile-First Index Audit</span>
              )}
            </button>
          </div>
        </form>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-[11px] text-slate-400">
          <strong>Crawler Notice:</strong> Changing the User-Agent header simulates crawler requests to analyze server-delivered HTML differences. It does not originate from verified Googlebot IP addresses.
        </div>
      </div>

      {/* ERROR NOTICE */}
      {status === 'error' && errorMessage && (
        <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 text-sm mb-8 flex items-start gap-3">
          <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <strong className="block font-bold">Audit Request Failed</strong>
            <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* AUDIT RESULTS DASHBOARD */}
      {status === 'success' && auditData && (
        <div className="space-y-8 mb-12">
          {/* SUMMARY HEADER CARD */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  <span>{auditData.executionMode}</span>
                  <span className="text-slate-400">•</span>
                  <span>{auditData.userAgentProfile === 'googlebot' ? 'Googlebot Profile' : 'Chrome Profile'}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  Mobile-First Indexing Audit Report
                </h2>
                <p className="text-xs text-slate-500 font-mono mt-1 break-all">
                  Audited: <strong>{auditData.requestedDesktopUrl}</strong>
                  {auditData.requestedMobileUrl && (
                    <> (Mobile URL: <strong>{auditData.requestedMobileUrl}</strong>)</>
                  )}
                </p>
              </div>

              {/* Export Controls */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportXlsx}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Export XLSX
                </button>
                <a
                  href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(auditData.desktop.finalUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
                >
                  <span>PageSpeed</span>
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </a>
              </div>
            </div>

            {/* OVERALL VERDICT BANNER */}
            <div className={`mt-6 p-5 rounded-2xl border ${
              auditData.summary.parityVerdict === 'Audit Failed' || auditData.summary.criticalCount > 0
                ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
                : auditData.summary.parityVerdict.startsWith('Incomplete Audit') || auditData.summary.highCount > 0
                ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/60'
                : auditData.summary.hasDifferences
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
                : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${
                      auditData.summary.parityVerdict === 'Audit Failed' || auditData.summary.criticalCount > 0
                        ? 'bg-rose-500 animate-pulse'
                        : auditData.summary.parityVerdict.startsWith('Incomplete Audit') || auditData.summary.highCount > 0
                        ? 'bg-orange-500'
                        : auditData.summary.hasDifferences
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`} />
                    <h3 className="font-black text-base text-slate-900 dark:text-white">
                      Parity Verdict: {auditData.summary.parityVerdict}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    {auditData.summary.verdictExplanation
                      ? auditData.summary.verdictExplanation
                      : auditData.summary.criticalCount > 0
                      ? 'Critical discrepancies detected between desktop and mobile responses. Under Google mobile-first indexing, these issues can lead to immediate indexing failure or ranking loss.'
                      : auditData.summary.highCount > 0
                      ? 'Significant differences detected. Important SEO elements differ between desktop and mobile versions.'
                      : auditData.summary.hasDifferences
                      ? 'Minor discrepancies detected. Review the findings below to verify whether markup differences are intentional.'
                      : 'All surveyed core SEO elements (titles, canonicals, robots directives, content length, and structured data) match across desktop and mobile responses.'}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    {auditData.summary.textSimilarityPct}%
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Content Similarity
                  </div>
                </div>
              </div>
            </div>

            {/* METRICS STRIP */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Desktop Status</div>
                <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  HTTP {auditData.desktop.statusCode}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mobile Status</div>
                <div className={`text-sm font-mono font-bold mt-0.5 ${
                  auditData.mobile.statusCode === 200 ? 'text-slate-800 dark:text-slate-200' : 'text-rose-600'
                }`}>
                  HTTP {auditData.mobile.statusCode}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Desktop Words</div>
                <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {auditData.desktop.content.wordCount.toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mobile Words</div>
                <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {auditData.mobile.content.wordCount.toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Critical Issues</div>
                <div className={`text-sm font-mono font-bold mt-0.5 ${
                  auditData.summary.criticalCount > 0 ? 'text-rose-600 font-black' : 'text-slate-800 dark:text-slate-200'
                }`}>
                  {auditData.summary.criticalCount}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Discrepancies</div>
                <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {auditData.summary.totalDiscrepancies}
                </div>
              </div>
            </div>
          </div>

          {/* TAB NAVIGATION */}
          <div className="flex overflow-x-auto pb-1 gap-2 border-b border-slate-200 dark:border-slate-800">
            {[
              { id: 'overview', label: 'Comparison Matrix & Issues' },
              { id: 'crawling', label: 'Crawling & Indexing' },
              { id: 'content', label: 'Content Parity' },
              { id: 'links-images', label: 'Links & Images' },
              { id: 'schema', label: 'Structured Data' },
              { id: 'hreflang', label: 'Hreflang' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW (MATRIX & FINDINGS) */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* COMPARISON MATRIX TABLE */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 mb-4">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Desktop vs Mobile Comparison Matrix
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {auditData.comparisonTable.length} elements evaluated
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase tracking-wider font-bold">
                        <th className="py-3 px-3">SEO Element</th>
                        <th className="py-3 px-3">Desktop Response</th>
                        <th className="py-3 px-3">Mobile Response</th>
                        <th className="py-3 px-3">Parity Status</th>
                        <th className="py-3 px-3">Context</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {auditData.comparisonTable.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                          <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                            {item.element}
                            <span className="block text-[10px] font-normal text-slate-400">{item.category}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300 max-w-xs truncate" title={item.desktop}>
                            {item.desktop}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300 max-w-xs truncate" title={item.mobile}>
                            {item.mobile}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {getStatusBadge(item.status)}
                          </td>
                          <td className="py-3 px-3 text-slate-500 dark:text-slate-400 max-w-xs text-[11px]">
                            {item.details || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DISCREPANCIES & RECOMMENDATIONS */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-700 mb-6">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      Actionable Discrepancy Findings
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Specific technical issues detected between desktop and mobile versions, prioritized by SEO impact.
                    </p>
                  </div>

                  {/* Filter by severity */}
                  <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto">
                    {(['ALL', 'Critical', 'High', 'Medium', 'Low', 'Informational'] as const).map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setSeverityFilter(sev)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          severityFilter === sev
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredDiscrepancies.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No discrepancies match the selected severity filter.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredDiscrepancies.map((disc) => (
                      <div
                        key={disc.id}
                        className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            {getSeverityBadge(disc.severity)}
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                              {disc.name}
                            </h4>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {disc.category}
                          </span>
                        </div>

                        {/* Evidence Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                              Desktop Evidence
                            </span>
                            <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
                              {disc.desktopEvidence}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                              Mobile Evidence
                            </span>
                            <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
                              {disc.mobileEvidence}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          <strong className="text-slate-800 dark:text-slate-100">Why It Matters: </strong>
                          {disc.whyItMatters}
                        </div>

                        <div className="text-xs p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200">
                          <strong className="font-bold">Recommendation: </strong>
                          {disc.recommendation}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CRAWLING & INDEXING */}
          {activeTab === 'crawling' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs">
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-4">
                  Crawling & Indexability Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Desktop Crawl Box */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">Desktop Googlebot</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold">
                        HTTP {auditData.desktop.statusCode}
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Final Destination URL</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200 break-all">{auditData.desktop.finalUrl}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">robots.txt Crawlability</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{auditData.desktop.robotsTxt.status}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{auditData.desktop.robotsTxt.explanation}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Meta Robots Tag</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{auditData.desktop.metaRobots.raw || 'index, follow (implicit default)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">X-Robots-Tag Header</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{auditData.desktop.xRobotsTag.raw || '(None declared)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Canonical Tag</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200 break-all">{auditData.desktop.canonical.resolved || '(Missing)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Mobile Alternate Tag</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200 break-all">{auditData.desktop.mobileAlternate.resolved || '(None declared)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Vary: User-Agent Header</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{auditData.desktop.varyHeader.raw || '(None declared)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Payload Size & Duration</span>
                        <span className="text-slate-700 dark:text-slate-300 font-mono">
                          {(auditData.desktop.responseSizeBytes / 1024).toFixed(1)} KB • {auditData.desktop.durationMs}ms
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Crawl Box */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">Googlebot Smartphone</span>
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-md font-bold ${
                        auditData.mobile.statusCode === 200
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                      }`}>
                        HTTP {auditData.mobile.statusCode}
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Final Destination URL</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200 break-all">{auditData.mobile.finalUrl}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">robots.txt Crawlability</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{auditData.mobile.robotsTxt.status}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{auditData.mobile.robotsTxt.explanation}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Meta Robots Tag</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{auditData.mobile.metaRobots.raw || 'index, follow (implicit default)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">X-Robots-Tag Header</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{auditData.mobile.xRobotsTag.raw || '(None declared)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Canonical Tag</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200 break-all">{auditData.mobile.canonical.resolved || '(Missing)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Mobile Alternate Tag</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200 break-all">{auditData.mobile.mobileAlternate.resolved || '(None declared)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Vary: User-Agent Header</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{auditData.mobile.varyHeader.raw || '(None declared)'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Payload Size & Duration</span>
                        <span className="text-slate-700 dark:text-slate-300 font-mono">
                          {(auditData.mobile.responseSizeBytes / 1024).toFixed(1)} KB • {auditData.mobile.durationMs}ms
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONTENT PARITY */}
          {activeTab === 'content' && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-6">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Content & Headings Parity
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {/* Desktop Content */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  <span className="font-bold text-sm text-slate-900 dark:text-white block border-b border-slate-200 dark:border-slate-700 pb-2">
                    Desktop Content Signals
                  </span>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Title Tag ({auditData.desktop.content.titleLength} chars)</span>
                    <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{auditData.desktop.content.title || '(Missing)'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Meta Description ({auditData.desktop.content.metaDescriptionLength} chars)</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">{auditData.desktop.content.metaDescription || '(Missing)'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Primary H1 Heading ({auditData.desktop.content.h1Count} total H1s)</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{auditData.desktop.content.h1Primary || '(Missing)'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Visible Word Count</span>
                    <p className="text-slate-800 dark:text-slate-200 font-mono font-bold">{auditData.desktop.content.wordCount.toLocaleString()} words</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Visible Text Snippet</span>
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 italic text-[11px] leading-relaxed">
                      "{auditData.desktop.content.textSnippet}..."
                    </div>
                  </div>
                </div>

                {/* Mobile Content */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  <span className="font-bold text-sm text-slate-900 dark:text-white block border-b border-slate-200 dark:border-slate-700 pb-2">
                    Mobile Content Signals
                  </span>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Title Tag ({auditData.mobile.content.titleLength} chars)</span>
                    <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{auditData.mobile.content.title || '(Missing)'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Meta Description ({auditData.mobile.content.metaDescriptionLength} chars)</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">{auditData.mobile.content.metaDescription || '(Missing)'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Primary H1 Heading ({auditData.mobile.content.h1Count} total H1s)</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{auditData.mobile.content.h1Primary || '(Missing)'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Visible Word Count</span>
                    <p className="text-slate-800 dark:text-slate-200 font-mono font-bold">{auditData.mobile.content.wordCount.toLocaleString()} words</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Visible Text Snippet</span>
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 italic text-[11px] leading-relaxed">
                      "{auditData.mobile.content.textSnippet}..."
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LINKS & IMAGES */}
          {activeTab === 'links-images' && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-6">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Links & Media Markup Comparison
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {/* Desktop Links & Images */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  <span className="font-bold text-sm text-slate-900 dark:text-white block border-b border-slate-200 dark:border-slate-700 pb-2">
                    Desktop Links & Media
                  </span>
                  <div className="space-y-1.5">
                    <span className="text-slate-400 block text-[11px]">Link Architecture</span>
                    <p className="text-slate-800 dark:text-slate-200">
                      Total Links: <strong>{auditData.desktop.links.totalCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Unique Internal Targets: <strong>{auditData.desktop.links.uniqueInternalDestinations}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      External Links: <strong>{auditData.desktop.links.externalCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Nofollow Links: <strong>{auditData.desktop.links.nofollowCount}</strong>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                    <span className="text-slate-400 block text-[11px]">Image Markup</span>
                    <p className="text-slate-800 dark:text-slate-200">
                      Total Images: <strong>{auditData.desktop.images.totalCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Images with Alt Text: <strong>{auditData.desktop.images.withAltCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Images Missing Alt: <strong>{auditData.desktop.images.missingAltCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Responsive Tags (picture / srcset): <strong>{auditData.desktop.images.responsiveMarkupCount}</strong>
                    </p>
                  </div>
                </div>

                {/* Mobile Links & Images */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  <span className="font-bold text-sm text-slate-900 dark:text-white block border-b border-slate-200 dark:border-slate-700 pb-2">
                    Mobile Links & Media
                  </span>
                  <div className="space-y-1.5">
                    <span className="text-slate-400 block text-[11px]">Link Architecture</span>
                    <p className="text-slate-800 dark:text-slate-200">
                      Total Links: <strong>{auditData.mobile.links.totalCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Unique Internal Targets: <strong>{auditData.mobile.links.uniqueInternalDestinations}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      External Links: <strong>{auditData.mobile.links.externalCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Nofollow Links: <strong>{auditData.mobile.links.nofollowCount}</strong>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                    <span className="text-slate-400 block text-[11px]">Image Markup</span>
                    <p className="text-slate-800 dark:text-slate-200">
                      Total Images: <strong>{auditData.mobile.images.totalCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Images with Alt Text: <strong>{auditData.mobile.images.withAltCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Images Missing Alt: <strong>{auditData.mobile.images.missingAltCount}</strong>
                    </p>
                    <p className="text-slate-800 dark:text-slate-200">
                      Responsive Tags (picture / srcset): <strong>{auditData.mobile.images.responsiveMarkupCount}</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: STRUCTURED DATA */}
          {activeTab === 'schema' && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-6">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Structured Data Parity (JSON-LD & Microdata)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {/* Desktop Schema */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Desktop Structured Data</span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      {auditData.desktop.structuredData.entityCount} entities
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Schema Types Detected</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {auditData.desktop.structuredData.types.length === 0 ? (
                        <span className="text-slate-400 italic">No structured data types found</span>
                      ) : (
                        auditData.desktop.structuredData.types.map((t, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono text-[11px]">
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {auditData.desktop.structuredData.entities.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 block text-[11px]">Entity Samples</span>
                      {auditData.desktop.structuredData.entities.slice(0, 5).map((ent, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 block">{ent.type}</span>
                          {ent.name && <span className="text-slate-700 dark:text-slate-300 block text-[11px]">Name: {ent.name}</span>}
                          {ent.id && <span className="text-slate-500 font-mono text-[10px] block truncate">ID: {ent.id}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mobile Schema */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Mobile Structured Data</span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      {auditData.mobile.structuredData.entityCount} entities
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Schema Types Detected</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {auditData.mobile.structuredData.types.length === 0 ? (
                        <span className="text-slate-400 italic">No structured data types found</span>
                      ) : (
                        auditData.mobile.structuredData.types.map((t, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono text-[11px]">
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {auditData.mobile.structuredData.entities.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 block text-[11px]">Entity Samples</span>
                      {auditData.mobile.structuredData.entities.slice(0, 5).map((ent, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 block">{ent.type}</span>
                          {ent.name && <span className="text-slate-700 dark:text-slate-300 block text-[11px]">Name: {ent.name}</span>}
                          {ent.id && <span className="text-slate-500 font-mono text-[10px] block truncate">ID: {ent.id}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: HREFLANG */}
          {activeTab === 'hreflang' && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-6">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Hreflang Annotations Parity
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {/* Desktop Hreflang */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Desktop Annotations</span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      {auditData.desktop.hreflang.count} total
                    </span>
                  </div>

                  {auditData.desktop.hreflang.items.length === 0 ? (
                    <p className="text-slate-400 italic">No hreflang annotations declared on desktop.</p>
                  ) : (
                    <div className="space-y-2">
                      {auditData.desktop.hreflang.items.map((item, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 font-mono">
                            {item.hreflang}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400 font-mono truncate text-[11px]" title={item.resolvedHref}>
                            {item.resolvedHref}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mobile Hreflang */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Mobile Annotations</span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      {auditData.mobile.hreflang.count} total
                    </span>
                  </div>

                  {auditData.mobile.hreflang.items.length === 0 ? (
                    <p className="text-slate-400 italic">No hreflang annotations declared on mobile.</p>
                  ) : (
                    <div className="space-y-2">
                      {auditData.mobile.hreflang.items.map((item, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 font-mono">
                            {item.hreflang}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400 font-mono truncate text-[11px]" title={item.resolvedHref}>
                            {item.resolvedHref}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolLayout>
  );
}
