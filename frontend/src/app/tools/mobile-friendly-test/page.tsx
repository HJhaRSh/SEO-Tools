'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function MobileFriendlyTest() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultsData, setResultsData] = useState<any | null>(null);

  const handleTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setStatus('loading');
    setErrorMessage(null);
    setResultsData(null);

    try {
      const res = await fetch('/api/seo/mobile-friendly/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to inspect mobile friendliness.');
      }

      setResultsData(data);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred while evaluating mobile friendliness.');
    }
  };

  return (
    <ToolLayout
      title="Mobile-Friendly Test"
      description="Inspect real mobile responsiveness signals, viewport meta configuration, content overflow, and readability."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Mobile-Friendly Test' }]}
      aboutText="A mobile-friendly website is essential for user experience and SEO. This tool evaluates your live webpage based on common mobile usability criteria, including viewport meta configuration, font size legibility, and responsive breakpoints without inventing retired Google verdicts."
      howItWorks={[
        "Enter the URL to be tested.",
        "The server securely fetches the page using a Mobile Chrome user-agent.",
        "It verifies viewport configuration, text legibility declarations, and horizontal layout constraints.",
        "A detailed audit report shows real passed, warning, and notice criteria."
      ]}
      faq={[
        { question: "Did Google retire the official Mobile-Friendly Test?", answer: "Yes. Google officially retired the standalone Mobile-Friendly Test tool and API in December 2023, shifting emphasis towards Core Web Vitals and Lighthouse metrics. This tool performs genuine static mobile signal inspections without pretending to query a retired Google endpoint." },
        { question: "What is the most critical mobile SEO requirement?", answer: "The meta viewport tag (<meta name='viewport' content='width=device-width, initial-scale=1'>) is the fundamental prerequisite. Without it, mobile browsers render pages at desktop scale." }
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
            {status === 'loading' ? 'Testing Mobile Usability...' : 'Test Mobile Friendliness'}
          </button>
        </form>
      </div>

      {status === 'error' && errorMessage && (
        <div className="card mb-8 p-4 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 text-sm">
          <strong>Validation Notice:</strong> {errorMessage}
        </div>
      )}

      {status === 'success' && resultsData && (
        <div className="card space-y-6">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>USABILITY RESULTS</h2>
            <p className="text-xs text-slate-500 mt-1">
              Tested: <strong className="font-mono text-slate-800 dark:text-slate-200">{resultsData.finalUrl}</strong> (HTTP {resultsData.statusCode})
            </p>
          </div>

          <div style={{ display: 'grid', gap: '16px' }}>
            {(resultsData.tests || []).map((test: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{test.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{test.details}</div>
                </div>
                <span className={`badge ${test.badge}`}>{test.status}</span>
              </div>
            ))}
          </div>

          {resultsData.renderingNote && (
            <p className="text-xs text-slate-400 italic pt-2 border-t border-slate-200 dark:border-slate-800">
              {resultsData.renderingNote}
            </p>
          )}
        </div>
      )}
    </ToolLayout>
  );
}
