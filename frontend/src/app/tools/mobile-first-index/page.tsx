'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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

  const renderCellContent = (text: string, element: string) => {
    if (
      element.includes('Schema') &&
      text &&
      text !== '(None detected)' &&
      text !== '(None)' &&
      !text.startsWith('Desktop:') &&
      !text.startsWith('Mobile:')
    ) {
      const match = text.match(/^(.*?)(\s*\(\d+\s+entities\))?$/);
      const typesStr = match ? match[1] : text;
      const suffix = match && match[2] ? match[2].trim() : null;
      const types = typesStr.split(',').map((s) => s.trim()).filter(Boolean);

      if (types.length > 0 && !types[0].startsWith('(')) {
        return (
          <div className="flex flex-wrap items-center gap-1.5 py-0.5 max-w-sm">
            {types.map((t, i) => (
              <span
                key={i}
                className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-mono text-[11px] whitespace-normal break-words"
              >
                {t}
              </span>
            ))}
            {suffix && (
              <span className="text-[10px] text-slate-400 font-sans font-medium block w-full mt-0.5">
                {suffix}
              </span>
            )}
          </div>
        );
      }
    }

    return (
      <span className="break-words whitespace-normal leading-relaxed block max-w-sm">
        {text}
      </span>
    );
  };

  const filteredDiscrepancies = auditData
    ? severityFilter === 'ALL'
      ? auditData.discrepancies
      : auditData.discrepancies.filter((d) => d.severity === severityFilter)
    : [];

  const faqItems = [
    {
      question: "What is Google Mobile-First Indexing?",
      answer: "Mobile-first indexing means Google predominantly crawls and indexes the mobile version of a webpage's content for indexing and ranking in search results. Previously, Google used the desktop version to evaluate content relevance. Under mobile-first indexing, search engines evaluate your primary content, headings, structured data, canonical tags, and internal links based on the mobile page."
    },
    {
      question: "Does changing the User-Agent header make requests come from Googlebot IPs?",
      answer: "No. This tool dispatches HTTP requests using Google's official desktop and smartphone User-Agent header strings to inspect the server-delivered HTML markup returned to mobile crawlers. Requests originate from our server infrastructure rather than verified Google IP addresses. To inspect Google's internal index and rendering, use Google Search Console URL Inspection."
    },
    {
      question: "How should canonical and alternate tags be configured for separate mobile (m-dot) sites?",
      answer: "According to Google's official documentation, the desktop webpage must declare a rel=\"canonical\" tag pointing to itself, along with a rel=\"alternate\" media tag pointing to the mobile URL. The separate mobile page must declare a rel=\"canonical\" tag pointing back to the desktop URL (never a self-referencing canonical)."
    },
    {
      question: "Is this a mobile-friendly usability test or an indexing parity audit?",
      answer: "This is a technical mobile-first indexing parity audit. Mobile-friendly usability tools evaluate viewport settings, touch target tap spacing, and readable font sizes on physical screens. This checker compares whether search engine bots receive equivalent HTML markup, content, headings, canonicals, robots rules, and schema markup across desktop and mobile versions."
    },
    {
      question: "How do I check mobile-first indexing issues on my website?",
      answer: "Enter your webpage URL into our mobile-first indexing checker. The tool performs dual HTTP requests using desktop and smartphone Googlebot user agents, evaluates RFC 9309 robots.txt permissions, and compares essential SEO signals. Review the comparison matrix and prioritized discrepancy report to identify mismatched canonicals, missing headings, dropped content, or omitted structured data."
    },
    {
      question: "What happens if content is missing from the mobile version of a page?",
      answer: "If critical body text, heading tags, images, or structured data are omitted from your mobile page, Googlebot Smartphone will not evaluate that missing information when determining organic relevance and rankings. To maintain search performance, ensure that all primary content accessible on desktop is equally present and crawlable on mobile."
    },
    {
      question: "Should structured data and schema markup be identical on mobile and desktop?",
      answer: "Yes. Google recommends that both mobile and desktop versions include equivalent structured data markup (such as Article, Product, Organization, or BreadcrumbList JSON-LD). Ensure that URLs within mobile structured data reference the correct destination, and verify that mobile layouts do not strip schema markup."
    },
    {
      question: "Does mobile-first indexing require a separate mobile URL or responsive design?",
      answer: "Mobile-first indexing does not require separate mobile URLs. Google officially recommends responsive web design, where the same URL and HTML are served to all devices while styling adapts across viewports via CSS. If your site does operate a separate m-dot mobile site, both URLs must maintain proper bidirectional canonical and alternate relationships."
    }
  ];

  const relatedTools = [
    {
      name: 'Mobile-Friendly Test',
      href: '/tools/mobile-friendly-test',
      desc: 'Test viewport meta tag settings, touch target spacing, and font readability on smartphones.',
    },
    {
      name: 'Fetch & Render',
      href: '/tools/fetch-render',
      desc: 'Inspect how search bots execute client-side scripts and render responsive components.',
    },
    {
      name: 'Pre-rendering Tester',
      href: '/tools/prerendering-tester',
      desc: 'Detect server response differences across mobile Googlebot and desktop user agents.',
    },
  ];

  const extraSections = (
    <>
      {/* WHAT DOES OUR MOBILE-FIRST INDEXING CHECKER ANALYSE? */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our Mobile-First Indexing Checker Analyse?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                Mobile and Desktop Content Parity
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Compares text word count and content similarity across desktop and mobile responses. Verifies that primary body copy, H1–H6 heading hierarchies, and meta descriptions remain accessible to Googlebot Smartphone.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                Canonical Tags and Meta Robots
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Audits self-referencing canonicals on responsive URLs and checks rel=&quot;canonical&quot; and rel=&quot;alternate&quot; links for separate mobile configurations. Confirms that noindex directives or restrictive X-Robots-Tags do not block smartphone crawlers.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                Structured Data and Hreflang
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Parses JSON-LD schema graphs across both responses to detect omitted structured data types or missing entities on mobile. Validates that international <Link href="/tools/hreflang-tester" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">hreflang annotations</Link> point to corresponding device targets.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                Internal Links and Images
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Compares internal link counts to ensure mobile navigation does not orphan important site pages. Checks image counts, alt attributes, and responsive srcset elements so key media assets remain discoverable.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between md:col-span-2 lg:col-span-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                Robots.txt and Crawlability
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Independently parses and evaluates <Link href="/tools/robots-txt-tester" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">robots.txt permissions</Link> under RFC 9309 for desktop and mobile hosts. Verifies that Googlebot Smartphone is permitted to crawl the page and its critical assets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* UNDERSTANDING MOBILE-FIRST INDEXING AUDIT RESULTS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Understanding Mobile-First Indexing Audit Results</h2>
        </div>
        <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-5 sm:p-8 space-y-4 text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
          <p>
            Our audit engine compares signals extracted from desktop and mobile HTTP payloads and assigns standardized parity status badges across every evaluated dimension:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 my-3">
            <div className="p-3.5 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 mb-1.5">Match</span>
              <p className="text-xs text-[var(--im-text)]">Desktop and mobile signals are identical or equivalent (e.g. matching canonical, equal H1, intact schema markup).</p>
            </div>
            <div className="p-3.5 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 mb-1.5">Difference</span>
              <p className="text-xs text-[var(--im-text)]">A non-critical variance exists between versions (e.g. slight word count variation or adjusted title phrasing).</p>
            </div>
            <div className="p-3.5 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 mb-1.5">Warning</span>
              <p className="text-xs text-[var(--im-text)]">A potential parity concern that may affect indexing (e.g. missing secondary headings or omitted descriptive images).</p>
            </div>
            <div className="p-3.5 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 mb-1.5">Critical</span>
              <p className="text-xs text-[var(--im-text)]">A severe discrepancy directly threatening indexing (e.g. mobile 404/403, mobile noindex, missing H1, or missing schema).</p>
            </div>
            <div className="p-3.5 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl sm:col-span-2 lg:col-span-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 mb-1.5">Both Missing</span>
              <p className="text-xs text-[var(--im-text)]">The audited SEO signal is absent from both versions (e.g. no hreflang tags declared on single-language pages).</p>
            </div>
          </div>
          <p>
            Identified issues are compiled into a prioritized discrepancy report categorized by severity (Critical, High, Medium, Low) so technical teams can resolve highest-risk indexing bottlenecks first.
          </p>
        </div>
      </section>

      {/* COMMON MOBILE-FIRST INDEXING PROBLEMS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Common Mobile-First Indexing Problems</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Content Stripped on Mobile Viewports
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Hiding descriptive body paragraphs, product specifications, or secondary headings on mobile to save screen space prevents Googlebot Smartphone from evaluating that content for keyword relevance.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Conflicting Canonicals and Robots Directives
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Serving a self-referencing canonical on a separate m-dot mobile URL or inadvertently deploying a <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">noindex</code> meta robots tag on mobile responses prevents Google from indexing your preferred canonical URL.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Omitted Schema Structured Data
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Including Product, Article, or FAQPage JSON-LD on desktop pages but omitting schema markup on mobile responses causes the page to lose rich snippet enhancements in Google mobile search results.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Robots.txt Blocking Googlebot Smartphone
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Disallowing crawler access on mobile hosts or blocking CSS and script subresources in <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">robots.txt</code> prevents Google from fetching and understanding mobile page layouts. Use our <Link href="/tools/robots-txt-tester" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">Robots.txt Tester</Link> to inspect crawler directives.
            </p>
          </div>
        </div>
      </section>
    </>
  );

  return (
    <ToolLayout
      title="Free Mobile-First Indexing Checker"
      description="Use Indian Marketers' free Mobile-First Indexing Checker to compare SEO content and signals across mobile and desktop versions of a webpage. Review headings, canonicals, structured data, robots.txt permissions, internal links and other differences that may affect mobile-first indexing."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Mobile-First Indexing Checker' }]}
      aboutTitle="What Is Mobile-First Indexing?"
      aboutText={
        <div className="space-y-4">
          <p>
            <strong>Mobile-first indexing</strong> means Google predominantly crawls and indexes the mobile version of a webpage&apos;s content to determine search rankings. Under this indexing system, Googlebot Smartphone evaluates your primary content, heading tags, canonical annotations, internal links, images, and structured data markup to evaluate organic relevance.
          </p>
          <p>
            Google officially recommends responsive web design, where the same URL and HTML are delivered across desktop and smartphone browsers with presentation adapted through CSS. Content equivalence does not require identical pixel layouts—content placed in mobile tabs or accordions remains crawlable as long as it exists in the delivered HTML. However, omitting essential text, removing schema markup, or mismatching canonical tags on mobile can directly impair search visibility.
          </p>
          <div className="p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/70 text-xs text-slate-600 dark:text-slate-300">
            <strong>Diagnostic simulation notice:</strong> This tool performs dual independent HTTP requests using desktop and smartphone Googlebot user-agent strings to inspect server-delivered HTML and SEO signal parity. It is an independent technical audit and does not originate from verified Googlebot IP addresses. To inspect Google&apos;s internal index and live browser rendering, consult Google Search Console&apos;s URL Inspection tool.
          </div>
        </div>
      }
      howItWorksTitle="How to Check Mobile-First Indexing Issues"
      howItWorks={[
        "Enter your webpage URL (and optionally a separate mobile URL if your website serves mobile users from an m-dot subdomain).",
        "Select your crawler profile in Advanced Settings (Googlebot desktop/smartphone or standard Chrome desktop/mobile).",
        "The server initiates two independent HTTP requests using desktop and smartphone user-agent strings to retrieve initial HTML responses.",
        "Robots.txt rules are independently fetched and evaluated under RFC 9309 for both desktop and mobile host origins.",
        "SEO signals (titles, descriptions, H1 headings, content similarity, canonical tags, schema JSON-LD, internal links, images, and hreflang) are extracted and compared.",
        "A side-by-side comparison matrix and prioritized discrepancy report classify issues as Critical, Warning, Difference, or Match.",
        "Export the complete audit report as an RFC 4180 CSV or formatted multi-worksheet XLSX spreadsheet for technical documentation."
      ]}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faqItems}
      relatedTools={relatedTools}
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
          <div className="flex overflow-x-auto touch-scroll scrollbar-none pb-1 gap-2 border-b border-slate-200 dark:border-slate-800">
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
                          <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200 align-top min-w-[150px]">
                            {item.element}
                            <span className="block text-[10px] font-normal text-slate-400">{item.category}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300 align-top min-w-[180px]" title={item.desktop}>
                            {renderCellContent(item.desktop, item.element)}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300 align-top min-w-[180px]" title={item.mobile}>
                            {renderCellContent(item.mobile, item.element)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap align-top">
                            {getStatusBadge(item.status)}
                          </td>
                          <td className="py-3 px-3 text-slate-500 dark:text-slate-400 max-w-xs text-[11px] break-words whitespace-normal leading-relaxed align-top">
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
