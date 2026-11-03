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

  const aboutText = (
    <div className="space-y-4">
      <p>
        A <strong>bulk schema checker</strong> is an automated SEO auditing tool designed to test structured data markup across multiple URLs in a single pass. Rather than inspecting source code or running developer tools page by page, this utility fetches the server-rendered HTML of up to 100 web pages simultaneously and scans for declared Schema.org vocabularies.
      </p>
      <p>
        Verifying schema markup at scale helps webmasters, SEO professionals, and developers confirm that key structured data entities—such as <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">Article</code>, <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">Product</code>, <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">Organization</code>, <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">BreadcrumbList</code>, and <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">FAQPage</code>—are consistently deployed across site templates, blog archives, and product catalogues without silent omissions or accidental template regressions.
      </p>
    </div>
  );

  const howItWorks = [
    'Enter one or more URLs into the textarea below, placing each complete HTTP or HTTPS address on a new line (up to 100 URLs per check).',
    'Click "Check Schema". The tool automatically sanitizes inputs, removes URL fragments (#hash), and deduplicates identical addresses.',
    'Our backend fetches each page\'s raw HTML with safe concurrency and inspects the markup for JSON-LD scripts, Microdata itemscopes, and RDFa attributes.',
    'Review the generated summary table showing the check status (Yes, No, or Unable to check) and the exact Schema.org types detected on each URL.',
    'Download your audit data with "Export CSV" to analyze findings in Google Sheets or Microsoft Excel.',
  ];

  const extraSections = (
    <>
      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our Schema Checker Detect?</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            Our schema markup tester inspects raw server HTML responses for three primary structured data specifications recognized by search engines:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base">
            <li>
              <strong>JSON-LD (JavaScript Object Notation for Linked Data):</strong> Parses standard <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">&lt;script type=&quot;application/ld+json&quot;&gt;</code> blocks, extracts root and <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">@graph</code> entities, and unpacks serialized Next.js script payloads.
            </li>
            <li>
              <strong>Microdata:</strong> Detects top-level HTML tags containing <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">itemscope</code> and valid Schema.org <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">itemtype</code> attributes.
            </li>
            <li>
              <strong>RDFa:</strong> Identifies top-level HTML elements using <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">typeof</code> attributes paired with Schema.org vocabulary mappings.
            </li>
          </ul>
          <p className="text-xs sm:text-sm text-[var(--im-text-muted)] bg-[var(--im-bg-soft)] p-3 rounded-lg border border-[var(--im-border)]">
            <em>Important scope note:</em> This tool detects declared Schema.org types and formats in static HTML. It does not evaluate Google rich-result eligibility rules or execute client-side JavaScript. To inspect schema injected after client-side JavaScript execution, use our <a href="/tools/fetch-render" className="text-[var(--im-primary-deep)] underline hover:opacity-80">Fetch &amp; Render tool</a>.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Why Check Structured Data on Your Website?</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-3">
          <p>
            Structured data provides explicit clues about the meaning of a page to search engine algorithms. Bulk checking provides critical practical advantages:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1">Verify Template Rollouts</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                Ensure new CMS themes or e-commerce updates consistently output valid schema on all product, category, and article pages.
              </p>
            </div>
            <div className="p-3.5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1">Catch Omissions Fast</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                Spot orphan pages or sections where schema plugins failed to render or where custom scripts broke during website deployments.
              </p>
            </div>
            <div className="p-3.5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1">Support Technical Audits</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                Export clean CSV spreadsheets for clients or stakeholders during site migrations, redesigns, and technical SEO reviews.
              </p>
            </div>
            <div className="p-3.5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1">Generate Missing Markup</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                When pages lack markup, use our <a href="/tools/schema-generator" className="text-[var(--im-primary-deep)] underline hover:opacity-80">Schema Markup Generator</a> to create clean JSON-LD blocks for immediate implementation.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );

  const faq = [
    {
      question: 'What is a bulk schema checker?',
      answer: 'A bulk schema checker is an automated SEO audit utility that tests multiple web pages simultaneously for structured data markup. Instead of manually inspecting URLs one by one in developer tools, a bulk checker extracts declared Schema.org types across dozens of pages at once, helping you verify deployment consistency and identify missing markup across your website.',
    },
    {
      question: 'How can I check schema markup on multiple URLs?',
      answer: 'Paste your list of URLs—up to 100 per check—into the input field, with one URL per line. Click "Check Schema" to begin. The tool fetches each page\'s server HTML response, scans for structured data, and outputs a clean table detailing whether schema was found and which Schema.org types were detected.',
    },
    {
      question: 'What types of structured data can this tool detect?',
      answer: 'The tool detects all three major Schema.org implementations: JSON-LD (including @graph structures and Next.js script payloads), Microdata (using itemscope and itemtype attributes), and RDFa (using typeof attributes with Schema.org vocabularies). It normalizes detected entities and reports their specific Schema.org type names.',
    },
    {
      question: 'Can I check JSON-LD schema markup using this tool?',
      answer: 'Yes. JSON-LD is the format recommended by Google and the W3C. Our checker parses standard application/ld+json script tags, handles MIME variations and charset parameters, extracts entities from @graph arrays, and unpacks embedded Next.js script objects without requiring browser-heavy JavaScript execution.',
    },
    {
      question: 'Why is schema markup not detected on my page?',
      answer: 'Schema might not be detected if it is injected dynamically by client-side JavaScript after initial HTML delivery, if server firewalls block crawler requests, if the script contains invalid syntax, or if non-Schema.org vocabularies are used. If your site relies on client-side rendering, use Fetch & Render to inspect the post-execution DOM.',
    },
    {
      question: 'Is a bulk schema checker different from Google\'s Rich Results Test?',
      answer: 'Yes. This tool is a high-speed presence and format detector designed to audit up to 100 pages at once for declared Schema.org types. In contrast, Google\'s Rich Results Test evaluates whether single URLs satisfy Google\'s specific required and recommended fields for search rich snippet enhancements.',
    },
  ];

  return (
    <ToolLayout
      title="Free Bulk Schema Checker"
      description="Check schema markup across multiple web pages with Indian Marketers' free Bulk Schema Checker. Enter your URLs to identify detected structured data and schema types in one place, making it easier to review schema implementation across your website."
      category="Search Appearance"
      breadcrumbs={[
        { label: 'Tools', href: '/tools' },
        { label: 'Bulk Schema Checker' },
      ]}
      aboutTitle="What Is a Bulk Schema Checker?"
      aboutText={aboutText}
      howItWorksTitle="How to Check Schema Markup Across Multiple URLs"
      howItWorks={howItWorks}
      faqTitle="Bulk Schema Checker FAQs"
      faq={faq}
      extraSections={extraSections}
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
          <div className="overflow-x-auto touch-scroll rounded-[var(--im-radius-md)] border border-[var(--im-border)] shadow-[var(--im-shadow-sm)]">
            <table className="w-full text-sm border-collapse min-w-[500px]">
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
