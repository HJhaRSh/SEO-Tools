'use client';

import React, { useState } from 'react';
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

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to evaluate robots.txt');
      }

      setResultData(data);
      if (currentMode === 'live') {
        const fetchedContent = data.robotsTxt.content || '';
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
      const data = await res.json();
      if (data.success) {
        setSitemapResults(data.sitemaps);
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
      const data = await res.json();
      if (data.success) {
        setResourceResults(data);
      } else {
        alert(data.error || 'Failed checking resources');
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

  return (
    <ToolLayout
      title="robots.txt Tester"
      description="Inspect, test, and debug robots.txt directives in real-time according to official RFC 9309 and Googlebot standards."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'robots.txt Tester' }]}
      fullWidth={true}
      aboutText="The Indian Marketers robots.txt Tester is a full-featured crawlability analyzer and directive debugging engine built strictly to the RFC 9309 specification and Google's official crawler documentation. Beyond basic syntax inspection, this tool replicates real search engine parser behaviors—including longest-octet specificity resolution, Allow vs. Disallow tie-breaking precedence, repeated User-agent group consolidation, and exact line-by-line attribution. It also features a Live Sandbox Editor for risk-free simulation, automated XML Sitemap extraction and status checking, and a deep Page Resource Crawler to identify whether critical stylesheets, scripts, or images are blocked from crawler access."
      howItWorks={[
        "Enter your Website Origin and the exact URL Path or query string you want to test.",
        "Choose your target crawler from the User Agent dropdown (e.g. Googlebot, Bingbot, GPTBot, ClaudeBot, Applebot, or define a Custom crawler token).",
        "The backend server safely resolves DNS, prevents SSRF, and fetches the live robots.txt file adhering to 500 KiB limits and HTTP status code specifications (handling 2xx, 3xx redirects, 404/410, 429 rate limits, and 5xx temporary crawl restrictions).",
        "The RFC 9309 matching engine isolates the most specific User-agent group, calculates pattern octet lengths, and pinpoints the exact winning rule and line number.",
        "Inspect the visual crawl verdict, edit directives in the Live Sandbox Editor to test proposed fixes in real time, check XML sitemaps, or analyze embedded page resources."
      ]}
      faq={[
        { 
          question: "What is the difference between Crawlability and Indexability?", 
          answer: "Robots.txt exclusively controls crawling (whether a bot is permitted to request and download the page). It does NOT prevent indexing. If a blocked URL receives external backlinks, Google can still index the URL and display it in search results without content snippets. To ensure a page is omitted from indexation, the page must be crawlable and include a 'noindex' robots meta tag or X-Robots-Tag header." 
        },
        { 
          question: "How does rule precedence and tie-breaking work under RFC 9309?", 
          answer: "Directives are evaluated by pattern specificity (the number of octets in the matching rule). The longest matching rule takes precedence. When an Allow and Disallow rule match the identical path length, Allow takes precedence over Disallow." 
        },
        { 
          question: "Why does Googlebot Smartphone use the 'Googlebot' user-agent group?", 
          answer: "Google's official crawler documentation specifies that Googlebot Smartphone reads rules from the 'User-agent: Googlebot' group. It does not look for a separate smartphone token unless none is present." 
        },
        { 
          question: "Why should I test embedded page resources (CSS, JS, images)?", 
          answer: "Modern search engines render pages like a browser. If your robots.txt file blocks Googlebot from accessing essential CSS or JavaScript files, Google cannot render the layout correctly, which can severely impair mobile-friendliness assessment, rankings, and structured data detection." 
        }
      ]}
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
              <div className="flex items-center gap-2">
                <span className="text-base font-bold px-4 py-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-300">
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

                  <div className="space-y-4 text-base">
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                      <span className="text-slate-600 font-medium">Target URL:</span>
                      <a href={resultData.targetUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-mono text-right max-w-[280px] truncate text-base font-bold" title={resultData.targetUrl}>
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
                  <div className="flex border-b border-slate-200 bg-slate-100/80 px-4 pt-3 gap-2">
                    <button
                      onClick={() => setActiveTab('editor')}
                      className={`px-6 py-3.5 text-base font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                        activeTab === 'editor'
                          ? 'bg-white border-green-600 text-green-800 shadow-xs'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      Live Sandbox Editor
                    </button>

                    <button
                      onClick={() => setActiveTab('sitemaps')}
                      className={`px-6 py-3.5 text-base font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                        activeTab === 'sitemaps'
                          ? 'bg-white border-green-600 text-green-800 shadow-xs'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                      XML Sitemaps ({resultData.sitemaps.length})
                    </button>

                    <button
                      onClick={() => setActiveTab('resources')}
                      className={`px-6 py-3.5 text-base font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                        activeTab === 'resources'
                          ? 'bg-white border-green-600 text-green-800 shadow-xs'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
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
