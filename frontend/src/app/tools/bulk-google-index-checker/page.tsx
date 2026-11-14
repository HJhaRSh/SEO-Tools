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
        const reasonParam = params.get('reason');
        const reasonDetails: Record<string, string> = {
          redirect_uri_mismatch: 'Redirect URI mismatch with Google Cloud Console.',
          invalid_client: 'Invalid OAuth Client ID or Client Secret.',
          invalid_grant: 'Authorization code expired or already used. Please try again.',
          unauthorized_client: 'OAuth client not authorized for this request.',
        };
        const errorMessages: Record<string, string> = {
          OAUTH_NOT_CONFIGURED: 'Google OAuth is not configured on the server.',
          CSRF_STATE_MISMATCH: 'Authorization security state mismatch. Please try connecting again.',
          MISSING_AUTHORIZATION_CODE: 'Google authorization was canceled or did not return a valid code.',
          TOKEN_EXCHANGE_FAILED: reasonParam && reasonDetails[reasonParam]
            ? `Google token exchange failed: ${reasonDetails[reasonParam]}`
            : 'Could not complete token exchange with Google. Please retry.',
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
      question: 'What is a bulk Google index checker?',
      answer: 'A bulk Google index checker is an SEO tool that allows webmasters and SEO professionals to verify the Google indexing status of multiple URLs simultaneously rather than checking them one by one in Google Search Console.'
    },
    {
      question: 'How does this tool check Google indexing status in bulk?',
      answer: "The tool connects securely to the official Google Search Console URL Inspection API. When you paste up to 100 URLs from a verified property, the tool queries Google's inspection service in batches and retrieves Google's authoritative recorded index status, coverage reasons, and canonical details."
    },
    {
      question: 'Why is Google Search Console access required?',
      answer: 'Google treats indexing records, crawl history, and canonical verdicts as private site data. Google only shares authoritative indexing information through its official URL Inspection API with Google accounts that have verified ownership or permission on the property. Competitor sites cannot be inspected via this API.'
    },
    {
      question: 'Is the Bulk Google Index Checker free to use?',
      answer: "Yes. Indian Marketers' Bulk Google Index Checker is 100% free with no subscription or credit card required. You can inspect up to 100 URLs per batch across any verified Search Console property."
    },
    {
      question: 'Why are some of my website URLs not indexed by Google?',
      answer: 'URLs may be excluded from Google\'s index due to noindex directives, robots.txt crawl blocks, canonical tags pointing to alternative URLs, soft 404 errors, server timeouts, thin or duplicate content, or because newly published pages have not yet been evaluated by Googlebot.'
    },
    {
      question: 'How accurate are the indexing results?',
      answer: "The results are 100% authoritative because they come directly from Google's recorded search index via the official URL Inspection API. Note that the API returns the recorded status from Googlebot's most recent crawl rather than performing an immediate live URL fetch."
    },
    {
      question: 'Can I request Google indexing or force crawling through this tool?',
      answer: "No. This tool is strictly an indexing checker, not an indexing submission service. Google's URL Inspection API only permits reading recorded inspection data; it does not support requesting crawls. (Note: Google's Indexing API is a separate service restricted exclusively to JobPosting and BroadcastEvent structured data, not general website URLs.)"
    }
  ];

  const howItWorks = [
    'Connect Google Search Console: Click "Connect Google Search Console" to authorize secure, read-only access (webmasters.readonly). The tool never receives write access, passwords, or site modification rights.',
    'Select Verified Property: Choose your target domain property (e.g. sc-domain:example.com) or URL-prefix property from the authenticated property dropdown.',
    'Enter Multiple URLs: Paste up to 100 URLs belonging to the selected property into the input field (one URL per line, or click "Load Sample URLs"). The tool automatically normalizes and deduplicates inputs.',
    'Execute Bulk Inspection: Click "Check Indexing Status" to launch the inspection. The engine queries Google\'s URL Inspection API in batched requests with automated rate handling and exponential backoff.',
    'Analyze Verdicts and Diagnostics: Review indexed status badges (Indexed, Not Indexed, Alternate / Canonicalized), Google-selected canonical URLs, crawl timestamps, and live HTML metadata.',
    'Export Batch Reports: Download your complete batch audit as an RFC-compliant CSV spreadsheet or copy formatted tabular rows to your clipboard for client audits and team tracking.'
  ];

  const aboutText = (
    <div className="space-y-4">
      <p>
        A bulk Google index checker is an essential technical SEO utility designed to audit the Google search indexing status of multiple website URLs simultaneously. For websites managing hundreds or thousands of pages, inspecting URLs one by one in Google Search Console is time-consuming and inefficient. Indian Marketers&apos; free Bulk Google Index Checker automates this verification by querying Google&apos;s official URL Inspection API, allowing site owners and SEO professionals to review index coverage across batches of up to 100 URLs per session.
      </p>
      <p>
        Crucially, <strong>indexing</strong> and <strong>ranking</strong> represent two distinct stages in Google Search. <em>Indexing</em> means Googlebot has crawled and processed a webpage, analyzed its textual content and rendered structure, and stored it in Google&apos;s search index so it is eligible to appear in search results. In contrast, <em>ranking</em> is Google&apos;s algorithmic sorting of eligible indexed pages for specific search queries. A webpage must be indexed before it can rank, but indexing does not guarantee organic impressions or top-three SERP positions.
      </p>
    </div>
  );

  const extraSections = (
    <>
      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Understanding Google Indexing Results</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            When inspecting URLs with this tool, each entry is classified according to Google&apos;s recorded Search Console inspection response:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1.5 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                Indexed
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Google has crawled, processed, and included the URL in its search index. Coverage states include &quot;Submitted and indexed&quot; or &quot;Indexed, not submitted in sitemap&quot;. The URL is eligible to appear in organic Google search queries.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1.5 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                Not Indexed
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Google discovered or crawled the URL but excluded it from the search index. Common coverage reasons include noindex tags, crawl anomalies, Soft 404s, or exclusion under Google&apos;s quality heuristics.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1.5 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                Alternate / Canonicalized
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Google recognized the URL as an alternate version of another page (such as a duplicate page, paginated variation, or URL with an explicit rel=&quot;canonical&quot; pointing to a different primary page). Google indexed the canonical URL instead.
              </p>
            </div>
          </div>
          <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs sm:text-sm text-amber-900 leading-relaxed">
            <strong>Important note on inspection data:</strong> The results returned reflect Google&apos;s <em>recorded</em> index status from Googlebot&apos;s most recent crawl of each page. The URL Inspection API does not execute an immediate live web fetch or force Googlebot to re-index pages on demand.
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Why Are Some Website URLs Not Indexed?</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-3">
          <p>
            Googlebot crawls trillions of URLs across the web, but Google is selective about which pages it indexes. Common technical and algorithmic causes for unindexed URLs include:
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm">
            <li className="p-3 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <strong className="text-[var(--im-heading)] block mb-1">Noindex Directives:</strong>
              A <code className="bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-[var(--im-border)]">&lt;meta name=&quot;robots&quot; content=&quot;noindex&quot;&gt;</code> tag or <code className="bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-[var(--im-border)]">X-Robots-Tag: noindex</code> header explicitly prohibits Google from adding the URL to its search index.
            </li>
            <li className="p-3 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <strong className="text-[var(--im-heading)] block mb-1">Robots.txt Blocking:</strong>
              A <code className="bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-[var(--im-border)]">Disallow</code> directive blocks Googlebot from crawling the URL. (Note: Google may still index a blocked URL if other web pages link to it, but cannot read its content.)
            </li>
            <li className="p-3 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <strong className="text-[var(--im-heading)] block mb-1">Canonicalization Discrepancies:</strong>
              When multiple URLs share similar content, Google selects one primary canonical version. If the user-declared canonical contradicts internal link signals, Google may select an alternate URL.
            </li>
            <li className="p-3 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <strong className="text-[var(--im-heading)] block mb-1">Soft 404 &amp; Server Errors:</strong>
              Pages returning empty content, thin boilerplate, or broken templates while returning a 200 HTTP status code are classified as Soft 404s and dropped from indexing.
            </li>
            <li className="p-3 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <strong className="text-[var(--im-heading)] block mb-1">Crawl Budget &amp; Discovery Delays:</strong>
              Newly published pages or deeply nested URLs lacking internal links and XML sitemap references may take several crawl cycles before Googlebot schedules them for evaluation.
            </li>
            <li className="p-3 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <strong className="text-[var(--im-heading)] block mb-1">Thin or Duplicate Content:</strong>
              Google&apos;s indexing algorithms evaluate page quality. Pages with duplicate or automated content may be crawled but excluded under &quot;Crawled - currently not indexed&quot;.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What to Do When URLs Are Not Indexed</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-3">
          <p>
            When your bulk index check reveals unindexed or excluded URLs, perform these diagnostic follow-up checks:
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-xs sm:text-sm">
            <li>
              <strong>Verify Crawler Access Directives:</strong> Test whether your robots.txt accidentally blocks Googlebot or critical JavaScript resources using our <a href="/tools/robots-txt-tester" className="text-[var(--im-primary-deep)] font-medium underline hover:opacity-80">robots.txt Tester</a>.
            </li>
            <li>
              <strong>Submit via Valid XML Sitemap:</strong> Ensure all canonical, index-eligible URLs are included in a clean sitemap and submitted to Search Console using our <a href="/tools/sitemap-generator" className="text-[var(--im-primary-deep)] font-medium underline hover:opacity-80">XML Sitemap Generator</a>.
            </li>
            <li>
              <strong>Inspect JavaScript Rendering &amp; Metadata:</strong> Check whether client-side rendering delays or missing initial HTML tags prevent Googlebot from processing your page with our <a href="/tools/fetch-render" className="text-[var(--im-primary-deep)] font-medium underline hover:opacity-80">Fetch &amp; Render</a> tool.
            </li>
            <li>
              <strong>Confirm Mobile-First Parity:</strong> Verify that mobile Googlebot receives identical content, internal links, and canonical tags as desktop bots using our <a href="/tools/mobile-first-index" className="text-[var(--im-primary-deep)] font-medium underline hover:opacity-80">Mobile-First Index Tool</a>.
            </li>
            <li>
              <strong>Strengthen Internal Linking:</strong> Add contextual internal links from relevant, high-authority indexed pages on your domain to help Googlebot discover and prioritize new URLs.
            </li>
          </ol>
          <p className="text-xs text-[var(--im-text-muted)] pt-1 italic">
            * Note: Resolving crawl and accessibility issues makes URLs eligible for indexing, but search engines ultimately determine indexing based on topical utility, uniqueness, and algorithmic site quality.
          </p>
        </div>
      </section>
    </>
  );

  const relatedTools = [
    {
      name: 'XML Sitemap Generator',
      href: '/tools/sitemap-generator',
      desc: 'Generate, crawl, and validate standard XML sitemaps to submit unindexed URLs to Google Search Console.'
    },
    {
      name: 'robots.txt Tester',
      href: '/tools/robots-txt-tester',
      desc: 'Verify whether URLs reported as Not Indexed or Crawl Anomaly are accidentally blocked from Googlebot under RFC 9309.'
    },
    {
      name: 'Fetch & Render',
      href: '/tools/fetch-render',
      desc: 'Inspect how Googlebot renders your page in headless Chromium and detect JavaScript rendering discrepancies.'
    }
  ];

  return (
    <ToolLayout
      title="Free Bulk Google Index Checker"
      description="Check the Google indexing status of multiple URLs using Indian Marketers' free Bulk Google Index Checker. Connect your Google Search Console account with read-only access to inspect recorded indexing verdicts, coverage states, and live page metadata in one place."
      category="Crawling & Access"
      breadcrumbs={[
        { label: 'Tools', href: '/tools' },
        { label: 'Bulk Google Index Checker' }
      ]}
      aboutTitle="What Is a Bulk Google Index Checker?"
      aboutText={aboutText}
      howItWorksTitle="How to Check Google Indexing Status in Bulk"
      howItWorks={howItWorks}
      extraSections={extraSections}
      faq={faqs}
      relatedTools={relatedTools}
    >
      {/* Toast Notification */}
      {actionNotice && (
        <div className="fixed bottom-6 right-6 z-50 transition-all transform ease-out duration-200">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 border ${actionNotice.type === 'success'
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
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${filter === f.id
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
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${item.googleIndexStatus === 'indexed'
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
