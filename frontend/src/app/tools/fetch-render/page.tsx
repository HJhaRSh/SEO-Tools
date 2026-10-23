'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

interface UserAgentOption {
  id: string;
  name: string;
  token: string;
  category: string;
  disclaimer: string;
}

const DEFAULT_USER_AGENTS: UserAgentOption[] = [
  {
    id: 'chrome-desktop',
    name: 'Google Chrome Desktop',
    token: 'chrome',
    category: 'browser',
    disclaimer: 'Standard modern desktop browser emulation.'
  },
  {
    id: 'googlebot-smartphone',
    name: 'Googlebot Smartphone',
    token: 'googlebot',
    category: 'search',
    disclaimer: 'User-agent simulation. Does not originate from verified Googlebot IP blocks.'
  },
  {
    id: 'googlebot-desktop',
    name: 'Googlebot Desktop',
    token: 'googlebot',
    category: 'search',
    disclaimer: 'User-agent simulation. Does not originate from verified Googlebot IP blocks.'
  },
  {
    id: 'bingbot',
    name: 'Bingbot',
    token: 'bingbot',
    category: 'search',
    disclaimer: 'Simulated user-agent. Server responses may vary based on bot-mitigation systems.'
  },
  {
    id: 'chrome-mobile',
    name: 'Google Chrome Mobile',
    token: 'chrome-mobile',
    category: 'browser',
    disclaimer: 'Standard modern mobile device emulation.'
  }
];

