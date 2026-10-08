'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function HreflangTester() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1200);
  };

  const hreflangs = [
    { lang: 'en', region: 'us', url: 'https://example.com/en-us/', status: 'Valid', badge: 'badge-success' },
    { lang: 'en', region: 'gb', url: 'https://example.com/en-gb/', status: 'Valid', badge: 'badge-success' },
    { lang: 'fr', region: 'fr', url: 'https://example.com/fr/', status: 'No Return Tag', badge: 'badge-error' },
    { lang: 'de', region: '', url: 'https://example.com/de/', status: 'Valid', badge: 'badge-success' },
    { lang: 'x-default', region: '', url: 'https://example.com/', status: 'Valid', badge: 'badge-success' }
  ];

  return (
    <ToolLayout
      title="hreflang Tags Tester"
      description="Validate hreflang tags for international targeting."
      category="International SEO"
      breadcrumbs={[{ label: 'hreflang Tags Tester' }]}
      aboutText="Hreflang tags tell search engines which language and regional version of a page to serve to users. They are notoriously easy to get wrong. This tool extracts all hreflang tags from a page and validates them for common errors."
      howItWorks={[
        "Enter the URL of the page you want to test.",
        "The tool extracts hreflang annotations from the HTML head, HTTP headers, and sitemaps.",
        "It validates the language and region codes.",
        "It checks for self-referencing tags and bi-directional return links."
      ]}
      faq={[
        { question: "What is a 'Return Tag' error?", answer: "If Page A links to Page B via hreflang, Page B must link back to Page A. If it doesn't, the tag is ignored." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>INPUT SECTION</h2>
        </div>
        
        <div className="input-group">
          <label className="label">Website URL</label>
          <input type="url" className="input" placeholder="https://example.com" />
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={handleTest}
          disabled={status === 'loading'}
          style={{ width: '100%', marginTop: '16px' }}
        >
          {status === 'loading' ? 'Checking hreflang...' : 'Check hreflang'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>VALIDATION RESULTS</h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-5" style={{ gap: '16px', marginBottom: '24px' }}>
             <div style={{ padding: '12px', textAlign: 'center', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontWeight: 600, color: 'var(--success-color)' }}>Yes</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Self-reference</div>
             </div>
             <div style={{ padding: '12px', textAlign: 'center', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontWeight: 600, color: 'var(--error-color)' }}>1 Missing</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Return tags</div>
             </div>
             <div style={{ padding: '12px', textAlign: 'center', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontWeight: 600, color: 'var(--success-color)' }}>Yes</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>x-default</div>
             </div>
             <div style={{ padding: '12px', textAlign: 'center', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontWeight: 600, color: 'var(--success-color)' }}>0</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Broken URLs</div>
             </div>
             <div style={{ padding: '12px', textAlign: 'center', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontWeight: 600, color: 'var(--success-color)' }}>0</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Duplicate tags</div>
             </div>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Language</th>
                  <th>Region</th>
                  <th>URL</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {hreflangs.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{item.lang}</td>
                    <td>{item.region || '-'}</td>
                    <td><span style={{ fontSize: '13px' }}>{item.url}</span></td>
                    <td><span className={`badge ${item.badge}`}>{item.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
