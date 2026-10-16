'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function PrerenderingTester() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const handleTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setStatus('loading');
    setErrorMessage(null);
    setErrorCode(null);
    setResult(null);

    try {
      const res = await fetch('/api/seo/fetch-render/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          userAgent: 'googlebot-desktop',
          mode: 'fetch-and-render',
          respectRobots: false,
          postLoadWaitMs: 2000,
          captureScreenshot: false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'BROWSER_RENDER_UNAVAILABLE') {
          setErrorCode('BROWSER_RENDER_UNAVAILABLE');
          throw new Error('Headless browser rendering is not supported in the current serverless environment.');
        }
        throw new Error(data.error || 'Failed to compare initial HTML against rendered DOM.');
      }

      setResult(data.result);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred while inspecting rendering differences.');
    }
  };

  return (
    <ToolLayout
      title="Pre-rendering Tester"
      description="Compare server-side source HTML with the live JavaScript rendered DOM."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Pre-rendering Tester' }]}
      aboutText="If your website uses a modern JavaScript framework (React, Next.js, Vue, Nuxt, Angular) and implements Server-Side Rendering (SSR) or Static Site Generation (SSG), this tool verifies that critical SEO elements are present in the initial HTML payload without requiring client-side JavaScript execution."
      howItWorks={[
        "Enter your webpage URL.",
        "The server captures the raw initial server-side HTTP response HTML.",
        "An isolated headless browser renders the JavaScript DOM.",
        "The tool compares critical SEO tags (Title, Meta Description, Canonical, Headings, Schema) and reveals elements added or modified by JavaScript."
      ]}
      faq={[
        { question: "Why is it important to have SEO elements in the Source HTML?", answer: "While Google can render JavaScript, it is a secondary, queued process that consumes crawl budget. Providing critical elements (like Title, Canonical, and Schema) in the raw server HTML ensures immediate, deterministic indexing." },
        { question: "What does 'Changed' or 'Added' mean?", answer: "'Added' means the element was missing from the initial server HTML and injected client-side by JavaScript. 'Changed' means client-side scripts modified the value after initial page load." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>INPUT SECTION</h2>
        </div>
        
        <form onSubmit={handleTest}>
          <div className="input-group">
            <label className="label">Website URL <span className="text-red-500">*</span></label>
            <input
              type="url"
              className="input"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          
          <button 
            type="submit"
            className="btn btn-primary" 
            disabled={status === 'loading' || !url.trim()}
            style={{ width: '100%', marginTop: '16px' }}
          >
            {status === 'loading' ? 'Testing Rendering Differences...' : 'Test Rendering'}
          </button>
        </form>
      </div>

      {status === 'error' && errorMessage && (
        <div className={`card mb-8 p-4 rounded-xl border text-sm ${
          errorCode === 'BROWSER_RENDER_UNAVAILABLE'
            ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300'
            : 'border-rose-200 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300'
        }`}>
          <strong>{errorCode === 'BROWSER_RENDER_UNAVAILABLE' ? 'Environment Notice:' : 'Test Notice:'}</strong> {errorMessage}
        </div>
      )}

      {status === 'success' && result && (
        <div className="card space-y-6">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>COMPARISON RESULTS</h2>
            <p className="text-xs text-slate-500 mt-1">
              Tested: <strong className="font-mono text-slate-800 dark:text-slate-200">{result.targetUrl}</strong> (HTTP {result.summary.httpStatus})
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3" style={{ gap: '16px' }}>
            {(result.seoSignals?.comparison || []).map((item: any, i: number) => {
              const badgeClass =
                item.status === 'IDENTICAL'
                  ? 'badge-success'
                  : item.status === 'MODIFIED' || item.status === 'ADDED'
                  ? 'badge-warning'
                  : 'badge-error';

              return (
                <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{item.label}</h3>
                    <span className={`badge ${badgeClass}`}>{item.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1 mt-2">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Initial HTML:</span>{' '}
                      <span className="font-mono break-all">{item.initialValue || '(none)'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Rendered DOM:</span>{' '}
                      <span className="font-mono break-all">{item.renderedValue || '(none)'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-400 italic pt-2 border-t border-slate-200 dark:border-slate-800">
            Note: Demonstrates observable differences between initial server payload and the rendered DOM. Google indexes client-side modifications during secondary rendering passes.
          </p>
        </div>
      )}
    </ToolLayout>
  );
}
