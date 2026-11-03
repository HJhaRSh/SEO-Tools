'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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

  const extraSections = (
    <>
      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our Mobile-Friendly Checker Test?</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            Our mobile-friendly website test examines four critical mobile usability pillars based on W3C responsive web standards and Apple Human Interface Guidelines:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">Mobile Viewport Configuration</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Verifies the presence of a valid <code className="text-xs bg-[var(--im-surface)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">&lt;meta name=&quot;viewport&quot; content=&quot;width=device-width, initial-scale=1&quot;&gt;</code> tag and checks that users are not locked out of accessibility zooming.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">Text Size and Readability</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Measures computed font sizes across rendered text nodes. Flags text smaller than the 12px legibility threshold and identifies body copy below the recommended 16px mobile standard.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">Touch Targets and Spacing</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Evaluates interactive buttons, navigation links, and inputs against the 44x44 CSS pixel touch threshold and checks for a minimum 8px distance between adjacent interactive elements.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">Horizontal Scrolling and Layout Overflow</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Detects unconstrained fixed-width containers, wide HTML data tables, and oversized media elements that exceed the mobile viewport width and force awkward horizontal scrolling.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Understanding Your Mobile-Friendly Test Results</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-3">
          <p>
            Each audited URL receives an overall diagnostic status (<strong>PASS</strong>, <strong>WARNING</strong>, or <strong>FAIL</strong>) accompanied by a breakdown of verified checks. When issues are identified, the tool supplies:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base">
            <li>
              <strong>Exact CSS Selectors:</strong> Pinpoints the specific offending DOM elements (e.g. <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">header &gt; nav &gt; a.btn</code> or <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">table.data-grid</code>) so your development team can fix styling directly in CSS.
            </li>
            <li>
              <strong>Dimensional Measurements:</strong> Reports measured element widths, computed font sizes in pixels, and touch target distances relative to mobile viewport thresholds.
            </li>
            <li>
              <strong>Actionable Recommendations:</strong> Provides practical remediation advice, such as adding <code className="text-xs bg-[var(--im-bg-soft)] px-1.5 py-0.5 rounded border border-[var(--im-border)]">overflow-x: auto</code>, expanding tap target padding, or adjusting media query breakpoints.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Mobile-Friendly Testing vs Mobile-First Indexing</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-3">
          <p>
            It is critical to distinguish between <strong>mobile friendliness</strong> and <strong>mobile-first indexing</strong>. While related, they address completely different aspects of your website:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1">Mobile-Friendly Usability (This Tool)</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                Evaluates human user experience on smartphones. Checks whether text is legible without zooming, buttons are comfortably tap-friendly, and content fits neatly within screen boundaries.
              </p>
            </div>
            <div className="p-3.5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-semibold text-sm text-[var(--im-heading)] mb-1">Mobile-First Indexing Parity</h3>
              <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                Audits whether search engine bots receive identical primary content, heading tags, canonical links, and structured data across mobile and desktop crawls.
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[var(--im-text-muted)] bg-[var(--im-bg-soft)] p-3 rounded-lg border border-[var(--im-border)] mt-2">
            To compare content and tag parity across desktop and smartphone Googlebot, use our dedicated <Link href="/tools/mobile-first-index" className="text-[var(--im-primary-deep)] underline hover:opacity-80">Mobile-First Index Tool</Link>. To inspect JavaScript crawler rendering and DOM snapshots, explore our <Link href="/tools/fetch-render" className="text-[var(--im-primary-deep)] underline hover:opacity-80">Fetch &amp; Render tool</Link> and <Link href="/tools/prerendering-tester" className="text-[var(--im-primary-deep)] underline hover:opacity-80">Pre-rendering Tester</Link>.
          </p>
        </div>
      </section>
    </>
  );

  return (
    <ToolLayout
      title="Free Mobile-Friendly Test for Websites"
      description="Check whether your website is mobile-friendly with Indian Marketers' free Mobile-Friendly Test. Analyse viewport settings, text readability, touch targets and horizontal scrolling issues for individual pages or multiple URLs."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Mobile-Friendly Test' }]}
      aboutTitle="What Is a Mobile-Friendly Test?"
      aboutText={
        <div className="space-y-4">
          <p>
            A <strong>mobile-friendly test</strong> evaluates whether a website provides an intuitive, frictionless reading and browsing experience on smartphone screens. With more than 60% of worldwide web traffic originating on mobile devices, mobile usability directly influences visitor dwell time, bounce rates, and organic conversion.
          </p>
          <p>
            In December 2023, Google officially retired its standalone Mobile-Friendly Test tool and API, transitioning mobile evaluation toward Lighthouse and Core Web Vitals. Indian Marketers provides this independent mobile-friendly website checker to fill that gap. Our engine audits core responsive ergonomics including viewport configuration, sub-pixel horizontal overflow, computed font size readability, and touch target tap dimensions without fabricating obsolete scores.
          </p>
        </div>
      }
      howItWorksTitle="How to Test If Your Website Is Mobile-Friendly"
      howItWorks={[
        "Enter a single webpage URL or switch to bulk mode to paste up to 50 URLs for simultaneous testing.",
        "Select your target mobile device viewport preset (Standard iPhone 390px, Android 412px, Compact 375px, or Phablet 430px).",
        "Click 'Run Mobile-Friendly Test' to analyze viewport tags, horizontal overflow, font sizes, and tap targets.",
        "Review expandable issue diagnostics featuring exact CSS selectors, element dimensions, and severity badges.",
        "Export clean audit reports in CSV format or formatted Excel (.xlsx) spreadsheets for team collaboration."
      ]}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={[
        {
          question: "Did Google retire the official Mobile-Friendly Test?",
          answer: "Google officially retired its standalone Mobile-Friendly Test tool, testing API, and Search Console Mobile Usability report in December 2023. Search engines now evaluate page experience through Core Web Vitals and Lighthouse metrics. Indian Marketers provides this independent mobile-friendly testing tool so developers and site owners can continue auditing viewports, text sizing, tap targets, and layout responsiveness directly."
        },
        {
          question: "What is the difference between Mobile-Friendly Testing and Mobile-First Indexing?",
          answer: "Mobile-friendly testing evaluates front-end user experience on smartphone screens, checking touch target spacing, viewport tags, font legibility, and horizontal overflow. Mobile-first indexing describes how Google crawls and indexes web content using a smartphone bot. A page can be fully crawlable under mobile-first indexing while failing usability tests if buttons are too small or content horizontally overflows."
        },
        {
          question: "What causes 'Size Content to Viewport' failures?",
          answer: "Horizontal layout overflow occurs when elements exceed the screen width of the selected mobile viewport. Common culprits include rigid CSS fixed widths (such as width: 800px or min-width: 600px), wide data tables without responsive wrappers, unconstrained high-resolution images, and fixed-position advertising banners. These elements force smartphone visitors to scroll sideways or zoom out."
        },
        {
          question: "What are the recommended tap target dimensions?",
          answer: "WCAG accessibility standards and Apple's Human Interface Guidelines recommend interactive touch targets of at least 44 by 44 CSS pixels, with at least 8 pixels of spacing between adjacent clickable elements. Adequate sizing and spacing prevent frustrating mis-taps on smartphones, ensuring users can accurately select links, form fields, hamburger menus, and buttons without zooming."
        },
        {
          question: "How do I check if my website is mobile-friendly?",
          answer: "To test your website, paste your URL into the single URL input or switch to bulk mode to evaluate up to 50 pages simultaneously. Select your target device viewport baseline, such as iPhone or Android, and click 'Run Mobile-Friendly Test'. The checker evaluates your viewport meta tag, font legibility, tap targets, and layout overflow, returning selector-level diagnostics."
        },
        {
          question: "Can I test my website on different mobile screen sizes?",
          answer: "Yes. Our mobile-friendly tester includes multiple device viewport presets: Standard Mobile (iPhone 14 at 390x844px), Android Standard (Pixel 7 at 412x915px), Small Mobile (iPhone SE at 375x667px), and Large Mobile / Phablet (iPhone Pro Max at 430x932px). Selecting different presets helps you identify breakpoint-specific styling bugs across popular smartphone screen dimensions."
        },
        {
          question: "Can I check multiple website URLs at once?",
          answer: "Yes. The bulk mobile-friendly checker allows you to test up to 50 URLs in a single audit session. Enter one URL per line, select your device preset, and start the batch test. You can monitor live progress across chunks, inspect individual URL diagnostics, and export complete results to CSV or Excel (.xlsx) spreadsheets for reporting."
        },
        {
          question: "Does a mobile-friendly website automatically rank higher on Google?",
          answer: "Mobile-friendliness is a foundational user experience signal, but it is not a direct ranking guarantee on its own. While mobile usability prevents high bounce rates and improves engagement, Google ranks pages based on hundreds of factors including content relevance, topical authority, backlinks, and Core Web Vitals. However, failing mobile usability can severely harm user conversion and organic performance."
        }
      ]}
      relatedTools={[
        {
          name: 'Mobile-First Index Tool',
          href: '/tools/mobile-first-index',
          desc: 'Audit content, heading, and structured data parity between desktop and mobile Googlebot.',
        },
        {
          name: 'Pre-rendering Tester',
          href: '/tools/prerendering-tester',
          desc: 'Compare initial source markup against rendered DOM across user agents.',
        },
        {
          name: 'Fetch & Render',
          href: '/tools/fetch-render',
          desc: 'Simulate Googlebot Smartphone browser execution and capture rendering screenshots.',
        },
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
                src={
                  screenshotModalUrl.screenshot.base64Data!.startsWith('data:')
                    ? screenshotModalUrl.screenshot.base64Data!
                    : `data:image/png;base64,${screenshotModalUrl.screenshot.base64Data}`
                }
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
                    const raw = screenshotModalUrl.screenshot!.base64Data!;
                    // base64Data may be stored as a full data URL — strip prefix if present
                    const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw;
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
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (e) {
                    console.error('Screenshot download failed:', e);
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
