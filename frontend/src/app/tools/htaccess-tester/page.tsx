'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';
import { HTACCESS_EXAMPLES } from '@/lib/seo/htaccessExamples';
import { HtaccessTestResult, HtaccessServerVariables } from '@/lib/seo/htaccessTypes';

export default function HtaccessTester() {
  const [urlInput, setUrlInput] = useState('https://example.com/old-page');
  const [htaccessInput, setHtaccessInput] = useState(`RewriteEngine On
RewriteRule ^old-page$ /new-page [R=301,L]`);
  
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

  const handleApplyExample = (exampleId: string) => {
    const ex = HTACCESS_EXAMPLES.find(e => e.id === exampleId);
    if (ex) {
      setHtaccessInput(ex.rules);
      setUrlInput(ex.sampleUrl);
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
          serverVariables: cleanVars
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to simulate .htaccess rules');
      }

      setResultData(data);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setUrlInput('https://example.com/old-page');
    setHtaccessInput(`RewriteEngine On
RewriteRule ^old-page$ /new-page [R=301,L]`);
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

  return (
    <ToolLayout
      title=".htaccess Tester"
      description="Test Apache .htaccess rewrite and redirect rules to see how URLs will be transformed before making changes to your live website."
      category="Crawling & Access"
      breadcrumbs={[{ label: '.htaccess Tester' }]}
      aboutText="The .htaccess file is a powerful configuration file for Apache web servers. This tool simulates your mod_rewrite and mod_alias directives, showing exactly which conditions and rules execute and diagnosing redirection loops before live deployment."
      howItWorks={[
        "Enter your target test URL.",
        "Paste your .htaccess rules or pick a pre-configured SEO template.",
        "Optionally customize server variables (e.g. HTTPS, HTTP_HOST, User-Agent).",
        "Click 'Test Rules' to run the evaluation and inspect the line-by-line debug trace."
      ]}
      faq={[
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
        }
      ]}
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
              onChange={(e) => setUrlInput(e.target.value)}
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
              onChange={(e) => setHtaccessInput(e.target.value)}
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
                    onChange={(e) => setServerVars({ ...serverVars, HTTP_HOST: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HTTPS</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg font-mono text-slate-800"
                    value={serverVars.HTTPS}
                    onChange={(e) => setServerVars({ ...serverVars, HTTPS: e.target.value })}
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
                    onChange={(e) => setServerVars({ ...serverVars, HTTP_USER_AGENT: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HTTP_REFERER</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-lg font-mono text-slate-800"
                    placeholder="https://google.com/"
                    value={serverVars.HTTP_REFERER}
                    onChange={(e) => setServerVars({ ...serverVars, HTTP_REFERER: e.target.value })}
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

              {/* PRIVACY & TRANSPARENCY NOTICE */}
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="text-slate-400">ℹ️</span>
                <span>{resultData.privacyNotice}</span>
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

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
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
