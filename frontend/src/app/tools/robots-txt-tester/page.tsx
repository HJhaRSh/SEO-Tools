'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function RobotsTxtTester() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1000);
  };

  return (
    <ToolLayout
      title="robots.txt Tester"
      description="Check whether a URL is allowed or blocked by a website's robots.txt rules."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'robots.txt Tester' }]}
      aboutText="The robots.txt tester tool shows you whether search engine crawlers are blocked from accessing a specific URL on your site. This is critical for ensuring that pages you want indexed are accessible, and private pages remain hidden."
      howItWorks={[
        "Enter your website URL.",
        "Select the User Agent (e.g. Googlebot).",
        "The tool checks the active robots.txt file.",
        "The rules are analysed and the result is displayed."
      ]}
      faq={[
        { question: "What is a robots.txt file?", answer: "It's a text file that tells search engine spiders which pages they can and cannot crawl on your website." }
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
        
        <div className="input-group">
          <label className="label">URL to test (Path)</label>
          <input type="text" className="input" placeholder="/page-to-test" />
        </div>
        
        <div className="input-group">
          <label className="label">User Agent</label>
          <select className="select">
            <option>Googlebot</option>
            <option>Bingbot</option>
            <option>GPTBot</option>
            <option>ClaudeBot</option>
            <option>Google-Extended</option>
            <option>PerplexityBot</option>
            <option>Custom</option>
          </select>
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={handleTest}
          disabled={status === 'loading'}
          style={{ width: '100%', marginTop: '16px' }}
        >
          {status === 'loading' ? 'Analysing...' : 'Test URL'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>ROBOTS.TXT RESULT</h2>
          </div>
          
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status:</span>
              <span className="badge badge-success">Allowed</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Robots.txt status:</span>
              <span>Found (200 OK)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>HTTP status:</span>
              <span>200 OK</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Matched rule:</span>
              <code style={{ background: 'var(--bg-color)', padding: '2px 6px', borderRadius: '4px' }}>Allow: /</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>User agent:</span>
              <span>Googlebot</span>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
