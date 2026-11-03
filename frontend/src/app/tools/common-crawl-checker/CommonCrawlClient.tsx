'use client';

import React, { useState } from 'react';
import {
  CommonCrawlAuditReport,
  ScopeSetting,
  MonthlyCrawlRecord,
  SitemapCoverageAnalysis
} from '@/lib/seo/common-crawl/types';
import jsPDF from 'jspdf';

export default function CommonCrawlClient() {
  const [inputUrl, setInputUrl] = useState('');
  const [scope, setScope] = useState<ScopeSetting>('include_www');
  const [limitCollections, setLimitCollections] = useState('12');
  const [sitemapInput, setSitemapInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CommonCrawlAuditReport | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'access' | 'sitemap' | 'recommendations'>('overview');

  // Sitemap Coverage state
  const [sitemapLoading, setSitemapLoading] = useState(false);
  const [sitemapAnalysis, setSitemapAnalysis] = useState<SitemapCoverageAnalysis | null>(null);
  const [sitemapError, setSitemapError] = useState<string | null>(null);

  // Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleAudit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputUrl.trim()) {
      setError('Please enter a domain or webpage URL to audit.');
      return;
    }

    setLoading(true);
    setError(null);
    setSitemapAnalysis(null);
    setLoadingStage('Querying published Common Crawl collections...');

    try {
      setLoadingStage('Analyzing monthly captures & historical crawler access...');
      const res = await fetch('/api/seo/common-crawl/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputUrl.trim(),
          scope,
          limitCollections: parseInt(limitCollections, 10)
        })
      });

      let data: any;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(
          res.status === 504 || res.status === 408
            ? 'Analysis request timed out on server. Please try with fewer collections (e.g. 6 or 3).'
            : `Server returned HTTP ${res.status}: ${text.slice(0, 100) || 'Unknown error'}`
        );
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete Common Crawl analysis.');
      }

      setReport(data.report);
      if (data.report.sitemapCoverage) {
        setSitemapAnalysis(data.report.sitemapCoverage);
        setSitemapInput(data.report.sitemapCoverage.sitemapUrl || '');
      } else {
        // Automatically attempt sitemap detection in background for the active audit
        triggerAutoSitemapCheck(data.report);
      }
      setActiveTab('overview');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setLoadingStage('');
    }
  };

  const triggerAutoSitemapCheck = async (auditReport: CommonCrawlAuditReport) => {
    setSitemapLoading(true);
    setSitemapError(null);
    try {
      const res = await fetch('/api/seo/common-crawl/sitemap-coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname: auditReport.hostname,
          collectionId: auditReport.monthlyTrend[0]?.collectionId,
          capturedUrls: auditReport.monthlyTrend[0]?.urls?.map((u: any) => u.url) || []
        })
      });
      let data: any;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned HTTP ${res.status}: ${text.slice(0, 100) || 'Unknown error'}`);
      }

      if (res.ok && data.success && data.coverage) {
        setSitemapAnalysis(data.coverage);
        setSitemapInput(data.coverage.sitemapUrl || '');
      }
    } catch {
      // Background auto-discovery will stay silent so user can manually retry
    } finally {
      setSitemapLoading(false);
    }
  };

  const handleSitemapCheck = async () => {
    if (!report) return;
    setSitemapLoading(true);
    setSitemapError(null);

    try {
      const res = await fetch('/api/seo/common-crawl/sitemap-coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname: report.hostname,
          sitemapUrl: sitemapInput.trim() || undefined,
          collectionId: report.monthlyTrend[0]?.collectionId,
          capturedUrls: report.monthlyTrend[0]?.urls?.map((u: any) => u.url) || []
        })
      });

      let data: any;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned HTTP ${res.status}: ${text.slice(0, 100) || 'Unknown error'}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Sitemap coverage analysis failed.');
      }

      setSitemapAnalysis(data.coverage);
    } catch (err: any) {
      setSitemapError(err.message || 'Error checking sitemap coverage.');
    } finally {
      setSitemapLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // CSV Export
  const downloadCsv = () => {
    if (!report) return;
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += `"Collection ID","Collection Name","Captured Count","Count Type","Status","Last Captured Date"\n`;
    for (const r of report.monthlyTrend) {
      csv += `"${r.collectionId}","${r.collectionName}","${r.capturedCount}","${r.countType}","${r.status}","${r.lastCapturedDate || 'N/A'}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `common-crawl-${report.hostname}-history.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // JSON Export
  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `common-crawl-${report.hostname}-audit.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Export
  const downloadPdf = () => {
    if (!report) return;
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.setTextColor(234, 88, 12); // #ea580c Indian Marketers orange
      doc.text('Common Crawl Visibility Audit', 14, 20);

      doc.setFontSize(11);
      doc.setTextColor(50, 50, 50);
      doc.text(`Target: ${report.target}`, 14, 28);
      doc.text(`Hostname: ${report.hostname} | Scope: ${report.scope}`, 14, 34);
      doc.text(`Date of Analysis: ${new Date(report.analyzedAt).toLocaleDateString()}`, 14, 40);

      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('Overall Status', 14, 52);

      doc.setFontSize(10);
      doc.setTextColor(70, 70, 70);
      doc.text(`Status: ${report.overallStatusLabel}`, 14, 58);
      const splitSummary = doc.splitTextToSize(report.overallStatusSummary, 180);
      doc.text(splitSummary, 14, 64);

      let yPos = 80;
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('Monthly Crawl Trend (Latest Collections)', 14, yPos);
      yPos += 8;

      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Collection', 14, yPos);
      doc.text('Captured Count', 85, yPos);
      doc.text('Type', 130, yPos);
      doc.text('Status', 160, yPos);
      yPos += 6;

      doc.setTextColor(40, 40, 40);
      for (const item of report.monthlyTrend.slice(0, 8)) {
        doc.text(item.collectionName || item.collectionId, 14, yPos);
        doc.text(item.capturedCount.toLocaleString(), 85, yPos);
        doc.text(item.countType, 130, yPos);
        doc.text(item.status, 160, yPos);
        yPos += 6;
      }

      yPos += 10;
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('Technical Recommendations', 14, yPos);
      yPos += 8;

      doc.setFontSize(9);
      for (const rec of report.recommendations.slice(0, 3)) {
        doc.setTextColor(234, 88, 12);
        doc.text(`[${rec.priority}] ${rec.title}`, 14, yPos);
        yPos += 5;
        doc.setTextColor(60, 60, 60);
        const splitAction = doc.splitTextToSize(`Action: ${rec.suggestedAction}`, 180);
        doc.text(splitAction, 14, yPos);
        yPos += (splitAction.length * 4) + 4;
      }

      yPos += 10;
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('Generated by Indian Marketers SEO Toolkit (https://indianmarketers.in/tools/common-crawl-checker)', 14, 280);

      doc.save(`common-crawl-${report.hostname}-report.pdf`);
    } catch (err: any) {
      alert(`Could not generate PDF: ${err.message}`);
    }
  };

  const maxMonthlyCount = report
    ? Math.max(1, ...report.monthlyTrend.map(r => r.capturedCount))
    : 1;

  return (
    <div className="space-y-8">
      {/* Search & Audit Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <form onSubmit={handleAudit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="target-input" className="block text-sm font-semibold text-slate-800">
              Domain Name or Webpage URL
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  id="target-input"
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="e.g. hoabl.com, barbequenation.com or https://example.com/blog/article"
                  className="w-full px-4 py-3 text-base rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white text-slate-900"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !inputUrl.trim()}
                className="px-7 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-w-[150px] shadow-sm cursor-pointer"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Auditing...</span>
                  </>
                ) : (
                  <span>Audit Archive</span>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Enter a domain (e.g. <span className="font-mono">example.com</span>) for sitewide crawl visibility or an exact URL to inspect historical snapshots.
            </p>
          </div>

          {/* Scope and Parameters Accordion */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Crawl Scope Setting
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setScope('include_www')}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    scope === 'include_www'
                      ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Root + www
                </button>
                <button
                  type="button"
                  onClick={() => setScope('subdomains')}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    scope === 'subdomains'
                      ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  All Subdomains
                </button>
                <button
                  type="button"
                  onClick={() => setScope('exact')}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    scope === 'exact'
                      ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Exact Host
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="limit-collections-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Historical Crawl Depth
              </label>
              <select
                id="limit-collections-select"
                value={limitCollections}
                onChange={(e) => setLimitCollections(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="6">Latest 6 Crawl Collections (~6 Months)</option>
                <option value="12">Latest 12 Crawl Collections (~1 Year - Recommended)</option>
              </select>
            </div>
          </div>
        </form>

        {loading && (
          <div className="mt-6 p-4 rounded-xl bg-orange-50/70 border border-orange-100 flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-orange-600 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm text-orange-900 font-medium">{loadingStage}</span>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
            <div className="font-semibold mb-1">Audit Failed</div>
            <div>{error}</div>
          </div>
        )}
      </div>

      {/* Results Dashboard */}
      {report && (
        <div className="space-y-6">
          {/* Executive Overview Header Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {report.mode === 'page' ? 'Exact Page Audit' : 'Domain Audit'}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    Scope: {report.scope}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 break-all">
                  {report.target}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Audited on {new Date(report.analyzedAt).toLocaleString()} • {report.monthlyTrend.length} published collections queried
                </p>
              </div>

              {/* Action buttons (CSV / JSON / PDF) */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={downloadCsv}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Export Crawl History to CSV"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  <span>CSV</span>
                </button>
                <button
                  onClick={downloadJson}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Export Complete Structured Report to JSON"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                  <span>JSON</span>
                </button>
                <button
                  onClick={downloadPdf}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Generate Client Audit PDF"
                >
                  <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v16z" /></svg>
                  <span>Export PDF</span>
                </button>
              </div>
            </div>

            {/* Diagnostic Status Banner */}
            <div className={`mt-6 p-4 rounded-xl border flex items-start gap-3.5 ${
              report.overallStatus === 'CAPTURES_CONFIRMED_NO_RESTRICTIONS'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : report.overallStatus === 'CAPTURES_CONFIRMED_RESTRICTIONS_DETECTED' || report.overallStatus === 'HISTORICAL_RESTRICTIONS_OBSERVED'
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}>
              <div className="shrink-0 mt-0.5">
                {report.overallStatus === 'CAPTURES_CONFIRMED_NO_RESTRICTIONS' ? (
                  <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                )}
              </div>
              <div className="text-sm">
                <span className="font-bold">{report.overallStatusLabel}: </span>
                <span>{report.overallStatusSummary}</span>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Latest Capture Count</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {report.trendSummary.latestCaptureCount.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Collection: {report.trendSummary.latestCollection || 'N/A'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Capture Trend (MoM)</div>
                <div className={`text-2xl font-bold mt-1 ${
                  report.trendSummary.absoluteChange > 0 
                    ? 'text-emerald-600' 
                    : report.trendSummary.absoluteChange < 0 
                    ? 'text-rose-600' 
                    : 'text-slate-700'
                }`}>
                  {report.trendSummary.absoluteChange > 0 ? `+${report.trendSummary.absoluteChange.toLocaleString()}` : report.trendSummary.absoluteChange.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {report.trendSummary.percentChange !== null ? `${report.trendSummary.percentChange}% vs previous` : 'Baseline crawl'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Last Observed Capture</div>
                <div className="text-xl font-bold text-slate-900 mt-1">
                  {report.trendSummary.lastObservedCaptureDate || 'None in range'}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Peak: {report.trendSummary.highestCount.toLocaleString()} URLs
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Live CCBot Probe</div>
                <div className={`text-xl font-bold mt-1 ${
                  report.liveProbes.find(p => p.profileName.includes('CCBot'))?.accessResult === 'SERVED_SUCCESSFULLY'
                    ? 'text-emerald-600'
                    : 'text-amber-600'
                }`}>
                  {report.liveProbes.find(p => p.profileName.includes('CCBot'))?.accessResult === 'SERVED_SUCCESSFULLY'
                    ? 'Served 200 OK'
                    : report.liveProbes.find(p => p.profileName.includes('CCBot'))?.challengeIndicator || 'Challenged'}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Server network simulation
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 overflow-x-auto space-x-2">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'history', label: 'Crawl History & Trends' },
              { id: 'access', label: 'Crawler Access & Robots' },
              { id: 'sitemap', label: 'Sitemap Coverage' },
              { id: 'recommendations', label: `Recommendations (${report.recommendations.length})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* If page mode, show page capture history card */}
              {report.pageHistory && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span>Exact Page Capture Timeline</span>
                  </h3>

                  {report.pageHistory.captures.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                            <th className="py-2.5 px-3">Capture Date</th>
                            <th className="py-2.5 px-3">Collection</th>
                            <th className="py-2.5 px-3">HTTP Status</th>
                            <th className="py-2.5 px-3">MIME</th>
                            <th className="py-2.5 px-3">WARC File</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {report.pageHistory.captures.map((cap, i) => (
                            <tr key={i} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                                {cap.timestamp.slice(0, 4)}-{cap.timestamp.slice(4, 6)}-{cap.timestamp.slice(6, 8)} {cap.timestamp.slice(8, 10)}:{cap.timestamp.slice(10, 12)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{cap.collectionId}</td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  cap.status === 200 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {cap.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-500">{cap.mime}</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 truncate max-w-[200px]" title={cap.filename}>
                                {cap.filename.split('/').pop()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm">
                      No exact capture record was found for this specific page across the queried collections.
                    </div>
                  )}
                </div>
              )}

              {/* Monthly Visual Trend Bar Chart */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Monthly Crawl Visibility History
                </h3>
                <p className="text-xs text-slate-500 mb-6">
                  Unique successfully captured HTML URLs per published Common Crawl collection.
                </p>

                <div className="space-y-3">
                  {report.monthlyTrend.map((record) => {
                    const percent = Math.min(100, Math.max(2, Math.round((record.capturedCount / maxMonthlyCount) * 100)));
                    const isAvailable = record.status === 'confirmed' || record.status === 'estimated';

                    return (
                      <div key={record.collectionId} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-800">{record.collectionName}</span>
                          <span className="font-mono text-slate-600">
                            {isAvailable ? `${record.capturedCount.toLocaleString()} captured` : record.status}
                            {record.countType === 'estimated' && ' (est.)'}
                          </span>
                        </div>
                        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex items-center">
                          {isAvailable && record.capturedCount > 0 ? (
                            <div
                              className="h-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-full transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          ) : (
                            <div className="w-full text-[10px] text-slate-400 pl-2">
                              {record.status === 'no_records' ? '0 captured' : record.statusMessage || 'Unavailable'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Key Diagnostic Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h4 className="font-bold text-slate-900 mb-2">Crawl Policy Evidence</h4>
                  <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                    Evaluated under official RFC 9309 rules across archived robots.txt captures and live simulated probes.
                  </p>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between p-2.5 rounded-lg bg-slate-50">
                      <span className="text-slate-600">Archived CCBot Directives</span>
                      <span className="font-bold text-slate-800">
                        {report.robotsHistory.find(r => r.isAvailable)?.ccBotStatus || 'Unavailable'}
                      </span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-slate-50">
                      <span className="text-slate-600">Archived Wildcard (*) Directives</span>
                      <span className="font-bold text-slate-800">
                        {report.robotsHistory.find(r => r.isAvailable)?.wildcardStatus || 'Unavailable'}
                      </span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-slate-50">
                      <span className="text-slate-600">Likely Block Signature</span>
                      <span className="font-bold text-slate-800">{report.blockSource.likelyOrigin}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h4 className="font-bold text-slate-900 mb-2">Methodology & Transparency</h4>
                  <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
                    <li>Data sourced from official Common Crawl CDX APIs (<span className="font-mono">index.commoncrawl.org</span>).</li>
                    <li>Large domains leverage Common Crawl official CDX block-level estimation (~3,000 URLs/block).</li>
                    <li>Absence from Common Crawl does NOT mean a page is excluded from Google search.</li>
                    <li>Common Crawl is a selective crawl queue and does not run client-side JavaScript.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CRAWL HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Published Crawl Collections Breakdown
              </h3>
              <p className="text-xs text-slate-500 mb-6">
                Official capture counts, estimation methods, and last observed capture dates across queried indexes.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                      <th className="py-3 px-3 font-semibold">Collection</th>
                      <th className="py-3 px-3 font-semibold">Crawl Period</th>
                      <th className="py-3 px-3 font-semibold">Captured Count</th>
                      <th className="py-3 px-3 font-semibold">Metric Type</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 px-3 font-semibold">Last Captured</th>
                      <th className="py-3 px-3 font-semibold">Methodology / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.monthlyTrend.map((r) => (
                      <tr key={r.collectionId} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3 font-medium text-slate-900">
                          <div>{r.collectionName}</div>
                          <div className="font-mono text-[10px] text-slate-400">{r.collectionId}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{r.dateRange}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {r.capturedCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            r.countType === 'exact' 
                              ? 'bg-blue-50 text-blue-700' 
                              : r.countType === 'estimated' 
                              ? 'bg-purple-50 text-purple-700' 
                              : r.countType === 'partial'
                              ? 'bg-amber-50 text-amber-700'
                              : r.countType === 'unavailable'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {r.countType}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            r.status === 'confirmed' 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : r.status === 'estimated' 
                              ? 'bg-amber-50 text-amber-700' 
                              : r.status === 'temporarily_unavailable' || r.status === 'query_error' || r.status === 'rate_limited'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-mono">
                          {r.lastCapturedDate || 'N/A'}
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-[11px] max-w-xs">
                          {r.estimationMethod || r.statusMessage || 'Standard enumeration'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: CRAWLER ACCESS & ROBOTS */}
          {activeTab === 'access' && (
            <div className="space-y-6">
              {/* Historical Policy Change Alert if detected */}
              {report.historicalChangeObservation && (
                <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 text-sm flex items-start gap-3">
                  <svg className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <div>
                    <div className="font-bold">Historical Access Shift Detected</div>
                    <div className="text-xs mt-0.5">{report.historicalChangeObservation}</div>
                  </div>
                </div>
              )}

              {/* Live Edge User-Agent Probes Table */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Live Simulated Crawler Access Probes
                </h3>
                <p className="text-xs text-slate-500 mb-6">
                  Direct requests executed against <span className="font-mono">{report.normalizedUrl}</span> across 4 distinct request profiles to isolate edge firewall challenges.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                        <th className="py-3 px-3 font-semibold">Profile</th>
                        <th className="py-3 px-3 font-semibold">HTTP Status</th>
                        <th className="py-3 px-3 font-semibold">Response Time</th>
                        <th className="py-3 px-3 font-semibold">Access Result</th>
                        <th className="py-3 px-3 font-semibold">Challenge Indicator</th>
                        <th className="py-3 px-3 font-semibold">Relevant Headers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.liveProbes.map((probe, i) => (
                        <tr key={i} className="hover:bg-slate-50/60">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">{probe.profileName}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[240px]" title={probe.userAgent}>
                              {probe.userAgent}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800">
                            {probe.statusCode} {probe.statusText}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {probe.durationMs}ms
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              probe.accessResult === 'SERVED_SUCCESSFULLY'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              {probe.accessResult}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-medium">
                            {probe.challengeIndicator || 'NONE'}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                            {Object.entries(probe.relevantHeaders).map(([k, v]) => (
                              <div key={k}>{k}: {v}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">Important Disclaimer: </span>
                  These requests simulate user-agent headers from our server network and do not originate from Common Crawl IP address space.
                </div>
              </div>

              {/* Block Source Detection Panel */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Block Source Detection</h3>
                    <p className="text-xs text-slate-500">Automated signature attribution for crawler access restrictions.</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    report.blockSource.confidence === 'HIGH'
                      ? 'bg-emerald-100 text-emerald-800'
                      : report.blockSource.confidence === 'MEDIUM'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {report.blockSource.confidence} Confidence
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700">Detected Signature: </span>
                    <span className="text-slate-900 font-medium">{report.blockSource.detectedPattern}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Likely Origin: </span>
                    <span className="text-slate-900 font-medium">{report.blockSource.likelyOrigin}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Supporting Evidence:</span>
                    <ul className="list-disc list-inside mt-1 space-y-1 text-slate-600">
                      {report.blockSource.evidence.map((ev, i) => (
                        <li key={i}>{ev}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <span className="font-semibold text-slate-700">Investigation Path: </span>
                    <span className="text-slate-800">{report.blockSource.suggestedAction}</span>
                  </div>
                </div>
              </div>

              {/* Historical robots.txt archives table */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Historical robots.txt Archival Records
                </h3>
                <p className="text-xs text-slate-500 mb-6">
                  Actual robots.txt files stored in Common Crawl per collection. Evaluated for CCBot and wildcard permissions.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                        <th className="py-3 px-3 font-semibold">Collection</th>
                        <th className="py-3 px-3 font-semibold">Captured Date</th>
                        <th className="py-3 px-3 font-semibold">CCBot Status</th>
                        <th className="py-3 px-3 font-semibold">Wildcard (*)</th>
                        <th className="py-3 px-3 font-semibold">Matched Rule</th>
                        <th className="py-3 px-3 font-semibold">Sitemaps</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.robotsHistory.map((rh) => (
                        <tr key={rh.collectionId} className="hover:bg-slate-50/60">
                          <td className="py-3 px-3 font-medium text-slate-900">
                            {rh.collectionName}
                            {rh.firstObservedChange && (
                              <span className="ml-2 px-2 py-0.5 rounded text-[10px] bg-orange-100 text-orange-800 font-semibold">
                                Changed
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {rh.captureDate || 'Historical copy unavailable'}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              rh.ccBotStatus === 'ALLOWED' 
                                ? 'bg-emerald-50 text-emerald-700' 
                                : rh.ccBotStatus === 'BLOCKED' 
                                ? 'bg-rose-50 text-rose-700' 
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {rh.ccBotStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              rh.wildcardStatus === 'ALLOWED' 
                                ? 'bg-emerald-50 text-emerald-700' 
                                : rh.wildcardStatus === 'BLOCKED' 
                                ? 'bg-rose-50 text-rose-700' 
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {rh.wildcardStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {rh.appliedRule ? `${rh.appliedRule.originalText} (line ${rh.appliedRule.lineNumber})` : 'Default Allow'}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            {rh.sitemapsCount} declared
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SITEMAP COVERAGE */}
          {activeTab === 'sitemap' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Sitemap vs Common Crawl Coverage Analysis
                </h3>
                <p className="text-xs text-slate-500 mb-6">
                  Verify how many of your sitemap URLs exist inside the selected Common Crawl collection.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <input
                    type="text"
                    value={sitemapInput}
                    onChange={(e) => setSitemapInput(e.target.value)}
                    placeholder={`e.g. https://${report.hostname}/sitemap.xml (optional, auto-discovers if empty)`}
                    className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    disabled={sitemapLoading}
                  />
                  <button
                    onClick={handleSitemapCheck}
                    disabled={sitemapLoading}
                    className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {sitemapLoading ? (
                      <>
                        <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>Detecting & Comparing...</span>
                      </>
                    ) : (
                      'Compare Sitemap'
                    )}
                  </button>
                </div>

                {sitemapAnalysis && (
                  <div className="mb-6 flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200/80 px-3.5 py-2 rounded-xl">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>
                      Detected XML Sitemap:{' '}
                      <a
                        href={sitemapAnalysis.sitemapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-orange-600 hover:underline font-medium"
                      >
                        {sitemapAnalysis.sitemapUrl}
                      </a>
                    </span>
                  </div>
                )}

                {sitemapError && (
                  <div className="p-3 mb-6 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                    {sitemapError}
                  </div>
                )}

                {sitemapAnalysis ? (
                  <div className="space-y-6">
                    {/* Coverage Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="text-xs text-slate-500">Total Sitemap URLs</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">
                          {sitemapAnalysis.totalSitemapUrls.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
                        <div className="text-xs text-emerald-700">Archived in Crawl</div>
                        <div className="text-2xl font-bold text-emerald-800 mt-1">
                          {sitemapAnalysis.confirmedArchivedUrls.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-100">
                        <div className="text-xs text-rose-700">Not in Collection</div>
                        <div className="text-2xl font-bold text-rose-800 mt-1">
                          {sitemapAnalysis.missingUrls.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-orange-50/60 border border-orange-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-orange-700">Crawl Coverage</span>
                          {sitemapAnalysis.isPartial && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                              Partial Sample
                            </span>
                          )}
                        </div>
                        <div className="text-2xl font-bold text-orange-800 mt-1">
                          {sitemapAnalysis.coveragePercentage}%
                        </div>
                        {sitemapAnalysis.isPartial && (
                          <div className="text-[10px] text-amber-700 mt-0.5">
                            Capped at 500 URLs
                          </div>
                        )}
                      </div>
                    </div>

                    {sitemapAnalysis.isPartial && (
                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs">
                        <span className="font-bold">Partial Sitemap Scope: </span>
                        This sitemap contains more than 500 URLs and was capped at 500 URLs for serverless execution. The {sitemapAnalysis.coveragePercentage}% coverage reflects this 500-URL sample, not verified sitewide coverage.
                      </div>
                    )}

                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                      <span className="font-bold">Important Transparency Note: </span>
                      "Not found in Common Crawl" must not be displayed or interpreted as "Not indexed by Google". Common Crawl is a selective research archive with limited crawl capacity per collection.
                    </div>

                    {/* URL Details Table */}
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                          <tr className="text-slate-700">
                            <th className="py-2.5 px-3">Sitemap URL</th>
                            <th className="py-2.5 px-3">Common Crawl Status</th>
                            <th className="py-2.5 px-3">HTTP Status</th>
                            <th className="py-2.5 px-3">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sitemapAnalysis.urls.map((u, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-3 font-mono text-slate-800 truncate max-w-md" title={u.url}>
                                {u.url}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  u.status === 'ARCHIVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {u.status === 'ARCHIVED' ? 'Archived' : 'Missing'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600">
                                {u.httpStatus || 'N/A'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-500">
                                {u.captureTimestamp || 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 text-slate-500 text-xs">
                    {sitemapLoading ? (
                      <div className="flex flex-col items-center gap-2">
                        <svg className="animate-spin w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>Auto-detecting sitemap and calculating Common Crawl coverage...</span>
                      </div>
                    ) : (
                      'Auto-detecting sitemap... If your sitemap is at a non-standard location, enter the URL above and click Compare Sitemap.'
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: RECOMMENDATIONS */}
          {activeTab === 'recommendations' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Actionable Technical Recommendations
                </h3>
                <p className="text-xs text-slate-500 mb-6">
                  Evidence-backed fixes generated from observed Common Crawl archival evidence, robots policies, and live network probes.
                </p>

                <div className="space-y-4">
                  {report.recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <h4 className="font-bold text-slate-900 text-sm">{rec.title}</h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          rec.priority === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-800'
                            : rec.priority === 'HIGH'
                            ? 'bg-orange-100 text-orange-800'
                            : rec.priority === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {rec.priority}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-50">
                          <span className="font-semibold text-slate-700">Observed Finding: </span>
                          <span className="text-slate-600">{rec.finding}</span>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50">
                          <span className="font-semibold text-slate-700">Supporting Evidence: </span>
                          <span className="text-slate-600">{rec.supportingEvidence}</span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-700 leading-relaxed">
                        <span className="font-semibold text-slate-900">Recommended Action: </span>
                        <span>{rec.suggestedAction}</span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span className="text-slate-500">
                          <span className="font-medium text-slate-700">Verification: </span>
                          {rec.verificationMethod}
                        </span>
                        <button
                          onClick={() => copyToClipboard(rec.suggestedAction, rec.id)}
                          className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] transition-colors shrink-0 cursor-pointer"
                        >
                          {copiedId === rec.id ? 'Copied!' : 'Copy Action'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

