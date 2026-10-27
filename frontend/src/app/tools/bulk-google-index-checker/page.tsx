'use client';

import React, { useState, useEffect, useMemo, useId, useRef } from 'react';
import ToolLayout from '@/components/ToolLayout';
import type {
  InspectionRowResult,
  GoogleIndexVerdict,
  GscProperty,
  AuthStatusResponse,
  InspectionSummary,
} from '@/lib/seo/bulk-google-index-checker/types';
import { VERDICT_LABELS } from '@/lib/seo/bulk-google-index-checker/types';
import { normalizeInputUrls, MAX_BATCH_CAPACITY } from '@/lib/seo/bulk-google-index-checker/urlUtils';
import {
  generateInspectionCsv,
  triggerCsvDownload,
  formatTabularResults,
  copyTextToClipboard,
} from '@/lib/seo/bulk-google-index-checker/csvUtils';

type FilterType =
  | 'all'
  | 'indexed'
  | 'not_indexed'
  | 'canonicalized'
  | 'unknown'
  | 'check_failed'
  | 'missing_title'
  | 'missing_description';

type SortField = 'url' | 'status' | 'titleLength' | 'descLength';
type SortOrder = 'asc' | 'desc';

export default function BulkGoogleIndexCheckerPage() {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse>({
    configured: false,
    connected: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [rawInput, setRawInput] = useState('');
  const [items, setItems] = useState<InspectionRowResult[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [progressCount, setProgressCount] = useState<number>(0);
  const [totalToProcess, setTotalToProcess] = useState<number>(0);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('url');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [actionNotice, setActionNotice] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const isCancelledRef = useRef(false);
  const inputId = useId();

  // Load Auth Status on mount
  const checkAuthStatus = async () => {
    try {
      setAuthLoading(true);
      const res = await fetch('/api/seo/bulk-google-index-checker/auth/status');
      const data: AuthStatusResponse = await res.json();
      setAuthStatus(data);
      if (data.connected && data.properties && data.properties.length > 0) {
        setSelectedProperty((prev) => (prev ? prev : data.properties![0].siteUrl));
      }
    } catch {
      setAuthStatus({ configured: false, connected: false });
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();

    // Check URL parameters for OAuth errors or successes
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const authParam = params.get('auth');
      const errParam = params.get('error');

      if (authParam === 'success') {
        showNotice('Successfully connected to Google Search Console!', 'success');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (errParam) {
        const errorMessages: Record<string, string> = {
          OAUTH_NOT_CONFIGURED: 'Google OAuth is not configured on the server.',
          CSRF_STATE_MISMATCH: 'Authorization security state mismatch. Please try connecting again.',
          MISSING_AUTHORIZATION_CODE: 'Google authorization was canceled or did not return a valid code.',
          TOKEN_EXCHANGE_FAILED: 'Could not complete token exchange with Google. Please retry.',
        };
        showNotice(errorMessages[errParam] || `Authentication error: ${errParam}`, 'error');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  const showNotice = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setActionNotice({ message, type });
  };

  useEffect(() => {
    if (actionNotice) {
      const timer = setTimeout(() => setActionNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionNotice]);

  // Handle Disconnect
  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your Google Search Console account from this tool?')) {
      return;
    }
    try {
      await fetch('/api/seo/bulk-google-index-checker/auth/disconnect', { method: 'POST' });
      setAuthStatus((prev) => ({ ...prev, connected: false, properties: [] }));
      setSelectedProperty('');
      showNotice('Google Search Console account disconnected.', 'info');
    } catch {
      showNotice('Error disconnecting account.', 'error');
    }
  };

  // Helper for sample URLs based on selected property
  const handleLoadSampleUrls = () => {
    if (!selectedProperty) {
      setRawInput(
        [
          'https://example.com/',
          'https://example.com/about',
          'https://example.com/blog/post-one',
          'https://example.com/contact',
        ].join('\n')
      );
      return;
    }

    if (selectedProperty.startsWith('sc-domain:')) {
      const domain = selectedProperty.replace('sc-domain:', '');
      setRawInput(
        [
          `https://${domain}/`,
          `https://${domain}/about`,
          `https://${domain}/blog/sample-post`,
          `https://${domain}/contact`,
        ].join('\n')
      );
    } else {
      const base = selectedProperty.endsWith('/') ? selectedProperty.slice(0, -1) : selectedProperty;
      setRawInput([`${base}/`, `${base}/about`, `${base}/pricing`, `${base}/contact`].join('\n'));
    }
  };

  // Run the batch indexing check
  const handleCheckIndexing = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authStatus.connected) {
      showNotice('Please connect your Google Search Console account first.', 'error');
      return;
    }

    if (!selectedProperty) {
      showNotice('Please select a Search Console website property.', 'error');
      return;
    }

    const { validUrls, errors } = normalizeInputUrls(rawInput);

    if (validUrls.length === 0 && errors.length === 0) {
      showNotice('Please enter at least one URL to inspect.', 'error');
      return;
    }

    isCancelledRef.current = false;
    setIsChecking(true);
    setProgressCount(0);
    setTotalToProcess(validUrls.length);

    // Initialize item placeholders with pending state
    const initialItems: InspectionRowResult[] = validUrls.map((url, idx) => ({
      id: `${Date.now()}-${idx}`,
      url,
      googleIndexStatus: 'unknown',
      verdict: null,
      coverageState: 'Waiting in queue...',
      indexingState: null,
      pageFetchState: null,
      robotsTxtState: null,
      crawledAs: null,
      lastGoogleCrawl: null,
      googleCanonical: null,
      userCanonical: null,
      sitemap: [],
      referringUrls: [],
      metaTitle: null,
      titleLength: 0,
      metaDescription: null,
      descriptionLength: 0,
      metadataStatus: 'missing',
      checkedAt: new Date().toISOString(),
      inspectionCheckedAt: null,
      error: null,
    }));

    // Append syntax error items immediately
    errors.forEach((err, idx) => {
      initialItems.push({
        id: `err-${Date.now()}-${idx}`,
        url: err.url,
        googleIndexStatus: 'check_failed',
        verdict: 'INVALID_URL',
        coverageState: err.error,
        indexingState: null,
        pageFetchState: null,
        robotsTxtState: null,
        crawledAs: null,
        lastGoogleCrawl: null,
        googleCanonical: null,
        userCanonical: null,
        sitemap: [],
        referringUrls: [],
        metaTitle: null,
        titleLength: 0,
        metaDescription: null,
        descriptionLength: 0,
        metadataStatus: 'error',
        checkedAt: new Date().toISOString(),
        inspectionCheckedAt: null,
        error: err.error,
      });
    });

    setItems(initialItems);

    // Process valid URLs in chunks of 5
    const CHUNK_SIZE = 5;
    const accumulatedResults: InspectionRowResult[] = [];
    let processedSoFar = 0;

    for (let i = 0; i < validUrls.length; i += CHUNK_SIZE) {
      if (isCancelledRef.current) {
        showNotice('URL inspection was canceled by user.', 'info');
        break;
      }

      const chunk = validUrls.slice(i, i + CHUNK_SIZE);

      try {
        const res = await fetch('/api/seo/bulk-google-index-checker/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: chunk,
            siteUrl: selectedProperty,
          }),
        });

        if (res.status === 401) {
          setAuthStatus((prev) => ({ ...prev, connected: false }));
          showNotice('Your Google authorization has expired. Please reconnect.', 'error');
          break;
        }

        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          accumulatedResults.push(...data.results);
          processedSoFar += chunk.length;
          setProgressCount(processedSoFar);

          // Update state live as chunks finish
          const resultMap = new Map<string, InspectionRowResult>();
          accumulatedResults.forEach((r) => resultMap.set(r.url, r));

          setItems((prev) =>
            prev.map((item) => (resultMap.has(item.url) ? resultMap.get(item.url)! : item))
          );
        } else {
          throw new Error(data.error || 'Failed to inspect chunk');
        }
      } catch (err: any) {
        showNotice(`Inspection issue on batch chunk: ${err.message}`, 'error');
      }
    }

    setIsChecking(false);
    if (!isCancelledRef.current) {
      showNotice(`Completed indexing inspection for ${processedSoFar} URLs.`, 'success');
    }
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setIsChecking(false);
  };

  // Summary Metrics
  const summary: InspectionSummary = useMemo(() => {
    return {
      total: items.length,
      indexedCount: items.filter((i) => i.googleIndexStatus === 'indexed').length,
      notIndexedCount: items.filter((i) => i.googleIndexStatus === 'not_indexed').length,
      canonicalizedCount: items.filter((i) => i.googleIndexStatus === 'canonicalized').length,
      unknownCount: items.filter((i) => i.googleIndexStatus === 'unknown').length,
      failedCount: items.filter((i) => i.googleIndexStatus === 'check_failed').length,
      missingTitleCount: items.filter((i) => !i.metaTitle).length,
      missingDescriptionCount: items.filter((i) => !i.metaDescription).length,
    };
  }, [items]);

  // Filter & Sort Items
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    if (filter === 'indexed') {
      result = result.filter((i) => i.googleIndexStatus === 'indexed');
    } else if (filter === 'not_indexed') {
      result = result.filter((i) => i.googleIndexStatus === 'not_indexed');
    } else if (filter === 'canonicalized') {
      result = result.filter((i) => i.googleIndexStatus === 'canonicalized');
    } else if (filter === 'unknown') {
      result = result.filter((i) => i.googleIndexStatus === 'unknown');
    } else if (filter === 'check_failed') {
      result = result.filter((i) => i.googleIndexStatus === 'check_failed');
    } else if (filter === 'missing_title') {
      result = result.filter((i) => !i.metaTitle);
    } else if (filter === 'missing_description') {
      result = result.filter((i) => !i.metaDescription);
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.url.toLowerCase().includes(q) ||
          (i.coverageState && i.coverageState.toLowerCase().includes(q)) ||
          (i.metaTitle && i.metaTitle.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'url') {
        cmp = a.url.localeCompare(b.url);
      } else if (sortField === 'status') {
        cmp = a.googleIndexStatus.localeCompare(b.googleIndexStatus);
      } else if (sortField === 'titleLength') {
        cmp = a.titleLength - b.titleLength;
      } else if (sortField === 'descLength') {
        cmp = a.descriptionLength - b.descriptionLength;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [items, filter, searchFilter, sortField, sortOrder]);

  const handleDownloadCsv = () => {
    if (items.length === 0) return;
    const csv = generateInspectionCsv(items);
    triggerCsvDownload(csv);
    showNotice(`Downloaded CSV report for ${items.length} URLs.`, 'success');
  };

  const handleCopyResults = async () => {
    if (items.length === 0) return;
    const tsv = formatTabularResults(items);
    const ok = await copyTextToClipboard(tsv);
    if (ok) {
      showNotice(`Copied tabular results for ${items.length} URLs to clipboard.`, 'success');
    }
  };

  const handleCopyUrls = async () => {
    if (items.length === 0) return;
    const text = items.map((i) => i.url).join('\n');
    const ok = await copyTextToClipboard(text);
    if (ok) {
      showNotice(`Copied ${items.length} URLs to clipboard.`, 'success');
    }
  };

  const handleClearAll = () => {
    setRawInput('');
    setItems([]);
    setExpandedRowId(null);
    showNotice('Cleared all inputs and results.', 'info');
  };

  const faqs = [
    {
      question: 'Is the Bulk Google Index Checker free?',
      answer: 'Yes. The Bulk Google Index Checker is 100% free to use. You simply connect your Google Search Console account with read-only permissions to inspect up to 100 URLs per session.'
    },
    {
      question: 'Why do I need Search Console access?',
      answer: 'Google treats indexing records, coverage states, crawl history, and canonical choices as private search engine data. Google only shares this information via the official URL Inspection API with accounts that have verified ownership or permission on the property.'
    },
    {
      question: 'Can I check multiple URLs together?',
      answer: 'Yes. You can paste up to 100 URLs at a time from your selected property. The tool automatically batches requests and retrieves indexing information directly from Google.'
    },
    {
      question: 'Can I inspect competitor websites?',
      answer: 'No. The Google URL Inspection API requires verified property ownership in Google Search Console. You can only inspect websites where your Google account has verified property access.'
    },
    {
      question: 'What does Not Indexed mean?',
      answer: 'Not Indexed means Google has crawled or discovered the URL but chose not to include it in the search index, or excluded it due to reasons such as a noindex tag, crawl anomaly, soft 404, or canonicalization.'
    },
    {
      question: 'Can I export indexing results?',
      answer: 'Yes. You can export the complete batch report as an RFC-compliant CSV spreadsheet, including Google indexing verdicts, coverage reasons, canonical URLs, last crawl timestamps, and live metadata.'
    },
    {
      question: 'Does the tool show meta titles and descriptions?',
      answer: 'Yes. In addition to Google indexing data, the tool concurrently extracts the live HTML meta title, meta description, and character counts directly from the public webpage.'
    },
    {
      question: "How current is Google's indexing information?",
      answer: "The data returned is Google's recorded index status from Googlebot's most recent crawl. It reflects what Google's search index currently knows about your page."
    },
    {
      question: 'Does connecting Google give the tool editing permissions?',
      answer: 'No. The tool requests strictly read-only access (https://www.googleapis.com/auth/webmasters.readonly). It cannot edit your sitemaps, modify settings, or change website verification.'
    },
    {
      question: 'What happens when I disconnect?',
      answer: 'Clicking Disconnect immediately destroys the server session cookie and attempts token revocation with Google. Your authorization token is discarded.'
    }
  ];

  // Technical explanation of the inspection engine for the bottom SEO section
  const howTheEngineWorks = [
    'OAuth 2.0 Authorization: The user signs into Google with read-only Search Console access (https://www.googleapis.com/auth/webmasters.readonly). No passwords or write permissions are granted.',
    'Property Discovery: The system calls the Google Sites API (GET /webmasters/v3/sites) to retrieve all verified domain and URL-prefix properties the user is authorized to inspect.',
    'Scope Verification & Batching: URLs pasted into the input field are validated against the selected property boundary. Unrelated URLs are filtered out to protect Google inspection quotas.',
    'URL Inspection API Execution: Valid URLs are dispatched in small batches to Google\'s official endpoint (POST /urlInspection/index:inspect) with automated exponential backoff on 429 quota responses.',
    'Live Parity & Reporting: Each URL\'s recorded index verdict (Indexed, Not Indexed, Canonicalized) is mapped alongside its live public HTML meta title and description for instant filtering, diagnostic inspection, and CSV export.'
  ];

  return (
    <ToolLayout
      title="Bulk Google Index Checker"
      description="Check Google's indexing status for multiple URLs with Search Console and view live meta titles and descriptions."
      category="Crawling & Access"
      breadcrumbs={[
        { label: 'Tools', href: '/tools' },
        { label: 'Bulk Google Index Checker' }
      ]}
      aboutText="The Bulk Google Index Checker connects directly to the official Google Search Console URL Inspection API to retrieve Google's authoritative recorded indexing information. Rather than guessing whether a page might be crawlable or scraping search engine results, it reports Google's exact index verdict, coverage state, last crawl timestamp, and Google-selected canonical URLs, alongside live public HTML meta titles and descriptions."
      howItWorks={howTheEngineWorks}
      faq={faqs}
    >
      {/* Toast Notification */}
      {actionNotice && (
        <div className="fixed bottom-6 right-6 z-50 transition-all transform ease-out duration-200">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 border ${
              actionNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : actionNotice.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-300'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            <span>{actionNotice.message}</span>
          </div>
        </div>
      )}

      {/* SECTION: 4-STEP QUICK START GUIDE (Light Theme) */}
      <section className="bg-white border border-[var(--im-border)] rounded-2xl p-5 sm:p-6 mb-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-[var(--im-heading)] uppercase tracking-wider flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#47A048]"></span>
            Quick Start Guide: 4 Simple Steps
          </h2>
          <span className="text-xs text-[var(--im-text-muted)] hidden sm:inline">
            Official Search Console URL Inspection API
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Step 1 */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center mb-2.5 border border-emerald-200">
              1
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Connect Search Console</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Click Connect Google Search Console and sign in with an account that has access to your website.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center mb-2.5 border border-emerald-200">
              2
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Select Your Website</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Choose the website you want to check from the list of Search Console properties connected to your account.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center mb-2.5 border border-emerald-200">
              3
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Paste Your URLs</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Enter up to 100 URLs from the selected website into the box below, with one URL per line.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center mb-2.5 border border-emerald-200">
              4
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Check &amp; Download</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Click Check Indexing to retrieve Google&apos;s indexing status, coverage reason, and live meta tags. Download as CSV.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION: GOOGLE AUTHORIZATION & PROPERTY SELECTION (Light Theme) */}
      <section className="bg-white border border-[var(--im-border)] rounded-2xl p-5 sm:p-6 mb-6 shadow-xs">
        {authLoading ? (
          <div className="flex items-center gap-3 text-slate-500 text-sm py-4">
            <svg className="animate-spin h-5 w-5 text-emerald-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Checking Google Search Console connection...
          </div>
        ) : !authStatus.configured ? (
          // Unconfigured state
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-sm font-bold text-amber-900">Google Search Console connection is not configured yet.</h3>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Administrator setup required: Please configure <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-semibold">GOOGLE_CLIENT_ID</code>, <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-semibold">GOOGLE_CLIENT_SECRET</code>, and authorized redirect URI in your environment variables.
                </p>
              </div>
            </div>
          </div>
        ) : !authStatus.connected ? (
          // Configured but Not Connected State
          <div>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="max-w-2xl">
                <h3 className="text-base font-bold text-slate-900 mb-1.5 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                  Connect Google Search Console
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-3">
                  Google only shares a website&apos;s indexing information with accounts that have permission to access it. Connecting Search Console allows this tool to check the indexing status of your website URLs securely.
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    Read-only access
                  </span>
                  <span>We cannot modify your Search Console settings</span>
                  <span>•</span>
                  <span>No passwords stored</span>
                  <span>•</span>
                  <span>Disconnect anytime</span>
                </div>
              </div>

              <div>
                <a
                  href="/api/seo/bulk-google-index-checker/auth/login"
                  className="inline-flex items-center justify-center px-6 py-3 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-bold text-sm rounded-xl shadow-xs transition whitespace-nowrap cursor-pointer"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z" />
                  </svg>
                  Connect Google Search Console
                </a>
              </div>
            </div>
          </div>
        ) : (
          // Connected State
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100"></span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">Connected to Google Search Console</span>
                    {authStatus.userEmail && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono font-medium border border-slate-200">
                        {authStatus.userEmail}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Read-only authorization active. Select your website property to check URLs.
                  </p>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 text-xs font-semibold transition cursor-pointer"
                >
                  Disconnect Account
                </button>
              </div>
            </div>

            {/* Property Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                  Select Search Console Property (Website)
                </label>
                {!authStatus.properties || authStatus.properties.length === 0 ? (
                  <div className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
                    No Search Console properties are available for this Google account. Please ensure your account has verified access to at least one website in Google Search Console.
                  </div>
                ) : (
                  <select
                    value={selectedProperty}
                    onChange={(e) => setSelectedProperty(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {authStatus.properties.map((prop) => (
                      <option key={prop.siteUrl} value={prop.siteUrl}>
                        {prop.isDomainProperty ? `[Domain Property] ${prop.siteUrl}` : `[URL Prefix] ${prop.siteUrl}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <span className="font-bold text-slate-800 block mb-0.5">Property Scope Rule:</span>
                Submitted URLs must belong to the selected property. Any URL outside the property will be flagged and will not consume inspection quota.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION: URL INPUT (Light Theme) */}
      <section className="bg-white border border-[var(--im-border)] rounded-2xl p-5 sm:p-6 mb-6 shadow-xs">
        <form onSubmit={handleCheckIndexing}>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor={inputId} className="text-sm font-bold text-slate-900">
              Enter URLs to Inspect (Up to 100)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSampleUrls}
                className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer underline"
              >
                Load Sample URLs
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setRawInput('')}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <textarea
            id={inputId}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={5}
            placeholder={`https://example.com/\nhttps://example.com/about/\nhttps://example.com/blog/post-one/\nhttps://example.com/contact/`}
            className="w-full bg-slate-50/50 border border-slate-300 rounded-xl p-3.5 text-sm text-slate-900 placeholder:text-slate-400 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
            <div className="text-xs text-slate-500">
              One URL per line. Accepts HTTP and HTTPS. Automatically checked with Google Search Console URL Inspection API.
            </div>

            <div className="flex items-center gap-2">
              {isChecking && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={isChecking || !rawInput.trim() || !authStatus.connected || !selectedProperty}
                className="inline-flex items-center justify-center px-6 py-2.5 bg-[#47A048] hover:bg-[#3d8b3e] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-xs transition cursor-pointer"
              >
                {isChecking ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Checking {progressCount} of {totalToProcess}...
                  </span>
                ) : (
                  'Check Indexing'
                )}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* SECTION: SUMMARY METRICS CARDS (Light Theme) */}
      {items.length > 0 && (
        <section className="mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs uppercase font-semibold text-slate-500">Total URLs</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{summary.total}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs uppercase font-semibold text-emerald-700">Indexed</span>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{summary.indexedCount}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs uppercase font-semibold text-amber-700">Not Indexed</span>
              <div className="text-2xl font-bold text-amber-600 mt-1">{summary.notIndexedCount}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs uppercase font-semibold text-purple-700">Canonicalized</span>
              <div className="text-2xl font-bold text-purple-600 mt-1">{summary.canonicalizedCount}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs col-span-2 sm:col-span-1">
              <span className="text-xs uppercase font-semibold text-slate-500">Failed / Unknown</span>
              <div className="text-2xl font-bold text-slate-700 mt-1">{summary.failedCount + summary.unknownCount}</div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION: RESULTS TABLE & TOOLBAR (Light Theme) */}
      {items.length > 0 && (
        <section className="bg-white border border-[var(--im-border)] rounded-2xl p-5 sm:p-6 mb-10 shadow-xs">
          {/* Action Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Google URL Inspection Results</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {filteredAndSortedItems.length} of {items.length} URLs
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="px-3.5 py-1.5 rounded-xl bg-[#47A048] hover:bg-[#3d8b3e] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>

              <button
                type="button"
                onClick={handleCopyResults}
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Copy Results
              </button>

              <button
                type="button"
                onClick={handleCopyUrls}
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Copy URLs
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-200 hover:border-red-200 text-xs font-semibold transition cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Filters & Search Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 my-4">
            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'All' },
                { id: 'indexed', label: `Indexed (${summary.indexedCount})` },
                { id: 'not_indexed', label: `Not Indexed (${summary.notIndexedCount})` },
                { id: 'canonicalized', label: `Canonicalized (${summary.canonicalizedCount})` },
                { id: 'unknown', label: `Unknown (${summary.unknownCount})` },
                { id: 'check_failed', label: `Failed (${summary.failedCount})` },
                { id: 'missing_title', label: `Missing Title (${summary.missingTitleCount})` },
                { id: 'missing_description', label: `Missing Desc (${summary.missingDescriptionCount})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id as FilterType)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                    filter === f.id
                      ? 'bg-[#47A048] text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="w-full lg:w-64">
              <input
                type="text"
                placeholder="Search URL or coverage..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider">
                  <th
                    className="p-3 cursor-pointer hover:text-slate-900"
                    onClick={() => {
                      if (sortField === 'url') setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortField('url');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    URL {sortField === 'url' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:text-slate-900"
                    onClick={() => {
                      if (sortField === 'status') setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortField('status');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    Google Index Status {sortField === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="p-3">Coverage Reason</th>
                  <th
                    className="p-3 cursor-pointer hover:text-slate-900"
                    onClick={() => {
                      if (sortField === 'titleLength') setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortField('titleLength');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    Meta Title {sortField === 'titleLength' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:text-slate-900"
                    onClick={() => {
                      if (sortField === 'descLength') setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortField('descLength');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    Meta Description {sortField === 'descLength' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="p-3">Last Google Crawl</th>
                  <th className="p-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAndSortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      No URLs match the current filter or search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedItems.map((item) => {
                    const isExpanded = expandedRowId === item.id;

                    return (
                      <React.Fragment key={item.id}>
                        <tr className="hover:bg-slate-50/80 transition">
                          {/* URL */}
                          <td className="p-3 font-mono max-w-xs break-all">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1"
                            >
                              <span className="line-clamp-1">{item.url}</span>
                              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </td>

                          {/* Index Status */}
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                item.googleIndexStatus === 'indexed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : item.googleIndexStatus === 'not_indexed'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : item.googleIndexStatus === 'canonicalized'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : item.googleIndexStatus === 'check_failed'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {VERDICT_LABELS[item.googleIndexStatus]}
                            </span>
                          </td>

                          {/* Coverage Reason */}
                          <td className="p-3 max-w-xs text-slate-700">
                            {item.coverageState ? (
                              <span className="line-clamp-2">{item.coverageState}</span>
                            ) : (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </td>

                          {/* Title */}
                          <td className="p-3 max-w-xs text-slate-800">
                            {item.metaTitle ? (
                              <div>
                                <span className="line-clamp-1 font-medium">{item.metaTitle}</span>
                                <span className="text-[10px] text-slate-500 font-mono">({item.titleLength} chars)</span>
                              </div>
                            ) : (
                              <span className="text-amber-600 italic">Missing Title</span>
                            )}
                          </td>

                          {/* Description */}
                          <td className="p-3 max-w-sm text-slate-700">
                            {item.metaDescription ? (
                              <div>
                                <span className="line-clamp-1">{item.metaDescription}</span>
                                <span className="text-[10px] text-slate-500 font-mono">({item.descriptionLength} chars)</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Missing Description</span>
                            )}
                          </td>

                          {/* Last Google Crawl */}
                          <td className="p-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                            {item.lastGoogleCrawl ? (
                              new Date(item.lastGoogleCrawl).toLocaleDateString()
                            ) : (
                              <span className="text-slate-400 italic">Not recorded</span>
                            )}
                          </td>

                          {/* Details Toggle Action */}
                          <td className="p-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                            >
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Row Details */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 border-b border-slate-200">
                            <td colSpan={7} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <span className="text-slate-500 font-bold uppercase block mb-1">
                                    Google Canonical
                                  </span>
                                  <span className="text-slate-900 font-mono break-all font-medium">
                                    {item.googleCanonical || '(None chosen by Google)'}
                                  </span>
                                </div>

                                <div>
                                  <span className="text-slate-500 font-bold uppercase block mb-1">
                                    User-Declared Canonical
                                  </span>
                                  <span className="text-slate-900 font-mono break-all font-medium">
                                    {item.userCanonical || '(None declared on page)'}
                                  </span>
                                </div>

                                <div>
                                  <span className="text-slate-500 font-bold uppercase block mb-1">
                                    Crawl Diagnostics
                                  </span>
                                  <span className="text-slate-700 block">
                                    Robots.txt: <strong className="text-slate-900">{item.robotsTxtState || 'N/A'}</strong>
                                  </span>
                                  <span className="text-slate-700 block">
                                    Page Fetch: <strong className="text-slate-900">{item.pageFetchState || 'N/A'}</strong>
                                  </span>
                                  <span className="text-slate-700 block">
                                    Crawled As: <strong className="text-slate-900">{item.crawledAs || 'N/A'}</strong>
                                  </span>
                                </div>

                                <div>
                                  <span className="text-slate-500 font-bold uppercase block mb-1">
                                    Inspection Timestamp
                                  </span>
                                  <span className="text-slate-700 font-mono block">
                                    {item.checkedAt}
                                  </span>
                                  {item.error && (
                                    <span className="text-red-600 font-semibold block mt-1">
                                      Error: {item.error}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ToolLayout>
  );
}
