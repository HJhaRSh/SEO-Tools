'use client';

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import {
  HreflangTestUrlResponse,
  HreflangValidationItem,
  UserAgentProfile,
} from '@/lib/seo/hreflang/types';
import { generateHreflangCsv, downloadCsvFile } from '@/lib/seo/hreflang/exportResults';

type TestingMode = 'url' | 'sitemap_url' | 'sitemap_upload';
type FilterStatus = 'all' | 'errors' | 'warnings' | 'valid' | 'html' | 'header' | 'sitemap';
type SortOption = 'default' | 'errors-desc' | 'lang-asc' | 'status-asc' | 'url-asc';

export default function HreflangTester() {
  // Mode selection
  const [mode, setMode] = useState<TestingMode>('url');

  // Input states
  const [url, setUrl] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [uploadedXml, setUploadedXml] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  // Options
  const [checkReturnTags, setCheckReturnTags] = useState(true);
  const [checkLiveUrls, setCheckLiveUrls] = useState(false);
  const [userAgent, setUserAgent] = useState<UserAgentProfile>('default');

  // Request & Status states
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [responseData, setResponseData] = useState<HreflangTestUrlResponse | null>(null);

  // Table filtering, search, sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [selectedItem, setSelectedItem] = useState<HreflangValidationItem | null>(null);

  // Abort controller
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xml')) {
      setStatus('error');
      setErrorMessage('Please upload a valid .xml sitemap file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus('error');
      setErrorMessage('File size exceeds 5MB limit. Please upload a smaller sitemap or test via URL.');
      return;
    }

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setUploadedXml(content);
    };
    reader.readAsText(file);
  };

  const handleTest = async (e?: React.FormEvent, overrideUrl?: string) => {
    if (e) e.preventDefault();

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setStatus('loading');
    setErrorMessage('');
    setResponseData(null);
    setSelectedItem(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let endpoint = '/api/seo/hreflang/test-url';
      let payload: any = {};

      if (mode === 'url' || overrideUrl !== undefined) {
        if (overrideUrl !== undefined) {
          setUrl(overrideUrl);
          setMode('url');
        }
        const rawUrl = overrideUrl !== undefined ? overrideUrl : url;
        const trimmed = rawUrl.trim();
        if (!trimmed) {
          setStatus('error');
          setErrorMessage('Please enter a website URL to test.');
          return;
        }
        const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        payload = {
          url: normalized,
          checkReturnTags,
          userAgent,
        };
      } else if (mode === 'sitemap_url') {
        const trimmed = sitemapUrl.trim();
        if (!trimmed) {
          setStatus('error');
          setErrorMessage('Please enter an XML sitemap URL to test.');
          return;
        }
        endpoint = '/api/seo/hreflang/test-sitemap';
        payload = {
          sitemapUrl: trimmed,
          checkLiveUrls,
          userAgent,
        };
      } else {
        if (!uploadedXml.trim()) {
          setStatus('error');
          setErrorMessage('Please choose an XML sitemap file to upload.');
          return;
        }
        endpoint = '/api/seo/hreflang/test-sitemap';
        payload = {
          xmlContent: uploadedXml,
          checkLiveUrls,
          userAgent,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data: HreflangTestUrlResponse = await res.json();

      if (!data.success) {
        setStatus('error');
        setErrorMessage(data.error || 'Failed to inspect hreflang tags.');
        return;
      }

      setStatus('success');
      setResponseData(data);
      if (data.results && data.results.length > 0) {
        setSelectedItem(data.results[0]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setStatus('error');
      setErrorMessage(err.message || 'An unexpected error occurred while communicating with the server.');
    }
  };

  // Filtered and Sorted Table Data
  const displayedItems = useMemo(() => {
    if (!responseData?.results) return [];

    let list = [...responseData.results];

    // Filter by category
    if (filterStatus === 'errors') {
      list = list.filter((item) => item.issues.some((i) => i.severity === 'error'));
    } else if (filterStatus === 'warnings') {
      list = list.filter((item) => item.issues.some((i) => i.severity === 'warning'));
    } else if (filterStatus === 'valid') {
      list = list.filter((item) => item.issues.filter((i) => i.severity === 'error').length === 0);
    } else if (filterStatus === 'html') {
      list = list.filter((item) => item.annotation.source === 'HTML');
    } else if (filterStatus === 'header') {
      list = list.filter((item) => item.annotation.source === 'HTTP_HEADER');
    } else if (filterStatus === 'sitemap') {
      list = list.filter((item) => item.annotation.source === 'XML_SITEMAP');
    }

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((item) => {
        const inHreflang = item.annotation.hreflang.toLowerCase().includes(q);
        const inUrl = item.annotation.href.toLowerCase().includes(q);
        const inLang = (item.annotation.language || '').toLowerCase().includes(q);
        const inRegion = (item.annotation.region || '').toLowerCase().includes(q);
        const inMsg = item.issues.some((iss) => iss.message.toLowerCase().includes(q));
        return inHreflang || inUrl || inLang || inRegion || inMsg;
      });
    }

    // Sorting
    if (sortBy === 'errors-desc') {
      list.sort((a, b) => {
        const aErr = a.issues.filter((i) => i.severity === 'error').length;
        const bErr = b.issues.filter((i) => i.severity === 'error').length;
        return bErr - aErr;
      });
    } else if (sortBy === 'lang-asc') {
      list.sort((a, b) => a.annotation.hreflang.localeCompare(b.annotation.hreflang));
    } else if (sortBy === 'status-asc') {
      list.sort((a, b) => (a.statusCode || 999) - (b.statusCode || 999));
    } else if (sortBy === 'url-asc') {
      list.sort((a, b) => a.annotation.href.localeCompare(b.annotation.href));
    }

    return list;
  }, [responseData, filterStatus, searchTerm, sortBy]);

  const handleExportCsv = () => {
    if (!responseData?.results || responseData.results.length === 0) return;
    const csvData = generateHreflangCsv(displayedItems);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadCsvFile(csvData, `hreflang-validation-${dateStr}.csv`);
  };

  const aboutText = (
    <div className="space-y-4">
      <p>
        An <strong>hreflang checker</strong> is an essential international technical SEO diagnostic tool designed to evaluate language and regional annotations implemented on multilingual and multi-regional websites. When a website serves localized versions of content for distinct geographies or languages, hreflang annotations instruct search engines like Google and Bing which regional variant to display in local search results. Operating under official Google Search Central guidelines, our free <strong>hreflang validator</strong> parses declarations across HTML header tags, HTTP headers, and XML sitemaps to verify that localized URL variations are connected correctly.
      </p>
      <p>
        Implementing hreflang correctly is notoriously challenging because search engines enforce strict technical requirements: language codes must adhere to ISO 639-1, country codes must follow ISO 3166-1 Alpha-2, each alternate URL must include a self-referencing tag, and all localized variants must confirm reciprocal return links. While hreflang helps Google match the right regional page to the right searcher, it does not guarantee rank or substitute for canonical tags. To inspect how search bots render your initial HTML head tags, use our <Link href="/tools/fetch-render" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Fetch &amp; Render</Link> tool. To confirm that your international URLs are indexed in Google, inspect them with the <Link href="/tools/bulk-google-index-checker" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Bulk Google Index Checker</Link>.
      </p>
    </div>
  );

  const howItWorksSteps = [
    "Select testing mode: single Webpage URL, XML Sitemap URL, or local XML sitemap file upload.",
    "Enter the target URL or upload your sitemap file, then optionally customize the crawler user agent and alternate crawl depth.",
    "Click 'Test Webpage Hreflang' or 'Test Sitemap Hreflang' to begin automated fetching and validation.",
    "The engine extracts hreflang declarations across HTML head link elements, HTTP response headers, and XML sitemaps.",
    "It verifies ISO 639-1 language codes, ISO 3166-1 region codes, self-referencing declarations, and x-default annotations.",
    "It inspects live alternate URLs for reciprocal return tags, HTTP 200 status, redirect chains, canonical alignment, and indexability."
  ];

  const extraSections = (
    <>
      {/* WHAT DOES OUR HREFLANG VALIDATOR CHECK? */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our Hreflang Validator Check?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              ISO Language and Region Codes
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Verifies that language codes strictly follow two-letter ISO 639-1 standards (e.g., <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">en</code>, <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">es</code>, <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">de</code>) and optional region codes adhere to ISO 3166-1 Alpha-2 (e.g., <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">en-US</code>, <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">en-GB</code>). Flags invalid country codes such as <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-rose-600">en-UK</code>.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Reciprocal Return Links
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Performs bidirectional link validation. If Page A designates Page B as an alternate language version, Page B must confirm that relationship by declaring Page A as an alternate. Missing reciprocal return links cause Google to disregard the affected hreflang annotations.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Self-Referencing Hreflang Tags
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Confirms that the inspected URL includes a self-referencing alternate link pointing directly to itself with its assigned language and regional tag. Google requires self-referencing tags to validate the complete cluster of localized variations.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              x-default Fallback Annotations
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Inspects the presence and formatting of the <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">x-default</code> value. While not mandatory for every site, x-default provides an intentional fallback page for global users whose language or region is not specifically targeted.
            </p>
          </div>
        </div>
      </section>

      {/* CHECKING HREFLANG ACROSS HTML, HTTP HEADERS, AND XML SITEMAPS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Checking Hreflang Across HTML, HTTP Headers, and XML Sitemaps</h2>
        </div>
        <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs space-y-4 text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
          <p>
            Google supports three equivalent methods to implement hreflang annotations. Website operators should choose the method that best aligns with their architecture rather than attempting to duplicate annotations across all three:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[var(--im-surface)] border border-[var(--im-border)]">
              <h3 className="font-bold text-sm text-[var(--im-heading)] mb-1.5">1. HTML Head Link Elements</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                Placed inside the <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">&lt;head&gt;</code> element of each HTML page. Ideal for smaller websites with server-rendered markup.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--im-surface)] border border-[var(--im-border)]">
              <h3 className="font-bold text-sm text-[var(--im-heading)] mb-1.5">2. HTTP Link Response Headers</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                Delivered directly via HTTP headers (<code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Link: &lt;url&gt;; rel=&quot;alternate&quot;; hreflang=&quot;...&quot;</code>). Essential for non-HTML assets like multi-language PDF downloads.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--im-surface)] border border-[var(--im-border)]">
              <h3 className="font-bold text-sm text-[var(--im-heading)] mb-1.5">3. XML Sitemap Annotations</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                Defined within XML sitemaps using <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">&lt;xhtml:link&gt;</code> elements. Reduces HTML payload size and centralizes validation. Build clean sitemaps with our <Link href="/tools/sitemap-generator" className="text-[var(--im-primary-deep)] font-semibold hover:underline">XML Sitemap Generator</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COMMON HREFLANG ERRORS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Common Hreflang Errors &amp; Practical Fixes</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 text-rose-600 dark:text-rose-400">
              Invalid Language or Country Codes
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Using standalone country codes (such as <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">es</code> when intending Spain, which Google reads as Spanish language) or unofficial codes like <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">en-UK</code> instead of <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-semibold text-emerald-600">en-GB</code>. Always use ISO 639-1 for language and ISO 3166-1 Alpha-2 for region.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 text-rose-600 dark:text-rose-400">
              Missing Reciprocal Return Links
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Declaring an alternate page without that page linking back. When return links are omitted, Google will not confirm the relationship and may ignore the annotations for the affected URL pair to prevent unverified association.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 text-rose-600 dark:text-rose-400">
              Pointing Hreflang to Redirected or Non-Canonical URLs
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Hreflang URLs should always point directly to canonical, self-resolving HTTP 200 URLs. If an alternate URL redirects (HTTP 301/302) or points to a URL that specifies a different canonical URL, search engines face conflicting indexing signals.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 text-rose-600 dark:text-rose-400">
              Blocked by Robots.txt or Noindex Directives
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              If an alternate language URL is blocked from crawling in robots.txt or carries a <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">noindex</code> directive, search engines cannot index the localized version or verify return link markup.
            </p>
          </div>
        </div>
      </section>
    </>
  );

  const faqItems = [
    {
      question: 'What is a hreflang checker?',
      answer: 'A hreflang checker is an international SEO validation tool that inspects the alternate language and regional annotations implemented on a website. It verifies that search engines like Google can correctly discover, parse, and associate localized page variations with their intended regional audiences across search engine results.'
    },
    {
      question: 'How do I check hreflang tags on a website?',
      answer: 'To check hreflang tags, enter your webpage URL or XML sitemap URL into our free Hreflang Checker (or upload a local sitemap XML file) and click test. The tool automatically fetches your annotations from HTML head link elements, HTTP headers, or XML sitemap tags, validating ISO language codes, return links, self-references, and alternate URL indexability.'
    },
    {
      question: 'What is the difference between a hreflang checker and validator?',
      answer: 'While the terms are often used interchangeably, an hreflang checker typically identifies and extracts declared alternate language tags from a page or sitemap, whereas an hreflang validator actively audits their syntax against ISO 639-1 language codes, ISO 3166-1 region codes, self-referencing presence, and live reciprocal return links.'
    },
    {
      question: "What is a 'Return Tag' (Reciprocal Link) error?",
      answer: 'If Page A declares Page B as its French alternate via hreflang, Page B must declare Page A as its English alternate. If Page B does not link back, Google ignores the hreflang relationship between those two pages to prevent third parties from falsely associating themselves with your content.'
    },
    {
      question: 'What is a self-referencing hreflang tag and why is it required?',
      answer: "A self-referencing hreflang tag is an annotation on a page that points back to the page's own URL with its matching language and region code. Google's international SEO guidelines require every localized page version to include its own self-reference in the alternate link cluster to ensure consistent clustering across all language variations."
    },
    {
      question: "What is 'x-default' and when should it be used?",
      answer: 'The x-default hreflang attribute designates a fallback URL for international searchers when no other page variant matches their language or country preferences. It is commonly implemented for homepage language selectors, country redirect splash pages, or generic international versions.'
    },
    {
      question: "Can I use 'en-UK' for users in the United Kingdom?",
      answer: "No. 'UK' is not an ISO 3166-1 Alpha-2 country code. Google officially requires the ISO 3166-1 Alpha-2 code 'GB' for the United Kingdom (e.g., 'en-GB'). Specifying 'en-UK' invalidates the regional component of the hreflang declaration."
    },
    {
      question: 'Do hreflang annotations need to be in the HTML head?',
      answer: "Yes. When implementing hreflang via HTML markup, <link rel='alternate' hreflang='...' href='...'> tags must reside within the <head> element. Tags placed in the <body> are invalid and ignored by Googlebot. Alternatively, hreflang can be implemented via HTTP Link response headers or XML sitemaps."
    },
    {
      question: 'Can hreflang tags be added through XML sitemaps?',
      answer: "Yes. XML sitemaps support hreflang using the <xhtml:link rel='alternate' hreflang='...' href='...'/> extension. Sitemap hreflang eliminates page weight overhead in HTML head and is especially effective for large multilingual sites or non-HTML documents like PDFs."
    },
    {
      question: 'What is the difference between hreflang and canonical tags?',
      answer: "Hreflang indicates localized equivalents for different languages and regions, whereas canonical tags (rel='canonical') specify the single master version among duplicate or near-identical URLs within the same language. Each localized variant should have a self-referencing canonical tag alongside reciprocal hreflang tags."
    },
    {
      question: 'Does hreflang improve Google rankings?',
      answer: 'Hreflang is not a direct ranking factor and does not inherently boost search rankings. Instead, it ensures search engines serve the most linguistically and regionally appropriate version of your content to international searchers, reducing bounce rates and improving international user experience.'
    }
  ];

  const relatedTools = [
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate valid multilingual XML sitemaps with XHTML alternate namespace tags.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Inspect crawler rendering, HTTP response headers, and international HTML head tags.' },
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: 'Inspect Google Search Console index status across international URL variants.' }
  ];

  return (
    <ToolLayout
      title="Free Hreflang Checker & Validator"
      description="Use Indian Marketers' free Hreflang Checker to validate language and region tags across webpages and XML sitemaps. Check language codes, self-referencing tags, reciprocal return links and x-default annotations to identify common international SEO issues."
      category="International SEO"
      breadcrumbs={[{ label: 'Hreflang Checker' }]}
      aboutTitle="What Is a Hreflang Checker?"
      aboutText={aboutText}
      howItWorksTitle="How to Check Hreflang Tags"
      howItWorks={howItWorksSteps}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faqItems}
      relatedTools={relatedTools}
    >
      {/* Input Section Card */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>INPUT SECTION</h2>
            
            {/* Testing Mode Selector */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMode('url')}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  mode === 'url'
                    ? 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Test Webpage URL
              </button>
              <button
                type="button"
                onClick={() => setMode('sitemap_url')}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  mode === 'sitemap_url'
                    ? 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Test Sitemap URL
              </button>
              <button
                type="button"
                onClick={() => setMode('sitemap_upload')}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  mode === 'sitemap_upload'
                    ? 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Upload Sitemap XML
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleTest}>
          {mode === 'url' && (
            <div className="space-y-4">
              <div className="input-group">
                <label className="label">Webpage URL to Test</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. apple.com or samsung.com/ae"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Enter any website or webpage URL (e.g. <code>apple.com</code>, <code>samsung.com/ae</code>, or <code>microsoft.com</code>). The tool extracts hreflang from HTML head, HTTP headers, or automatically discovers them from XML Sitemaps.
                </p>

                {/* Quick Test Presets */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Try Live Examples:</span>
                  {[
                    { label: 'Apple', url: 'apple.com', badge: 'HTML' },
                    { label: 'Samsung', url: 'samsung.com/ae', badge: 'Sitemap' },
                    { label: 'Microsoft', url: 'microsoft.com', badge: 'HTML' },
                    { label: 'Shopify', url: 'shopify.com', badge: 'HTML' },
                    { label: 'IKEA', url: 'ikea.com', badge: '116 Locales' },
                    { label: 'Adobe', url: 'adobe.com', badge: 'Sitemap' },
                    { label: 'Slack', url: 'slack.com', badge: 'HTML' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={status === 'loading'}
                      onClick={() => handleTest(undefined, preset.url)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-green-50 hover:text-green-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span className="font-semibold">{preset.label}</span>
                      <span className="text-[10px] opacity-75 font-mono">({preset.badge})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label text-sm">User-Agent Profile</label>
                  <select
                    className="select text-sm py-2"
                    value={userAgent}
                    onChange={(e) => setUserAgent(e.target.value as UserAgentProfile)}
                  >
                    <option value="default">Default HTTP Client (SEO Auditor)</option>
                    <option value="desktop">Desktop Chrome (Browser-like)</option>
                    <option value="mobile">Mobile Chrome (Android)</option>
                    <option value="googlebot">Googlebot Simulator</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end pb-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={checkReturnTags}
                      onChange={(e) => setCheckReturnTags(e.target.checked)}
                      className="rounded border-slate-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Verify live alternate pages &amp; reciprocal return tags</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {mode === 'sitemap_url' && (
            <div className="space-y-4">
              <div className="input-group">
                <label className="label">XML Sitemap URL</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://example.com/sitemap.xml"
                  value={sitemapUrl}
                  onChange={(e) => setSitemapUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Enter the URL of an XML sitemap containing &lt;xhtml:link rel=&quot;alternate&quot; hreflang=&quot;...&quot;&gt; entries.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label text-sm">User-Agent Profile</label>
                  <select
                    className="select text-sm py-2"
                    value={userAgent}
                    onChange={(e) => setUserAgent(e.target.value as UserAgentProfile)}
                  >
                    <option value="default">Default HTTP Client (SEO Auditor)</option>
                    <option value="desktop">Desktop Chrome</option>
                    <option value="mobile">Mobile Chrome</option>
                    <option value="googlebot">Googlebot Simulator</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end pb-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={checkLiveUrls}
                      onChange={(e) => setCheckLiveUrls(e.target.checked)}
                      className="rounded border-slate-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Live check alternate URLs (bounded to first 50 entries)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {mode === 'sitemap_upload' && (
            <div className="space-y-4">
              <div className="input-group">
                <label className="label">Select Local XML Sitemap File</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xml,text/xml"
                  onChange={handleFileUpload}
                  className="input file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
                />
                {uploadedFileName && (
                  <p className="text-xs text-green-600 font-semibold mt-1.5">
                    Selected file: {uploadedFileName} ({Math.round(uploadedXml.length / 1024)} KB)
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1.5">
                  Upload an XML sitemap file (maximum 5MB). Processed strictly in-memory without persistent server storage.
                </p>
              </div>

              <div className="flex items-center">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={checkLiveUrls}
                    onChange={(e) => setCheckLiveUrls(e.target.checked)}
                    className="rounded border-slate-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Live check alternate URLs (bounded to first 50 entries)</span>
                </label>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === 'loading'}
            style={{ width: '100%', marginTop: '20px' }}
          >
            {status === 'loading' ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                Inspecting hreflang annotations...
              </span>
            ) : (
              'Check hreflang'
            )}
          </button>
        </form>
      </div>

      {/* Error Message Box */}
      {status === 'error' && (
        <div className="card mb-8 border-l-4 border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-400 rounded-lg shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-rose-900 dark:text-rose-200 text-base mb-1">
                Validation Notice
              </h3>
              <p className="text-sm text-rose-700 dark:text-rose-300 leading-relaxed">
                {errorMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Validation Results Section */}
      {status === 'success' && responseData && (
        <div className="space-y-8">
          {/* Summary Metric Cards */}
          <div className="card">
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800 }}>VALIDATION SUMMARY</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Source: <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{responseData.sourceUrl}</span> (HTTP {responseData.pageStatus})
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!responseData.results || responseData.results.length === 0}
                className="btn btn-secondary text-xs sm:text-sm py-2 px-4 inline-flex items-center gap-2 cursor-pointer"
              >
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            </div>

            {/* Sitemap Auto-Discovery Banner */}
            {responseData.sitemapAutoDiscovered && (
              <div className="mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/60 rounded-lg text-emerald-700 dark:text-emerald-300 font-bold shrink-0 mt-0.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-sm text-emerald-950 dark:text-emerald-200 mb-0.5">
                    Hreflang Auto-Discovered from XML Sitemap
                  </div>
                  <p className="leading-relaxed text-emerald-800 dark:text-emerald-300">
                    This website (like Samsung) specifies international hreflang targeting via <strong>XML Sitemaps</strong> rather than inline HTML tags. We automatically crawled the site&apos;s sitemap registry and located <strong>{responseData.summary.totalAnnotations}</strong> hreflang annotations for this URL in: <code className="font-mono font-bold bg-white/70 dark:bg-slate-900/60 px-1.5 py-0.5 rounded break-all">{responseData.discoveredSitemapUrl}</code>.
                  </p>
                </div>
              </div>
            )}

            {/* Standard Notice Banner (e.g. for bounded audits or detected sitemaps) */}
            {responseData.message && !responseData.sitemapAutoDiscovered && (
              <div className="mb-6 p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="leading-relaxed">{responseData.message}</span>
              </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
              <div className="p-3 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className="text-xl font-black text-slate-900 dark:text-white">
                  {responseData.summary.totalAnnotations}
                </div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Hreflang Tags</div>
              </div>

              <div className="p-3 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className={`text-xl font-black ${
                  responseData.summary.selfReferenceStatus === 'Present'
                    ? 'text-emerald-600'
                    : responseData.summary.selfReferenceStatus === 'Missing'
                    ? 'text-rose-600'
                    : 'text-slate-600'
                }`}>
                  {responseData.summary.selfReferenceStatus}
                </div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Self-Reference</div>
              </div>

              <div className="p-3 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className={`text-xl font-black ${
                  responseData.summary.missingReturnTags > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {responseData.summary.missingReturnTags > 0
                    ? `${responseData.summary.missingReturnTags} Missing`
                    : `${responseData.summary.returnTagsVerified} Verified`}
                </div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Return Tags</div>
              </div>

              <div className="p-3 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className={`text-xl font-black ${
                  responseData.summary.xDefaultPresent ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {responseData.summary.xDefaultPresent ? 'Present' : 'Not Set'}
                </div>
                <div className="text-xs text-slate-500 font-semibold mt-1">x-default</div>
              </div>

              <div className="p-3 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className={`text-xl font-black ${
                  responseData.summary.errorCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {responseData.summary.errorCount}
                </div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Errors</div>
              </div>

              <div className="p-3 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className={`text-xl font-black ${
                  responseData.summary.warningCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {responseData.summary.warningCount}
                </div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Warnings</div>
              </div>
            </div>

            {/* Page Signals Bar (HTML Lang with validation, Canonical, Robots) */}
            {responseData.pageSignals && (
              <div className="p-3 bg-slate-100/70 dark:bg-slate-800/40 rounded-xl text-xs flex flex-wrap items-center gap-x-6 gap-y-2 border border-slate-200 dark:border-slate-700">
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold">HTML lang:</span>{' '}
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {responseData.pageSignals.htmlLang ? `<html lang="${responseData.pageSignals.htmlLang}">` : 'None declared'}
                  </span>
                  {responseData.pageSignals.htmlLangValidation && (
                    <span
                      title={responseData.pageSignals.htmlLangValidation.message}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        responseData.pageSignals.htmlLangValidation.status === 'valid'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : responseData.pageSignals.htmlLangValidation.status === 'mismatch'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}
                    >
                      {responseData.pageSignals.htmlLangValidation.status === 'valid'
                        ? '✓ Valid ISO'
                        : responseData.pageSignals.htmlLangValidation.status === 'mismatch'
                        ? '⚠ Lang Mismatch'
                        : '⚠ Missing Lang'}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Declared Canonical:</span>{' '}
                  <span className="font-mono text-slate-800 dark:text-slate-200 break-all">
                    {responseData.pageSignals.canonicalUrl || 'None'}
                  </span>
                </div>
                {responseData.pageSignals.robotsMeta && (
                  <div>
                    <span className="text-slate-500 font-semibold">Robots:</span>{' '}
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {responseData.pageSignals.robotsMeta}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Zero Annotations Explanatory Diagnostic Card */}
            {responseData.summary.totalAnnotations === 0 && (
              <div className="mt-4 p-5 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-bold flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
                    <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Page Successfully Audited: No Hreflang Tags Declared</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-semibold text-[11px]">
                    HTTP {responseData.pageStatus} OK
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-amber-200/60 dark:border-amber-800/50">
                    <div className="font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span> HTML &lt;head&gt;
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Scanned page markup. Zero <code>&lt;link rel=&quot;alternate&quot; hreflang=&quot;...&quot;&gt;</code> tags exist in the HTML document.
                    </p>
                  </div>

                  <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-amber-200/60 dark:border-amber-800/50">
                    <div className="font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span> HTTP Headers
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Inspected server response headers. No <code>Link: &lt;...&gt;; rel=&quot;alternate&quot;; hreflang=&quot;...&quot;</code> headers found.
                    </p>
                  </div>

                  <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-amber-200/60 dark:border-amber-800/50">
                    <div className="font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span> XML Sitemaps
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      {responseData.detectedSitemaps && responseData.detectedSitemaps.length > 0
                        ? `Scanned robots.txt sitemaps. Found ${responseData.detectedSitemaps.length} sitemaps, but none declare hreflang alternates for this URL.`
                        : 'Checked robots.txt and standard sitemap locations. No hreflang sitemaps found for this URL.'}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-amber-100/60 dark:bg-amber-900/30 rounded-xl text-[11px] leading-relaxed text-amber-950 dark:text-amber-200">
                  <div className="font-semibold mb-0.5">Why does this occur on major websites?</div>
                  Many well-known international domains (such as Google homepage, Netflix, Nike, Spotify, or Wikipedia) do <strong>not</strong> implement Google-style hreflang tags. Instead, they handle internationalization via IP-based geo-redirection, country-code top-level domains (ccTLDs), or user country-selector menus. Without hreflang, search engines rely entirely on automated algorithmic content detection.
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-bold text-amber-900 dark:text-amber-200">Test Multi-Regional Sites with Hreflang:</span>
                  {[
                    { label: 'Apple (HTML)', url: 'apple.com' },
                    { label: 'Samsung (Sitemap)', url: 'samsung.com/ae' },
                    { label: 'Microsoft (HTML)', url: 'microsoft.com' },
                    { label: 'Shopify (HTML)', url: 'shopify.com' },
                    { label: 'IKEA (116 Locales)', url: 'ikea.com' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleTest(undefined, preset.url)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-green-50 hover:text-green-700 text-slate-700 dark:text-slate-300 border border-amber-300 dark:border-amber-700 font-medium transition-colors cursor-pointer"
                    >
                      {preset.label} →
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Active Alternate Inspector Card */}
          {selectedItem && (
            <div className="card">
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }} className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>INSPECTED ALTERNATE DETAILS</h3>
                  <span className="badge badge-neutral text-xs">
                    {selectedItem.annotation.source}
                  </span>
                </div>
                <span className={`badge ${
                  selectedItem.issues.some((i) => i.severity === 'error')
                    ? 'badge-error'
                    : selectedItem.issues.some((i) => i.severity === 'warning')
                    ? 'badge-warning'
                    : 'badge-success'
                }`}>
                  {selectedItem.issues.some((i) => i.severity === 'error')
                    ? 'Errors Detected'
                    : selectedItem.issues.some((i) => i.severity === 'warning')
                    ? 'Warnings'
                    : 'Valid Annotation'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-4">
                <div>
                  <div className="text-xs text-slate-500 font-semibold">Target Hreflang &amp; Locale</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    <code>{selectedItem.annotation.hreflang}</code>{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({selectedItem.annotation.language || 'none'}
                      {selectedItem.annotation.region ? ` - ${selectedItem.annotation.region}` : ''})
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 font-semibold">Alternate URL</div>
                  <a
                    href={selectedItem.annotation.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 hover:underline font-mono text-xs break-all mt-0.5 block"
                  >
                    {selectedItem.annotation.href}
                  </a>
                </div>

                <div>
                  <div className="text-xs text-slate-500 font-semibold">Target Page HTML &lt;lang&gt;</div>
                  <div className="mt-0.5 text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                    {selectedItem.htmlLang ? (
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        &lt;html lang=&quot;{selectedItem.htmlLang}&quot;&gt;
                      </span>
                    ) : selectedItem.htmlLangStatus === 'untested' ? (
                      <span className="text-slate-400">Untested / Live check disabled</span>
                    ) : (
                      <span className="text-amber-600 font-bold">Missing &lt;html lang&gt;</span>
                    )}
                    {selectedItem.htmlLangStatus && selectedItem.htmlLangStatus !== 'untested' && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        selectedItem.htmlLangStatus === 'match'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : selectedItem.htmlLangStatus === 'mismatch'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {selectedItem.htmlLangStatus === 'match'
                          ? '✓ Matches Hreflang'
                          : selectedItem.htmlLangStatus === 'mismatch'
                          ? '✗ Language Mismatch'
                          : 'Missing Lang'}
                      </span>
                    )}
                  </div>
                  {selectedItem.htmlLangDetails && (
                    <div className="text-[11px] text-slate-500 mt-0.5">{selectedItem.htmlLangDetails}</div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-slate-500 font-semibold">Return Tag Status</div>
                  <div className="mt-0.5 font-semibold text-xs">
                    {selectedItem.returnTagFound === true ? (
                      <span className="text-emerald-600">✓ Bi-directional return link verified</span>
                    ) : selectedItem.returnTagFound === false ? (
                      <span className="text-rose-600">✗ Missing return tag on alternate page</span>
                    ) : selectedItem.issues.some((i) => i.code === 'AMBIGUOUS_RETURN_TAG') ? (
                      <span className="text-amber-600">? Unverified (Source language ambiguous)</span>
                    ) : (
                      <span className="text-slate-500">Untested / Live check disabled</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 font-semibold">Live HTTP Status &amp; Indexability</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {selectedItem.statusCode ? `HTTP ${selectedItem.statusCode}` : 'Not fetched'}{' '}
                    • Indexability: {selectedItem.indexability.toUpperCase()}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 font-semibold">Canonical Alignment</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {selectedItem.canonicalUrl ? (
                      <span className={selectedItem.canonicalStatus === 'self' ? 'text-emerald-600' : 'text-amber-600'}>
                        {selectedItem.canonicalStatus === 'self' ? '✓ Self-canonical' : '⚠ Non-self canonical'}
                      </span>
                    ) : (
                      <span className="text-slate-400">None detected</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Issues list */}
              {selectedItem.issues.length > 0 ? (
                <div className="space-y-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400">Issues &amp; Recommendations:</div>
                  {selectedItem.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl text-xs flex items-start gap-2 ${
                        issue.severity === 'error'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : issue.severity === 'warning'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-slate-50 text-slate-800 border border-slate-200'
                      }`}
                    >
                      <span className="font-bold uppercase tracking-wide text-[10px] px-1.5 py-0.5 rounded bg-white/70">
                        {issue.severity}
                      </span>
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-medium">
                  ✓ This hreflang annotation adheres to Google international SEO requirements.
                </div>
              )}
            </div>
          )}

          {/* Results Table Card */}
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Annotations List ({displayedItems.length} of {responseData.results.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Click any row to inspect issues, return tags, and headers.
                </p>
              </div>

              {/* Table Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(['all', 'errors', 'warnings', 'valid', 'html', 'header', 'sitemap'] as FilterStatus[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterStatus(tab)}
                    className={`px-3 py-1.5 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                      filterStatus === tab
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Search and Sort Toolbar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <input
                type="text"
                placeholder="Search hreflang, destination URL, or issue..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input py-2 text-sm"
              />

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="select py-2 text-sm"
              >
                <option value="default">Default Order</option>
                <option value="errors-desc">Severity: Most Errors First</option>
                <option value="lang-asc">Hreflang Code (A to Z)</option>
                <option value="status-asc">HTTP Status Code</option>
                <option value="url-asc">Alternate URL (A to Z)</option>
              </select>
            </div>

            {/* Responsive Table */}
            <div className="overflow-x-auto touch-scroll rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm min-w-[650px]">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3.5">Hreflang</th>
                    <th className="p-3.5">Language / Region</th>
                    <th className="p-3.5">Alternate URL</th>
                    <th className="p-3.5">HTML &lt;lang&gt;</th>
                    <th className="p-3.5">Source</th>
                    <th className="p-3.5">Return Tag</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        {responseData.results.length === 0
                          ? 'No hreflang annotations found in this resource.'
                          : 'No hreflang annotations match your search and filter criteria.'}
                      </td>
                    </tr>
                  ) : (
                    displayedItems.map((item, idx) => {
                      const hasErrors = item.issues.some((i) => i.severity === 'error');
                      const hasWarnings = item.issues.some((i) => i.severity === 'warning');
                      const isSelected = selectedItem?.annotation.href === item.annotation.href && selectedItem?.annotation.hreflang === item.annotation.hreflang;

                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedItem(item)}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                            isSelected ? 'bg-green-50/60 dark:bg-green-950/20' : ''
                          }`}
                        >
                          <td className="p-3.5 font-bold font-mono text-slate-900 dark:text-white">
                            {item.annotation.hreflang}
                          </td>
                          <td className="p-3.5 text-xs text-slate-600 dark:text-slate-300">
                            {item.annotation.language || '-'}
                            {item.annotation.region ? ` / ${item.annotation.region}` : ''}
                          </td>
                          <td className="p-3.5 max-w-xs sm:max-w-sm truncate text-xs font-mono text-slate-700 dark:text-slate-300">
                            <span title={item.annotation.href}>{item.annotation.href}</span>
                          </td>
                          <td className="p-3.5 text-xs font-mono">
                            {item.htmlLang ? (
                              <span className={`inline-flex items-center gap-1 font-semibold ${
                                item.htmlLangStatus === 'match'
                                  ? 'text-emerald-600'
                                  : item.htmlLangStatus === 'mismatch'
                                  ? 'text-rose-600'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}>
                                {item.htmlLang}
                                {item.htmlLangStatus === 'match' && <span className="text-[10px]">✓</span>}
                                {item.htmlLangStatus === 'mismatch' && <span className="text-[10px] font-bold">⚠</span>}
                              </span>
                            ) : item.htmlLangStatus === 'untested' ? (
                              <span className="text-slate-400 text-[11px]">-</span>
                            ) : (
                              <span className="text-amber-600 text-[11px]">none</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                              {item.annotation.source}
                            </span>
                          </td>
                          <td className="p-3.5 text-xs font-semibold">
                            {item.returnTagFound === true ? (
                              <span className="text-emerald-600">✓ Found</span>
                            ) : item.returnTagFound === false ? (
                              <span className="text-rose-600">✗ Missing</span>
                            ) : item.issues.some((i) => i.code === 'AMBIGUOUS_RETURN_TAG') ? (
                              <span className="text-amber-600 font-bold">? Unverified</span>
                            ) : (
                              <span className="text-slate-400">Untested</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            {hasErrors ? (
                              <span className="badge badge-error text-xs">Error</span>
                            ) : hasWarnings ? (
                              <span className="badge badge-warning text-xs">Warning</span>
                            ) : (
                              <span className="badge badge-success text-xs">Valid</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem(item);
                              }}
                              className={`text-xs px-2.5 py-1 rounded font-semibold cursor-pointer ${
                                isSelected
                                  ? 'bg-green-600 text-white'
                                  : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {isSelected ? 'Viewing' : 'Inspect'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
