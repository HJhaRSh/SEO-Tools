'use client';

import React, { useState, useCallback, useRef } from 'react';
import type {
  TimeoutRiskCheckResult,
  TimeoutRiskCheckApiResponse,
  ProbeResult,
  TimingBand,
} from '@/lib/seo/timeout-risk/types';

// ─── Helpers ───────────────────────────────────────────────────────
function bandColor(band: TimingBand | undefined): string {
  switch (band) {
    case 'FAST': return 'text-green-700 bg-green-50 border-green-200';
    case 'MODERATE': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'SLOW': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'VERY_SLOW': return 'text-red-700 bg-red-50 border-red-200';
    default: return 'text-gray-700 bg-gray-50 border-gray-200';
  }
}

function bandBadge(band: TimingBand | undefined, label: string | undefined): React.ReactNode {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full border ${bandColor(band)}`}>
      {label || 'Unknown'}
    </span>
  );
}

function errorBadge(error: string): React.ReactNode {
  return (
    <span className="inline-block px-2 py-0.5 text-xs font-bold rounded-full border text-red-700 bg-red-50 border-red-200">
      {error.replace(/_/g, ' ')}
    </span>
  );
}

function classifyProbeBand(ttfbMs: number): { band: TimingBand; label: string } {
  if (ttfbMs < 500) return { band: 'FAST', label: 'Fast' };
  if (ttfbMs < 1000) return { band: 'MODERATE', label: 'Moderate' };
  if (ttfbMs < 2000) return { band: 'SLOW', label: 'Slow' };
  return { band: 'VERY_SLOW', label: 'Very Slow' };
}

// ─── CSV export ────────────────────────────────────────────────────
function escapeCsvCell(value: string): string {
  // Neutralize spreadsheet formula injection
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = "'" + safe;
  }
  // Escape quotes and wrap if needed
  if (safe.includes('"') || safe.includes(',') || safe.includes('\n') || safe.includes('\r')) {
    safe = '"' + safe.replace(/"/g, '""') + '"';
  }
  return safe;
}

function generateCsv(result: TimeoutRiskCheckResult): string {
  const headers = [
    'Probe #', 'Identity', 'Mode', 'HTTP Status', 'TTFB (ms)', 'Body Download (ms)',
    'Total (ms)', 'Timing Band', 'HTML Size (bytes)', 'Truncated', 'Redirects',
    'Final URL', 'Status', 'Eligible', 'Cache-Control', 'CF-Cache-Status',
    'Limitation: Response-header timing is this tool\'s TTFB approximation, not a precision measurement.'
  ];

  const rows = result.probes.map((p) => {
    const band = p.isEligible ? classifyProbeBand(p.timing.ttfbMs) : { label: 'N/A' };
    return [
      String(p.order),
      p.identity.label,
      p.isCacheBust ? 'Cache-bust' : 'Standard',
      String(p.httpStatus || 'N/A'),
      String(p.timing.ttfbMs || 'N/A'),
      p.timing.bodyDownloadMs >= 0 ? String(p.timing.bodyDownloadMs) : 'Incomplete',
      String(p.timing.totalMs || 'N/A'),
      band.label,
      String(p.htmlSizeBytes),
      p.isTruncated ? 'Yes' : 'No',
      String(p.redirectCount),
      p.finalUrl,
      p.error || 'OK',
      p.isEligible ? 'Yes' : 'No',
      p.cacheObservation.cacheControl || '',
      p.cacheObservation.cfCacheStatus || '',
      '',
    ].map(escapeCsvCell);
  });

  return [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// ─── Copy summary ──────────────────────────────────────────────────
function generateSummaryText(result: TimeoutRiskCheckResult): string {
  const lines = [
    `499 Timeout Risk Check — ${result.normalizedUrl}`,
    `Timestamp: ${result.timestamp}`,
    '',
    `Summary: ${result.summary.summaryText}`,
    `Eligible probes: ${result.summary.eligibleCount}/${result.summary.standardProbeCount}`,
    result.summary.medianTtfbMs !== null ? `Median TTFB: ${result.summary.medianTtfbMs}ms (${result.summary.medianBand?.label})` : 'Median TTFB: Insufficient data',
    '',
    'Probes:',
    ...result.probes.map((p) =>
      `  ${p.order}. ${p.identity.label}${p.isCacheBust ? ' (cache-bust)' : ''}: ${p.error ? p.error : `${p.timing.ttfbMs}ms TTFB, HTTP ${p.httpStatus}`}`
    ),
    '',
    'Disclaimer: Response-header timing measured from this tool\'s server. Real 499 confirmation requires server/CDN logs.',
  ];
  return lines.join('\n');
}


// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export default function TimeoutRiskClient() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimeoutRiskCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedProbes, setExpandedProbes] = useState<Set<number>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!url.trim()) {
      setError('Please enter a URL to check.');
      return;
    }

    // Clear previous results
    setResult(null);
    setError(null);
    setExpandedProbes(new Set());
    setLoading(true);

    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/seo/499-checker/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal,
      });

      const data: TimeoutRiskCheckApiResponse = await res.json();

      if (!data.success || !data.data) {
        setError(data.error || 'An unexpected error occurred. Please try again.');
        return;
      }

      setResult(data.data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Failed to connect to the checking service. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [url, loading]);

  const handleReset = useCallback(() => {
    setUrl('');
    setResult(null);
    setError(null);
    setExpandedProbes(new Set());
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const handleCopySummary = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(generateSummaryText(result));
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = generateSummaryText(result);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  }, [result]);

  const handleDownloadCsv = useCallback(() => {
    if (!result) return;
    const csv = generateCsv(result);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `499-timeout-risk-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [result]);

  const toggleProbeExpand = useCallback((order: number) => {
    setExpandedProbes((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* ─── Input Form ──────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-2xl p-5 sm:p-8 shadow-[var(--im-shadow-sm)]">
        <label htmlFor="url-input" className="block text-sm font-bold text-[var(--im-heading)] mb-2">
          Webpage URL
        </label>
        <p className="text-xs text-[var(--im-text-muted)] mb-3">
          Enter a public HTTP or HTTPS URL. Bare domains (e.g. example.com) will be prepended with https://.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="url-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/page"
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--im-bg-soft)] border border-[var(--im-border)] focus:border-[var(--im-primary)] focus:ring-4 focus:ring-[var(--im-accent-tint)] text-sm text-[var(--im-text)] font-medium transition-all placeholder:text-[var(--im-text-muted)] focus:outline-none"
            disabled={loading}
            autoComplete="url"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-6 py-3 rounded-xl bg-[var(--im-primary-deep)] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
                  Checking…
                </span>
              ) : 'Check Timeout Risk'}
            </button>
            {result && (
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-3 rounded-xl bg-[var(--im-bg-soft)] border border-[var(--im-border)] text-sm font-bold text-[var(--im-text-muted)] hover:text-[var(--im-heading)] hover:border-[var(--im-primary-deep)] transition-all cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </form>

      {/* ─── Loading State ───────────────────────────────────── */}
      {loading && (
        <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-2xl p-8 shadow-[var(--im-shadow-sm)] text-center" role="status" aria-live="polite">
          <svg className="w-10 h-10 mx-auto mb-3 animate-spin text-[var(--im-primary-deep)]" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
          <p className="text-sm font-bold text-[var(--im-heading)]">Running 4 sequential probes…</p>
          <p className="text-xs text-[var(--im-text-muted)] mt-1">Testing ChatGPT-User, Claude-User, Perplexity-User, and a cache-busting probe. This may take 10–25 seconds.</p>
        </div>
      )}

      {/* ─── Error ───────────────────────────────────────────── */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 sm:p-6" role="alert">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* ─── Results ─────────────────────────────────────────── */}
      {result && !loading && (
        <div className="space-y-6" aria-live="polite">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Median TTFB */}
            <div className={`rounded-2xl border p-5 shadow-[var(--im-shadow-sm)] ${result.summary.medianTtfbMs !== null ? bandColor(result.summary.medianBand?.band) : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
              <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Median TTFB</p>
              <p className="text-2xl font-bold">{result.summary.medianTtfbMs !== null ? `${result.summary.medianTtfbMs} ms` : 'N/A'}</p>
              <p className="text-xs mt-1">{result.summary.medianBand?.label || 'Insufficient data'}</p>
            </div>

            {/* Eligible Probes */}
            <div className="rounded-2xl border border-[var(--im-border)] bg-[var(--im-surface)] p-5 shadow-[var(--im-shadow-sm)]">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--im-text-muted)] mb-1">Eligible Probes</p>
              <p className="text-2xl font-bold text-[var(--im-heading)]">{result.summary.eligibleCount} / {result.summary.standardProbeCount}</p>
              <p className="text-xs text-[var(--im-text-muted)] mt-1">{result.summary.isComplete ? 'Complete' : 'Incomplete — some probes failed or were blocked'}</p>
            </div>

            {/* Cache Comparison */}
            <div className="rounded-2xl border border-[var(--im-border)] bg-[var(--im-surface)] p-5 shadow-[var(--im-shadow-sm)]">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--im-text-muted)] mb-1">Cache Diff</p>
              <p className="text-2xl font-bold text-[var(--im-heading)]">
                {result.cacheBustComparison.differenceMs !== null
                  ? `${result.cacheBustComparison.differenceMs > 0 ? '+' : ''}${result.cacheBustComparison.differenceMs} ms`
                  : 'N/A'}
              </p>
              <p className="text-xs text-[var(--im-text-muted)] mt-1">Standard vs cache-bust probe</p>
            </div>

            {/* Access Issues */}
            <div className={`rounded-2xl border p-5 shadow-[var(--im-shadow-sm)] ${result.summary.accessIssues.length > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Access Issues</p>
              <p className="text-2xl font-bold">{result.summary.accessIssues.length}</p>
              <p className="text-xs mt-1">{result.summary.accessIssues.length === 0 ? 'No blocking detected' : 'Probes blocked or errored'}</p>
            </div>
          </div>

          {/* Summary Text */}
          <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-2xl p-5 sm:p-6 shadow-[var(--im-shadow-sm)]">
            <h2 className="text-base font-bold text-[var(--im-heading)] mb-2">Summary</h2>
            <p className="text-sm text-[var(--im-text)] leading-relaxed">{result.summary.summaryText}</p>
            <p className="text-xs text-[var(--im-text-muted)] mt-3 italic">{result.probeOrderNote}</p>
          </div>

          {/* Probe Table */}
          <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-2xl shadow-[var(--im-shadow-sm)] overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-[var(--im-border)]">
              <h2 className="text-base font-bold text-[var(--im-heading)]">Probe Results</h2>
              <p className="text-xs text-[var(--im-text-muted)] mt-1">Response-header timing is this tool&apos;s TTFB approximation. Timing bands are heuristic thresholds, not published AI-provider deadlines.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--im-bg-soft)] border-b border-[var(--im-border)]">
                    <th className="text-left px-4 py-3 font-bold text-[var(--im-heading)] text-xs">#</th>
                    <th className="text-left px-4 py-3 font-bold text-[var(--im-heading)] text-xs">Identity</th>
                    <th className="text-left px-4 py-3 font-bold text-[var(--im-heading)] text-xs">Mode</th>
                    <th className="text-left px-4 py-3 font-bold text-[var(--im-heading)] text-xs">Status</th>
                    <th className="text-right px-4 py-3 font-bold text-[var(--im-heading)] text-xs">TTFB</th>
                    <th className="text-right px-4 py-3 font-bold text-[var(--im-heading)] text-xs">Total</th>
                    <th className="text-right px-4 py-3 font-bold text-[var(--im-heading)] text-xs">HTML Size</th>
                    <th className="text-left px-4 py-3 font-bold text-[var(--im-heading)] text-xs">Band</th>
                    <th className="text-center px-4 py-3 font-bold text-[var(--im-heading)] text-xs">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {result.probes.map((probe) => {
                    const probeBand = probe.isEligible ? classifyProbeBand(probe.timing.ttfbMs) : null;
                    const isExpanded = expandedProbes.has(probe.order);
                    return (
                      <React.Fragment key={probe.order}>
                        <tr className={`border-b border-[var(--im-border)] hover:bg-[var(--im-bg-soft)] transition-colors ${probe.error ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3 font-bold text-[var(--im-heading)]">{probe.order}</td>
                          <td className="px-4 py-3 text-[var(--im-text)]">
                            {probe.identity.label}
                            {probe.isCacheBust && <span className="ml-1 text-xs text-amber-600 font-medium">(CB)</span>}
                          </td>
                          <td className="px-4 py-3">
                            {probe.isCacheBust ? (
                              <span className="text-xs text-amber-700 font-medium">Cache-bust</span>
                            ) : (
                              <span className="text-xs text-[var(--im-text-muted)]">Standard</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {probe.httpStatus ? (
                              <span className={`font-mono text-xs font-bold ${probe.httpStatus >= 200 && probe.httpStatus < 400 ? 'text-green-700' : 'text-red-700'}`}>
                                {probe.httpStatus}
                              </span>
                            ) : (
                              <span className="text-xs text-red-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {probe.timing.ttfbMs > 0 ? `${probe.timing.ttfbMs} ms` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {probe.timing.totalMs > 0 ? `${probe.timing.totalMs} ms` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {probe.htmlSizeBytes > 0 ? `${(probe.htmlSizeBytes / 1024).toFixed(1)} KB` : '—'}
                            {probe.isTruncated && <span className="text-amber-600 ml-1" title="Response was truncated">✂</span>}
                          </td>
                          <td className="px-4 py-3">
                            {probe.error && probe.error !== 'BODY_TRUNCATED' ? (
                              errorBadge(probe.error)
                            ) : probeBand ? (
                              bandBadge(probeBand.band, probeBand.label)
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggleProbeExpand(probe.order)}
                              className="text-xs font-bold text-[var(--im-primary-deep)] hover:underline cursor-pointer"
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for probe ${probe.order}`}
                            >
                              {isExpanded ? 'Hide' : 'Show'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-[var(--im-bg-soft)]">
                            <td colSpan={9} className="px-4 py-4">
                              <ProbeDetails probe={probe} />
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

          {/* Cache-bust comparison */}
          <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-2xl p-5 sm:p-6 shadow-[var(--im-shadow-sm)]">
            <h2 className="text-base font-bold text-[var(--im-heading)] mb-2">Cache-Busting Comparison</h2>
            <p className="text-xs text-amber-700 font-medium mb-2">Cache-busting probe — cold cache not guaranteed.</p>
            <p className="text-sm text-[var(--im-text)] leading-relaxed">{result.cacheBustComparison.note}</p>
            {result.cacheBustComparison.possibleDifferentResource && (
              <p className="text-xs text-amber-700 mt-2 font-medium">⚠ The cache-busting URL returned a different destination, status, or content type. The comparison may not represent the same resource.</p>
            )}
          </div>

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-2xl p-5 sm:p-6 shadow-[var(--im-shadow-sm)]">
              <h2 className="text-base font-bold text-[var(--im-heading)] mb-3">Findings &amp; Recommendations</h2>
              <div className="space-y-3">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                    rec.severity === 'critical' ? 'bg-red-50 border-red-200' :
                    rec.severity === 'warning' ? 'bg-amber-50 border-amber-200' :
                    'bg-blue-50 border-blue-200'
                  }`}>
                    <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                      rec.severity === 'critical' ? 'bg-red-500' :
                      rec.severity === 'warning' ? 'bg-amber-500' :
                      'bg-blue-500'
                    }`} />
                    <div>
                      <span className="font-bold text-[var(--im-heading)] text-xs">{rec.category}: </span>
                      <span className="text-[var(--im-text)]">{rec.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCopySummary}
              className="px-5 py-2.5 rounded-xl bg-[var(--im-surface)] border border-[var(--im-border)] text-sm font-bold text-[var(--im-heading)] hover:border-[var(--im-primary-deep)] transition-all cursor-pointer"
            >
              {copyFeedback ? '✓ Copied!' : 'Copy Summary'}
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-5 py-2.5 rounded-xl bg-[var(--im-surface)] border border-[var(--im-border)] text-sm font-bold text-[var(--im-heading)] hover:border-[var(--im-primary-deep)] transition-all cursor-pointer"
            >
              Download CSV
            </button>
          </div>

          {/* Disclaimers */}
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-2xl p-5 text-xs text-[var(--im-text-muted)] space-y-1.5">
            {result.disclaimers.map((d, i) => (
              <p key={i}>• {d}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Expandable Probe Detail ─────────────────────────────────────
function ProbeDetails({ probe }: { probe: ProbeResult }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
      {/* Timing */}
      <div>
        <h4 className="font-bold text-[var(--im-heading)] mb-1.5">Timing</h4>
        <dl className="space-y-1">
          <div className="flex justify-between"><dt className="text-[var(--im-text-muted)]">TTFB (headers):</dt><dd className="font-mono">{probe.timing.ttfbMs} ms</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--im-text-muted)]">Body download:</dt><dd className="font-mono">{probe.timing.bodyDownloadMs >= 0 ? `${probe.timing.bodyDownloadMs} ms` : 'Incomplete'}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--im-text-muted)]">Total:</dt><dd className="font-mono">{probe.timing.totalMs} ms</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--im-text-muted)]">Queue wait:</dt><dd className="font-mono">{probe.timing.queueWaitMs} ms</dd></div>
        </dl>
      </div>

      {/* Response */}
      <div>
        <h4 className="font-bold text-[var(--im-heading)] mb-1.5">Response</h4>
        <dl className="space-y-1">
          <div className="flex justify-between"><dt className="text-[var(--im-text-muted)]">HTTP Status:</dt><dd className="font-mono">{probe.httpStatus || 'N/A'} {probe.httpStatusText}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--im-text-muted)]">Content-Type:</dt><dd className="font-mono truncate max-w-[180px]" title={probe.contentType}>{probe.contentType || 'N/A'}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--im-text-muted)]">HTML Size:</dt><dd className="font-mono">{probe.htmlSizeBytes > 0 ? `${(probe.htmlSizeBytes / 1024).toFixed(1)} KB` : 'N/A'}{probe.isTruncated ? ' (truncated)' : ''}{probe.isBodyIncomplete ? ' (incomplete)' : ''}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--im-text-muted)]">Eligible:</dt><dd>{probe.isEligible ? <span className="text-green-700 font-bold">Yes</span> : <span className="text-red-700 font-bold">No</span>}</dd></div>
          {probe.ineligibilityReason && <div><dt className="text-[var(--im-text-muted)]">Reason:</dt><dd className="text-red-600">{probe.ineligibilityReason}</dd></div>}
        </dl>
      </div>

      {/* Final URL */}
      <div className="sm:col-span-2">
        <h4 className="font-bold text-[var(--im-heading)] mb-1.5">URLs</h4>
        <dl className="space-y-1">
          <div><dt className="text-[var(--im-text-muted)] inline">Requested: </dt><dd className="font-mono inline break-all">{probe.requestedUrl}</dd></div>
          <div><dt className="text-[var(--im-text-muted)] inline">Final: </dt><dd className="font-mono inline break-all">{probe.finalUrl}</dd></div>
          {probe.cacheBustParam && <div><dt className="text-[var(--im-text-muted)] inline">Cache-bust param: </dt><dd className="font-mono inline">{probe.cacheBustParam}</dd></div>}
        </dl>
      </div>

      {/* Redirects */}
      {probe.redirectCount > 0 && (
        <div className="sm:col-span-2">
          <h4 className="font-bold text-[var(--im-heading)] mb-1.5">Redirect Chain ({probe.redirectCount} hop{probe.redirectCount !== 1 ? 's' : ''})</h4>
          <div className="space-y-1">
            {probe.redirectChain.map((hop, i) => (
              <div key={i} className="flex items-start gap-2 bg-white border border-[var(--im-border)] rounded-lg p-2">
                <span className="font-mono text-amber-700 font-bold shrink-0">{hop.statusCode}</span>
                <div className="min-w-0">
                  <div className="font-mono break-all text-[var(--im-text-muted)]">{hop.from}</div>
                  <div className="font-mono break-all text-[var(--im-text)]">→ {hop.to}</div>
                  <div className="text-[var(--im-text-muted)]">~{hop.hopMs} ms</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cache Headers */}
      {Object.values(probe.cacheObservation).some(Boolean) && (
        <div className="sm:col-span-2">
          <h4 className="font-bold text-[var(--im-heading)] mb-1.5">Cache Headers</h4>
          <dl className="space-y-1">
            {probe.cacheObservation.cacheControl && <div className="flex gap-2"><dt className="text-[var(--im-text-muted)] shrink-0">Cache-Control:</dt><dd className="font-mono break-all">{probe.cacheObservation.cacheControl}</dd></div>}
            {probe.cacheObservation.age && <div className="flex gap-2"><dt className="text-[var(--im-text-muted)] shrink-0">Age:</dt><dd className="font-mono">{probe.cacheObservation.age}</dd></div>}
            {probe.cacheObservation.cfCacheStatus && <div className="flex gap-2"><dt className="text-[var(--im-text-muted)] shrink-0">CF-Cache-Status:</dt><dd className="font-mono">{probe.cacheObservation.cfCacheStatus}</dd></div>}
            {probe.cacheObservation.xCache && <div className="flex gap-2"><dt className="text-[var(--im-text-muted)] shrink-0">X-Cache:</dt><dd className="font-mono">{probe.cacheObservation.xCache}</dd></div>}
            {probe.cacheObservation.vary && <div className="flex gap-2"><dt className="text-[var(--im-text-muted)] shrink-0">Vary:</dt><dd className="font-mono break-all">{probe.cacheObservation.vary}</dd></div>}
            {probe.cacheObservation.serverTiming && <div className="flex gap-2"><dt className="text-[var(--im-text-muted)] shrink-0">Server-Timing:</dt><dd className="font-mono break-all">{probe.cacheObservation.serverTiming}</dd></div>}
          </dl>
        </div>
      )}

      {/* User Agent */}
      <div className="sm:col-span-2">
        <h4 className="font-bold text-[var(--im-heading)] mb-1.5">User Agent Sent</h4>
        <p className="font-mono text-[var(--im-text-muted)] break-all bg-white border border-[var(--im-border)] rounded-lg p-2">{probe.identity.userAgent}</p>
        <p className="text-[var(--im-text-muted)] mt-1 italic">Sending this user-agent string does not reproduce the actual provider&apos;s IP addresses, verified identity, or infrastructure.</p>
      </div>
    </div>
  );
}

