'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import {
  USER_AGENTS,
  CATEGORY_LABELS,
  MAX_SELECTED_AGENTS,
  UserAgentDefinition,
} from '@/lib/seo/prerendering/userAgents';
import {
  AgentTestResult,
  ComparisonFieldResult,
  AuditSummary,
  PrerenderApiResponse,
} from '@/lib/seo/prerendering/types';
import { generatePrerenderCsv, generatePrerenderXlsx } from '@/lib/seo/prerendering/exporter';

export default function PrerenderingTester() {
  // URL state
  const [url, setUrl] = useState('');

  // Multi-User-Agent state
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(
    USER_AGENTS.filter((ua) => ua.isDefault).map((ua) => ua.id)
  );
  const [agentSearch, setAgentSearch] = useState('');

  // Primary Mode execution state
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [results, setResults] = useState<AgentTestResult[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonFieldResult[]>([]);

  // Raw HTML viewer state & navigation
  const [viewingHtmlAgent, setViewingHtmlAgent] = useState<AgentTestResult | null>(null);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const [highlightInspector, setHighlightInspector] = useState(false);
  const htmlInspectorRef = useRef<HTMLDivElement>(null);
  const comparisonTableRef = useRef<HTMLDivElement>(null);

  const handleViewHtml = (row: AgentTestResult) => {
    setViewingHtmlAgent(row);
    setHighlightInspector(true);
    // Smooth scroll down to the HTML inspector block after React paints
    setTimeout(() => {
      const el = htmlInspectorRef.current || document.getElementById('raw-html-inspector');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
    setTimeout(() => setHighlightInspector(false), 2000);
  };

  const handleScrollToTable = () => {
    const el = comparisonTableRef.current || document.getElementById('comparison-table-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // User-Agent Selection handlers
  const toggleAgent = (id: string) => {
    setSelectionWarning(null);
    if (selectedAgentIds.includes(id)) {
      setSelectedAgentIds(selectedAgentIds.filter((item) => item !== id));
    } else {
      if (selectedAgentIds.length >= MAX_SELECTED_AGENTS) {
        setSelectionWarning(`You can select up to ${MAX_SELECTED_AGENTS} user agents per test.`);
        return;
      }
      setSelectedAgentIds([...selectedAgentIds, id]);
    }
  };

  const handleSelectAll = () => {
    const allIds = USER_AGENTS.map((ua) => ua.id);
    setSelectedAgentIds(allIds.slice(0, MAX_SELECTED_AGENTS));
  };

  const handleClearSelection = () => {
    setSelectedAgentIds([]);
  };

  const handleResetDefaults = () => {
    setSelectedAgentIds(USER_AGENTS.filter((ua) => ua.isDefault).map((ua) => ua.id));
  };

  // Primary Mode Test Submission
  const handleTestUserAgents = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    if (selectedAgentIds.length === 0) {
      setStatus('error');
      setErrorMessage('Please select at least one user agent to test.');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);
    setSummary(null);
    setResults([]);
    setComparisons([]);
    setViewingHtmlAgent(null);

    try {
      const res = await fetch('/api/seo/prerendering/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          userAgents: selectedAgentIds,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: PrerenderApiResponse | null = null;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (!res.ok || !data || !data.success) {
        const rawText = !data ? await res.text().catch(() => '') : '';
        throw new Error(data?.error || `Failed to compare responses across user agents (HTTP ${res.status}). ${rawText && rawText.length < 150 ? rawText.trim() : ''}`.trim());
      }

      setSummary(data.summary || null);
      setResults(data.results || []);
      setComparisons(data.comparisons || []);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred during multi-user-agent HTTP testing.');
    }
  };

  // Export handlers
  const handleExportCsv = () => {
    if (results.length === 0) return;
    const csvContent = generatePrerenderCsv(url, results);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `prerender-comparison-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportXlsx = async () => {
    if (results.length === 0) return;
    const xlsxBuffer = await generatePrerenderXlsx(url, results);
    const blob = new Blob([xlsxBuffer as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `prerender-comparison-${new Date().toISOString().slice(0, 10)}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyRawHtml = async (rawHtml: string) => {
    try {
      await navigator.clipboard.writeText(rawHtml);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadRawHtml = (agent: AgentTestResult) => {
    if (!agent.rawHtml) return;
    const blob = new Blob([agent.rawHtml], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${agent.userAgentId}-source.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter user agents by search query
  const filteredAgents = USER_AGENTS.filter(
    (ua) =>
      ua.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
      ua.category.toLowerCase().includes(agentSearch.toLowerCase()) ||
      ua.id.toLowerCase().includes(agentSearch.toLowerCase())
  );

  const groupedAgents = filteredAgents.reduce((acc, ua) => {
    acc[ua.category] = acc[ua.category] || [];
    acc[ua.category].push(ua);
    return acc;
  }, {} as Record<string, UserAgentDefinition[]>);

  const faqItems = [
    {
      question: 'What is a pre-rendering tester?',
      answer:
        'A pre-rendering tester is a diagnostic technical SEO tool that sends simulated HTTP requests across different user agents—including desktop browsers, Googlebot, Bingbot, and AI crawlers—to compare server responses, status codes, response headers, raw HTML markup, and critical SEO tags side-by-side.',
    },
    {
      question: 'What is the difference between pre-rendering and dynamic rendering?',
      answer:
        'Pre-rendering generates static HTML on the server before client-side scripts run. Dynamic rendering is a specific implementation where the web server or CDN intercepts incoming requests and returns pre-rendered static HTML to search engine bots, while serving standard client-rendered JavaScript to human browsers.',
    },
    {
      question: 'How can I check if my website uses dynamic rendering?',
      answer:
        'Enter your page URL in this tool and test Googlebot alongside a standard browser like Google Chrome Desktop. If Googlebot receives full HTML markup and word counts while Chrome receives a minimal JavaScript app shell, or if the Vary: User-Agent header is returned, your website likely employs dynamic rendering middleware.',
    },
    {
      question: 'Why does Googlebot receive different HTML from a browser?',
      answer:
        'Differences occur when websites use dynamic rendering middleware (such as Prerender.io), server-side rendering for bots, device-specific responsive themes, CDN caching rules, or bot-protection firewalls that deliver challenge screens or simplified payloads to automated clients.',
    },
    {
      question: 'Does different HTML automatically mean cloaking or SEO manipulation?',
      answer:
        'No. Serving pre-rendered HTML to search crawlers is not deceptive cloaking if the core content, headings, and canonical signals remain substantially equivalent to what human visitors see. Google evaluates whether differences are intended to manipulate rankings or serve legitimate architectural needs.',
    },
    {
      question: 'Does selecting Googlebot guarantee real Googlebot IP verification?',
      answer:
        'No. This tool sends requests with official Googlebot User-Agent strings, but requests originate from server infrastructure rather than verified Googlebot IP addresses (1e100.net). Systems enforcing reverse-DNS IP verification may treat these simulated requests differently.',
    },
    {
      question: 'What is the difference between Pre-rendering Tester and Fetch & Render?',
      answer:
        'Pre-rendering Tester inspects multi-user-agent HTTP server responses without executing client-side scripts to verify server-delivered markup. Fetch & Render launches an isolated Chromium browser instance to execute JavaScript, capture rendered DOM snapshots, and log console runtime errors.',
    },
  ];

  const relatedTools = [
    {
      name: 'Fetch & Render',
      href: '/tools/fetch-render',
      desc: 'Execute client-side JavaScript in headless Chromium to compare initial HTML with rendered DOM and inspect screenshots.',
    },
    {
      name: 'Mobile-First Index Tool',
      href: '/tools/mobile-first-index',
      desc: 'Audit technical SEO parity between desktop and mobile versions of your page for Googlebot indexing.',
    },
    {
      name: 'Robots.txt Tester',
      href: '/tools/robots-txt-tester',
      desc: 'Verify whether Googlebot, Bingbot, and AI crawlers are permitted to access your URLs under RFC 9309 rules.',
    },
  ];

  const extraSections = (
    <>
      {/* WHAT DOES OUR PRE-RENDERING CHECKER ANALYSE? */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our Pre-rendering Checker Analyse?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                HTTP Responses Across User Agents
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Sends concurrent HTTP requests using up to 10 user-agent headers—including desktop browsers, Googlebot Smartphone, Googlebot Desktop, Bingbot, Applebot, and AI search crawlers. Evaluates whether each client receives an identical HTTP 200 OK or divergent status codes.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                SEO Metadata and HTML Content Differences
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Extracts and benchmarks essential on-page SEO signals across all tested agents: page title, meta description, H1-H6 headings, canonical URL tags, meta robots directives, visible word counts, links, and image references to highlight content variations.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                Redirects and Response Headers
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Inspects HTTP redirect hops, destination locations, and response headers—including the <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Vary: User-Agent</code> header. Detects whether search crawlers are routed through distinct redirect chains compared to human visitors.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                HTML Fingerprints and Discrepancies
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Calculates cryptographic MD5 and SHA-256 byte-level hashes of the returned HTML bodies. Differentiates between identical HTML responses, harmless markup variations (such as session nonces or timestamps), and substantive SEO signal discrepancies.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* UNDERSTANDING PRE-RENDERING TEST RESULTS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Understanding Pre-rendering Test Results</h2>
        </div>
        <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-5 sm:p-8 space-y-4 text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
          <p>
            Interpreting multi-user-agent test findings requires distinguishing between standard architectural variations and genuine technical SEO discrepancies:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3">
            <div className="p-4 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl">
              <div className="text-xs font-bold text-[var(--im-secondary)] uppercase tracking-wider mb-1">Status Code Mismatches</div>
              <p className="text-xs text-[var(--im-text)]">
                If desktop browsers receive HTTP 200 while Googlebot receives HTTP 403 or 503, an origin firewall or bot mitigation rule may be blocking search crawlers. Conversely, if bots encounter unexpected 301/302 redirects not seen by browsers, crawl efficiency may be compromised.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl">
              <div className="text-xs font-bold text-[var(--im-secondary)] uppercase tracking-wider mb-1">Canonical Tag & Robots Directives</div>
              <p className="text-xs text-[var(--im-text)]">
                A discrepancy where Googlebot receives a <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">noindex</code> directive or differing canonical URL compared to human browsers can cause de-indexing or consolidation errors in Google Search Console.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl">
              <div className="text-xs font-bold text-[var(--im-secondary)] uppercase tracking-wider mb-1">Content & Heading Variations</div>
              <p className="text-xs text-[var(--im-text)]">
                If Googlebot receives comprehensive article text and headings while browsers receive an empty <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">&lt;div id=&quot;root&quot;&gt;&lt;/div&gt;</code> container, your site is using pre-rendering or dynamic rendering. Ensure the pre-rendered text accurately reflects the client-rendered user experience.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl">
              <div className="text-xs font-bold text-[var(--im-secondary)] uppercase tracking-wider mb-1">MD5 / SHA-256 Byte Hashes</div>
              <p className="text-xs text-[var(--im-text)]">
                A byte hash mismatch proves that the raw server response buffers differed by at least one byte. This frequently happens due to dynamic CSRF tokens, caching headers, or whitespace formatting, and does not automatically signal cloaking or ranking manipulation.
              </p>
            </div>
          </div>
          <p className="text-xs opacity-90">
            <strong>Diagnostic scope:</strong> Findings reflect simulated HTTP requests dispatched from our testing servers. For definitive confirmation of Google&apos;s indexed content and render pipeline, verify your URLs with Google Search Console&apos;s URL Inspection tool.
          </p>
        </div>
      </section>

      {/* PRE-RENDERING VS DYNAMIC RENDERING VS SERVER-SIDE RENDERING */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Pre-rendering vs Dynamic Rendering vs Server-Side Rendering</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-[var(--im-secondary)] uppercase tracking-wider mb-1">Static Pre-rendering (SSG)</div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2">Build-Time Generation</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                HTML pages are generated ahead of time during the application build phase. Both search crawlers and human visitors receive identical, static HTML files that hydrate client-side scripts seamlessly without bot detection middleware.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-[var(--im-secondary)] uppercase tracking-wider mb-1">Dynamic Rendering</div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2">User-Agent Interception</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                A web server or CDN proxy inspects incoming user agents. When a search bot (like Googlebot) is detected, the server executes headless rendering or returns cached static HTML, while serving client-side JavaScript to human users. Google documents dynamic rendering as a temporary workaround rather than a long-term architecture.
              </p>
            </div>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-[var(--im-secondary)] uppercase tracking-wider mb-1">Server-Side Rendering (SSR)</div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2">On-Demand Server Execution</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                The server renders HTML for every incoming request regardless of whether the requester is a human or a crawler. Google officially recommends server-side rendering, static rendering, or hydration architectures over bot-specific dynamic rendering.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPLEMENTARY RENDERING & CRAWLING WORKFLOWS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Complementary Technical SEO Diagnostic Workflows</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2">JavaScript DOM Rendering</h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed mb-3">
              Use <Link href="/tools/fetch-render" className="font-bold underline text-[var(--im-secondary)] hover:opacity-80">Fetch &amp; Render</Link> to compare initial HTML with JavaScript-rendered content and investigate rendering-related SEO issues in an isolated Chromium browser.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2">Mobile-First Parity Check</h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed mb-3">
              Audit desktop versus mobile Googlebot parity with our dedicated <Link href="/tools/mobile-first-index" className="font-bold underline text-[var(--im-secondary)] hover:opacity-80">Mobile-First Index Tool</Link> to prevent ranking drops caused by missing mobile content.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2">Robots Directives &amp; Access</h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed mb-3">
              Verify whether search bots and AI crawlers can crawl your rendering middleware or static files with our RFC 9309-compliant <Link href="/tools/robots-txt-tester" className="font-bold underline text-[var(--im-secondary)] hover:opacity-80">Robots.txt Tester</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );

  return (
    <ToolLayout
      title="Free Pre-rendering Tester"
      description="Use Indian Marketers' free Pre-rendering Tester to compare the HTML and SEO content delivered to browsers, Googlebot and other crawlers. Check HTTP responses, redirects, canonical tags, headings and content differences to investigate possible dynamic rendering or bot-specific HTML delivery."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Pre-rendering Tester' }]}
      aboutTitle="What Is a Pre-rendering Tester?"
      aboutText={
        <div className="space-y-4">
          <p>
            A <strong>pre-rendering tester</strong> is a technical SEO diagnostic tool designed to verify whether web servers, content delivery networks (CDNs), or edge proxies return differing HTTP responses and HTML markup to distinct web crawlers and client browsers. By dispatching concurrent requests with custom user-agent headers, this tool enables SEOs and developers to inspect bot-specific HTML delivery without needing specialized command-line tools.
          </p>
          <p>
            Websites built with JavaScript frameworks (such as React, Vue, or Angular) often rely on pre-rendering middleware (like Prerender.io or Rendertron) or dynamic rendering architectures to deliver pre-compiled static markup to search crawlers while serving standard Single Page Applications (SPAs) to human visitors. This tester compares HTTP status codes, redirect chains, Vary headers, cryptographic MD5/SHA-256 byte fingerprints, and essential SEO tags side-by-side to highlight observable discrepancies.
          </p>
          <div className="p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/70 text-xs text-slate-600 dark:text-slate-300">
            <strong>Diagnostic simulation notice:</strong> This tool sends requests containing standard crawler User-Agent header strings. It does not originate from verified search engine IP addresses (such as Google’s <code className="font-mono text-xs bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">*.googlebot.com</code>). Websites enforcing strict reverse-DNS verification or Cloudflare Bot Management may handle these diagnostic probes differently from authentic search crawlers.
          </div>
        </div>
      }
      howItWorksTitle="How to Test Pre-rendering and Dynamic Rendering"
      howItWorks={[
        'Enter any fully qualified HTTP or HTTPS webpage URL into the website input field.',
        'Select up to 10 user agents across Desktop Browsers, Mobile Browsers, Search Engine Crawlers (Googlebot Smartphone, Googlebot Desktop, Bingbot, Applebot), AI Crawlers (GPTBot, ClaudeBot, PerplexityBot), and Social Bots.',
        'Click "Test Pre-rendering" to dispatch isolated, concurrent HTTP requests with built-in SSRF protection.',
        'Review the Audit Verdict banner to see automated classification: Same HTML Response, Different Raw HTML / Same SEO Signals, or Possible Pre-rendering.',
        'Inspect the User-Agent Response Comparison Table to check HTTP status codes, redirect destinations, Vary: User-Agent headers, and MD5 byte hashes.',
        'Examine the Discrepancy Detection matrix to benchmark Page Titles, Meta Descriptions, H1-H6 Headings, Word Counts, Image counts, Canonical Links, and Robots directives.',
        'Click "View HTML" for any user agent to inspect raw response markup, copy HTML to clipboard, or download full source files.',
        'Download complete audit findings in structured CSV or Excel (.xlsx) formats for team reporting and documentation.',
      ]}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faqItems}
      relatedTools={relatedTools}
    >
      <div className="card mb-8">
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>MULTI-USER-AGENT AUDIT INPUT</h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter your target webpage URL and select up to {MAX_SELECTED_AGENTS} user agents to test separate HTTP responses.
              </p>
            </div>

            <form onSubmit={handleTestUserAgents}>
              <div className="input-group">
                <label className="label">
                  Website URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://example.com/page"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              {/* USER AGENT SELECTOR */}
              <div className="mt-6 mb-4">
                {selectionWarning && (
                  <div className="mb-3 p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center justify-between">
                    <span>{selectionWarning}</span>
                    <button
                      type="button"
                      onClick={() => setSelectionWarning(null)}
                      className="ml-2 text-amber-700 dark:text-amber-400 font-bold hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                  <label className="label m-0">
                    Select User Agents ({selectedAgentIds.length}/{MAX_SELECTED_AGENTS} selected){' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleResetDefaults}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold"
                    >
                      Default Set
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold"
                    >
                      Select All ({MAX_SELECTED_AGENTS} max)
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <input
                    type="text"
                    className="input text-xs py-2"
                    placeholder="Search or filter user agents..."
                    value={agentSearch}
                    onChange={(e) => setAgentSearch(e.target.value)}
                  />
                </div>

                {/* GROUPED AGENTS CHECKBOXES */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 max-h-72 overflow-y-auto">
                  {Object.entries(groupedAgents).map(([cat, agents]) => (
                    <div key={cat} className="space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1">
                        {CATEGORY_LABELS[cat] || cat}
                      </h4>
                      {agents.map((ua) => {
                        const isChecked = selectedAgentIds.includes(ua.id);
                        return (
                          <label
                            key={ua.id}
                            className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                              isChecked
                                ? 'bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200 font-semibold border border-green-200 dark:border-green-800'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAgent(ua.id)}
                              className="mt-0.5 rounded text-green-600 focus:ring-green-500 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="block truncate">{ua.name}</span>
                              <span className="block text-[10px] text-slate-400 font-mono truncate">{ua.id}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500 mt-2 italic">
                  <strong>Technical Disclaimer:</strong> Requests use exact user-agent headers but originate from this testing application, not verified crawler IP blocks. Some bot protection systems or CDNs with IP verification may respond with HTTP 403 or human challenge pages.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={status === 'loading' || !url.trim() || selectedAgentIds.length === 0}
                style={{ width: '100%', marginTop: '16px' }}
              >
                {status === 'loading'
                  ? `Testing HTTP Responses (${selectedAgentIds.length} agents)...`
                  : `Test Pre-rendering (${selectedAgentIds.length} Agents)`}
              </button>
            </form>
          </div>

          {/* ERROR NOTICE */}
          {status === 'error' && errorMessage && (
            <div className="card mb-8 p-4 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 text-sm">
              <strong>Test Notice:</strong> {errorMessage}
            </div>
          )}

          {/* SUCCESS RESULTS SECTION */}
          {status === 'success' && summary && (
            <div className="card space-y-8 mb-8">
              {/* HEADER WITH CONTROLS */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800 }}>MULTI-USER-AGENT COMPARISON AUDIT</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Target URL: <strong className="font-mono text-slate-800 dark:text-slate-200">{url}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                    title="Export results to CSV"
                  >
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportXlsx}
                    className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
                    title="Export results to Excel spreadsheet"
                  >
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export XLSX
                  </button>
                </div>
              </div>

              {/* CLASSIFICATION VERDICT BANNER */}
              <div
                className={`p-4 rounded-xl border text-sm ${
                  summary.classification === 'Same HTML Response' || summary.classification === 'Different Raw HTML, Same SEO Signals'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : summary.classification === 'Possible Pre-rendering / Dynamic Rendering'
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                    : summary.classification === 'Potential SEO Signal Conflict'
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-base">
                  <span>Audit Verdict:</span>
                  <span className="badge badge-success bg-white dark:bg-slate-800">
                    {summary.classification}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-90">{summary.classificationReason}</p>
              </div>

              {/* AUDIT SUMMARY STATS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Agents Tested</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {summary.userAgentsTested}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Successful / Failed</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    <span className="text-emerald-600">{summary.successfulResponses}</span>
                    <span className="text-slate-400 text-sm font-normal"> / </span>
                    <span className={summary.failedResponses > 0 ? 'text-rose-600' : 'text-slate-400'}>
                      {summary.failedResponses}
                    </span>
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Status Codes</p>
                  <p className="text-sm font-bold mt-1.5">
                    {summary.differentHttpStatuses ? (
                      <span className="badge badge-warning text-[10px]">Different</span>
                    ) : (
                      <span className="badge badge-success text-[10px]">Identical</span>
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Titles / Descriptions</p>
                  <p className="text-sm font-bold mt-1.5">
                    {summary.differentTitles || summary.differentMetaDescriptions ? (
                      <span className="badge badge-warning text-[10px]">Variance</span>
                    ) : (
                      <span className="badge badge-success text-[10px]">Consistent</span>
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Canonical & Robots</p>
                  <p className="text-sm font-bold mt-1.5">
                    {summary.canonicalConflicts || summary.robotsConflicts ? (
                      <span className="badge badge-error text-[10px]">Conflict</span>
                    ) : (
                      <span className="badge badge-success text-[10px]">Consistent</span>
                    )}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">HTML Byte Fingerprint</p>
                  <p className="text-sm font-bold mt-1.5">
                    {summary.rawHtmlDifferences ? (
                      <span className="badge bg-purple-100 text-purple-800 border border-purple-300 text-[10px]">
                        Differs
                      </span>
                    ) : (
                      <span className="badge badge-success text-[10px]">Identical</span>
                    )}
                  </p>
                </div>
              </div>

              {/* CORE RESULTS COMPARISON TABLE (Matching Reference TechnicalSEO tool) */}
              <div id="comparison-table-section" ref={comparisonTableRef} className="scroll-mt-24">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    USER-AGENT RESPONSE COMPARISON TABLE
                  </h3>
                  {viewingHtmlAgent && (
                    <button
                      type="button"
                      onClick={() => {
                        const el = htmlInspectorRef.current || document.getElementById('raw-html-inspector');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Jump to HTML Inspector ({viewingHtmlAgent.userAgentName})</span>
                      <span>&darr;</span>
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto touch-scroll border border-slate-200 dark:border-slate-800 rounded-2xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold whitespace-nowrap">
                        <th className="py-3 px-3.5">User Agent</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Redirect</th>
                        <th className="py-3 px-3.5">Page Title</th>
                        <th className="py-3 px-3.5">Meta Description</th>
                        <th className="py-3 px-3">H1 Headings</th>
                        <th className="py-3 px-3">Words</th>
                        <th className="py-3 px-3">Images</th>
                        <th className="py-3 px-3">Links</th>
                        <th className="py-3 px-3">Vary: UA</th>
                        <th className="py-3 px-3">MD5 Fingerprint</th>
                        <th className="py-3 px-3">Meta Robots</th>
                        <th className="py-3 px-3.5">Link Canonical</th>
                        <th className="py-3 px-3 text-center">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {results.map((row) => {
                        const isSuccess = row.status === 'success';
                        const isSelectedForHtml = viewingHtmlAgent?.userAgentId === row.userAgentId;
                        return (
                          <tr
                            key={row.userAgentId}
                            className={`transition-colors ${
                              isSelectedForHtml
                                ? 'bg-emerald-500/15 dark:bg-emerald-950/40 ring-1 ring-inset ring-emerald-500/40'
                                : !isSuccess
                                ? 'bg-rose-50/40 dark:bg-rose-950/10 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            {/* User Agent */}
                            <td className="py-3 px-3.5 whitespace-nowrap font-sans">
                              <span className="font-bold text-slate-900 dark:text-white block">
                                {row.userAgentName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">{row.userAgentId}</span>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              {isSuccess ? (
                                <span
                                  className={`badge text-[10px] ${
                                    row.statusCode === 200
                                      ? 'badge-success'
                                      : row.statusCode && row.statusCode >= 300 && row.statusCode < 400
                                      ? 'badge-warning'
                                      : 'badge-error'
                                  }`}
                                >
                                  {row.statusCode} {row.statusText || ''}
                                </span>
                              ) : (
                                <span className="badge badge-error text-[10px]">Error</span>
                              )}
                            </td>

                            {/* Redirect */}
                            <td className="py-3 px-3 max-w-[160px] truncate" title={row.finalUrl || ''}>
                              {row.redirectChain.length > 0 ? (
                                <span className="text-amber-600 font-bold">
                                  {row.redirectChain.length} hop(s)
                                </span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>

                            {/* Title */}
                            <td
                              className="py-3 px-3.5 max-w-[180px] truncate font-sans"
                              title={row.title || '(none)'}
                            >
                              {row.title ? (
                                <span className="text-slate-800 dark:text-slate-200">{row.title}</span>
                              ) : (
                                <span className="text-slate-400 italic font-sans">(none)</span>
                              )}
                            </td>

                            {/* Meta Description */}
                            <td
                              className="py-3 px-3.5 max-w-[200px] truncate font-sans"
                              title={row.metaDescription || '(none)'}
                            >
                              {row.metaDescription ? (
                                <span className="text-slate-700 dark:text-slate-300">{row.metaDescription}</span>
                              ) : (
                                <span className="text-slate-400 italic font-sans">(none)</span>
                              )}
                            </td>

                            {/* H1 */}
                            <td
                              className="py-3 px-3 max-w-[160px] truncate font-sans"
                              title={row.h1.join(' | ') || '(none)'}
                            >
                              {row.h1.length > 0 ? (
                                <span>
                                  <strong>({row.h1.length})</strong> {row.h1[0]}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">(none)</span>
                              )}
                            </td>

                            {/* Word Count */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              {row.wordCount !== null ? row.wordCount.toLocaleString() : '-'}
                            </td>

                            {/* Image Count */}
                            <td className="py-3 px-3 whitespace-nowrap" title={`Total: ${row.imageCount ?? 0} | Sampled for comparison: ${row.imagesSample?.length ?? 0}`}>
                              <span>{row.imageCount !== null ? row.imageCount : '-'}</span>
                              {row.imagesSample && row.imagesSample.length > 0 && (
                                <span className="text-[10px] text-slate-400 block font-sans">({row.imagesSample.length} smp)</span>
                              )}
                            </td>

                            {/* Link Count */}
                            <td className="py-3 px-3 whitespace-nowrap" title={`Total: ${row.linkCount ?? 0} (${row.internalLinkCount || 0} int / ${row.externalLinkCount || 0} ext) | Sampled: ${(row.internalLinksSample?.length ?? 0) + (row.externalLinksSample?.length ?? 0)}`}>
                              <span>{row.linkCount !== null ? row.linkCount : '-'}</span>
                              {(row.internalLinksSample || row.externalLinksSample) && (
                                <span className="text-[10px] text-slate-400 block font-sans">({(row.internalLinksSample?.length ?? 0) + (row.externalLinksSample?.length ?? 0)} smp)</span>
                              )}
                            </td>

                            {/* Vary: User-Agent */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={`badge text-[10px] ${
                                  row.varyUserAgent === 'Present'
                                    ? 'badge-success'
                                    : row.varyUserAgent === 'Absent'
                                    ? 'badge-warning'
                                    : 'badge-neutral'
                                }`}
                              >
                                {row.varyUserAgent}
                              </span>
                            </td>

                            {/* MD5 Fingerprint */}
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px]" title={row.md5 || ''}>
                              {row.md5 ? (
                                <span className="text-slate-700 dark:text-slate-300">
                                  {row.md5.slice(0, 10)}...
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>

                            {/* Meta Robots */}
                            <td
                              className="py-3 px-3 max-w-[140px] truncate font-sans"
                              title={row.metaRobots || row.xRobotsTag || 'default (index, follow)'}
                            >
                              {row.metaRobots || row.xRobotsTag || 'default'}
                            </td>

                            {/* Canonical */}
                            <td
                              className="py-3 px-3.5 max-w-[180px] truncate font-sans"
                              title={row.canonical || '(none)'}
                            >
                              {row.canonical ? (
                                <span className="text-slate-700 dark:text-slate-300">{row.canonical}</span>
                              ) : (
                                <span className="text-slate-400 italic">(none)</span>
                              )}
                            </td>

                            {/* Source button */}
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {row.rawHtml ? (
                                <button
                                  type="button"
                                  onClick={() => handleViewHtml(row)}
                                  className={`text-[11px] font-sans font-bold px-2.5 py-1 rounded transition-all cursor-pointer shadow-xs ${
                                    isSelectedForHtml
                                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-400/60'
                                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                                  }`}
                                  title={`Jump to HTML source for ${row.userAgentName}`}
                                >
                                  {isSelectedForHtml ? 'Viewing HTML ↓' : 'View HTML'}
                                </button>
                              ) : (
                                <span className="text-rose-500 font-sans text-[11px]">Failed</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DETAILED SIGNAL COMPARISON ENGINE FINDINGS */}
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-3">
                  DISCREPANCY DETECTION & COMPARISON SIGNALS
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisons.map((c, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-2xl border transition-all ${
                        c.status === 'different'
                          ? c.severity === 'error'
                            ? 'bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/60'
                            : 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/60'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">{c.label}</h4>
                        <span
                          className={`badge text-[10px] ${
                            c.status === 'matched'
                              ? 'badge-success'
                              : c.status === 'different'
                              ? c.severity === 'error'
                                ? 'badge-error'
                                : 'badge-warning'
                              : c.status === 'insufficient-comparable-responses'
                              ? 'badge-neutral'
                              : c.status === 'unsupported-content' || c.status === 'http-error-response'
                              ? 'badge-warning'
                              : 'badge-neutral'
                          }`}
                        >
                          {c.status.replace(/-/g, ' ').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{c.explanation}</p>
                      
                      {/* Breakdown by user agent */}
                      <div className="space-y-1 text-[11px] font-mono border-t border-slate-200 dark:border-slate-800 pt-2">
                        {Object.entries(c.values).map(([agentId, val]) => (
                          <div key={agentId} className="flex justify-between gap-2 py-0.5">
                            <span className="text-slate-500 font-sans truncate">{agentId}:</span>
                            <span className="text-slate-800 dark:text-slate-200 truncate max-w-[220px]">
                              {Array.isArray(val) ? val.join(' | ') || '(none)' : String(val ?? '(none)')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RAW HTML INSPECTOR MODAL / DRAWER */}
              {viewingHtmlAgent && (
                <div
                  id="raw-html-inspector"
                  ref={htmlInspectorRef}
                  className={`p-6 rounded-2xl border transition-all duration-300 bg-slate-900 text-slate-100 space-y-4 scroll-mt-24 shadow-2xl ${
                    highlightInspector
                      ? 'border-emerald-400 ring-4 ring-emerald-500/50 scale-[1.005]'
                      : 'border-slate-700 ring-1 ring-emerald-500/30'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <h4 className="text-base font-bold text-white flex items-center gap-2">
                          <span>Raw HTML Response:</span>
                          <span className="text-emerald-400 font-mono">{viewingHtmlAgent.userAgentName}</span>
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        HTTP {viewingHtmlAgent.statusCode} | Byte size:{' '}
                        {((viewingHtmlAgent.htmlSize || 0) / 1024).toFixed(1)} KB | MD5:{' '}
                        <span className="font-mono">{viewingHtmlAgent.md5}</span>
                        {viewingHtmlAgent.isTruncatedSource && (
                          <span className="ml-2 text-amber-400 font-semibold">(Display truncated to first 100 KB)</span>
                        )}
                        {!viewingHtmlAgent.isHtml && (
                          <span className="ml-2 text-rose-400 font-semibold">(Non-HTML Content: {viewingHtmlAgent.contentType})</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleScrollToTable}
                        className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                        title="Scroll back up to the comparison table"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                        Back to Table
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyRawHtml(viewingHtmlAgent.rawHtml || '')}
                        className="btn btn-secondary text-xs py-1.5 px-3 cursor-pointer"
                      >
                        {copiedHtml ? 'Copied!' : 'Copy Source'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadRawHtml(viewingHtmlAgent)}
                        className="btn btn-secondary text-xs py-1.5 px-3 cursor-pointer"
                      >
                        Download HTML
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingHtmlAgent(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-300 border border-slate-800">
                    <pre className="whitespace-pre-wrap break-all">{viewingHtmlAgent.rawHtml}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
    </ToolLayout>
  );
}
