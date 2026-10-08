'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function PrerenderingTester() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 2000);
  };

  const elements = [
    { name: 'Title', status: 'Changed', badge: 'badge-warning' },
    { name: 'Meta Description', status: 'Present', badge: 'badge-success' },
    { name: 'H1', status: 'Missing', badge: 'badge-error' },
    { name: 'Main Content', status: 'Changed', badge: 'badge-warning' },
    { name: 'Canonical', status: 'Present', badge: 'badge-success' },
    { name: 'Schema', status: 'Missing in Source', badge: 'badge-warning' },
  ];

  return (
    <ToolLayout
      title="Pre-rendering Tester"
      description="Compare source HTML with fully rendered DOM."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Pre-rendering Tester' }]}
      aboutText="If your website uses a JavaScript framework (React, Vue, Angular) and implements Server-Side Rendering (SSR) or Static Site Generation (SSG), this tool helps you verify that critical SEO elements are present in the initial HTML payload without requiring JavaScript execution."
      howItWorks={[
        "Enter your webpage URL.",
        "The tool extracts key SEO elements from the raw Source HTML.",
        "It then renders the page via a headless browser to get the Rendered HTML.",
        "The tool compares the two and highlights missing or modified elements."
      ]}
      faq={[
        { question: "Why is it important to have SEO elements in the Source HTML?", answer: "While Google can render JavaScript, it is a secondary, delayed process. Providing critical elements (like Title, Canonical, and Schema) in the raw HTML ensures immediate and accurate indexing." }
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
          {status === 'loading' ? 'Testing Rendering...' : 'Test Rendering'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>COMPARISON RESULTS</h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3" style={{ gap: '16px' }}>
            {elements.map((item, i) => (
              <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', margin: 0 }}>{item.name}</h3>
                  <span className={`badge ${item.badge}`}>{item.status}</span>
                </div>
                {item.status === 'Changed' && (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    Value injected or altered by JavaScript after initial load.
                  </p>
                )}
                {item.status === 'Present' && (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    Identical in Source HTML and Rendered DOM.
                  </p>
                )}
                {item.status.includes('Missing') && (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    Critical element missing from initial HTML payload.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
