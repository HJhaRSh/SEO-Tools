'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';
import {
  SingleUrlMobileAuditResult,
  TestStatus,
  BulkUrlProgress,
} from '@/lib/seo/mobile-friendly/types';
import {
  MOBILE_VIEWPORT_PRESETS,
  DEFAULT_VIEWPORT_PRESET,
  AUDIT_THRESHOLDS,
} from '@/lib/seo/mobile-friendly/constants';
import { parseAndValidateBulkUrls } from '@/lib/seo/mobile-friendly/urlValidator';
import {
  generateMobileFriendlyCsv,
  generateMobileFriendlyXlsx,
} from '@/lib/seo/mobile-friendly/exporter';

export default function MobileFriendlyTest() {
  // Input state
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [singleUrl, setSingleUrl] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [viewportPreset, setViewportPreset] = useState<string>('standard');

  // Execution state
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<BulkUrlProgress | null>(null);

  // Results state
  const [results, setResults] = useState<SingleUrlMobileAuditResult[]>([]);
  const [expandedUrlIndex, setExpandedUrlIndex] = useState<number | null>(0);
  const [screenshotModalUrl, setScreenshotModalUrl] = useState<SingleUrlMobileAuditResult | null>(null);

  // Handle Form Submission
  const handleTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (status === 'loading') return;

    setErrorMessage(null);

    // Validate Input
    const rawTarget = mode === 'single' ? singleUrl : bulkInput;
    const validation = parseAndValidateBulkUrls(rawTarget);

    if (validation.validUrls.length === 0) {
      if (validation.invalidRows.length > 0) {
        setErrorMessage(`Invalid URL format on line ${validation.invalidRows[0].row}: "${validation.invalidRows[0].raw}"`);
      } else {
        setErrorMessage('Please provide at least one valid HTTP or HTTPS webpage URL to test.');
      }
      setStatus('error');
      return;
    }

    const allUrls = validation.validUrls;
    setStatus('loading');
    setResults([]);
    setExpandedUrlIndex(0);

    const initialProgress: BulkUrlProgress = {
      total: allUrls.length,
      completed: 0,
      failed: 0,
      remaining: allUrls.length,
      currentIndex: 0,
      activeUrl: allUrls[0],
    };
    setProgress(initialProgress);

    const accumulatedResults: SingleUrlMobileAuditResult[] = [];
    const chunkSize = AUDIT_THRESHOLDS.CLIENT_BATCH_CHUNK_SIZE;

    try {
      for (let i = 0; i < allUrls.length; i += chunkSize) {
        const chunk = allUrls.slice(i, i + chunkSize);
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                currentIndex: i,
                activeUrl: chunk[0],
                remaining: allUrls.length - accumulatedResults.length,
              }
            : null
        );

        const res = await fetch('/api/seo/mobile-friendly/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: chunk,
            viewportPreset,
          }),
        });

        let data = await res.json().catch(() => null);

        if (!res.ok || !data || !data.success) {
          // If a chunk completely failed at HTTP layer, convert those chunk URLs to error entries so other chunks still succeed
          const fallbackChunkResults: SingleUrlMobileAuditResult[] = chunk.map((cUrl) => {
            const defaultVp = MOBILE_VIEWPORT_PRESETS[viewportPreset] || DEFAULT_VIEWPORT_PRESET;
            return {
              url: cUrl,
              finalUrl: cUrl,
              durationMs: 0,
              testedAt: new Date().toISOString(),
              isCompleted: false,
              overallStatus: 'ERROR',
              overallSummary: data?.error || `Request failed with status ${res.status}`,
              executionMode: 'static-dom-heuristics',
              assessmentLabel: 'Static HTML Assessment — Browser rendering not performed',
              errorCode: 'FETCH_FAILED',
              viewport: {
                width: defaultVp.width,
                height: defaultVp.height,
                deviceScaleFactor: defaultVp.deviceScaleFactor,
              },
              viewportDeclaration: {
                present: false,
                rawContent: null,
                hasDeviceWidth: false,
                hasInitialScale: false,
                userScalableNo: false,
                maximumScaleRestricted: false,
              },
              tests: {
                configureViewport: { status: 'NOT_TESTED', summary: 'Skipped due to request failure.', issues: [] },
                fixedWidthViewport: { status: 'NOT_TESTED', summary: 'Skipped due to request failure.', issues: [] },
                sizeContentToViewport: { status: 'NOT_TESTED', summary: 'Skipped due to request failure.', issues: [] },
                legibleFontSizes: { status: 'NOT_TESTED', summary: 'Skipped due to request failure.', issues: [] },
                tapTargets: { status: 'NOT_TESTED', summary: 'Skipped due to request failure.', issues: [] },
                incompatiblePlugins: { status: 'NOT_TESTED', summary: 'Skipped due to request failure.', issues: [] },
              },
              issues: [
                {
                  category: 'NETWORK',
                  title: 'Request Failed',
                  severity: 'CRITICAL',
                  description: data?.error || `API returned status ${res.status}`,
                  evidence: `URL: ${cUrl}`,
                  recommendedAction: 'Retry test with smaller batch or verify network connectivity.',
                },
              ],
              metrics: {},
            };
          });
          accumulatedResults.push(...fallbackChunkResults);
        } else if (Array.isArray(data.results)) {
          accumulatedResults.push(...data.results);
        }

        setResults([...accumulatedResults]);

        const completedCount = accumulatedResults.filter((r) => r.isCompleted).length;
        const failedCount = accumulatedResults.filter((r) => !r.isCompleted || r.overallStatus === 'ERROR').length;

        setProgress({
          total: allUrls.length,
          completed: completedCount,
          failed: failedCount,
          remaining: allUrls.length - accumulatedResults.length,
          currentIndex: i + chunk.length,
          activeUrl: chunk[chunk.length - 1],
        });
      }

      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred during mobile friendliness testing.');
    }
  };

  // Export handlers
  const handleExportCsv = () => {
    if (results.length === 0) return;
    const csvData = generateMobileFriendlyCsv(results);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `mobile-friendly-report-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportXlsx = async () => {
    if (results.length === 0) return;
    const xlsxBuffer = await generateMobileFriendlyXlsx(results);
    const blob = new Blob([xlsxBuffer as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `mobile-friendly-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (testStatus: TestStatus) => {
    switch (testStatus) {
      case 'PASS':
        return <span className="badge badge-success">PASS</span>;
      case 'WARNING':
        return <span className="badge badge-warning">WARNING</span>;
      case 'FAIL':
        return <span className="badge badge-error">FAIL</span>;
      case 'ERROR':
        return <span className="badge badge-error">ERROR</span>;
      default:
        return <span className="badge badge-neutral">NOT TESTED</span>;
    }
  };

  return (
    <ToolLayout
      title="Mobile-Friendly Test"
      description="Perform genuine mobile usability testing across viewports, content overflow, touch targets, and font legibility inspired by TechnicalSEO."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Mobile-Friendly Test' }]}
      aboutText="In December 2023, Google officially retired its standalone Mobile-Friendly Test API. This tool provides an independent, deep mobile usability testing engine. It inspects viewport declarations, detects horizontal overflow, evaluates computed font legibility, measures interactive touch target dimensions and spacing, and flags obsolete plugins without fabricating retired Google scores."
      howItWorks={[
        "Enter a single URL or paste up to 50 URLs for bulk mobile usability analysis.",
        "Select your desired mobile device viewport preset (e.g. iPhone standard 390px, Android 412px).",
        "The system fetches and evaluates the page against mobile usability standards.",
        "Inspect expandable issue reports with exact CSS selectors, overflow measurements, and touch target distances.",
        "Export genuine test results to clean CSV or formatted Excel (.xlsx) spreadsheets."
      ]}
      faq={[
        {
          question: "Did Google retire the official Mobile-Friendly Test?",
          answer: "Yes. Google retired the standalone Mobile-Friendly Test and API in December 2023, shifting emphasis towards Lighthouse and Core Web Vitals. This tool provides an independent, objective mobile usability evaluation engine."
        },
        {
          question: "What is the difference between Mobile-Friendly Testing and Mobile-First Indexing?",
          answer: "Mobile-Friendly Testing evaluates how easily a human user can navigate and read a webpage on a smartphone (e.g. touch target spacing, viewport configuration, and horizontal scrolling). The Mobile-First Indexing tool compares content and SEO tag parity between desktop and mobile versions to ensure search crawlers index the correct data."
        },
        {
          question: "What causes 'Size Content to Viewport' failures?",
          answer: "Horizontal overflow occurs when elements like wide tables, rigid fixed-width containers (e.g. width: 800px), or large unconstrained images exceed the screen width, forcing smartphone users to pinch or scroll horizontally."
        },
        {
          question: "What are the recommended tap target dimensions?",
          answer: "Apple's Human Interface Guidelines and WCAG guidelines recommend an effective interactive tap target of at least 44x44 CSS pixels with at least 8px spacing between adjacent controls to prevent accidental touch mistakes."
        }
      ]}
    >
      {/* Input Card */}
      <div className="card mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Audit Configuration</h2>
              <p className="text-xs text-slate-500">Configure URL mode and device viewport</p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'single'
                  ? 'bg-white dark:bg-slate-700 text-green-700 dark:text-green-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              onClick={() => setMode('single')}
            >
              Single URL Test
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'bulk'
                  ? 'bg-white dark:bg-slate-700 text-green-700 dark:text-green-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              onClick={() => setMode('bulk')}
            >
              Bulk URL Test (up to 50)
            </button>
          </div>
        </div>

        <form onSubmit={handleTest} className="space-y-5">
          {mode === 'single' ? (
            <div className="input-group">
              <label className="label">Webpage URL <span className="text-rose-500">*</span></label>
              <input
                type="url"
                className="input"
                placeholder="https://example.com/page/"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                required
              />
              <p className="text-xs text-slate-400 mt-1.5">Enter a fully qualified HTTP or HTTPS page URL.</p>
            </div>
          ) : (
            <div className="input-group">
              <label className="label">
                Webpage URLs (One URL per line, max 50) <span className="text-rose-500">*</span>
              </label>
              <textarea
                className="textarea font-mono text-sm leading-relaxed"
                rows={6}
                placeholder="https://example.com/&#10;https://example.com/about/&#10;https://example.com/pricing/"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                required
              />
              <div className="flex justify-between items-center text-xs text-slate-400 mt-1.5">
                <span>Supports trailing whitespace trimming, deduplication, and line validation.</span>
                <span>
                  {bulkInput.split('\n').filter((l) => l.trim()).length} / 50 URLs
                </span>
              </div>
            </div>
          )}

          {/* Viewport Preset Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="label text-sm">Mobile Viewport Preset</label>
              <select
                className="select text-sm"
                value={viewportPreset}
                onChange={(e) => setViewportPreset(e.target.value)}
              >
                {Object.values(MOBILE_VIEWPORT_PRESETS).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-400 flex flex-col justify-center">
              <span className="font-bold text-slate-800 dark:text-slate-200 mb-0.5">Active Viewport Baseline:</span>
              <span>
                {MOBILE_VIEWPORT_PRESETS[viewportPreset].width} x {MOBILE_VIEWPORT_PRESETS[viewportPreset].height} CSS pixels (Scale factor {MOBILE_VIEWPORT_PRESETS[viewportPreset].deviceScaleFactor}x)
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary w-full py-4 text-base font-bold shadow-md hover:shadow-lg transition-all"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Evaluating Mobile Usability Signals...
              </span>
            ) : mode === 'single' ? (
              'Run Mobile-Friendly Test'
            ) : (
              'Run Bulk Mobile-Friendly Tests'
            )}
          </button>
        </form>
      </div>

      {/* Error Message */}
      {status === 'error' && errorMessage && (
        <div className="card mb-8 p-4 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 text-sm">
          <strong>Validation / Audit Notice:</strong> {errorMessage}
        </div>
      )}

      {/* Progress Bar (Bulk Mode) */}
      {status === 'loading' && progress && (
        <div className="card mb-8 p-6 space-y-4">
          <div className="flex justify-between items-center text-sm font-bold text-slate-800 dark:text-slate-200">
            <span>Progress: {progress.completed} of {progress.total} Completed</span>
            <span className="text-xs text-slate-500 font-mono">
              Remaining: {progress.remaining} | Failed: {progress.failed}
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-green-600 h-full transition-all duration-300 rounded-full"
              style={{
                width: `${Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%`,
              }}
            />
          </div>
          {progress.activeUrl && (
            <p className="text-xs text-slate-500 truncate">
              Currently testing: <span className="font-mono text-slate-700 dark:text-slate-300">{progress.activeUrl}</span>
            </p>
          )}
        </div>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="space-y-8">
          {/* Header Summary & Exporters */}
          <div className="card flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Mobile Usability Results</h2>
                <span className="badge badge-neutral text-xs font-bold">
                  {results.length} URL{results.length > 1 ? 's' : ''} Audited
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Independent mobile usability inspection based on real responsive standards.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportCsv}
                className="btn btn-secondary text-xs py-2 px-3.5 inline-flex items-center gap-1.5"
              >
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
              <button
                type="button"
                onClick={handleExportXlsx}
                className="btn btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export XLSX
              </button>
            </div>
          </div>

          {/* Results Table (Reference Match) */}
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-4">URL</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Usability</th>
                    <th className="py-3 px-3 text-center">Screenshot</th>
                    <th className="py-3 px-3 text-center">Viewport</th>
                    <th className="py-3 px-3 text-center">Fixed Width</th>
                    <th className="py-3 px-3 text-center">Size Content</th>
                    <th className="py-3 px-3 text-center">Font Sizes</th>
                    <th className="py-3 px-3 text-center">Tap Targets</th>
                    <th className="py-3 px-3 text-center">Plugins</th>
                    <th className="py-3 px-4 text-right">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {results.map((r, idx) => {
                    const isExpanded = expandedUrlIndex === idx;
                    return (
                      <React.Fragment key={idx}>
                        <tr
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''
                          }`}
                          onClick={() => setExpandedUrlIndex(isExpanded ? null : idx)}
                        >
                          <td className="py-3.5 px-4 font-mono max-w-[200px] truncate text-slate-900 dark:text-slate-100" title={r.url}>
                            {r.url}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="font-mono text-slate-600 dark:text-slate-400">
                              {r.statusCode || 'ERR'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            {getStatusBadge(r.overallStatus)}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {r.screenshot?.available ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setScreenshotModalUrl(r);
                                }}
                                className="text-green-600 hover:text-green-700 font-bold hover:underline"
                              >
                                View
                              </button>
                            ) : (
                              <span className="text-slate-400">N/A</span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {getStatusBadge(r.tests.configureViewport.status)}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {getStatusBadge(r.tests.fixedWidthViewport.status)}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {getStatusBadge(r.tests.sizeContentToViewport.status)}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {getStatusBadge(r.tests.legibleFontSizes.status)}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {getStatusBadge(r.tests.tapTargets.status)}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            {getStatusBadge(r.tests.incompatiblePlugins.status)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {r.issues.length}
                            </span>
                            <span className="ml-2 text-slate-400 font-normal">
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </td>
                        </tr>

                        {/* Expandable Issue Section */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={11} className="p-5 bg-slate-50/50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700">
                              <div className="space-y-5">
                                {/* Summary Banner */}
                                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs uppercase tracking-wider font-extrabold px-2 py-0.5 rounded ${
                                        r.executionMode === 'browser-rendered'
                                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                      }`}>
                                        {r.assessmentLabel || (
                                          r.executionMode === 'browser-rendered'
                                            ? 'Browser-Rendered Mobile Usability Assessment'
                                            : 'Static HTML Assessment — Browser rendering not performed'
                                        )}
                                      </span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1.5">
                                      {r.overallSummary}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                      <span>Tested at {r.viewport.width}x{r.viewport.height}px</span>
                                      <span>•</span>
                                      <span>Mode: {r.executionMode}</span>
                                      <span>•</span>
                                      <span>Duration: {r.durationMs}ms</span>
                                      {r.finalUrl && r.finalUrl !== r.url && (
                                        <>
                                          <span>•</span>
                                          <span className="text-amber-600 dark:text-amber-400 font-mono">Redirected to: {r.finalUrl}</span>
                                        </>
                                      )}
                                    </div>
                                    {r.executionMode === 'static-dom-heuristics' && r.browserAttempted && r.browserFailureReason && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 bg-slate-100 dark:bg-slate-700/50 px-2 py-1 rounded inline-block">
                                        ℹ Browser notice: {r.browserFailureReason}. Fallback to static HTML assessment applied.
                                      </div>
                                    )}
                                  </div>
                                  {r.screenshot?.available && (
                                    <button
                                      type="button"
                                      onClick={() => setScreenshotModalUrl(r)}
                                      className="btn btn-secondary text-xs py-2 px-3 self-start sm:self-auto"
                                    >
                                      Preview Screenshot
                                    </button>
                                  )}
                                </div>

                                {/* Six Core Assessment Categories */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                  {/* 1. Configure Viewport */}
                                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Configure Viewport</span>
                                      {getStatusBadge(r.tests.configureViewport.status)}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400">{r.tests.configureViewport.summary}</p>
                                    {r.tests.configureViewport.evidence && (
                                      <p className="text-[11px] font-mono text-slate-500 truncate" title={r.tests.configureViewport.evidence}>
                                        {r.tests.configureViewport.evidence}
                                      </p>
                                    )}
                                  </div>

                                  {/* 2. Fixed Width Viewport */}
                                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Fixed Width Viewport</span>
                                      {getStatusBadge(r.tests.fixedWidthViewport.status)}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400">{r.tests.fixedWidthViewport.summary}</p>
                                    {r.tests.fixedWidthViewport.evidence && (
                                      <p className="text-[11px] font-mono text-slate-500 truncate" title={r.tests.fixedWidthViewport.evidence}>
                                        {r.tests.fixedWidthViewport.evidence}
                                      </p>
                                    )}
                                  </div>

                                  {/* 3. Size Content to Viewport */}
                                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Size Content to Viewport</span>
                                      {getStatusBadge(r.tests.sizeContentToViewport.status)}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400">{r.tests.sizeContentToViewport.summary}</p>
                                    {r.tests.sizeContentToViewport.evidence && (
                                      <p className="text-[11px] font-mono text-slate-500 truncate" title={r.tests.sizeContentToViewport.evidence}>
                                        {r.tests.sizeContentToViewport.evidence}
                                      </p>
                                    )}
                                  </div>

                                  {/* 4. Use Legible Font Sizes */}
                                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Legible Font Sizes</span>
                                      {getStatusBadge(r.tests.legibleFontSizes.status)}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400">{r.tests.legibleFontSizes.summary}</p>
                                    {r.tests.legibleFontSizes.evidence && (
                                      <p className="text-[11px] font-mono text-slate-500 truncate" title={r.tests.legibleFontSizes.evidence}>
                                        {r.tests.legibleFontSizes.evidence}
                                      </p>
                                    )}
                                  </div>

                                  {/* 5. Tap Targets Too Close */}
                                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Tap Targets</span>
                                      {getStatusBadge(r.tests.tapTargets.status)}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400">{r.tests.tapTargets.summary}</p>
                                    {r.tests.tapTargets.evidence && (
                                      <p className="text-[11px] font-mono text-slate-500 truncate" title={r.tests.tapTargets.evidence}>
                                        {r.tests.tapTargets.evidence}
                                      </p>
                                    )}
                                  </div>

                                  {/* 6. Uses Incompatible Plugins */}
                                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Incompatible Plugins</span>
                                      {getStatusBadge(r.tests.incompatiblePlugins.status)}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400">{r.tests.incompatiblePlugins.summary}</p>
                                    {r.tests.incompatiblePlugins.evidence && (
                                      <p className="text-[11px] font-mono text-slate-500 truncate" title={r.tests.incompatiblePlugins.evidence}>
                                        {r.tests.incompatiblePlugins.evidence}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Detailed Actionable Issues List */}
                                {r.issues.length > 0 ? (
                                  <div className="space-y-3 pt-2">
                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                      Actionable Findings ({r.issues.length})
                                    </h4>
                                    <div className="space-y-2.5">
                                      {r.issues.map((issue, issueIdx) => (
                                        <div
                                          key={issueIdx}
                                          className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                                            issue.severity === 'CRITICAL'
                                              ? 'border-rose-200 bg-rose-50/60 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200'
                                              : issue.severity === 'WARNING'
                                              ? 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                                              : 'border-slate-200 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                          }`}
                                        >
                                          <div className="flex justify-between items-center">
                                            <span className="font-bold">{issue.title}</span>
                                            <span className="font-extrabold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-full bg-white/70 dark:bg-slate-900/60 border border-current">
                                              {issue.severity}
                                            </span>
                                          </div>
                                          <p className="text-slate-700 dark:text-slate-300">{issue.description}</p>
                                          <div className="text-[11px] font-mono bg-white/50 dark:bg-slate-900/40 p-1.5 rounded border border-current/20 mt-1">
                                            <strong>Evidence:</strong> {issue.evidence}
                                          </div>
                                          {issue.selector && (
                                            <div className="text-[11px] font-mono text-slate-500">
                                              Selector: <code className="font-bold">{issue.selector}</code>
                                            </div>
                                          )}
                                          <div className="text-slate-600 dark:text-slate-400 mt-1">
                                            <strong>Recommendation:</strong> {issue.recommendedAction}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                                    ✓ No mobile usability warnings or critical issues were identified for this URL.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Modal */}
      {screenshotModalUrl && screenshotModalUrl.screenshot?.base64Data && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setScreenshotModalUrl(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Rendered Mobile Screenshot</h3>
                <p className="text-xs text-slate-400 truncate max-w-xs">{screenshotModalUrl.url}</p>
              </div>
              <button
                type="button"
                onClick={() => setScreenshotModalUrl(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex justify-center p-2 bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${screenshotModalUrl.screenshot.base64Data}`}
                alt="Mobile Rendered Screenshot"
                className="max-h-[60vh] object-contain rounded-xl shadow-md"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-500">
                Viewport: {screenshotModalUrl.viewport.width} x {screenshotModalUrl.viewport.height}px
              </span>
              <button
                type="button"
                className="btn btn-primary text-xs py-2 px-4"
                onClick={() => {
                  try {
                    const base64 = screenshotModalUrl.screenshot!.base64Data!;
                    const byteCharacters = atob(base64);
                    const byteNumbers = new Uint8Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                      byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const blob = new Blob([byteNumbers], { type: 'image/png' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `mobile-screenshot-${new Date().toISOString().slice(0, 10)}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch {
                    // fallback: open in new tab
                    window.open(`data:image/png;base64,${screenshotModalUrl.screenshot!.base64Data}`, '_blank');
                  }
                }}
              >
                Download Screenshot
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
