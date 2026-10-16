'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function MobileFirstIndex() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultData, setResultData] = useState<any | null>(null);

  const handleTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setStatus('loading');
    setErrorMessage(null);
    setResultData(null);

    try {
      const res = await fetch('/api/seo/mobile-first-index/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to compare desktop and mobile versions.');
      }

      setResultData(data);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred while auditing parity.');
    }
  };

  return (
    <ToolLayout
      title="Mobile-First Index Tool"
      description="Compare desktop and mobile content parity side-by-side to identify indexing discrepancies."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Mobile-First Index Tool' }]}
      aboutText="Google indexes the mobile version of your website. If your mobile site hides content, removes structured data, alters canonical links, or trims internal links compared to your desktop site, your SEO will suffer. This tool audits both versions side-by-side using live desktop and mobile user agents."
      howItWorks={[
        "Enter the URL you wish to audit.",
        "The server fetches the page using both a Desktop Chrome and Mobile Android user agent.",
        "It extracts text, links, headings, and metadata from both live payloads.",
        "A comparison table highlights discrepancies without inferring internal Google indexing decisions."
      ]}
      faq={[
        { question: "Is it okay to hide content on mobile?", answer: "Generally, no. Under mobile-first indexing, the primary content and critical SEO elements must be equivalent on both desktop and mobile versions." },
        { question: "Does this tool verify Google's internal indexing state?", answer: "No public tool can query Google's internal index databases without authenticated Google Search Console access. This tool provides an accurate, observable desktop-versus-mobile markup parity analysis." }
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
            {status === 'loading' ? 'Comparing Versions...' : 'Compare Mobile & Desktop'}
          </button>
        </form>
      </div>

      {status === 'error' && errorMessage && (
        <div className="card mb-8 p-4 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 text-sm">
          <strong>Validation Notice:</strong> {errorMessage}
        </div>
      )}

      {status === 'success' && resultData && (
        <div className="card space-y-6">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>DESKTOP / MOBILE HTTP HTML PARITY AUDIT</h2>
            <p className="text-xs text-slate-500 mt-1">
              Tested: <strong className="font-mono text-slate-800 dark:text-slate-200">{resultData.url}</strong> (Desktop: HTTP {resultData.desktopStatus} / Mobile: HTTP {resultData.mobileStatus})
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <strong>HTTP HTML Analysis Scope:</strong> This audit compares server-returned HTML markup delivered to Googlebot Desktop versus Googlebot Smartphone. It audits observable markup differences without inferring internal Google indexing decisions.
          </div>
          
          <div
            style={{
              padding: '16px',
              backgroundColor: resultData.hasDifferences ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: resultData.hasDifferences ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: resultData.hasDifferences ? 'var(--warning-color)' : 'var(--success-color)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>
              Verdict: {resultData.parityVerdict}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {resultData.hasDifferences
                ? 'Differences detected between desktop and mobile responses. Review the table below to ensure critical SEO elements are not missing on mobile.'
                : 'All surveyed SEO elements (Title, Headings, Canonical, Schema, Word count) match across desktop and mobile responses.'}
            </div>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Element</th>
                  <th>Desktop Response</th>
                  <th>Mobile Response</th>
                  <th>Parity Status</th>
                </tr>
              </thead>
              <tbody>
                {(resultData.comparison || []).map((item: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td className="text-xs font-mono">{item.desktop}</td>
                    <td className="text-xs font-mono">{item.mobile}</td>
                    <td>
                      <span
                        className={`badge ${
                          item.status === 'Match'
                            ? 'badge-success'
                            : item.status === 'Both Missing'
                            ? 'badge-neutral'
                            : 'badge-warning'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 italic pt-2 border-t border-slate-200 dark:border-slate-800">
            Note: While differences in markup are directly observable, specific Google ranking and indexing decisions cannot be definitively inferred without Search Console inspection.
          </p>
        </div>
      )}
    </ToolLayout>
  );
}
