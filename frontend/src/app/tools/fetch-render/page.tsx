'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function FetchRender() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [activeTab, setActiveTab] = useState('Overview');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 2000);
  };

  const tabs = ['Overview', 'Source HTML', 'Rendered HTML', 'Screenshot', 'Differences'];

  return (
    <ToolLayout
      title="Fetch & Render"
      description="See your webpage exactly how search engines see it."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Fetch & Render' }]}
      aboutText="Search engines like Google don't just read the HTML source anymore; they execute JavaScript to render the page. This tool simulates that process, allowing you to compare the initial HTML payload against the final rendered Document Object Model (DOM)."
      howItWorks={[
        "Enter the URL you want to test.",
        "The tool fetches the raw HTML.",
        "A headless browser executes the JavaScript on the page.",
        "You can inspect the differences between the raw source and rendered output."
      ]}
      faq={[
        { question: "Why is my content missing in the Source HTML?", answer: "If your content is loaded via JavaScript (e.g., in a React SPA), it won't be in the Source HTML. It will only appear in the Rendered HTML." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>INPUT SECTION</h2>
        </div>
        
        <div className="input-group">
          <label className="label">URL to Fetch</label>
          <input type="url" className="input" placeholder="https://example.com" />
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={handleTest}
          disabled={status === 'loading'}
          style={{ width: '100%', marginTop: '16px' }}
        >
          {status === 'loading' ? 'Rendering page...' : 'Fetch & Render'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>RENDER RESULTS</h2>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {tabs.map(tab => (
              <button 
                key={tab}
                className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '13px' }}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <div style={{ padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)', minHeight: '300px' }}>
            {activeTab === 'Overview' && (
              <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <span className="badge badge-success">Success (200 OK)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Render Time:</span>
                  <span>1.4s</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>DOM Size:</span>
                  <span>84 KB</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Resources Loaded:</span>
                  <span>24 / 24</span>
                </div>
              </div>
            )}
            
            {activeTab === 'Screenshot' && (
              <div style={{ width: '100%', height: '300px', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Screenshot Placeholder</span>
              </div>
            )}
            
            {activeTab === 'Differences' && (
              <div style={{ color: 'var(--text-main)', fontSize: '14px' }}>
                <p style={{ marginBottom: '16px', color: 'var(--warning-color)', fontWeight: 500 }}>
                  Content differences detected between Source and Rendered DOM.
                </p>
                <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <li>Title tag was modified by JavaScript.</li>
                  <li>Main content section was injected asynchronously.</li>
                </ul>
              </div>
            )}
            
            {(activeTab === 'Source HTML' || activeTab === 'Rendered HTML') && (
              <pre style={{ overflowX: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
                {`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Example Domain</title>
</head>
<body>
  ...
</body>
</html>`}
              </pre>
            )}
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
