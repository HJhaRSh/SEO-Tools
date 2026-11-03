'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import { USER_AGENTS } from '@/lib/seo/userAgents';
import { RobotsTestResult } from '@/lib/seo/robotsService';
import { SitemapCheckResult, ResourceCheckResult } from '@/lib/seo/resourceService';

export default function RobotsTxtTester() {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [testPath, setTestPath] = useState('/');
  const [selectedUserAgent, setSelectedUserAgent] = useState('Googlebot');
  const [customUserAgent, setCustomUserAgent] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result state
  const [resultData, setResultData] = useState<RobotsTestResult | null>(null);

  // Original untouched fetched robots.txt content (for reset functionality)
  const [originalLiveContent, setOriginalLiveContent] = useState('');

  // Active tab state for deep dive
  const [activeTab, setActiveTab] = useState<'editor' | 'sitemaps' | 'resources'>('editor');

  // Live Editor state
  const [editorContent, setEditorContent] = useState('');
  const [editorEvaluating, setEditorEvaluating] = useState(false);

  // Sitemap state
  const [sitemapChecking, setSitemapChecking] = useState(false);
  const [sitemapResults, setSitemapResults] = useState<SitemapCheckResult[] | null>(null);

  // Resource Check state
  const [resourceChecking, setResourceChecking] = useState(false);
  const [resourceResults, setResourceResults] = useState<ResourceCheckResult | null>(null);
  const [resourceFilter, setResourceFilter] = useState<'all' | 'blocked' | 'allowed'>('all');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [resetFeedback, setResetFeedback] = useState(false);

  const getEffectiveUserAgent = () => {
    return selectedUserAgent === 'Custom' ? customUserAgent.trim() || 'CustomBot' : selectedUserAgent;
  };

  /**
   * Safely inspects HTTP response status, Content-Type, and parses JSON.
   * Gracefully handles HTML/text 500/502/503/504 serverless errors and malformed JSON.
   */
  const parseSafeJsonResponse = async <T = any>(
    res: Response,
    fallbackErrorMsg: string
  ): Promise<{ ok: boolean; data?: T; error?: string }> => {
    const status = res.status;
    const contentType = res.headers.get('content-type') || '';

    let rawText = '';
    try {
      rawText = await res.text();
    } catch (err: any) {
      return {
        ok: false,
        error: `Unable to read server response (HTTP ${status}): ${err?.message || 'Network stream error'}`
      };
    }

    let parsed: any = null;
    const isLikelyJson =
      contentType.toLowerCase().includes('application/json') ||
      rawText.trim().startsWith('{') ||
      rawText.trim().startsWith('[');

    if (isLikelyJson) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return {
          ok: false,
          error: `Server returned an invalid JSON response (HTTP ${status}).`
        };
      }
    }

    if (parsed && typeof parsed === 'object') {
      if (res.ok && parsed.success !== false) {
        return { ok: true, data: parsed as T };
      }

      const errorMsg =
        parsed.error ||
        (Array.isArray(parsed.errors) && parsed.errors.length > 0 ? parsed.errors.join(', ') : null) ||
        parsed.message ||
        fallbackErrorMsg;

      return { ok: false, data: parsed as T, error: errorMsg };
    }

    // Non-JSON server error handling (e.g. Vercel 500/502/503/504 HTML error pages)
    let sanitizedError = `Server responded with HTTP ${status} ${res.statusText || 'Error'}.`;
    if (status === 504 || status === 408) {
      sanitizedError = 'The request timed out on the server. Please check the website URL and try again.';
    } else if (status === 502 || status === 503) {
      sanitizedError = 'The service is temporarily unavailable. Please try again in a few moments.';
    } else if (status >= 500) {
      sanitizedError = 'A server error occurred while evaluating robots.txt. Please verify the target URL.';
    } else if (status === 404) {
      sanitizedError = 'The requested endpoint was not found on the server (HTTP 404).';
    } else if (status === 403) {
      sanitizedError = 'Access to this URL was blocked by security policies (HTTP 403).';
    }

    return { ok: false, error: sanitizedError };
  };

  const handleTest = async (overrideMode?: 'live' | 'editor', contentToTest?: string) => {
    if (!websiteUrl.trim()) {
      setErrorMessage('Please enter a valid website URL.');
      setStatus('error');
      return;
    }

    const currentMode = overrideMode || 'live';
    const ua = getEffectiveUserAgent();

    if (currentMode === 'editor') {
      setEditorEvaluating(true);
    } else {
      setStatus('loading');
      setSitemapResults(null);
      setResourceResults(null);
    }
    setErrorMessage(null);

    try {
      const res = await fetch('/api/seo/robots/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: websiteUrl.trim(),
          path: testPath.trim() || '/',
          userAgent: ua,
          mode: currentMode,
          customRobotsTxt: currentMode === 'editor' ? (contentToTest ?? editorContent) : null,
          forceRefresh: true
        })
      });

      const { ok, data, error } = await parseSafeJsonResponse<RobotsTestResult>(
        res,
        'Failed to evaluate robots.txt'
      );

      if (!ok || !data || data.success === false) {
        throw new Error(error || data?.errors?.join(', ') || 'Failed to evaluate robots.txt');
      }

      setResultData(data);
      if (currentMode === 'live') {
        const fetchedContent = data.robotsTxt?.content || '';
        setOriginalLiveContent(fetchedContent);
        setEditorContent(fetchedContent);
      }
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.');
      setStatus('error');
    } finally {
      setEditorEvaluating(false);
    }
  };

  const handleResetEditor = () => {
    const contentToRestore = originalLiveContent || (resultData ? resultData.robotsTxt.content : '');
    setEditorContent(contentToRestore);
    setResetFeedback(true);
    setTimeout(() => setResetFeedback(false), 2000);
    // Re-test immediately against the restored live content
    handleTest('editor', contentToRestore);
  };

  const handleCheckSitemaps = async () => {
    if (!resultData || !resultData.sitemaps || resultData.sitemaps.length === 0) return;

    setSitemapChecking(true);
    try {
      const res = await fetch('/api/seo/robots/sitemaps/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sitemaps: resultData.sitemaps.map(s => s.url)
        })
      });

      const { ok, data, error } = await parseSafeJsonResponse<{ success: boolean; sitemaps: SitemapCheckResult[] }>(
        res,
        'Failed checking sitemaps'
      );

      if (ok && data?.success && Array.isArray(data.sitemaps)) {
        setSitemapResults(data.sitemaps);
      } else {
        console.warn('Sitemap status check returned an error:', error);
      }
    } catch (err) {
      console.error('Error checking sitemaps', err);
    } finally {
      setSitemapChecking(false);
    }
  };

  const handleCheckResources = async () => {
    if (!resultData) return;

    setResourceChecking(true);
    try {
      const res = await fetch('/api/seo/robots/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: resultData.targetUrl,
          userAgent: getEffectiveUserAgent()
        })
      });

      const { ok, data, error } = await parseSafeJsonResponse<ResourceCheckResult & { success?: boolean }>(
        res,
        'Failed checking page resources'
      );

      if (ok && data && data.success !== false) {
        setResourceResults(data);
      } else {
        alert(error || 'Failed checking resources');
      }
    } catch (err: any) {
      alert(err.message || 'Network error checking page resources');
    } finally {
      setResourceChecking(false);
    }
  };

  const handleCopyResult = () => {
    if (!resultData) return;
    const summary = `Indian Marketers SEO Tools — robots.txt Tester Report
Tested URL: ${resultData.targetUrl}
User Agent: ${resultData.userAgent.name}
Crawlability Status: ${resultData.result.status}
Applied Rule: ${resultData.result.appliedRule ? resultData.result.appliedRule.originalText + ' (Line ' + resultData.result.appliedRule.lineNumber + ')' : 'None'}
Explanation: ${resultData.result.explanation}
Source: ${resultData.source === 'EDITOR_ROBOTS' ? 'Live Sandbox Editor Simulation' : 'Live robots.txt'}`;

    navigator.clipboard.writeText(summary);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const exportResourcesCSV = () => {
    if (!resourceResults || !resourceResults.resources.length) return;
    const headers = ['Resource URL', 'Type', 'Host', 'Crawlability', 'Applied Rule', 'Robots.txt URL'];
    const rows = resourceResults.resources.map(r => [
      `"${r.url.replace(/"/g, '""')}"`,
      r.type,
      `"${r.host}"`,
      r.crawlability,
      `"${(r.appliedRule ? r.appliedRule.originalText : '').replace(/"/g, '""')}"`,
      `"${r.robotsTxtUrl}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `resources-crawlability-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const aboutText = (
    <div className="space-y-4">
      <p>
        A robots.txt tester is a diagnostic technical SEO tool designed to evaluate whether web crawlers—such as Googlebot, Bingbot, or custom search engine user agents—are permitted to crawl specific URLs on a website according to the rules defined in its <code className="font-mono text-xs sm:text-sm bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">robots.txt</code> file. Operating strictly under the official <strong>RFC 9309 Robots Exclusion Protocol</strong> standard, this tester parses live directives, matches user-agent tokens, resolves path specificity, and attributes the exact winning rule that determines crawler access.
      </p>
      <p>
        It is important to understand that a robots.txt tester evaluates <strong>crawlability permissions</strong>, not search indexation. A crawl verdict of &quot;Allowed&quot; confirms that search engine bots may download the page content; it does not guarantee that Google will index the URL. Conversely, a &quot;Disallowed&quot; verdict prevents crawlers from fetching the URL, but does not necessarily prevent the URL from appearing in search results if external backlinks point to it. To inspect actual Google indexation coverage, use our <Link href="/tools/bulk-google-index-checker" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Bulk Google Index Checker</Link>. For dedicated auditing of automated AI bots and LLM scraper access policies, refer to the <Link href="/tools/ai-bot-access-tester" className="text-[var(--im-primary-deep)] font-semibold hover:underline">AI Bot Access Tester</Link>.
      </p>
    </div>
  );

  const howItWorksSteps = [
    "Enter the Website URL (origin) you want to inspect (e.g. https://example.com).",
    "Specify the exact URL Path or query string you want to test (e.g. /products/item or /search?q=seo).",
    "Select your target crawler from the User Agent dropdown (e.g. Googlebot, Bingbot, or custom crawler token).",
    "Click 'Test URL Crawlability' to fetch the live robots.txt and execute the RFC 9309 directive evaluation engine.",
    "Review the Allow or Disallow verdict, matched user-agent group, and line-by-line winning rule attribution.",
    "Simulate rule modifications in the Live Sandbox Editor to preview fixes, or inspect sitemaps and embedded page resources."
  ];

  const extraSections = (
    <>
      {/* WHAT DOES OUR ROBOTS.TXT CHECKER ANALYSE? */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our Robots.txt Checker Analyse?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Allow &amp; Disallow Directives
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Parses positive (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">Allow:</code>) and negative (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">Disallow:</code>) statements across user-agent groups. Validates empty disallows (which grant full access) and trailing-slash rules to prevent unintended crawl blocks across whole directory hierarchies.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Googlebot &amp; User-Agent Groups
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Consolidates repeated user-agent blocks and maps crawler identities correctly. According to Google documentation, Googlebot Smartphone reads rules from <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">User-agent: Googlebot</code> before falling back to wildcard <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">*</code> groups.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              RFC 9309 Specificity &amp; Ties
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Resolves rule precedence using exact octet (character) length matching. Supports standard wildcards (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">*</code>) and end-of-path anchors (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">$</code>). In the event of an equal character-length tie between Allow and Disallow, RFC 9309 mandates Allow takes precedence.
            </p>
          </div>
        </div>
      </section>

      {/* UNDERSTANDING ROBOTS.TXT TEST RESULTS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Understanding Robots.txt Test Results</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            When you run a crawlability test, the engine returns a visual verdict accompanied by the underlying rationale:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                Allowed (Crawl Permitted)
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                The crawler is authorized to request the URL. This occurs when an explicit <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Allow:</code> rule wins, no matching disallow directive is encountered, or the server returns an HTTP 404 (Not Found) status code.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                Disallowed (Crawl Blocked)
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                The crawler is forbidden from requesting the URL. This occurs when a winning <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Disallow:</code> pattern matches the path, or if server-side 5xx errors cause crawlers to temporarily suspend crawling on the host.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                Attributed Winning Rule
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                The breakdown pinpoints the exact line number, directive text, and matched character length in your robots.txt file that governed the decision, enabling rapid pinpoint debugging of conflicting rules.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COMMON ROBOTS.TXT ERRORS AND CRAWLABILITY ISSUES */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Common Robots.txt Errors &amp; Crawlability Issues</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            When diagnosing organic search performance issues, keep these common robots.txt pitfalls in mind:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                1. Blocking Critical CSS, JavaScript, and Image Resources
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Googlebot requires access to CSS stylesheets and JavaScript scripts to render pages like an evergreen browser. Blocking static asset directories prevents Google from computing layout, determining mobile friendliness, and extracting structured data. Use our <Link href="/tools/fetch-render" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Fetch &amp; Render</Link> tool to inspect how search engines render your pages.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                2. Accidental Site-Wide Disallow Directives
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                A single stray directive such as <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Disallow: /</code> under a generic wildcard or Googlebot user-agent group instructs search engines to abandon crawling the entire website origin, causing new URLs to be ignored and updates to stall.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                3. Expecting Robots.txt Disallow to Remove Indexed URLs
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Robots.txt blocks crawling, not indexing. If a disallowed URL has external backlinks, Google can still index the URL. Crucially, blocking a page prevents Google from discovering a <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">noindex</code> tag. To remove a page, keep it crawlable and apply a noindex directive.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                4. Invalid Sitemap Declarations
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Sitemap lines must declare full, absolute URLs (e.g. <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">Sitemap: https://example.com/sitemap.xml</code>). Relative paths are ignored by RFC 9309 compliant parsers. Use our <Link href="/tools/sitemap-generator" className="text-[var(--im-primary-deep)] font-semibold hover:underline">XML Sitemap Generator</Link> to generate and validate standards-compliant XML sitemaps.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );

  const faqItems = [
    { 
      question: "What is a robots.txt tester?", 
      answer: "A robots.txt tester is a diagnostic technical SEO tool that checks whether specific search engine crawlers (such as Googlebot or Bingbot) are permitted to access and crawl a given URL path on your website according to your robots.txt file. It evaluates your directives against official standards (such as RFC 9309) to reveal whether a URL is allowed or disallowed." 
    },
    { 
      question: "How do I test robots.txt rules for a specific URL?", 
      answer: "To test a URL: enter your website origin (e.g., https://example.com) and the exact path you wish to test (e.g., /category/product or /private-folder). Next, choose your target crawler from the User Agent dropdown—such as Googlebot or Bingbot—and run the test. The tester fetches your live robots.txt file, evaluates your directives, and returns an Allow or Disallow verdict alongside the exact matching rule and line number." 
    },
    { 
      question: "Does Google Search Console still have a robots.txt Tester?", 
      answer: "Google retired its former standalone Search Console robots.txt Tester in late 2023. Search Console now provides a robots.txt report that displays fetched robots.txt files, fetch status, and processing errors. For testing whether a specific live URL is crawlable, Google offers the URL Inspection tool. Indian Marketers provides this independent robots.txt Tester to test URL paths, inspect rule precedence, and simulate edits in a sandbox editor before publishing changes." 
    },
    { 
      question: "Does robots.txt Disallow prevent a page from being indexed by Google?", 
      answer: "No. Robots.txt directives govern crawling (requesting and downloading the page), not indexing. If a disallowed URL receives external links, Google can still index the URL and display it in search results without a content snippet. To prevent indexing, a URL must be crawlable by Googlebot so it can read a 'noindex' robots meta tag or X-Robots-Tag HTTP header. Blocking a page in robots.txt prevents Google from reading a 'noindex' directive." 
    },
    { 
      question: "How does rule precedence and tie-breaking work under RFC 9309?", 
      answer: "Under RFC 9309, search engine crawlers evaluate directives by pattern specificity, defined by the number of octets (characters) in the matching rule path. The longest matching rule takes precedence regardless of whether it appears first or last in the file. When an Allow and Disallow rule match the exact same octet length, the Allow rule takes precedence over Disallow." 
    },
    { 
      question: "Why does Googlebot Smartphone use the 'Googlebot' user-agent group?", 
      answer: "According to Google's official crawler documentation, Googlebot Smartphone identifies itself as a Googlebot crawler and reads directives from the 'User-agent: Googlebot' group. It only falls back to the generic 'User-agent: *' wildcard group if no specific 'Googlebot' group exists in your robots.txt file. A separate user-agent group for Googlebot-Smartphone is generally unnecessary unless you specifically want distinct mobile crawling rules." 
    },
    { 
      question: "Why should I test embedded page resources like CSS and JavaScript?", 
      answer: "Google renders web pages using an evergreen Chromium browser engine. If your robots.txt file blocks Googlebot from crawling essential CSS stylesheets, JavaScript bundles, or images, Googlebot cannot render the page layout correctly. This can cause rendering discrepancies, negatively affect mobile-friendliness assessment, and prevent structured data and critical above-the-fold content from being indexed." 
    },
    { 
      question: "What happens if a website's robots.txt returns a 404 error?", 
      answer: "According to RFC 9309 Section 2.3.1.2, if a robots.txt file returns an HTTP 404 (Not Found) or 410 (Gone) status code, search engine crawlers interpret this as a complete absence of crawling restrictions. Crawlers assume all URLs on the host are allowed for crawling. In contrast, if the server returns a 5xx server error, crawlers treat the failure as a temporary service outage and typically postpone crawling until the file can be retrieved." 
    }
  ];

  const relatedTools = [
    { name: 'AI Bot Access Tester', href: '/tools/ai-bot-access-tester', desc: 'Verify whether AI crawlers like GPTBot and ClaudeBot can access your site.' },
    { name: 'XML Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Create and validate clean XML sitemaps to declare crawlable URLs.' },
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: 'Review Google Search Console indexing status separately from crawling rules.' }
  ];

  return (
    <ToolLayout
      title="Free Robots.txt Tester & Checker"
      description="Check whether search engine crawlers can access specific URLs with Indian Marketers' free Robots.txt Tester. Test Googlebot and other user agents against Allow and Disallow rules, identify matching directives, and review potential crawling restrictions."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'robots.txt Tester' }]}
      fullWidth={true}
      aboutTitle="What Is a Robots.txt Tester?"
      aboutText={aboutText}
      howItWorksTitle="How to Test Robots.txt Rules for a URL"
      howItWorks={howItWorksSteps}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faqItems}
      relatedTools={relatedTools}
    >
      <div className="space-y-8 w-full">
        
        {/* TOP CONFIGURATION BAR */}
        <div className="card shadow-sm border-slate-200 bg-white p-6 sm:p-8">
          <div className="border-b border-slate-200 pb-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Test URL Crawlability</h2>
              <p className="text-base text-slate-600 mt-1">Evaluate crawler access permissions against live or sandbox robots.txt directives</p>
            </div>
            {resultData && (
              <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
                <span className="text-xs sm:text-base font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-300 max-w-full truncate">
                  Target Host: {resultData.websiteOrigin}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
            {/* Website URL */}
            <div className="md:col-span-5">
              <label className="label text-base font-bold text-slate-800 mb-2">
                Website URL
              </label>
              <input
                type="url"
                className="input font-mono text-base py-3.5 px-4"
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={status === 'loading'}
              />
            </div>

            {/* Path */}
            <div className="md:col-span-3">
              <label className="label text-base font-bold text-slate-800 mb-2">
                Path to Test
              </label>
              <input
                type="text"
                className="input font-mono text-base py-3.5 px-4"
                placeholder="/page-to-test"
                value={testPath}
                onChange={(e) => setTestPath(e.target.value)}
                disabled={status === 'loading'}
              />
            </div>

            {/* User Agent */}
            <div className="md:col-span-2">
              <label className="label text-base font-bold text-slate-800 mb-2">
                User Agent
              </label>
              <select
                className="select text-base py-3.5 px-3 font-semibold"
                value={selectedUserAgent}
                onChange={(e) => setSelectedUserAgent(e.target.value)}
                disabled={status === 'loading'}
              >
                {USER_AGENTS.map((ua) => (
                  <option key={ua.name} value={ua.name}>{ua.name}</option>
                ))}
                <option value="Custom">Custom User Agent</option>
              </select>
            </div>

            {/* Submit Button */}
            <div className="md:col-span-2">
              <button
                className="btn btn-primary w-full py-3.5 text-base font-extrabold shadow-sm hover:shadow-md transition-all"
                onClick={() => handleTest('live')}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Testing...
                  </span>
                ) : (
                  'Test URL'
                )}
              </button>
            </div>
          </div>

          {selectedUserAgent === 'Custom' && (
            <div className="mt-5 pt-5 border-t border-slate-200 max-w-md">
              <label className="label text-base font-bold text-slate-800 mb-2">Custom User-Agent Token (matches robots.txt header)</label>
              <input
                type="text"
                className="input text-base py-3"
                placeholder="e.g. MySpecialBot"
                value={customUserAgent}
                onChange={(e) => setCustomUserAgent(e.target.value)}
              />
            </div>
          )}

          {errorMessage && (
            <div className="mt-6 p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-base flex items-start gap-4">
              <div className="p-2 bg-rose-100 rounded-xl text-rose-600 mt-0.5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <div>
                <p className="font-extrabold text-rose-900 text-lg">Crawlability Evaluation Error</p>
                <p className="text-rose-800 mt-1 leading-relaxed text-base">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* MAIN RESULTS DISPLAY */}
        {status === 'success' && resultData && (
          <div className="space-y-8 w-full">
            
            {/* Top Stat Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Verdict Card */}
              <div className={`card p-6 border-l-4 flex flex-col justify-between ${
                resultData.result.status === 'ALLOWED' 
                  ? 'border-l-emerald-600 bg-emerald-50/40' 
                  : resultData.result.status === 'BLOCKED' 
                  ? 'border-l-rose-600 bg-rose-50/40' 
                  : 'border-l-amber-600 bg-amber-50/40'
              }`}>
                <div>
                  <span className="text-xs uppercase font-black text-slate-500 tracking-wider">Crawl Verdict</span>
                  <div className="flex items-center gap-2 mt-3">
                    {resultData.result.status === 'ALLOWED' && (
                      <span className="badge badge-success text-xl px-4 py-2 font-black tracking-wide">ALLOWED</span>
                    )}
                    {resultData.result.status === 'BLOCKED' && (
                      <span className="badge badge-error text-xl px-4 py-2 font-black tracking-wide">BLOCKED</span>
                    )}
                    {resultData.result.status === 'UNKNOWN' && (
                      <span className="badge badge-warning text-xl px-4 py-2 font-black tracking-wide">INDETERMINATE</span>
                    )}
                  </div>
                </div>
                <div className="mt-4 text-base text-slate-700 font-medium">
                  Source: <span className="font-extrabold text-slate-900">{resultData.source === 'EDITOR_ROBOTS' ? 'Live Sandbox Editor' : 'Live Website'}</span>
                </div>
              </div>

              {/* Matched Rule Card */}
              <div className="card p-6 flex flex-col justify-between">
                <div>
                  <span className="text-xs uppercase font-black text-slate-500 tracking-wider">Applied Rule</span>
                  <div className="mt-3">
                    {resultData.result.appliedRule ? (
                      <div>
                        <code className="text-base bg-slate-100 text-slate-900 px-3 py-1 rounded font-bold border border-slate-300 block truncate">
                          {resultData.result.appliedRule.originalText}
                        </code>
                        <span className="text-base font-bold text-slate-700 mt-1.5 block">Line #{resultData.result.appliedRule.lineNumber}</span>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-slate-800 italic">No blocking rules (Default Allow)</span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-slate-600 mt-4">
                  Pattern specificity: <strong className="text-slate-900 font-extrabold">{resultData.result.appliedRule ? resultData.result.appliedRule.pattern.length : 0} octets</strong>
                </div>
              </div>

              {/* Robots.txt Status Card */}
              <div className="card p-6 flex flex-col justify-between">
                <div>
                  <span className="text-xs uppercase font-black text-slate-500 tracking-wider">Robots.txt HTTP</span>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="text-3xl font-black text-slate-900">
                      {resultData.robotsTxt.statusCode ?? 'N/A'}
                    </span>
                    <span className="text-base font-extrabold text-slate-800 truncate">
                      {resultData.robotsTxt.statusText}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-slate-600 mt-4">
                  {resultData.robotsTxt.fetchDurationMs !== undefined ? `Fetch latency: ${resultData.robotsTxt.fetchDurationMs}ms` : 'Sandbox simulation'}
                </div>
              </div>

              {/* Sitemaps Declared Card */}
              <div className="card p-6 flex flex-col justify-between">
                <div>
                  <span className="text-xs uppercase font-black text-slate-500 tracking-wider">XML Sitemaps</span>
                  <div className="mt-3 text-3xl font-black text-slate-900">
                    {resultData.sitemaps.length} <span className="text-base font-bold text-slate-600">declared</span>
                  </div>
                </div>
                <div className="text-base text-blue-700 font-extrabold mt-4 cursor-pointer hover:underline flex items-center gap-1" onClick={() => setActiveTab('sitemaps')}>
                  View sitemaps &rarr;
                </div>
              </div>
            </div>

            {/* Split Grid: Left Details & Right Inspector */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
              
              {/* LEFT COLUMN: Deep Evaluation & Details */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Result Breakdown Card */}
                <div className="card shadow-sm p-6 sm:p-7">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
                    <h3 className="font-extrabold text-slate-900 text-lg">Crawlability Breakdown</h3>
                    <button
                      onClick={handleCopyResult}
                      className="btn btn-secondary text-sm px-4 py-2 font-bold"
                    >
                      {copyFeedback ? '✓ Copied' : 'Copy Summary'}
                    </button>
                  </div>

                  <div className="space-y-4 text-sm sm:text-base">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start border-b border-slate-100 pb-3 gap-1">
                      <span className="text-slate-600 font-medium">Target URL:</span>
                      <a href={resultData.targetUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-mono sm:text-right max-w-full sm:max-w-[280px] truncate text-xs sm:text-base font-bold break-all sm:break-normal" title={resultData.targetUrl}>
                        {resultData.targetUrl}
                      </a>
                    </div>

                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                      <span className="text-slate-600 font-medium">Selected Crawler:</span>
                      <div className="text-right">
                        <span className="font-extrabold text-slate-900 text-base">{resultData.userAgent.name}</span>
                        <span className="text-slate-500 block font-mono text-sm mt-0.5">token: {resultData.userAgent.token}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <span className="text-slate-600 font-medium">Matched Group:</span>
                      <span className="font-mono bg-slate-100 px-3 py-1 rounded text-slate-900 font-extrabold text-base">
                        User-agent: {resultData.result.matchedGroup}
                      </span>
                    </div>

                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <span className="text-slate-600 font-medium">Robots.txt Location:</span>
                      <a href={resultData.robotsTxt.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-mono truncate max-w-[240px] text-sm font-bold" title={resultData.robotsTxt.url}>
                        {resultData.robotsTxt.url}
                      </a>
                    </div>

                    {resultData.result.crawlDelay !== undefined && (
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <span className="text-slate-600 font-medium">Crawl-delay Directive:</span>
                        <span className="font-extrabold text-amber-900 text-base">{resultData.result.crawlDelay} seconds</span>
                      </div>
                    )}
                  </div>

                  {/* Technical Explanation Callout */}
                  <div className="mt-6 p-5 rounded-2xl bg-slate-100 border border-slate-200">
                    <span className="text-xs uppercase font-black text-slate-500 block mb-2 tracking-wider">Official Explanation (RFC 9309)</span>
                    <p className="text-base text-slate-800 leading-relaxed font-normal">{resultData.result.explanation}</p>
                  </div>

                  {/* Redirects History if any */}
                  {resultData.robotsTxt.redirectHistory && resultData.robotsTxt.redirectHistory.length > 0 && (
                    <div className="mt-5 p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-base">
                      <span className="font-bold text-blue-900 block mb-2">Redirect Hops:</span>
                      {resultData.robotsTxt.redirectHistory.map((h, i) => (
                        <div key={i} className="text-slate-800 font-mono text-sm truncate py-1">
                          <strong>{h.statusCode}</strong>: {h.from} &rarr; {h.to}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warnings if any */}
                  {resultData.warnings && resultData.warnings.length > 0 && (
                    <div className="mt-5 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-base space-y-1.5">
                      <span className="font-bold block text-base">Parser Notices:</span>
                      {resultData.warnings.map((w, idx) => (
                        <div key={idx} className="leading-snug text-sm">&bull; {w}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Technical SEO Notice */}
                <div className="p-6 rounded-2xl bg-slate-100 border border-slate-300 text-base text-slate-800 space-y-3">
                  <div className="flex items-center gap-2 font-extrabold text-slate-900 text-lg">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Technical SEO Note
                  </div>
                  <p className="leading-relaxed">
                    Robots.txt controls <strong>crawl access</strong>, not indexing. A blocked page may still appear in Google search results without a snippet if backlinks exist. To prevent indexing, allow crawling and implement a <code className="bg-white px-2 py-0.5 rounded font-bold border border-slate-300">noindex</code> robots meta tag.
                  </p>
                </div>
              </div>

              {/* RIGHT COLUMN: Interactive Workspaces */}
              <div className="lg:col-span-7">
                <div className="card shadow-sm p-0 overflow-hidden border-slate-200">
                  
                  {/* Top Navigation Tabs */}
                  <div className="flex border-b border-slate-200 bg-slate-100/80 px-3 sm:px-4 pt-2.5 sm:pt-3 gap-1.5 sm:gap-2 overflow-x-auto touch-scroll scrollbar-none">
                    <button
                      onClick={() => setActiveTab('editor')}
                      className={`px-3.5 py-2.5 sm:px-6 sm:py-3.5 text-xs sm:text-base font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 whitespace-nowrap ${
                        activeTab === 'editor'
                          ? 'bg-white border-green-600 text-green-800 shadow-xs'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      Live Sandbox Editor
                    </button>

                    <button
                      onClick={() => setActiveTab('sitemaps')}
                      className={`px-3.5 py-2.5 sm:px-6 sm:py-3.5 text-xs sm:text-base font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 whitespace-nowrap ${
                        activeTab === 'sitemaps'
                          ? 'bg-white border-green-600 text-green-800 shadow-xs'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                      XML Sitemaps ({resultData.sitemaps.length})
                    </button>

                    <button
                      onClick={() => setActiveTab('resources')}
                      className={`px-3.5 py-2.5 sm:px-6 sm:py-3.5 text-xs sm:text-base font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 whitespace-nowrap ${
                        activeTab === 'resources'
                          ? 'bg-white border-green-600 text-green-800 shadow-xs'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      Page Resources
                    </button>
                  </div>

                  {/* Tab Body */}
                  <div className="p-6 sm:p-8">
                    {/* TAB 1: LIVE EDITOR */}
                    {activeTab === 'editor' && (
                      <div className="space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                          <div>
                            <h4 className="text-xl font-extrabold text-slate-900">Simulate robots.txt Directives</h4>
                            <p className="text-base text-slate-600 mt-0.5">Edit rules below to test scenarios without touching your live server.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleResetEditor}
                              className="btn btn-secondary text-sm px-4 py-2.5 font-bold cursor-pointer"
                              title="Reset editor back to original live robots.txt"
                            >
                              {resetFeedback ? '✓ Reset Done' : 'Reset to Live'}
                            </button>
                            <button
                              onClick={() => handleTest('editor', editorContent)}
                              disabled={editorEvaluating}
                              className="btn btn-primary text-sm px-5 py-2.5 font-extrabold shadow-sm cursor-pointer"
                            >
                              {editorEvaluating ? 'Testing...' : 'Test Edited Rules'}
                            </button>
                          </div>
                        </div>

                        <div className="relative rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
                          <textarea
                            rows={18}
                            value={editorContent}
                            onChange={(e) => setEditorContent(e.target.value)}
                            className="w-full font-mono text-base p-6 bg-slate-950 text-emerald-400 selection:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                            placeholder="# Enter robots.txt directives here..."
                            spellCheck={false}
                          />
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-600 font-semibold">
                          <span>Total Lines: {editorContent ? editorContent.split('\n').length : 0}</span>
                          <span>In-memory sandbox simulation</span>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: XML SITEMAPS */}
                    {activeTab === 'sitemaps' && (
                      <div className="space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                          <div>
                            <h4 className="text-xl font-extrabold text-slate-900">Extracted XML Sitemaps</h4>
                            <p className="text-base text-slate-600 mt-0.5">Sitemap declarations found inside the robots.txt file.</p>
                          </div>
                          {resultData.sitemaps.length > 0 && (
                            <button
                              onClick={handleCheckSitemaps}
                              disabled={sitemapChecking}
                              className="btn btn-secondary text-sm px-5 py-2.5 font-bold"
                            >
                              {sitemapChecking ? 'Checking HTTP...' : 'Check Status'}
                            </button>
                          )}
                        </div>

                        {resultData.sitemaps.length === 0 ? (
                          <div className="p-10 text-center bg-slate-50 rounded-2xl border border-slate-200">
                            <p className="text-base text-slate-600 font-medium">No Sitemap directives declared in this robots.txt file.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="w-full text-left text-base border-collapse">
                              <thead>
                                <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-extrabold">
                                  <th className="py-3.5 px-4">Sitemap URL</th>
                                  <th className="py-3.5 px-4 w-24 text-center">Line</th>
                                  <th className="py-3.5 px-4 w-40">HTTP Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 font-mono">
                                {resultData.sitemaps.map((sm, idx) => {
                                  const checkResult = sitemapResults?.find(r => r.url === sm.url);
                                  return (
                                    <tr key={idx} className="hover:bg-slate-50/80">
                                      <td className="py-3.5 px-4">
                                        <a href={sm.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all text-base font-bold">
                                          {sm.url}
                                        </a>
                                      </td>
                                      <td className="py-3.5 px-4 text-slate-700 text-center font-sans font-bold">{sm.lineNumber}</td>
                                      <td className="py-3.5 px-4 font-sans">
                                        {checkResult ? (
                                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black ${
                                            checkResult.accessible ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                          }`}>
                                            {checkResult.statusCode ? `${checkResult.statusCode} ${checkResult.statusText}` : checkResult.statusText}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 text-sm italic">Unchecked</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 3: PAGE RESOURCES */}
                    {activeTab === 'resources' && (
                      <div className="space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                          <div>
                            <h4 className="text-xl font-extrabold text-slate-900">Embedded Page Resources</h4>
                            <p className="text-base text-slate-600 mt-0.5">Verify if CSS, JavaScript, or images on this page are blocked by robots.txt.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {resourceResults && resourceResults.resources.length > 0 && (
                              <button
                                onClick={exportResourcesCSV}
                                className="btn btn-secondary text-sm px-4 py-2.5 font-bold"
                              >
                                Export CSV
                              </button>
                            )}
                            <button
                              onClick={handleCheckResources}
                              disabled={resourceChecking}
                              className="btn btn-primary text-sm px-5 py-2.5 font-extrabold shadow-sm"
                            >
                              {resourceChecking ? 'Analyzing Resources...' : 'Check Resources'}
                            </button>
                          </div>
                        </div>

                        {resourceResults ? (
                          <div className="space-y-5">
                            {/* Summary cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                                <span className="text-slate-600 block text-xs font-black uppercase tracking-wider">Total</span>
                                <span className="font-black text-2xl text-slate-900">{resourceResults.totalResources}</span>
                              </div>
                              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                                <span className="text-emerald-700 block text-xs font-black uppercase tracking-wider">Allowed</span>
                                <span className="font-black text-2xl text-emerald-800">{resourceResults.allowedCount}</span>
                              </div>
                              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200">
                                <span className="text-rose-700 block text-xs font-black uppercase tracking-wider">Blocked</span>
                                <span className="font-black text-2xl text-rose-800">{resourceResults.blockedCount}</span>
                              </div>
                              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                                <span className="text-slate-600 block text-xs font-black uppercase tracking-wider">Unknown</span>
                                <span className="font-black text-2xl text-slate-800">{resourceResults.unknownCount}</span>
                              </div>
                            </div>

                            {/* Filter buttons */}
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-base font-bold text-slate-700">Filter:</span>
                              {(['all', 'blocked', 'allowed'] as const).map(f => (
                                <button
                                  key={f}
                                  onClick={() => setResourceFilter(f)}
                                  className={`text-sm px-3.5 py-1.5 rounded-xl capitalize font-extrabold transition-colors cursor-pointer ${
                                    resourceFilter === f
                                      ? 'bg-slate-900 text-white shadow-xs'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                >
                                  {f}
                                </button>
                              ))}
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 rounded-2xl">
                              <table className="w-full text-left text-base border-collapse">
                                <thead className="sticky top-0 bg-slate-100 border-b border-slate-300 shadow-xs font-black text-slate-800">
                                  <tr>
                                    <th className="py-3 px-4">Resource URL</th>
                                    <th className="py-3 px-4 w-28">Type</th>
                                    <th className="py-3 px-4 w-52">Crawl Result</th>
                                    <th className="py-3 px-4 w-44">Host</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 font-mono">
                                  {resourceResults.resources
                                    .filter(r => {
                                      if (resourceFilter === 'blocked') return r.crawlability === 'BLOCKED';
                                      if (resourceFilter === 'allowed') return r.crawlability === 'ALLOWED';
                                      return true;
                                    })
                                    .map((resItem, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50/80">
                                        <td className="py-3 px-4 max-w-[320px] truncate" title={resItem.url}>
                                          <a href={resItem.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-bold text-sm">
                                            {resItem.url}
                                          </a>
                                        </td>
                                        <td className="py-3 px-4 font-sans text-xs font-bold text-slate-700">
                                          <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                                            {resItem.type}
                                          </span>
                                        </td>
                                        <td className="py-3 px-4 font-sans">
                                          <div className="flex flex-col gap-0.5">
                                            {resItem.crawlability === 'ALLOWED' && (
                                              <span className="badge badge-success text-xs px-2.5 py-0.5 font-bold w-fit">Allowed</span>
                                            )}
                                            {resItem.crawlability === 'BLOCKED' && (
                                              <span className="badge badge-error text-xs px-2.5 py-0.5 font-bold w-fit">Blocked</span>
                                            )}
                                            {resItem.crawlability === 'UNKNOWN' && (
                                              <span className="badge badge-warning text-xs px-2.5 py-0.5 font-bold w-fit">Unknown</span>
                                            )}
                                            {resItem.appliedRule && (
                                              <span className="text-[11px] font-mono text-slate-500 truncate mt-0.5" title={resItem.appliedRule.originalText}>
                                                by {resItem.appliedRule.originalText} (L{resItem.appliedRule.lineNumber})
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-3 px-4 text-slate-700 truncate max-w-[180px] text-xs font-sans font-medium" title={resItem.host}>
                                          {resItem.host}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="p-10 text-center bg-slate-50 rounded-2xl border border-slate-200">
                            <p className="text-base text-slate-700 leading-relaxed font-semibold">Click &ldquo;Check Resources&rdquo; to fetch the HTML and test all referenced CSS, JS, and image assets against their respective robots.txt files.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </ToolLayout>
  );
}
