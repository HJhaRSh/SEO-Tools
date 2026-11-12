'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import { AI_BOT_REGISTRY, AiBotDefinition } from '@/lib/seo/aiBotRegistry';
import { AiBotAccessBatchResponse, SingleUrlBotResult } from '@/lib/seo/aiBotTesterService';

export default function AiBotAccessTester() {
  // Input states
  const [urlsInput, setUrlsInput] = useState('');
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>(() =>
    AI_BOT_REGISTRY.filter(b => b.defaultSelected).map(b => b.id)
  );


  // Status & Results
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultData, setResultData] = useState<AiBotAccessBatchResponse | null>(null);

  // Detail Modal state
  const [activeDetail, setActiveDetail] = useState<SingleUrlBotResult | null>(null);

  // Bot Selector Search Query
  const [botSearchQuery, setBotSearchQuery] = useState('');

  // Table Filters & Search
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [botCategoryFilter, setBotCategoryFilter] = useState<string>('all');

  // Multi-select Bot helpers
  const handleToggleBot = (botId: string) => {
    setSelectedBotIds(prev =>
      prev.includes(botId) ? prev.filter(id => id !== botId) : [...prev, botId]
    );
  };

  const handleSelectAllBots = () => {
    setSelectedBotIds(AI_BOT_REGISTRY.map(b => b.id));
  };

  const handleDeselectAllBots = () => {
    setSelectedBotIds([]);
  };

  const handleSelectByCategory = (cat: string) => {
    const idsInCat = AI_BOT_REGISTRY.filter(b => b.category === cat).map(b => b.id);
    setSelectedBotIds(Array.from(new Set([...selectedBotIds, ...idsInCat])));
  };

  // Filter bots by search query (matching name or token)
  const filteredBots = useMemo(() => {
    if (!botSearchQuery.trim()) return AI_BOT_REGISTRY;
    const query = botSearchQuery.toLowerCase().trim();
    return AI_BOT_REGISTRY.filter(
      b =>
        b.name.toLowerCase().includes(query) ||
        b.token.toLowerCase().includes(query) ||
        b.provider.toLowerCase().includes(query)
    );
  }, [botSearchQuery]);

  // URL count tracker
  const enteredUrls = useMemo(() => {
    return urlsInput
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean);
  }, [urlsInput]);

  // Main Test Runner
  const handleTest = async () => {
    if (enteredUrls.length === 0) {
      setErrorMessage('Please enter at least one URL to test.');
      setStatus('error');
      return;
    }

    if (enteredUrls.length > 100) {
      setErrorMessage('Maximum 100 URLs are supported per test.');
      setStatus('error');
      return;
    }

    if (selectedBotIds.length === 0) {
      setErrorMessage('Please select at least one AI bot to test.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/seo/ai-bot-access/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: enteredUrls,
          botIds: selectedBotIds,
          checks: {
            robotsTxt: true,
            httpStatus: true,
            content: true
          }
        })
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }

      if (!res.ok || !data || !data.success) {
        const rawText = !data ? await res.text().catch(() => '') : '';
        const errorMessage =
          data?.error ||
          (rawText && !rawText.includes('<html') && rawText.trim().length > 0
            ? rawText.trim()
            : `Server returned HTTP ${res.status}`);
        throw new Error(errorMessage || 'Failed testing AI bot access.');
      }

      setResultData(data);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.');
      setStatus('error');
    }
  };

  // Matrix construction: Distinct URLs as rows
  const matrixUrls = useMemo(() => {
    if (!resultData) return [];
    return Array.from(new Set(resultData.results.map(r => r.url)));
  }, [resultData]);

  // Filtered Results for comparison table
  const filteredMatrixUrls = useMemo(() => {
    if (!matrixUrls.length) return [];
    return matrixUrls.filter(u => {
      if (searchFilter && !u.toLowerCase().includes(searchFilter.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [matrixUrls, searchFilter]);

  // Quick lookup helper: map of `${url}__${botId}` -> SingleUrlBotResult
  const resultMap = useMemo(() => {
    const map = new Map<string, SingleUrlBotResult>();
    if (resultData) {
      for (const item of resultData.results) {
        map.set(`${item.url}__${item.botId}`, item);
      }
    }
    return map;
  }, [resultData]);

  // CSV Export Generator
  const handleExportCSV = () => {
    if (!resultData || !resultData.results.length) return;
    const headers = [
      'URL',
      'AI Bot',
      'Provider',
      'Category',
      'Robots.txt Status',
      'Matched Rule',
      'Rule Line',
      'HTTP Status',
      'Content Status',
      'Overall Result',
      'Explanation'
    ];

    const rows = resultData.results.map(r => [
      `"${r.url.replace(/"/g, '""')}"`,
      `"${r.botName}"`,
      `"${r.botProvider}"`,
      `"${r.botCategory}"`,
      r.robotsTxt.status,
      `"${(r.robotsTxt.appliedRule?.originalText || 'None').replace(/"/g, '""')}"`,
      r.robotsTxt.appliedRule?.lineNumber ?? '',
      r.http.statusCode ? `${r.http.statusCode} ${r.http.statusText}` : r.http.statusText,
      r.content.status,
      r.summaryLabel,
      `"${r.explanation.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ai-bot-access-report-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const aboutText = (
    <div className="space-y-4">
      <p>
        An <strong>AI Bot Access Tester</strong> (also known as an <em>AI crawler checker</em> or <em>AI bot checker</em>) is a specialized technical SEO diagnostic tool that verifies whether artificial intelligence web crawlers, AI search indexers, and user-directed AI retrieval agents can successfully access your web pages. As search expands into Answer Engine Optimisation (AEO) and Generative Engine Optimisation (GEO), understanding how AI bots encounter your website is essential for managing content discovery, model training inclusion, and AI search visibility.
      </p>
      <p>
        Crucially, robots.txt directives represent <strong>crawler policy</strong> under RFC 9309 standards—they communicate whether well-behaved crawlers are permitted or forbidden to access specific URL paths. However, robots.txt is not a physical network firewall. Even when a URL is explicitly marked as allowed in robots.txt, automated crawler requests can still be blocked at the network level by web server permissions, CDN security rules, or Web Application Firewalls (WAFs).
      </p>
      <p>
        The Indian Marketers AI Bot Access Tester resolves this gap by providing an end-to-end <strong>three-layer diagnostic stack</strong>: it evaluates RFC 9309 robots.txt permissions, simulates HTTP crawler requests with documented user-agent headers, and detects bot-blocking security challenges. You can test up to 100 bulk URLs against <strong>35 selectable AI bot entries</strong>, distinguishing 32 active HTTP crawler identities from 3 robots.txt policy tokens (such as Google-Extended and Applebot-Extended). For inspecting traditional search engine crawling rules, explore our <Link href="/tools/robots-txt-tester" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Robots.txt Tester</Link>.
      </p>
    </div>
  );

  const howItWorksSteps = [
    "Enter up to 100 URLs (one per line) across one or multiple website origins.",
    "Select AI crawlers to test: choose individual bots, filter by search query, use quick-select shortcuts for 'Training Bots' or 'AI Search', or test all 35 supported bots.",
    "Click 'Check AI Bot Access' to dispatch server-side diagnostic tests with origin-cached robots.txt lookups and controlled network concurrency.",
    "Inspect Layer 1 robots.txt directives to verify whether bots are Allowed or Disallowed under RFC 9309 specificity rules.",
    "Review Layer 2 HTTP status codes (200 OK, 301/302 redirects, or 403 Forbidden) and Layer 3 WAF challenge detections (Cloudflare Turnstile, CAPTCHAs, or CDN bot blocks).",
    "Inspect results in the multi-bot comparison matrix, click any table cell for exact matching rule lines and HTTP headers, or export your audit as a CSV report."
  ];

  const extraSections = (
    <>
      {/* WHAT DOES OUR AI CRAWLER CHECKER TEST? */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our AI Crawler Checker Test?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Layer 1 — Robots.txt Permissions
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Evaluates crawler directives against your live <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">robots.txt</code> under RFC 9309 rules. Matches crawler-specific user-agent tokens (e.g. <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">GPTBot</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">ClaudeBot</code>) and applies wildcard specificity tie-breaking to report the exact matching Allow or Disallow line.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Layer 2 — Simulated HTTP Access
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Sends simulated HTTP requests with the crawler&apos;s documented user-agent string to inspect server response codes (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">200 OK</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">301/302 Redirect</code>, or <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">403 Forbidden</code>). Note that simulated requests evaluate server behavior but do not claim the verified IP reputation of official crawler networks.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Layer 3 — WAF &amp; Challenge Detection
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Analyses HTML bodies and HTTP headers to detect perimeter bot protections, including Cloudflare Turnstile, interstitial security challenges, AWS WAF blockers, and CAPTCHA screens. This identifies when automated access is blocked by security infrastructure despite being permitted in robots.txt.
            </p>
          </div>
        </div>
      </section>

      {/* UNDERSTANDING DIFFERENT AI CRAWLERS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Understanding Different AI Crawlers</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              OpenAI: GPTBot vs. OAI-SearchBot vs. ChatGPT-User
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              OpenAI operates distinct crawler identities with different purposes: <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">GPTBot</code> crawls content used to train foundation models; <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">OAI-SearchBot</code> indexes content specifically for ChatGPT search discovery and web citations; and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">ChatGPT-User</code> executes real-time user-initiated browsing requests. <strong>Disallowing GPTBot does not block your site from ChatGPT search</strong>, and allowing OAI-SearchBot does not guarantee search citations.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Anthropic: ClaudeBot &amp; Perplexity: PerplexityBot
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Anthropic uses <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">ClaudeBot</code> to train models and index web content, alongside <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Claude-SearchBot</code> for search features and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Claude-User</code> for user-directed actions. Similarly, Perplexity relies on <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">PerplexityBot</code> for search indexing and answers, while <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Perplexity-User</code> handles interactive user queries.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Robots.txt Policy-Only Tokens (Google-Extended)
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Tokens such as <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Google-Extended</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Applebot-Extended</code>, and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Webzio-Extended</code> are <strong>robots.txt policy controls</strong>, not standalone HTTP crawlers. Google-Extended lets publishers opt out of Gemini and Vertex AI training data uses without affecting visibility in regular Google Search. Because these tokens do not make independent network requests, our tool reports HTTP testing for them as Not Applicable.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Open Training Sets &amp; General AI Agents
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Open foundation models frequently source data from large web archives like <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">CCBot</code> (Common Crawl) and specialized crawlers like <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Bytespider</code> (ByteDance), <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Diffbot</code>, and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">cohere-ai</code>. Granular user-agent testing allows you to permit AI search indexers while restricting bulk model-training extraction.
            </p>
          </div>
        </div>
      </section>

      {/* UNDERSTANDING TEST RESULTS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Understanding AI Bot Access Test Results</h2>
        </div>
        <div className="space-y-3">
          <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
            <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1">
              Robots.txt Allowed vs. Disallowed
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
              An <strong>Allowed</strong> status indicates that no matching Disallow rule applies to the tested URL path under RFC 9309 rules. A <strong>Blocked (Disallowed)</strong> status confirms that your robots.txt explicitly prohibits the selected bot from crawling the URL, displaying the exact directive and line number.
            </p>
          </div>

          <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
            <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1">
              HTTP 200 OK vs. HTTP 403 Forbidden
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
              <strong>HTTP 200 OK</strong> indicates that the web server served page content normally to the simulated bot user-agent. <strong>HTTP 403 Forbidden</strong> indicates that the web server or hosting platform actively rejected the request based on security rules, IP reputation, or user-agent filtering.
            </p>
          </div>

          <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
            <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1">
              Possible WAF Challenge Detected
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
              A <strong>Possible Challenge</strong> verdict means the server returned an interstitial verification screen (such as Cloudflare Turnstile, Managed Challenge, or CAPTCHA). Automated crawlers cannot complete interactive browser challenges, meaning their access is effectively obstructed even if robots.txt allows the path.
            </p>
          </div>

          <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
            <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1">
              Policy-Only Token (Not Applicable for HTTP)
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
              For robots.txt policy tokens (such as Google-Extended and Applebot-Extended), HTTP testing is reported as <strong>Not Applicable</strong>. These tokens govern AI data usage policies without sending distinct crawler requests across the web.
            </p>
          </div>
        </div>
      </section>

      {/* WHY AI CRAWLERS MAY BE BLOCKED */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Why AI Crawlers May Be Blocked &amp; How to Fix It</h2>
        </div>
        <div className="space-y-3">
          <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
            <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
              1. Blanket Disallow Rules in Robots.txt
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
              A general <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Disallow: /</code> directive under a wildcard group (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">User-agent: *</code>) instructs all AI bots to avoid your site unless overridden by explicit bot-specific Allow directives. If you wish to allow AI search indexers while blocking training bots, add explicit groups such as <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">User-agent: OAI-SearchBot</code> with <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Allow: /</code>.
            </p>
          </div>

          <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
            <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
              2. CDN Bot Management &amp; WAF Security Rules
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
              Platforms like Cloudflare, Cloudfront, and Fastly offer automated &quot;AI Scraper and Crawler&quot; blocking toggles. While designed to protect server bandwidth, these rules can inadvertently block AI search crawlers (like OAI-SearchBot and PerplexityBot), preventing your site from being cited in AI search results. Configure granular WAF exceptions for verified search crawlers while keeping training bots restricted.
            </p>
          </div>

          <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
            <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
              3. Rate Limiting and Subresource Rendering Restrictions
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
              Aggressive server rate limiting can trigger HTTP 429 or 503 errors during bulk crawls. Additionally, if your robots.txt or firewall blocks access to critical JavaScript and CSS files, crawlers may fail to render the DOM accurately. Use our <Link href="/tools/fetch-render" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Fetch &amp; Render</Link> tool to inspect how search engines render client-side code, and monitor your index status with the <Link href="/tools/bulk-google-index-checker" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Bulk Google Index Checker</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );

  const faqItems = [
    {
      question: "What is an AI Bot Access Tester?",
      answer: "An AI Bot Access Tester is a technical SEO diagnostic tool that checks whether artificial intelligence web crawlers, AI search indexers, and user-directed AI fetchers can access and crawl specific URLs on your website. It evaluates crawler policy under RFC 9309 robots.txt rules, tests simulated HTTP response codes, and detects CDN or Web Application Firewall (WAF) bot challenges."
    },
    {
      question: "How do I check if GPTBot can crawl my website?",
      answer: "To check if GPTBot can crawl your website, enter your URL into the tester and select OpenAI GPTBot. The tool fetches your live robots.txt file to determine if your User-agent: GPTBot or wildcard (*) directives return an Allowed or Disallowed status under RFC 9309, then verifies whether your web server responds with HTTP 200 OK or blocks the request."
    },
    {
      question: "How can I check whether ChatGPT search crawlers are allowed?",
      answer: "To check whether ChatGPT search can access your pages, select OAI-SearchBot in the tester. OpenAI uses OAI-SearchBot specifically to index content and display web citations in ChatGPT search results. You can inspect whether your robots.txt allows OAI-SearchBot and confirm that your server does not return 403 Forbidden or WAF challenge pages."
    },
    {
      question: "What is the difference between GPTBot and OAI-SearchBot?",
      answer: "GPTBot is OpenAI’s automated crawler used to collect content for training foundational AI models. OAI-SearchBot is a separate crawler dedicated to discovering, indexing, and citing web pages directly within ChatGPT search. Disallowing GPTBot does not automatically block your site from appearing in ChatGPT search results, and allowing OAI-SearchBot does not grant model-training rights."
    },
    {
      question: "Can robots.txt block AI crawlers?",
      answer: "Yes, compliant AI crawlers from reputable providers (including OpenAI, Anthropic, Google, Perplexity, and Apple) follow RFC 9309 robots.txt specifications. Adding a Disallow directive under the specific crawler user-agent group instructs the bot not to crawl those URLs. However, robots.txt is a cooperative policy standard, not a server-level firewall."
    },
    {
      question: "Why does an AI bot show as allowed in robots.txt but blocked by HTTP?",
      answer: "Robots.txt represents crawler policy, not network access. If robots.txt allows an AI bot, the crawler is permitted to request the URL. However, your web hosting, CDN security rules, or Web Application Firewall (WAF)—such as Cloudflare Bot Management or AWS WAF—may block automated requests with HTTP 403 Forbidden or serve interactive CAPTCHA/Turnstile verification challenges."
    },
    {
      question: "What is the difference between Google-Extended and Googlebot?",
      answer: "Googlebot is Google’s primary search crawler responsible for indexing pages for Google Search. Google-Extended is a robots.txt policy token (not a standalone HTTP crawler) used exclusively to opt out of Google’s generative AI model training (such as Gemini and Vertex AI) without impacting your site’s visibility in regular Google Search results."
    },
    {
      question: "Does allowing AI crawlers improve AI search visibility?",
      answer: "Permitting crawler access is a prerequisite for discovery, but it does not guarantee inclusion or ranking in AI search answers or LLM summaries. AI search engines like ChatGPT Search and Perplexity evaluate content relevance, authoritative source signals, factual accuracy, and technical page quality to determine which sources to cite in response to user queries."
    },
    {
      question: "Can I test multiple website URLs at once?",
      answer: "Yes. The AI Bot Access Tester supports bulk testing for up to 100 URLs per scan across single or multiple website origins. The tool groups requests by origin to cache robots.txt lookups efficiently, evaluates RFC 9309 matching rules with line numbers, and displays the results in an interactive comparison matrix with one-click CSV export."
    }
  ];

  const relatedTools = [
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Inspect RFC 9309 rules, specificity tie-breaking, and live robots.txt directives.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Simulate bot rendering and inspect HTTP response headers across user agents.' },
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: 'Review Google Search Console index status for URLs permitted or blocked for crawlers.' }
  ];

  return (
    <ToolLayout
      title="Free AI Bot Access Tester & Crawler Checker"
      description="Check whether AI crawlers can access your website with Indian Marketers' free AI Bot Access Tester. Analyse robots.txt permissions, HTTP responses and potential bot-blocking challenges for GPTBot, ClaudeBot, PerplexityBot and other supported AI crawlers."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'AI Bot Access Tester' }]}
      fullWidth={true}
      aboutTitle="What Is an AI Bot Access Tester?"
      aboutText={aboutText}
      howItWorksTitle="How to Check AI Crawler Access"
      howItWorks={howItWorksSteps}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faqItems}
      relatedTools={relatedTools}
    >
      <div className="space-y-8 w-full">

        {/* INPUT CONFIGURATION CARD */}
        <div className="card shadow-sm border-slate-200 bg-white p-6 sm:p-8">
          <div className="border-b border-slate-200 pb-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">AI Crawler Access Evaluation</h2>
              <p className="text-base text-slate-600 mt-1">Test bulk URLs against major AI model trainers, AI search bots, and user-initiated fetchers.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold px-3 py-1.5 rounded-full border ${enteredUrls.length > 100 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-800 border-slate-300'
                }`}>
                {enteredUrls.length} / 100 URLs Entered
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* 1. URLs Multi-line Input */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="label text-base font-bold text-slate-800 m-0">
                  Target URLs to Test (One URL per line, maximum 100)
                </label>
                {enteredUrls.length > 0 && (
                  <button
                    onClick={() => setUrlsInput('')}
                    className="text-xs text-slate-500 hover:text-rose-600 font-semibold cursor-pointer"
                  >
                    Clear URLs
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                className="input font-mono text-base py-3.5 px-4 leading-relaxed"
                placeholder="https://example.com/&#10;https://example.com/blog/&#10;https://example.com/products/&#10;https://example.com/private/"
                value={urlsInput}
                onChange={(e) => setUrlsInput(e.target.value)}
                disabled={status === 'loading'}
              />
            </div>

            {/* 2. AI Bot Multi-Select Section */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <label className="label text-base font-bold text-slate-800 m-0">
                  Select AI Bots to Test ({selectedBotIds.length} of {AI_BOT_REGISTRY.length} selected)
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <button
                    onClick={handleSelectAllBots}
                    className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAllBots}
                    className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    Deselect All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => handleSelectByCategory('training')}
                    className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer"
                  >
                    + Training Bots
                  </button>
                  <button
                    onClick={() => handleSelectByCategory('search')}
                    className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                  >
                    + AI Search
                  </button>
                </div>
              </div>

              {/* Search User Agents */}
              <div className="mb-2 relative">
                <input
                  type="text"
                  placeholder="Search user-agents by name or token (e.g. GPTBot, Claude, Omgili, Semrush)..."
                  value={botSearchQuery}
                  onChange={(e) => setBotSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-green-500 font-medium"
                />
                <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                {botSearchQuery && (
                  <button
                    onClick={() => setBotSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Bot Checkboxes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 max-h-64 overflow-y-auto">
                {filteredBots.map((bot) => {
                  const isChecked = selectedBotIds.includes(bot.id);

                  return (
                    <label
                      key={bot.id}
                      className={`flex items-start gap-2.5 p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer select-none ${isChecked
                        ? 'bg-white border-green-500 shadow-xs text-slate-900'
                        : 'bg-transparent border-transparent text-slate-600 hover:bg-white/80'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleBot(bot.id)}
                        className="mt-0.5 rounded text-green-600 focus:ring-green-500 cursor-pointer w-4 h-4 shrink-0"
                      />
                      <div className="truncate min-w-0">
                        <span className="block truncate font-bold text-slate-900 text-xs">
                          {bot.name}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-500 truncate">
                          {bot.token}
                        </span>
                      </div>
                    </label>
                  );
                })}
                {filteredBots.length === 0 && (
                  <div className="col-span-full py-4 text-center text-xs text-slate-500 font-medium">
                    No user agents match &quot;{botSearchQuery}&quot;
                  </div>
                )}
              </div>
            </div>



            {/* Test Button */}
            <div className="pt-2">
              <button
                className="btn btn-primary w-full py-4 text-base font-extrabold shadow-sm hover:shadow-md transition-all cursor-pointer"
                onClick={handleTest}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Testing AI Crawlers ({enteredUrls.length} URLs &times; {selectedBotIds.length} Bots = {enteredUrls.length * selectedBotIds.length} Combinations)...
                  </span>
                ) : (
                  `Check AI Bot Access (${enteredUrls.length} URLs &bull; ${selectedBotIds.length} Bots)`
                )}
              </button>
            </div>

            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
                {errorMessage}
              </div>
            )}
          </div>
        </div>

        {/* RESULTS SECTION */}
        {status === 'success' && resultData && (
          <div className="space-y-8 w-full">

            {/* KPI STAT BANNER */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="card p-5 text-center">
                <span className="text-xs uppercase font-black text-slate-500 tracking-wider">Combinations</span>
                <span className="font-black text-2xl text-slate-900 block mt-1">{resultData.summary.totalCombinations}</span>
                <span className="text-xs text-slate-500 font-medium">{resultData.summary.totalUrls} URLs &bull; {resultData.summary.totalBots} Bots</span>
              </div>

              <div className="card p-5 text-center bg-emerald-50/40 border-emerald-200">
                <span className="text-xs uppercase font-black text-emerald-700 tracking-wider">Robots Allowed</span>
                <span className="font-black text-2xl text-emerald-800 block mt-1">{resultData.summary.robotsAllowed}</span>
                <span className="text-xs text-emerald-600 font-medium">
                  {Math.round((resultData.summary.robotsAllowed / (resultData.summary.totalCombinations || 1)) * 100)}% of total
                </span>
              </div>

              <div className="card p-5 text-center bg-rose-50/40 border-rose-200">
                <span className="text-xs uppercase font-black text-rose-700 tracking-wider">Robots Blocked</span>
                <span className="font-black text-2xl text-rose-800 block mt-1">{resultData.summary.robotsBlocked}</span>
                <span className="text-xs text-rose-600 font-medium">
                  {Math.round((resultData.summary.robotsBlocked / (resultData.summary.totalCombinations || 1)) * 100)}% of total
                </span>
              </div>

              <div className="card p-5 text-center bg-blue-50/40 border-blue-200">
                <span className="text-xs uppercase font-black text-blue-700 tracking-wider">HTTP Accessible</span>
                <span className="font-black text-2xl text-blue-800 block mt-1">{resultData.summary.httpAccessible}</span>
                <span className="text-xs text-blue-600 font-medium">200 OK + Content</span>
              </div>

              <div className="card p-5 text-center bg-amber-50/40 border-amber-200">
                <span className="text-xs uppercase font-black text-amber-700 tracking-wider">Challenges/WAF</span>
                <span className="font-black text-2xl text-amber-800 block mt-1">{resultData.summary.contentChallenges}</span>
                <span className="text-xs text-amber-600 font-medium">Turnstile/CAPTCHAs</span>
              </div>

              <div className="card p-5 text-center bg-slate-50 border-slate-200">
                <span className="text-xs uppercase font-black text-slate-600 tracking-wider">HTTP Denied (403)</span>
                <span className="font-black text-2xl text-slate-800 block mt-1">{resultData.summary.httpDenied}</span>
                <span className="text-xs text-slate-500 font-medium">Server firewalls</span>
              </div>
            </div>

            {/* URL SUBMISSION & DUPLICATE REPORT BANNER */}
            {resultData.urlStats && resultData.urlStats.duplicateCount > 0 && (
              <div className="p-3.5 px-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded">URL Notice</span>
                  <span>
                    Submitted: <strong>{resultData.urlStats.submittedCount}</strong> &bull; Unique Tested: <strong>{resultData.urlStats.uniqueCount}</strong> &bull; Duplicates Removed: <strong>{resultData.urlStats.duplicateCount}</strong>
                  </span>
                </div>
                <span className="text-[11px] text-amber-700 font-normal hidden sm:inline">
                  Redundant URLs were automatically deduplicated to optimize performance.
                </span>
              </div>
            )}

            {/* URL SELECTION HEADER / TABS (If multiple URLs tested) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {matrixUrls.length > 1 ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">Tested URL:</span>
                  {matrixUrls.map((u, i) => (
                    <button
                      key={u}
                      onClick={() => setSearchFilter(u)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${(searchFilter === u || (!searchFilter && i === 0))
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                    >
                      {u.replace(/^https?:\/\//, '')}
                    </button>
                  ))}
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter('')}
                      className="text-xs text-blue-600 hover:underline font-semibold ml-1 cursor-pointer"
                    >
                      Show All
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-500">
                  Showing access diagnostic per bot
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportCSV}
                  className="btn btn-secondary text-xs px-3.5 py-2 font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Export CSV
                </button>
              </div>
            </div>

            {/* TECHNICALSEO ACCORDION / LIST DISPLAY (Matching Screenshot) */}
            {filteredMatrixUrls.map((targetUrl) => {
              // Get all bot results for this URL
              const urlResults = resultData.results.filter(r => r.url === targetUrl);
              const domain = (() => {
                try { return new URL(targetUrl).hostname; } catch { return targetUrl; }
              })();

              return (
                <div key={targetUrl} className="rounded-2xl overflow-hidden shadow-xl bg-[#1e232a] border border-[#2b323c]">

                  {/* Top Header with Favicon + Target URL */}
                  <div className="py-5 px-6 flex items-center justify-center gap-3 bg-[#191d23] border-b border-[#2b323c]">
                    <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm border border-slate-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                        alt="Favicon"
                        className="w-4 h-4 object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <span className="text-lg font-bold text-slate-200 tracking-tight font-mono truncate max-w-xl">
                      {targetUrl}
                    </span>
                  </div>

                  {/* Dark Table Matching TechnicalSEO Reference */}
                  <div className="overflow-x-auto touch-scroll">
                    <table className="w-full text-left text-sm border-collapse min-w-[560px]">
                      <thead>
                        <tr className="border-b border-[#2e3744] text-[#8e9aa8] text-xs font-semibold uppercase tracking-wider">
                          <th className="py-3.5 px-6 font-semibold w-1/4">
                            <span className="inline-flex items-center gap-1 text-slate-300">
                              User Agent
                              <span className="text-[10px] text-slate-400">&uarr;</span>
                            </span>
                          </th>
                          <th className="py-3.5 px-6 font-semibold text-center w-28">
                            robots.txt
                          </th>
                          <th className="py-3.5 px-6 font-semibold w-1/4">
                            Status code
                          </th>
                          <th className="py-3.5 px-6 font-semibold w-1/3">
                            Word count / Redirect URL
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#28303d] text-sm font-medium">
                        {urlResults.map((item) => {
                          const isRobotsAllowed = item.robotsTxt.status === 'ALLOWED';
                          const isRobotsBlocked = item.robotsTxt.status === 'BLOCKED';

                          // HTTP status formatting & color
                          const statusCode = item.http.statusCode;
                          let statusColor = 'text-slate-400';
                          let statusLabel = item.http.statusText || 'N/A';

                          if (item.http.isPolicyOnly) {
                            statusColor = 'text-blue-400';
                            statusLabel = 'Policy Token';
                          } else if (statusCode) {
                            if (statusCode >= 200 && statusCode < 300) {
                              statusColor = 'text-emerald-400';
                              statusLabel = `${statusCode} OK`;
                            } else if (statusCode >= 300 && statusCode < 400) {
                              statusColor = 'text-[#eab308]'; // Amber
                              statusLabel = `${statusCode} ${item.http.statusText || 'Moved'}`;
                            } else if (statusCode >= 400 && statusCode < 500) {
                              statusColor = 'text-rose-400';
                              statusLabel = `${statusCode} ${item.http.statusText || 'Denied'}`;
                            } else if (statusCode >= 500) {
                              statusColor = 'text-rose-500';
                              statusLabel = `${statusCode} Server Error`;
                            }
                          }

                          // 4th Column Content: Redirect URL OR Word count
                          let fourthColContent: React.ReactNode = null;
                          if (item.http.finalUrl && item.http.finalUrl !== item.url) {
                            // It redirected
                            fourthColContent = (
                              <a
                                href={item.http.finalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-300 hover:text-white underline font-mono text-xs truncate block max-w-lg"
                                title={item.http.finalUrl}
                              >
                                {item.http.finalUrl}
                              </a>
                            );
                          } else if (item.content.wordCount !== undefined && item.content.wordCount > 0) {
                            fourthColContent = (
                              <span className="text-slate-300 font-medium">
                                {item.content.wordCount.toLocaleString()} words
                              </span>
                            );
                          } else if (item.http.isPolicyOnly) {
                            fourthColContent = (
                              <span className="text-slate-500 italic text-xs">
                                N/A (Policy token only)
                              </span>
                            );
                          } else if (item.http.status === 'HTTP_DENIED' || statusCode === 403) {
                            fourthColContent = (
                              <span className="text-rose-300 text-xs">
                                Access Forbidden (403)
                              </span>
                            );
                          } else if (item.content.challengeDetected) {
                            fourthColContent = (
                              <span className="text-amber-400 text-xs">
                                {item.content.challengeType || 'Bot Challenge'}
                              </span>
                            );
                          } else {
                            fourthColContent = (
                              <span className="text-slate-500 text-xs">&mdash;</span>
                            );
                          }

                          return (
                            <tr
                              key={item.botId}
                              onClick={() => setActiveDetail(item)}
                              className="hover:bg-[#252c36] transition-colors cursor-pointer group"
                              title="Click to view full 3-layer diagnostic"
                            >
                              {/* 1. User Agent Column */}
                              <td className="py-3.5 px-6 font-semibold text-slate-200">
                                <div className="flex items-center gap-2">
                                  <span>{item.botName} ({item.token})</span>
                                </div>
                              </td>

                              {/* 2. robots.txt Column */}
                              <td className="py-3.5 px-6 text-center">
                                {isRobotsAllowed ? (
                                  <span className="inline-flex items-center justify-center text-emerald-400 font-bold text-lg leading-none" title="Allowed by robots.txt">
                                    &#10003;
                                  </span>
                                ) : isRobotsBlocked ? (
                                  <span className="inline-flex items-center justify-center text-rose-500 font-bold text-base leading-none" title="Disallowed by robots.txt">
                                    &#10005;
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-xs">&mdash;</span>
                                )}
                              </td>

                              {/* 3. Status code Column */}
                              <td className="py-3.5 px-6">
                                <span className={`font-semibold ${statusColor}`}>
                                  {statusLabel}
                                </span>
                              </td>

                              {/* 4. Word count / Redirect URL Column */}
                              <td className="py-3.5 px-6">
                                <div className="flex items-center justify-between">
                                  {fourthColContent}
                                  <span className="text-[11px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                                    Details &rarr;
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* DETAIL INSPECTION MODAL */}
        {activeDetail && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">

              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase mb-1">
                    {activeDetail.botProvider} &bull; {activeDetail.botCategory}
                  </div>
                  <h3 className="text-2xl font-black text-slate-900">{activeDetail.botName} Access Report</h3>
                  <a href={activeDetail.url} target="_blank" rel="noreferrer" className="text-sm font-mono text-blue-600 hover:underline break-all mt-1 block">
                    {activeDetail.url}
                  </a>
                </div>
                <button
                  onClick={() => setActiveDetail(null)}
                  className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl font-bold cursor-pointer"
                >
                  &times;
                </button>
              </div>

              {/* 3-Layer Diagnostic Stack */}
              <div className="space-y-4">
                {/* Layer 1 */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-extrabold text-slate-500">Layer 1: robots.txt Permission</span>
                    <span className={`badge ${activeDetail.robotsTxt.status === 'ALLOWED' ? 'badge-success' : activeDetail.robotsTxt.status === 'BLOCKED' ? 'badge-error' : 'badge-warning'
                      }`}>
                      {activeDetail.robotsTxt.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800">{activeDetail.robotsTxt.explanation}</p>
                  {activeDetail.robotsTxt.appliedRule && (
                    <div className="text-xs font-mono text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                      Rule: <strong>{activeDetail.robotsTxt.appliedRule.originalText}</strong> (Line #{activeDetail.robotsTxt.appliedRule.lineNumber})
                    </div>
                  )}
                </div>

                {/* Layer 2 */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-extrabold text-slate-500">Layer 2: Simulated HTTP Request</span>
                    <span className="font-mono text-xs font-extrabold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {activeDetail.http.statusCode ? `HTTP ${activeDetail.http.statusCode}` : activeDetail.http.statusText}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {activeDetail.http.isPolicyOnly
                      ? 'Policy-only token. Does not issue independent HTTP crawler requests.'
                      : `Observed status: ${activeDetail.http.statusText} (${activeDetail.http.durationMs || 0}ms latency).`}
                  </p>
                </div>

                {/* Layer 3 */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-extrabold text-slate-500">Layer 3: Content & Challenge Detection</span>
                    <span className={`badge ${activeDetail.content.status === 'CONTENT_RETRIEVED' ? 'badge-success' : activeDetail.content.status === 'POSSIBLE_CHALLENGE' ? 'badge-warning' : 'badge-neutral'
                      }`}>
                      {activeDetail.content.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {activeDetail.content.challengeDetected
                      ? `Challenge detected: ${activeDetail.content.challengeType}. Automated access restricted.`
                      : activeDetail.content.status === 'CONTENT_RETRIEVED'
                        ? `Content retrieved successfully (${activeDetail.content.bodyLength || 0} bytes). Document title: "${activeDetail.content.title || 'Untitled'}".`
                        : 'Content analysis not applicable or failed.'}
                  </p>
                </div>
              </div>

              {/* Synthesized Reason */}
              <div className="p-4 rounded-2xl bg-slate-100 border border-slate-300">
                <span className="text-xs uppercase font-black text-slate-500 block mb-1">Synthesized Technical Verdict</span>
                <p className="text-sm font-semibold text-slate-900">{activeDetail.explanation}</p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setActiveDetail(null)}
                  className="btn btn-primary text-sm px-6 py-2.5 font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </ToolLayout>
  );
}