function base64ToBytes(base64: string): Uint8Array {
  if (!base64) return new Uint8Array(0);
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function triggerDownload(filename: string, mimeType: string, data: any) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function FetchRenderPage() {
  // Input fields
  const [url, setUrl] = useState('');
  const [userAgentId, setUserAgentId] = useState('chrome-desktop');
  const [mode, setMode] = useState<'fetch-and-render' | 'fetch-only'>('fetch-and-render');

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [respectRobots, setRespectRobots] = useState(true);
  const [postLoadWaitMs, setPostLoadWaitMs] = useState(2000);
  const [acceptLanguage, setAcceptLanguage] = useState('en-US,en;q=0.9');
  const [captureScreenshot, setCaptureScreenshot] = useState(true);

  // Execution state
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [loadingStep, setLoadingStep] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  // Submission race prevention ref
  const submissionRef = React.useRef<number>(0);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'overview' | 'original-html' | 'rendered-html' | 'screenshot' | 'seo-diff' | 'resources'>('overview');
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedRendered, setCopiedRendered] = useState(false);

  const selectedUa = DEFAULT_USER_AGENTS.find(u => u.id === userAgentId) || DEFAULT_USER_AGENTS[0];

  const handleRunTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (status === 'loading') return;

    const cleanUrl = url.trim();

    if (!cleanUrl) {
      setErrorMessage('Please enter a valid page URL (e.g. https://example.com/page/).');
      setStatus('error');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setErrorMessage('URL must begin with http:// or https://.');
      setStatus('error');
      return;
    }

    const currentSubmissionId = ++submissionRef.current;
    setStatus('loading');
    setErrorMessage(null);
    setErrorCode(null);
    setLoadingStep(
      mode === 'fetch-and-render'
        ? 'Fetching and rendering your webpage. This may take a few moments...'
        : 'Fetching your webpage. This may take a moment...'
    );

    try {
      const response = await fetch('/api/seo/fetch-render/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: cleanUrl,
          userAgent: userAgentId,
          mode,
          respectRobots,
          postLoadWaitMs,
          acceptLanguage,
          captureScreenshot
        })
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      }

      if (currentSubmissionId !== submissionRef.current) return;

      if (!response.ok || !data || !data.success) {
        let errorMsg = '';
        let detectedCode = data?.code || null;

        if (data && data.error) {
          errorMsg = data.error;
        } else {
          // Parse non-JSON errors (such as Vercel edge/gateway or proxy status pages)
          const rawText = !data ? await response.text().catch(() => '') : '';

          if (response.status === 504) {
            errorMsg = 'Gateway Timeout (HTTP 504): The rendering request exceeded server timeout limits. Try selecting "Fetch Only" mode or testing a lighter webpage.';
          } else if (response.status === 502) {
            errorMsg = 'Bad Gateway (HTTP 502): The backend API service is unreachable or restarting. Please verify deployment routing and retry shortly.';
          } else if (response.status === 503) {
            errorMsg = 'Service Unavailable (HTTP 503): Browser rendering service is temporarily unavailable in this environment.';
            detectedCode = 'BROWSER_RENDER_UNAVAILABLE';
          } else if (response.status === 429) {
            errorMsg = 'Too Many Requests (HTTP 429): Rendering queue or rate limit reached. Please wait a moment before trying again.';
          } else if (response.status === 404) {
            errorMsg = 'API Endpoint Not Found (HTTP 404): The Fetch & Render endpoint could not be found. Please check deployment service routes.';
          } else if (response.status === 500) {
            errorMsg = 'Backend Server Error (HTTP 500): The server encountered an internal error. If browser rendering failed, try switching to "Fetch Only" mode to isolate browser-runtime issues.';
          } else {
            errorMsg = `Backend returned HTTP status ${response.status}${response.statusText ? ` (${response.statusText})` : ''}.`;
          }

          if (rawText && !rawText.includes('<html') && !rawText.includes('<!DOCTYPE') && rawText.trim().length > 0 && rawText.trim().length < 200) {
            errorMsg += ` Details: ${rawText.trim()}`;
          }
        }

        // Tailor message for browser automation issues
        if (
          detectedCode === 'BROWSER_RENDER_UNAVAILABLE' ||
          errorMsg.includes('Browser rendering is not available in the current Vercel test environment') ||
          errorMsg.includes("Executable doesn't exist") ||
          errorMsg.includes('Failed to launch browser') ||
          errorMsg.includes('browserType.launch')
        ) {
          detectedCode = 'BROWSER_RENDER_UNAVAILABLE';
          errorMsg =
            'Browser rendering is currently unavailable in this testing environment. You can still run the complete server-side analysis using Fetch Only mode.';
        }

        setErrorCode(detectedCode);
        throw new Error(errorMsg);
      }

      setResult(data.result);
      setStatus('success');
      setActiveTab('overview');
    } catch (err: any) {
      if (currentSubmissionId !== submissionRef.current) return;
      setStatus('error');
      setErrorMessage(err.message || 'Network error executing Fetch & Render test.');
    }
  };

  const copyToClipboard = async (text: string, type: 'original' | 'rendered') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'original') {
        setCopiedOriginal(true);
        setTimeout(() => setCopiedOriginal(false), 2000);
      } else {
        setCopiedRendered(true);
        setTimeout(() => setCopiedRendered(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <ToolLayout
      title="Fetch & Render"
      description="Inspect how your webpage is fetched by search engine crawlers, execute JavaScript in headless Chromium, and compare initial HTML against the rendered DOM."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Fetch & Render' }]}
      aboutText="Search engine crawlers like Googlebot don't just consume the static HTML returned by your web server; they execute modern JavaScript in a Chromium-based rendering environment. This tool simulates crawler-style fetching and rendering, extracting critical SEO signals to help you uncover JavaScript-dependent content, metadata modifications, blocked subresources, and canonical discrepancies."
      howItWorks={[
        "Enter any absolute webpage URL and choose your target crawler or browser user-agent.",
        "The server performs an initial secure HTTP fetch to capture the original server HTML and headers.",
        "In Fetch & Render mode, an isolated Chromium browser context renders JavaScript, captures a real screenshot, and logs console errors.",
        "The tool parses both DOM states, detects SEO signal discrepancies (Title, Canonical, Meta Robots, Links, Word count), and flags blocked subresources."
      ]}
      faq={[
        {
          question: "Is this simulation identical to real Googlebot rendering?",
          answer: "No. This tool simulates Googlebot's user-agent string and viewport dimensions in a modern Chromium browser. However, genuine Googlebot crawls from Google's verified IP addresses and reverse-DNS infrastructure (1e100.net), and Google's rendering service may batch or cache resources differently."
        },
        {
          question: "Why does my page have missing content in the Original HTML?",
          answer: "Client-side rendered frameworks (such as React, Vue, or Angular Single Page Apps) only return a minimal HTML shell from the server. The actual content is injected asynchronously by JavaScript in the browser."
        },
        {
          question: "How does the 'Respect robots.txt' setting work?",
          answer: "When enabled, the tool checks whether the target URL and any subresources (scripts, stylesheets) are permitted under robots.txt rules for the chosen user-agent. If a resource is disallowed, Chromium aborts the network request and reports it in the blocked resources table."
        }
      ]}
    >
      {/* MAIN INPUT CARD */}
      <div className="card mb-8">
        <form onSubmit={handleRunTest}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
            {/* Field 1: Page URL */}
            <div className="lg:col-span-6">
              <label htmlFor="url-input" className="label">
                Enter Page URL
              </label>
              <input
                id="url-input"
                type="url"
                className="input"
                placeholder="https://example.com/page/"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (result) setResult(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={status === 'loading'}
                required
              />
            </div>

            {/* Field 2: User Agent */}
            <div className="lg:col-span-3">
              <label htmlFor="ua-select" className="label">
                User Agent
              </label>
              <select
                id="ua-select"
                className="select"
                value={userAgentId}
                onChange={(e) => {
                  setUserAgentId(e.target.value);
                  if (result) setResult(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={status === 'loading'}
              >
                {DEFAULT_USER_AGENTS.map((ua) => (
                  <option key={ua.id} value={ua.id}>
                    {ua.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Field 3: Rendering Mode */}
            <div className="lg:col-span-3">
              <label htmlFor="mode-select" className="label">
                Rendering Mode
              </label>
              <select
                id="mode-select"
                className="select"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as any);
                  if (result) setResult(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={status === 'loading'}
              >
                <option value="fetch-and-render">Fetch & Render</option>
                <option value="fetch-only">Fetch Only (No JS)</option>
              </select>
            </div>
          </div>

          {/* User Agent Disclaimer notice */}
          <div className="mb-5 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-start gap-2">
            <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>Note:</strong> {selectedUa.disclaimer}
            </span>
          </div>

          {/* Collapsible Advanced Options */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-green-600 flex items-center gap-1.5 cursor-pointer"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
              <span>{showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">
                    <input
                      type="checkbox"
                      checked={respectRobots}
                      onChange={(e) => setRespectRobots(e.target.checked)}
                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                    />
                    Respect robots.txt (Recommended)
                  </label>
                  <p className="text-xs text-slate-500">
                    Abort crawl or subresource requests if disallowed by applicable robots.txt rules.
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">
                    <input
                      type="checkbox"
                      checked={captureScreenshot}
                      onChange={(e) => setCaptureScreenshot(e.target.checked)}
                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                    />
                    Capture Screenshot
                  </label>
                  <p className="text-xs text-slate-500">
                    Capture rendered viewport image in Chromium.
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">
                    Post-load wait: {postLoadWaitMs / 1000}s
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="5000"
                    step="500"
                    value={postLoadWaitMs}
                    onChange={(e) => setPostLoadWaitMs(Number(e.target.value))}
                    className="w-full accent-green-600 cursor-pointer"
                  />
                  <p className="text-xs text-slate-500">
                    Wait period after DOMContentLoaded for asynchronous JS execution.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary w-full text-base sm:text-lg py-4 flex items-center justify-center gap-3"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <>
                <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>{loadingStep || 'Processing Fetch & Render...'}</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Fetch & Render Webpage</span>
              </>
            )}
          </button>
        </form>

        {/* Error Alert */}
        {status === 'error' && errorMessage && (
          <div
            className={`mt-6 p-4 rounded-xl border text-sm flex items-start gap-3 ${
              errorCode === 'BROWSER_RENDER_UNAVAILABLE'
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            {errorCode === 'BROWSER_RENDER_UNAVAILABLE' ? (
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <div className="flex-1">
              <p className="font-bold">
                {errorCode === 'BROWSER_RENDER_UNAVAILABLE'
                  ? 'Browser Rendering Notice'
                  : 'Test Execution Failed'}
              </p>
              <p className="mt-0.5">{errorMessage}</p>
              {errorCode === 'BROWSER_RENDER_UNAVAILABLE' && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('fetch-only');
                      setStatus('idle');
                      setErrorMessage(null);
                      setErrorCode(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Switch to Fetch Only
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RESULTS DISPLAY */}
      {status === 'success' && result && (
        <div className="space-y-6">
          {/* 1. Executive Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Card 1: HTTP Status */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">HTTP Status</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span
                  className={`inline-block w-3 h-3 rounded-full ${
                    result.summary.httpStatus < 300
                      ? 'bg-emerald-500'
                      : result.summary.httpStatus < 400
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                ></span>
                {result.summary.httpStatus} {result.summary.httpStatusText}
              </p>
            </div>

            {/* Card 2: Crawlability */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Crawlability</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span
                  className={`inline-block w-3 h-3 rounded-full ${
                    result.summary.crawlability === 'ALLOWED'
                      ? 'bg-emerald-500'
                      : result.summary.crawlability === 'DISALLOWED'
                      ? 'bg-rose-500'
                      : 'bg-amber-500'
                  }`}
                ></span>
                {result.summary.crawlability}
              </p>
            </div>

            {/* Card 3: Rendering */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Rendering</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span
                  className={`inline-block w-3 h-3 rounded-full ${
                    result.summary.renderingStatus === 'COMPLETED'
                      ? 'bg-emerald-500'
                      : result.summary.renderingStatus === 'FETCH_ONLY'
                      ? 'bg-blue-500'
                      : 'bg-rose-500'
                  }`}
                ></span>
                {result.summary.renderingStatus === 'FETCH_ONLY' ? 'Fetch Only' : result.summary.renderingStatus}
              </p>
            </div>

            {/* Card 4: Timing */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Time</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {(result.summary.totalDurationMs / 1000).toFixed(2)}s
              </p>
            </div>
          </div>

          {/* Cloudflare WAF Helper Banner */}
          {result.diagnostics.some((d: any) => d.id === 'waf-bot-challenge') && (
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-bold text-base">Cloudflare Bot Verification Block (HTTP 403)</p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                    This website uses Cloudflare Bot Management. When requests claim to be Googlebot from a non-Google IP, Cloudflare blocks them as unverified bots. Real Googlebot with verified reverse-DNS is not blocked.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserAgentId('chrome-desktop');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="btn btn-primary text-xs py-2 px-4 whitespace-nowrap shrink-0"
              >
                Switch to Chrome Desktop
              </button>
            </div>
          )}

          {/* 2. Result Tabs */}
          <div className="card">
            {/* Tabs Header */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 gap-2 sm:gap-3 overflow-x-auto pb-3 mb-6">
              {[
                { id: 'overview', label: 'Overview & Diagnostics' },
                { id: 'seo-diff', label: 'SEO Diff' },
                { id: 'original-html', label: 'Original HTML' },
                { id: 'rendered-html', label: 'Rendered DOM' },
                { id: 'screenshot', label: 'Screenshot' },
                { id: 'resources', label: 'Resources & Console' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-green-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: OVERVIEW & DIAGNOSTICS */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Diagnostics List */}
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">
                    Technical SEO Findings & Observations
                  </h3>

                  {result.diagnostics.length === 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-bold flex items-center gap-2">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      No technical SEO discrepancies or crawl blocking issues were detected.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {result.diagnostics.map((diag: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                            diag.severity === 'ERROR'
                              ? 'bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800/60'
                              : diag.severity === 'WARNING'
                              ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/60'
                              : 'bg-blue-50/70 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/60'
                          }`}
                        >
                          <span
                            className={`badge text-xs shrink-0 mt-0.5 ${
                              diag.severity === 'ERROR'
                                ? 'badge-error'
                                : diag.severity === 'WARNING'
                                ? 'badge-warning'
                                : 'bg-blue-100 text-blue-800 border border-blue-300'
                            }`}
                          >
                            {diag.severity}
                          </span>
                          <div className="flex-1">
                            <h4 className="font-bold text-slate-900 dark:text-white text-base">{diag.title}</h4>
                            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{diag.description}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 italic">
                              <strong>SEO Context:</strong> {diag.seoImpact}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Redirect History */}
                {result.initialFetch.redirectHistory.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-3">HTTP Redirect Chain</h3>
                    <div className="space-y-2">
                      {result.initialFetch.redirectHistory.map((hop: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 text-sm font-mono bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                          <span className="badge badge-warning text-xs">{hop.statusCode}</span>
                          <span className="truncate">{hop.from}</span>
                          <span className="text-slate-400">→</span>
                          <span className="truncate font-bold text-slate-900 dark:text-white">{hop.to}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Response Headers */}
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-3">Response Headers</h3>
                  <div className="max-h-60 overflow-y-auto bg-slate-900 text-slate-100 font-mono text-xs p-4 rounded-2xl">
                    {Object.entries(result.initialFetch.headers).map(([k, v]) => (
                      <div key={k} className="py-0.5">
                        <span className="text-emerald-400">{k}:</span> {String(v)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: SEO SIGNAL COMPARISON */}
            {activeTab === 'seo-diff' && (
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4">
                  Initial HTML vs Rendered DOM Signals
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                        <th className="py-3 px-4">SEO Element</th>
                        <th className="py-3 px-4">Original Server HTML</th>
                        <th className="py-3 px-4">Rendered JavaScript DOM</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(result.seoSignals.comparison || []).map((diff: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {diff.label}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 max-w-xs break-words font-mono text-xs">
                            {String(diff.initialValue || '(none)')}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 max-w-xs break-words font-mono text-xs">
                            {String(diff.renderedValue || '(none)')}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`badge text-xs ${
                                diff.status === 'IDENTICAL'
                                  ? 'badge-success'
                                  : diff.status === 'ADDED'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                  : diff.status === 'MODIFIED'
                                  ? 'badge-warning'
                                  : 'badge-error'
                              }`}
                            >
                              {diff.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: ORIGINAL HTML */}
            {activeTab === 'original-html' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-slate-500">
                    Byte size: <strong>{(result.initialFetch.byteSize / 1024).toFixed(1)} KB</strong>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(result.initialFetch.rawHtml, 'original')}
                      className="btn btn-secondary text-xs py-2 px-3"
                    >
                      {copiedOriginal ? 'Copied!' : 'Copy Code'}
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerDownload('original.html', 'text/html;charset=utf-8', result.initialFetch.rawHtml)}
                      className="btn btn-primary text-xs py-2 px-3"
                    >
                      Download HTML
                    </button>
                  </div>
                </div>

                <pre className="bg-slate-950 text-slate-100 font-mono text-xs p-4 rounded-2xl max-h-[500px] overflow-auto">
                  <code>{result.initialFetch.rawHtml}</code>
                </pre>
              </div>
            )}

            {/* TAB 4: RENDERED DOM */}
            {activeTab === 'rendered-html' && (
              <div>
                {result.renderResult ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-sm text-slate-500">
                        Byte size: <strong>{(result.renderResult.byteSize / 1024).toFixed(1)} KB</strong> | Render duration: <strong>{result.renderResult.renderDurationMs}ms</strong>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(result.renderResult.renderedHtml, 'rendered')}
                          className="btn btn-secondary text-xs py-2 px-3"
                        >
                          {copiedRendered ? 'Copied!' : 'Copy Code'}
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDownload('rendered.html', 'text/html;charset=utf-8', result.renderResult?.renderedHtml ?? '')}
                          className="btn btn-primary text-xs py-2 px-3"
                        >
                          Download Rendered DOM
                        </button>
                      </div>
                    </div>

                    <pre className="bg-slate-950 text-slate-100 font-mono text-xs p-4 rounded-2xl max-h-[500px] overflow-auto">
                      <code>{result.renderResult.renderedHtml}</code>
                    </pre>
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    JavaScript rendering was skipped in Fetch Only mode.
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: SCREENSHOT */}
            {activeTab === 'screenshot' && (
              <div>
                {result.renderResult?.screenshotBase64 ? (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-sm text-slate-500">
                        Viewport: <strong>{result.userAgent.viewport.width} x {result.userAgent.viewport.height}</strong> ({result.userAgent.name})
                      </div>
                      <button
                        type="button"
                        onClick={() => triggerDownload('screenshot.png', 'image/png', base64ToBytes(result.renderResult?.screenshotBase64 ?? ''))}
                        className="btn btn-primary text-xs py-2 px-3"
                      >
                        Download Screenshot
                      </button>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-slate-100 dark:bg-slate-900 flex justify-center">
                      <img
                        src={`data:image/png;base64,${result.renderResult.screenshotBase64}`}
                        alt="Rendered Webpage Screenshot"
                        className="rounded-xl shadow-md max-h-[600px] object-contain border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    No screenshot captured for this test run.
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: RESOURCES & CONSOLE */}
            {activeTab === 'resources' && (
              <div className="space-y-6">
                {/* Console Messages */}
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-3">JavaScript Console Logs & Exceptions</h4>
                  {(!result.renderResult?.consoleMessages || result.renderResult.consoleMessages.length === 0) ? (
                    <p className="text-sm text-slate-500">No JavaScript console errors or uncaught exceptions recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {result.renderResult.consoleMessages.map((msg: any, i: number) => (
                        <div key={i} className="p-3 bg-slate-900 text-rose-300 font-mono text-xs rounded-xl flex items-start gap-2">
                          <span className="badge badge-error text-[10px] py-0 px-1.5">{msg.type}</span>
                          <span className="flex-1 break-all">{msg.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subresources */}
                <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="font-bold text-slate-900 dark:text-white mb-3">
                    Subresources ({result.renderResult?.resources?.length || 0})
                  </h4>
                  {(!result.renderResult?.resources || result.renderResult.resources.length === 0) ? (
                    <p className="text-sm text-slate-500">No subresource requests tracked.</p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th className="py-2 px-2">Type</th>
                            <th className="py-2 px-2">Status</th>
                            <th className="py-2 px-2">URL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                          {result.renderResult.resources.map((r: any, i: number) => (
                            <tr key={i}>
                              <td className="py-2 px-2 text-slate-500">{r.type}</td>
                              <td className="py-2 px-2">
                                <span className={`badge text-[10px] ${r.loadStatus === 'LOADED' ? 'badge-success' : 'badge-error'}`}>
                                  {r.httpStatus || r.loadStatus}
                                </span>
                              </td>
                              <td className="py-2 px-2 truncate max-w-sm text-slate-700 dark:text-slate-300" title={r.url}>
                                {r.url}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. Export Center Bar */}
          <div className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">Download Test Reports</h4>
              <p className="text-xs text-slate-500">Export test artifacts, screenshots, and structured diagnostic data.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => triggerDownload('fetch-render-report.json', 'application/json;charset=utf-8', JSON.stringify(result, null, 2))}
                className="btn btn-secondary text-xs py-2 px-3"
              >
                JSON Report
              </button>
              <button
                type="button"
                onClick={() => triggerDownload('seo-diff.csv', 'text/csv;charset=utf-8', result.seoDiffCsv ?? '')}
                className="btn btn-secondary text-xs py-2 px-3"
              >
                SEO Diff CSV
              </button>
              {result.downloads.screenshotId && (
                <button
                  type="button"
                  onClick={() => triggerDownload('screenshot.png', 'image/png', base64ToBytes(result.renderResult?.screenshotBase64 ?? ''))}
                  className="btn btn-primary text-xs py-2 px-3"
                >
                  Screenshot PNG
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
