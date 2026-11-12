'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import { HTACCESS_EXAMPLES } from '@/lib/seo/htaccessExamples';
import { HtaccessTestResult, HtaccessServerVariables } from '@/lib/seo/htaccessTypes';

export default function HtaccessTester() {
  const [urlInput, setUrlInput] = useState('https://example.com/old-page');
  const [htaccessInput, setHtaccessInput] = useState(`RewriteEngine On
RewriteRule ^old-page$ /new-page [R=301,L]`);
  
  const [directoryContext, setDirectoryContext] = useState('');
  
  // Advanced Server Variables State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverVars, setServerVars] = useState<HtaccessServerVariables>({
    HTTP_HOST: '',
    HTTPS: '',
    HTTP_USER_AGENT: '',
    HTTP_REFERER: '',
    QUERY_STRING: ''
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultData, setResultData] = useState<HtaccessTestResult | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedTrace, setCopiedTrace] = useState(false);

  // In-flight request sequencing reference to prevent stale responses from overwriting current state
  const activeRequestIdRef = React.useRef(0);

  const handleApplyExample = (exampleId: string) => {
    const ex = HTACCESS_EXAMPLES.find(e => e.id === exampleId);
    if (ex) {
      setHtaccessInput(ex.rules);
      setUrlInput(ex.sampleUrl);
      setDirectoryContext('');
      setErrorMessage(null);
      setResultData(null);
      setStatus('idle');
    }
  };

  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    if (resultData || status !== 'idle') {
      setResultData(null);
      setStatus('idle');
      setErrorMessage(null);
    }
  };

  const handleHtaccessChange = (val: string) => {
    setHtaccessInput(val);
    if (resultData || status !== 'idle') {
      setResultData(null);
      setStatus('idle');
      setErrorMessage(null);
    }
  };

  const handleDirectoryContextChange = (val: string) => {
    setDirectoryContext(val);
    if (resultData || status !== 'idle') {
      setResultData(null);
      setStatus('idle');
      setErrorMessage(null);
    }
  };

  const handleServerVarChange = (key: keyof HtaccessServerVariables, val: string) => {
    setServerVars(prev => ({ ...prev, [key]: val }));
    if (resultData || status !== 'idle') {
      setResultData(null);
      setStatus('idle');
      setErrorMessage(null);
    }
  };

  const handleTest = async () => {
    if (!urlInput.trim()) {
      setErrorMessage('Please enter a target URL to test.');
      setStatus('error');
      return;
    }
    if (!htaccessInput.trim()) {
      setErrorMessage('Please enter .htaccess rules into the editor.');
      setStatus('error');
      return;
    }

    const currentRequestId = ++activeRequestIdRef.current;
    setStatus('loading');
    setErrorMessage(null);

    // Clean empty server variables
    const cleanVars: Record<string, string> = {};
    for (const [k, v] of Object.entries(serverVars)) {
      if (v && v.trim()) {
        cleanVars[k] = v.trim();
      }
    }

    try {
      const res = await fetch('/api/seo/htaccess/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlInput.trim(),
          htaccess: htaccessInput.trim(),
          serverVariables: cleanVars,
          settings: {
            directoryContext: directoryContext.trim() || undefined
          }
        })
      });

      const data = await res.json();

      // Guard against race conditions: ignore response if a newer request was dispatched
      if (currentRequestId !== activeRequestIdRef.current) {
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to simulate .htaccess rules');
      }

      setResultData(data);
      setStatus('success');
    } catch (err: any) {
      if (currentRequestId === activeRequestIdRef.current) {
        setErrorMessage(err.message || 'An unexpected error occurred.');
        setStatus('error');
      }
    }
  };

  const handleReset = () => {
    setUrlInput('https://example.com/old-page');
    setHtaccessInput(`RewriteEngine On
RewriteRule ^old-page$ /new-page [R=301,L]`);
    setDirectoryContext('');
    setServerVars({
      HTTP_HOST: '',
      HTTPS: '',
      HTTP_USER_AGENT: '',
      HTTP_REFERER: '',
      QUERY_STRING: ''
    });
    setResultData(null);
    setStatus('idle');
    setErrorMessage(null);
  };

  const copyToClipboard = (text: string, type: 'url' | 'trace') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedTrace(true);
      setTimeout(() => setCopiedTrace(false), 2000);
    }
  };

  const exportAsJson = () => {
    if (!resultData) return;
    const blob = new Blob([JSON.stringify(resultData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `htaccess-test-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCsv = () => {
    if (!resultData) return;
    const headers = ['Line', 'Directive', 'Original Text', 'Valid', 'Reached', 'Matched', 'Message'];
    const rows = resultData.trace.map(t => [
      t.lineNumber,
      `"${(t.directive || '').replace(/"/g, '""')}"`,
      `"${(t.originalText || '').replace(/"/g, '""')}"`,
      t.isValid ? 'Yes' : 'No',
      t.wasReached ? 'Yes' : 'No',
      t.isMet ? 'Yes' : 'No',
      `"${(t.message || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `htaccess-trace-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const aboutText = (
    <div className="space-y-4">
      <p>
        The <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">.htaccess</code> file is an Apache HTTP Server per-directory configuration file that provides decentralised management of web server directives. Our free online <strong>.htaccess tester</strong> and <strong>rewrite rule checker</strong> simulates how Apache processes <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">mod_rewrite</code> and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">mod_alias</code> directives on any URL, predicting URL transformations, HTTP redirect status codes, and pattern substitutions before you commit changes to your live server.
      </p>
      <p>
        Misconfigured Apache rewrite rules can cause severe technical SEO issues, including infinite redirect loops (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">ERR_TOO_MANY_REDIRECTS</code>), unexpected 500 Internal Server Errors, broken canonicalization, and dropped search engine rankings. By running tests in an isolated simulation sandbox with line-by-line diagnostic tracing, technical SEOs, webmasters, and developers can safely debug complex regular expressions, verify capture groups (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">$1-$9</code> and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">%1-%9</code>), test <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">RewriteCond</code> server variables, and validate 301 migration paths before production deployment.
      </p>
    </div>
  );

  const howItWorksSteps = [
    (
      <span key="step-1">
        <strong>Enter Original URL to Test:</strong> Input the target URL you wish to test (for example, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">https://example.com/old-page</code> or non-SSL/non-www variants) into the Original URL to Test field.
      </span>
    ),
    (
      <span key="step-2">
        <strong>Paste Rules or Select Quick Load Template:</strong> Paste your Apache directives into the .htaccess Rules editor, or choose from 8 pre-configured SEO templates covering HTTP to HTTPS redirection, www canonicalization, single-page 301 migrations, directory restructuring, trailing slashes, or clean query strings.
      </span>
    ),
    (
      <span key="step-3">
        <strong>Configure Advanced Server Variables (Optional):</strong> Open the Advanced Server Variables &amp; Environment panel to simulate specific server conditions, including <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">HTTP_HOST</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">HTTPS</code> (on/off), <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">HTTP_USER_AGENT</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">HTTP_REFERER</code>, or a subfolder Directory Context (e.g. <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">/shop/</code>).
      </span>
    ),
    (
      <span key="step-4">
        <strong>Click Test Rules:</strong> Click the Test Rules button to run the simulation engine. The tester executes rules sequentially and displays the final transformation outcome, transformation type (External Redirect vs Internal Rewrite), and HTTP status code.
      </span>
    ),
    (
      <span key="step-5">
        <strong>Review Diagnostic Trace &amp; Export:</strong> Inspect the Line-by-Line Execution Trace table to see which directives were reached, which conditions were met, and which patterns matched. Copy the transformed URL or debug log, or export the diagnostic results as JSON or CSV.
      </span>
    )
  ];

  const extraSections = (
    <>
      {/* WHAT DOES OUR .HTACCESS TESTER SUPPORT */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our .htaccess Tester Support?</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            The Indian Marketers .htaccess simulation engine evaluates the core directives required for technical SEO migrations, URL normalization, and canonical routing:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                RewriteRule and RewriteCond Directives
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Simulates mod_rewrite pattern matching with PCRE regular expressions, substitution targets, condition evaluation via <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">RewriteCond</code>, and backreference captures (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">$1-$9</code> for rule matches and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">%1-%9</code> for condition matches). Supports common rewrite flags including <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[R]</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[L]</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[NC]</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[QSA]</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[NE]</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[F]</code>, and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[G]</code>.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                301 and 302 Redirect Testing
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Evaluates external redirection status codes. Differentiates permanent redirects (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">301 Moved Permanently</code>), temporary redirects (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">302 Found</code>), forbidden responses (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">403 Forbidden</code>), and gone responses (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">410 Gone</code>), verifying target destination URLs before live crawler execution.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                RewriteBase and URL Rewriting
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Handles per-directory path prefixing and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">RewriteBase</code> directives. Tests internal silent rewrites—where Apache serves content from an alternate internal file path or query string without altering the visible URL in the user's browser bar.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                Debugging Rules and Redirect Loops
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Step-by-step diagnostic breakdown reveals whether each directive was reached, whether conditions were met, and why specific rules did or did not match. Built-in recursion checks detect circular redirection patterns, allowing you to catch infinite redirect loops before they affect live users or crawlers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* REDIRECTS VS INTERNAL REWRITES IN APACHE */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Redirects vs Internal Rewrites in Apache</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            A common misunderstanding in Apache configuration is conflating external HTTP redirects with internal URL rewrites. Both are powered by <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">mod_rewrite</code>, but they behave fundamentally differently across search engines and browsers:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                External HTTP Redirects ([R=301] / mod_alias)
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed mb-2">
                An external redirect instructs the client (browser or search crawler) to issue a new HTTP request to a different location. The URL in the browser address bar changes, and an HTTP status code (such as 301 Moved Permanently or 302 Found) is explicitly returned over the network.
              </p>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                <strong>SEO Impact:</strong> Permanent 301 redirects signal to Googlebot that ranking signals, PageRank, and canonical equity should transfer from the old URL to the new destination.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                Internal URL Rewrites (Silent Server Routing)
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed mb-2">
                An internal rewrite happens entirely inside the Apache server without sending a redirect response to the browser. Apache silently passes the request to an alternate file path or query-string handler (such as routing <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">/product/shoes</code> to <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">/product.php?cat=shoes</code>).
              </p>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                <strong>SEO Impact:</strong> The browser address bar remains on the clean URL, search engines index the public URL, and the server serves the underlying content transparently.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COMMON .HTACCESS CONFIGURATION AND REDIRECT ISSUES */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Common .htaccess Configuration and Redirect Issues</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            When diagnosing organic search performance issues or site migration bugs, keep these frequent .htaccess pitfalls in mind:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                1. Infinite Redirect Loops (ERR_TOO_MANY_REDIRECTS)
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Occurs when a target destination URL repeatedly satisfies the matching pattern of the original rewrite rule without an exit condition. For example, an SSL redirect without <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">RewriteCond %{`{`}HTTPS{`}`} off</code> causes infinite HTTPS-to-HTTPS redirect cycles.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                2. Incorrect Rule Ordering and Missing [L] Flags
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Apache evaluates rules sequentially from top to bottom. Omitting the <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[L]</code> (Last) or <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[END]</code> flag allows subsequent rules to process already-modified URL paths, leading to corrupted destinations or unintended substitutions.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                3. Query String Handling &amp; Unintended Parameter Stripping
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                By default, mod_rewrite preserves query strings across rewrites unless modified. To append new parameters without discarding existing ones, include the <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">[QSA]</code> flag. To completely strip obsolete query parameters, append a trailing question mark (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">?</code>) to the substitution path.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                4. Multi-Hop Redirect Chains (HTTP/HTTPS and www/Non-www)
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Chaining separate redirection rules—e.g. redirecting HTTP to HTTPS first, and then non-www to www in a second hop—wastes crawler crawl budget and slows page load times. Always combine canonicalization rules to resolve to the final canonical URL in a single 301 hop. Use our <Link href="/tools/fetch-render" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Fetch &amp; Render</Link> tool to inspect live HTTP response headers.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)] md:col-span-2">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                5. Trailing Slash Conflicts with mod_dir DirectorySlash
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Apache's core <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">mod_dir</code> automatically redirects requests for physical directories lacking a trailing slash to append one. If your rewrite rules attempt to strip trailing slashes from real directories, an endless loop between mod_rewrite and mod_dir occurs. Ensure your URL routing and XML sitemaps align using our <Link href="/tools/sitemap-generator" className="text-[var(--im-primary-deep)] font-semibold hover:underline">XML Sitemap Generator</Link> and verify crawler permissions with our <Link href="/tools/robots-txt-tester" className="text-[var(--im-primary-deep)] font-semibold hover:underline">robots.txt Tester</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* .HTACCESS TESTING VS LIVE APACHE SERVER BEHAVIOUR */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">.htaccess Testing vs Live Apache Server Behaviour</h2>
        </div>
        <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
          <p>
            While our online .htaccess tester delivers precise simulation of Apache mod_rewrite logic, live production execution depends on several server-level configuration factors:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                AllowOverride Directives in httpd.conf
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                In Apache HTTP Server, per-directory <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">.htaccess</code> files are only evaluated if the main server or VirtualHost configuration includes <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">AllowOverride FileInfo</code> or <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">AllowOverride All</code>. If set to <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">None</code>, Apache completely ignores .htaccess files without error.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                Module Availability (mod_rewrite &amp; mod_alias)
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                The rewrite engine requires <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">mod_rewrite</code> to be compiled and loaded in Apache. Using rewrite directives on a server where mod_rewrite is disabled triggers a fatal <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">500 Internal Server Error</code> unless enclosed within an <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">&lt;IfModule mod_rewrite.c&gt;</code> block.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                Per-Directory URL Prefix Stripping
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                In <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">.htaccess</code> context, Apache strips the leading directory path from the request URL before evaluating the RewriteRule regular expression (e.g. matching against <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">^old-page$</code> rather than <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">^/old-page$</code>). In VirtualHost context, the leading slash is preserved.
              </p>
            </div>

            <div className="p-4 sm:p-5 bg-[var(--im-bg-soft)] rounded-xl border border-[var(--im-border)]">
              <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">
                PCRE Regex Engine and Caching
              </h3>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] leading-relaxed">
                Apache uses PCRE (Perl Compatible Regular Expressions). While the simulation accurately matches PCRE syntax, live server testing is essential to confirm that local browser caches (which aggressively store 301 redirects) and server-side reverse proxies (like Cloudflare or Varnish) do not mask recent rule adjustments.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );

  const faqItems = [
    {
      question: "Does this modify my website's actual .htaccess file?",
      answer: "No. All evaluation is done in an isolated simulation environment. Your live server files remain completely untouched."
    },
    {
      question: "How does the tool evaluate rules?",
      answer: "The tester runs Apache rewrite simulation via the industry-standard madewithlove engine with deterministic local fallback handling, providing line-level diagnostics."
    },
    {
      question: "Is this an actual live HTTP redirect?",
      answer: "No. This tool provides simulated redirect and rewrite outcomes based on Apache configuration rules. To test live HTTP redirects from an existing server, use our HTTP Status / AI Bot Access tools."
    },
    {
      question: "What is a .htaccess tester?",
      answer: "A .htaccess tester is a diagnostic technical SEO and web development tool that simulates how Apache HTTP Server parses and executes per-directory rewrite and redirect directives on a specific URL. It allows webmasters to verify URL transformations, capture group substitutions, and HTTP status codes before committing changes to production."
    },
    {
      question: "How do I test .htaccess rewrite rules online?",
      answer: "Enter your test URL, paste your .htaccess configuration (or select one of the pre-configured SEO templates), optionally adjust advanced server variables such as HTTPS or HTTP_HOST, and click 'Test Rules'. The tester outputs the final simulated URL, transformation type (external redirect vs internal rewrite), HTTP status code, and a line-by-line debug trace."
    },
    {
      question: "Can I test 301 redirects before making them live?",
      answer: "Yes. The tool simulates external 301 (Moved Permanently) and 302 (Found) redirects triggered by mod_rewrite rules with the [R=301] flag or mod_alias directives like Redirect and RedirectMatch. You can verify both the final destination URL and the exact status code returned."
    },
    {
      question: "What is the difference between RewriteRule and Redirect directives?",
      answer: "Redirect and RedirectMatch belong to Apache's mod_alias module and handle straightforward path-based or regex URL redirections, always issuing an external HTTP status code. RewriteRule belongs to mod_rewrite and supports advanced regular expressions, conditional matching via RewriteCond, query string manipulation, and internal silent URL rewriting without changing the browser address bar."
    },
    {
      question: "Can I test RewriteCond server variable conditions?",
      answer: "Yes. The simulator evaluates RewriteCond directives against Apache server variables including %{HTTPS}, %{HTTP_HOST}, %{REQUEST_URI}, %{QUERY_STRING}, %{HTTP_USER_AGENT}, and %{HTTP_REFERER}. You can customize these variables in the Advanced Server Variables panel to test device-specific or protocol-specific rules."
    },
    {
      question: "How do I identify redirect loops in .htaccess?",
      answer: "Redirect loops occur when a target URL repeatedly matches a rewrite rule that redirects back to itself or another rule in an endless loop. The tool tracks execution iterations and flags potential recursion or circular redirect chains in the debug trace, helping you insert appropriate exit conditions before deploying to production."
    },
    {
      question: "Why might a rule work in the tester but fail on a live Apache server?",
      answer: "Simulations evaluate rule logic under standard Apache configurations. On a live server, a rule might fail if mod_rewrite is disabled, if AllowOverride FileInfo is set to None (causing Apache to ignore .htaccess directives), if conflicting server-level VirtualHost rules override it, or if file-system permission checks (like -f or -d) behave differently on disk."
    },
    {
      question: "Can I use this tool to check .htaccess syntax?",
      answer: "The tester validates syntax for supported mod_rewrite and mod_alias directives (including RewriteRule, RewriteCond, RewriteBase, Redirect, and RedirectMatch) and reports unrecognized or invalid directives in the line-by-line debug log. It is not an exhaustive validator for every Apache core or third-party module directive."
    },
    {
      question: "Does the tool support 302 temporary redirects?",
      answer: "Yes. When using [R=302] or the default [R] flag in RewriteRule, or using 'Redirect 302' in mod_alias, the simulator correctly reports the transformation as an external 302 temporary redirect."
    }
  ];

  const relatedTools = [
    {
      name: 'Fetch & Render',
      href: '/tools/fetch-render',
      desc: 'Verify that your Apache 301 redirects and rewritten URLs return clean HTTP status codes and render properly.'
    },
    {
      name: 'robots.txt Tester',
      href: '/tools/robots-txt-tester',
      desc: 'Ensure crawler access directives match your server redirect configurations and allow search engine access.'
    },
    {
      name: 'XML Sitemap Generator',
      href: '/tools/sitemap-generator',
      desc: 'Generate an updated XML sitemap reflecting your canonical and rewritten URL structure for search crawlers.'
    }
  ];

  return (
    <ToolLayout
      title="Free .htaccess Tester & Rewrite Rule Checker"
      description="Use Indian Marketers' free .htaccess Tester to simulate Apache rewrite and redirect rules before deployment. Test RewriteRule, RewriteCond, 301 redirects and URL transformations, then review debugging results to identify potential configuration issues."
      category="Crawling & Access"
      breadcrumbs={[{ label: '.htaccess Tester' }]}
      aboutTitle="What Is a .htaccess Tester?"
      aboutText={aboutText}
      howItWorksTitle="How to Test .htaccess Rewrite and Redirect Rules"
      howItWorks={howItWorksSteps}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faqItems}
      relatedTools={relatedTools}
    >
      <div className="space-y-6">

        {/* INPUT CARD */}
        <div className="card p-6 md:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-xl font-bold text-slate-900">Apache .htaccess Rule Simulation</h2>
            <p className="text-sm text-slate-600 mt-1">
              Verify redirect status codes, internal rewrites, and capture groups before going live.
            </p>
          </div>

          {/* TEMPLATE PICKER */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Quick Load Template
            </label>
            <div className="flex flex-wrap gap-2">
              {HTACCESS_EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => handleApplyExample(ex.id)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer"
                >
                  {ex.title}
                </button>
              ))}
            </div>
          </div>

          {/* URL TO TEST */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              Original URL to Test
            </label>
            <input
              type="text"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              placeholder="https://example.com/old-page"
              value={urlInput}
              onChange={(e) => handleUrlChange(e.target.value)}
            />
          </div>

          {/* HTACCESS RULES EDITOR */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-semibold text-slate-900">
                .htaccess Rules
              </label>
              <span className="text-xs text-slate-500">
                Supports RewriteRule, RewriteCond, RewriteBase, Redirect, RedirectMatch
              </span>
            </div>
            <textarea
              rows={8}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-900 text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-700 transition-all leading-relaxed"
              placeholder={`RewriteEngine On\nRewriteRule ^old-page$ /new-page [R=301,L]`}
              value={htaccessInput}
              onChange={(e) => handleHtaccessChange(e.target.value)}
              spellCheck={false}
            />
          </div>

          {/* EXPANDABLE ADVANCED SETTINGS */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 transition-all cursor-pointer select-none"
            >
              <span>Advanced Server Variables & Environment ({showAdvanced ? 'Hide' : 'Show'})</span>
              <span className="text-slate-400 font-mono">{showAdvanced ? '▲' : '▼'}</span>
            </button>

            {showAdvanced && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HTTP_HOST</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-lg font-mono text-slate-800"
                    placeholder="example.com (Auto-derived from URL)"
                    value={serverVars.HTTP_HOST}
                    onChange={(e) => handleServerVarChange('HTTP_HOST', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HTTPS</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg font-mono text-slate-800"
                    value={serverVars.HTTPS}
                    onChange={(e) => handleServerVarChange('HTTPS', e.target.value)}
                  >
                    <option value="">Auto-derived (on/off)</option>
                    <option value="on">on</option>
                    <option value="off">off</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HTTP_USER_AGENT</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-lg font-mono text-slate-800"
                    placeholder="Googlebot / Mozilla / Custom"
                    value={serverVars.HTTP_USER_AGENT}
                    onChange={(e) => handleServerVarChange('HTTP_USER_AGENT', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HTTP_REFERER</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-lg font-mono text-slate-800"
                    placeholder="https://google.com/"
                    value={serverVars.HTTP_REFERER}
                    onChange={(e) => handleServerVarChange('HTTP_REFERER', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Directory Context (e.g. /shop/)</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-lg font-mono text-slate-800"
                    placeholder="/ or /subdirectory/"
                    value={directoryContext}
                    onChange={(e) => handleDirectoryContextChange(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="flex-1 py-3 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-all shadow-sm cursor-pointer disabled:opacity-50"
              onClick={handleTest}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Evaluating Rules...' : 'Test Rules'}
            </button>
            <button
              type="button"
              className="py-3 px-6 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-sm transition-all cursor-pointer"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>

          {/* ERROR DISPLAY */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
              {errorMessage}
            </div>
          )}
        </div>

        {/* RESULTS SECTION */}
        {status === 'success' && resultData && (
          <div className="space-y-6">

            {/* MAIN TRANSFORMATION SUMMARY CARD */}
            <div className="card p-6 md:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                    Simulation Outcome
                  </span>
                  <div className="flex items-center gap-2.5 mt-1">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide ${
                        resultData.transformationType === 'EXTERNAL_REDIRECT'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : resultData.transformationType === 'INTERNAL_REWRITE'
                          ? 'bg-blue-100 text-blue-900 border border-blue-300'
                          : resultData.transformationType === 'FORBIDDEN' || resultData.transformationType === 'GONE'
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      }`}
                    >
                      {resultData.transformationType.replace('_', ' ')}
                      {resultData.statusCode ? ` (${resultData.statusCode})` : ''}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">
                      {resultData.statusText || (resultData.changed ? 'URL Modified' : 'No Modification')}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(resultData.outputUrl, 'url')}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-all"
                  >
                    {copiedUrl ? 'Copied URL!' : 'Copy Output URL'}
                  </button>
                  <button
                    onClick={exportAsJson}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-all"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={exportAsCsv}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-all"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {/* TRANSFORMATION URL COMPARISON */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Original URL</span>
                  <div className="font-mono text-sm text-slate-900 break-all select-all font-semibold">
                    {resultData.inputUrl}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Output URL</span>
                  <div className="font-mono text-sm text-emerald-800 break-all select-all font-semibold">
                    {resultData.outputUrl}
                  </div>
                </div>
              </div>

              {/* PRIVACY, ENGINE & TRANSPARENCY NOTICE */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="text-slate-400">ℹ️</span>
                    <span>{resultData.privacyNotice}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider ${
                    resultData.engineUsed === 'PRIMARY_API'
                      ? 'bg-purple-100 text-purple-900 border border-purple-200'
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                  }`}>
                    Engine: {resultData.engineUsed}
                  </span>
                </div>

                {resultData.warnings && resultData.warnings.length > 0 && (
                  <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-200 text-amber-900 text-xs space-y-1">
                    {resultData.warnings.map((w, wIdx) => (
                      <div key={wIdx} className="flex items-start gap-1.5">
                        <span className="text-amber-600 font-bold">⚠️</span>
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RULE-BY-RULE DEBUG TRACE TABLE */}
            <div className="card p-6 md:p-8 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Line-by-Line Execution Trace</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Step-by-step diagnostic breakdown of each directive, pattern match, and flag.
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(
                    resultData.trace.map(t => `Line ${t.lineNumber} [${t.directive}]: ${t.message}`).join('\n'),
                    'trace'
                  )}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer transition-all"
                >
                  {copiedTrace ? 'Copied Trace!' : 'Copy Debug Log'}
                </button>
              </div>

              <div className="overflow-x-auto touch-scroll">
                <table className="w-full text-left text-xs border-collapse min-w-[520px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-16">Line</th>
                      <th className="py-2.5 px-3">Rule Directive</th>
                      <th className="py-2.5 px-3 w-20 text-center">Valid</th>
                      <th className="py-2.5 px-3 w-20 text-center">Reached</th>
                      <th className="py-2.5 px-3 w-20 text-center">Matched</th>
                      <th className="py-2.5 px-4">Diagnostic Explanation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {resultData.trace.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-slate-500 font-bold">{item.lineNumber}</td>
                        <td className="py-3 px-3">
                          <code className="bg-slate-100 text-slate-900 px-2 py-1 rounded text-xs">
                            {item.originalText}
                          </code>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {item.isValid ? (
                            <span className="text-emerald-700 font-bold">✓</span>
                          ) : (
                            <span className="text-rose-600 font-bold">✗</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {item.wasReached ? (
                            <span className="text-emerald-700 font-bold">Yes</span>
                          ) : (
                            <span className="text-slate-400">No</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {item.isMet ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Met</span>
                          ) : (
                            <span className="text-slate-400">No</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-700 text-xs leading-relaxed whitespace-pre-line">
                          {item.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </ToolLayout>
  );
}
