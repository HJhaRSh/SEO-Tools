'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';
import type { SchemaCheckResult } from '@/lib/seo/schema-checker/types';

const MAX_URLS = 100;

function sanitizeCsvField(value: string): string {
  // Guard against CSV formula injection
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  // Escape double quotes
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getStatusLabel(r: SchemaCheckResult): 'Yes' | 'No' | 'Unable to check' {
  if (r.status === 'found' || (r.schemaFound && !r.status)) return 'Yes';
  if (r.status === 'unable_to_check') return 'Unable to check';
  return 'No';
}

function generateCsv(results: SchemaCheckResult[]): string {
  const rows = [['URL', 'Schema Found', 'Types']];
  for (const r of results) {
    const statusLabel = getStatusLabel(r);
    rows.push([
      r.url,
      statusLabel,
      statusLabel === 'Yes' && r.types.length > 0 ? r.types.join(', ') : '',
    ]);
  }
  return rows.map(row => row.map(sanitizeCsvField).join(',')).join('\r\n');
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function SchemaCheckerPage() {
  const [urlInput, setUrlInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<SchemaCheckResult[]>([]);

  const parseUrls = (raw: string): { valid: string[]; invalidCount: number } => {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    let invalidCount = 0;

    for (const line of lines) {
      let parsed: URL;
      try {
        parsed = new URL(line);
      } catch {
        invalidCount++;
        continue;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        invalidCount++;
        continue;
      }
      const normalized = parsed.href;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        valid.push(normalized);
      }
    }

    return { valid, invalidCount };
  };

  const handleCheck = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (status === 'loading') return;

    setErrorMessage(null);
    setResults([]);

    const { valid, invalidCount } = parseUrls(urlInput);

    if (valid.length === 0) {
      setStatus('error');
      setErrorMessage(
        invalidCount > 0
          ? 'No valid HTTP/HTTPS URLs found. Please check your input and try again.'
          : 'Please enter at least one URL to check.'
      );
      return;
    }

    if (valid.length > MAX_URLS) {
      setStatus('error');
      setErrorMessage(`Too many URLs. Maximum allowed is ${MAX_URLS}. You entered ${valid.length} unique URLs.`);
      return;
    }

    setStatus('loading');

    try {
      const res = await fetch('/api/seo/schema-checker/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: valid }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: { success?: boolean; results?: SchemaCheckResult[]; error?: string } = {};

      if (contentType.includes('application/json')) {
        data = (await res.json()) as { success?: boolean; results?: SchemaCheckResult[]; error?: string };
      } else {
        const text = await res.text();
        throw new Error(
          res.status === 504
            ? 'The request timed out. Please try checking fewer URLs at once.'
            : text.slice(0, 200) || `Server error (${res.status})`
        );
      }

      if (!res.ok || !data.success || !Array.isArray(data.results)) {
        throw new Error(data.error || 'Failed to check schema markup.');
      }

      setResults(data.results);
      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while checking schema. Please try again.'
      );
    }
  };

  const handleClear = () => {
    setUrlInput('');
    setStatus('idle');
    setErrorMessage(null);
    setResults([]);
  };

  const handleExportCsv = () => {
    if (results.length === 0) return;
    const csv = generateCsv(results);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `schema-checker-${date}.csv`);
  };

  const urlCount = parseUrls(urlInput).valid.length;
  const isLoading = status === 'loading';

  return (
    <ToolLayout
      title="Bulk Schema Checker"
      description="Check whether schema markup exists on one or multiple URLs and identify the schema types found on each page."
      category="Search Appearance"
      breadcrumbs={[
        { label: 'Tools', href: '/tools' },
        { label: 'Schema Checker' },
      ]}
      aboutText="The Bulk Schema Checker fetches each URL you provide and detects structured data markup — including JSON-LD, Microdata, and RDFa. It tells you whether schema markup is present and which schema types are used. This is useful for auditing structured data coverage across a set of pages quickly."
      howItWorks={[
        'Enter one or more URLs in the textarea below — one URL per line.',
        'Click "Check Schema" to begin. Up to 100 URLs can be checked at once.',
        'The tool fetches each page\'s HTML and scans for JSON-LD <script> blocks, Microdata itemtype attributes, and RDFa typeof attributes.',
        'Results appear in a table showing each URL, whether schema was found, and which schema types were detected.',
        'Use "Export CSV" to download the results as a comma-separated file.',
      ]}
      faq={[
        {
          question: 'What schema formats does this tool detect?',
          answer: 'It detects JSON-LD (including @graph and nested types), Microdata (itemscope/itemtype), and RDFa (typeof/vocab). The output only shows the schema type names — not the format used.',
        },
        {
          question: 'Will it detect schema added by JavaScript?',
          answer: 'This tool checks the raw HTML response returned by the server. Schema markup injected only after JavaScript execution may not be detected. Use the Fetch & Render tool if you need to inspect the fully rendered DOM.',
        },
        {
          question: 'What does "Schema Found: No" mean?',
          answer: 'It means no recognisable schema markup (JSON-LD, Microdata, or RDFa) was found in the raw HTML of that page. The page may still have schema injected via JavaScript.',
        },
        {
          question: 'How many URLs can I check at once?',
          answer: `Up to ${MAX_URLS} unique URLs per request. Duplicate URLs are automatically removed and only checked once.`,
        },
      ]}
    >
      <form onSubmit={handleCheck} className="space-y-6">
        {/* Input area */}
        <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-[var(--im-radius-md)] p-6 sm:p-8 shadow-[var(--im-shadow-sm)]">
          <label
            htmlFor="schema-checker-urls"
            className="block text-sm font-semibold text-[var(--im-heading)] mb-2"
          >
            URLs to Check
            <span className="ml-2 text-xs font-normal text-[var(--im-text-muted)]">
              One URL per line · max {MAX_URLS}
            </span>
          </label>

          <textarea
            id="schema-checker-urls"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            disabled={isLoading}
            rows={8}
            placeholder={
              'https://example.com/page-1\nhttps://example.com/page-2\nhttps://example.com/page-3'
            }
            className="w-full px-4 py-3 rounded-[var(--im-radius-sm)] bg-[var(--im-bg-soft)] border border-[var(--im-border)] text-sm text-[var(--im-text)] placeholder:text-[var(--im-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--im-accent-tint)] focus:border-[var(--im-primary-deep)] transition-all font-mono resize-y disabled:opacity-60"
          />

          {urlInput.trim() && (
            <p className="mt-2 text-xs text-[var(--im-text-muted)]">
              {urlCount} unique valid URL{urlCount !== 1 ? 's' : ''} detected
              {urlCount > MAX_URLS && (
                <span className="ml-1 text-amber-600 font-semibold">
                  — exceeds limit of {MAX_URLS}
                </span>
              )}
            </p>
          )}

          <p className="mt-3 text-xs text-[var(--im-text-muted)] italic">
            This tool checks schema markup present in the page HTML. Schema injected only after
            JavaScript execution may not be detected.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            id="schema-checker-submit"
            disabled={isLoading || !urlInput.trim()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--im-radius-md)] bg-[var(--im-secondary)] text-[var(--im-on-dark)] font-semibold text-sm shadow-[var(--im-shadow-sm)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--im-primary-deep)] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6" />
                </svg>
                Check Schema
              </>
            )}
          </button>

          {(urlInput || status !== 'idle') && (
            <button
              type="button"
              id="schema-checker-clear"
              onClick={handleClear}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-[var(--im-radius-md)] bg-[var(--im-surface)] border border-[var(--im-border)] text-sm font-semibold text-[var(--im-text)] hover:border-[var(--im-primary-deep)] hover:text-[var(--im-heading)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          )}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-[var(--im-radius-md)] bg-[var(--im-accent-tint)] border border-[var(--im-border)]">
            <svg className="w-5 h-5 animate-spin text-[var(--im-secondary)] flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-semibold text-[var(--im-heading)]">
              Checking schema on {urlCount} URL{urlCount !== 1 ? 's' : ''}…
            </p>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && errorMessage && (
          <div className="flex items-start gap-3 px-5 py-4 rounded-[var(--im-radius-md)] bg-red-50 border border-red-200">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-semibold text-red-700">{errorMessage}</p>
          </div>
        )}
      </form>

      {/* Results */}
      {status === 'success' && results.length > 0 && (
        <div className="mt-8 space-y-4">
          {/* Results header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--im-heading)]">Results</h2>
              <p className="text-xs text-[var(--im-text-muted)] mt-0.5">
                {results.length} URL{results.length !== 1 ? 's' : ''} checked ·{' '}
                {results.filter(r => r.schemaFound).length} with schema
              </p>
            </div>
            <button
              type="button"
              id="schema-checker-export-csv"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--im-radius-sm)] bg-[var(--im-surface)] border border-[var(--im-border)] text-sm font-semibold text-[var(--im-heading)] hover:border-[var(--im-primary-deep)] hover:bg-[var(--im-bg-soft)] transition-all shadow-[var(--im-shadow-sm)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>

          {/* Results table */}
          <div className="overflow-x-auto rounded-[var(--im-radius-md)] border border-[var(--im-border)] shadow-[var(--im-shadow-sm)]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--im-bg-soft)] border-b border-[var(--im-border)]">
                  <th
                    scope="col"
                    className="px-5 py-3.5 text-left font-semibold text-[var(--im-heading)] tracking-tight"
                    style={{ width: '45%' }}
                  >
                    URL
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3.5 text-left font-semibold text-[var(--im-heading)] tracking-tight whitespace-nowrap"
                    style={{ width: '15%' }}
                  >
                    Schema Found
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-3.5 text-left font-semibold text-[var(--im-heading)] tracking-tight"
                    style={{ width: '40%' }}
                  >
                    Types
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--im-border)]">
                {results.map((result, idx) => (
                  <tr
                    key={idx}
                    className="bg-[var(--im-surface)] hover:bg-[var(--im-bg-soft)] transition-colors"
                  >
                    {/* URL */}
                    <td className="px-5 py-3.5 font-mono text-xs text-[var(--im-text)] max-w-xs">
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={result.url}
                        className="block truncate text-[var(--im-primary-deep)] hover:underline"
                      >
                        {result.url}
                      </a>
                    </td>

                    {/* Schema Found */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {result.status === 'found' || (result.schemaFound && !result.status) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Yes
                        </span>
                      ) : result.status === 'unable_to_check' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Unable to check
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--im-bg-soft)] text-[var(--im-text-muted)] border border-[var(--im-border)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--im-text-muted)]" />
                          No
                        </span>
                      )}
                    </td>

                    {/* Types */}
                    <td className="px-5 py-3.5 text-[var(--im-text)]">
                      {result.types.length > 0 ? (
                        <span className="text-sm">{result.types.join(', ')}</span>
                      ) : (
                        <span className="text-[var(--im-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state before first use */}
      {status === 'idle' && !urlInput && (
        <div className="mt-8 text-center py-12 px-6 bg-[var(--im-surface)] rounded-[var(--im-radius-md)] border border-[var(--im-border)] shadow-[var(--im-shadow-sm)]">
          <div className="w-14 h-14 bg-[var(--im-accent-tint)] rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--im-secondary)]">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[var(--im-heading)] mb-1">
            Enter one or more URLs to check for schema markup
          </h3>
          <p className="text-sm text-[var(--im-text-muted)]">
            Supports JSON-LD, Microdata, and RDFa · Up to {MAX_URLS} URLs per check
          </p>
        </div>
      )}
    </ToolLayout>
  );
}
