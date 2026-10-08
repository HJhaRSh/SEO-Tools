'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function SitemapGenerator() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1500);
  };

  return (
    <ToolLayout
      title="Sitemap Generator"
      description="Generate and analyse XML sitemaps."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'Sitemap Generator' }]}
      aboutText="An XML sitemap helps search engines discover and index the URLs on your website. This tool crawls your site and generates a standard XML sitemap, while also providing analysis on redirect chains or errors found during the crawl."
      howItWorks={[
        "Enter your website's homepage URL.",
        "Optionally set a maximum number of URLs or crawl depth.",
        "Click 'Generate Sitemap'.",
        "Download the resulting XML file or review the crawl statistics."
      ]}
      faq={[
        { question: "How many URLs can this tool crawl?", answer: "Currently, the free version supports up to 500 URLs per generation." }
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
        
        <div className="grid md:grid-cols-2">
          <div className="input-group">
            <label className="label">Maximum URLs (Optional)</label>
            <input type="number" className="input" placeholder="500" />
          </div>
          <div className="input-group">
            <label className="label">Crawl depth (Optional)</label>
            <select className="select">
              <option>No limit</option>
              <option>1 level</option>
              <option>2 levels</option>
              <option>3 levels</option>
            </select>
          </div>
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={handleTest}
          disabled={status === 'loading'}
          style={{ width: '100%', marginTop: '16px' }}
        >
          {status === 'loading' ? 'Generating Sitemap...' : 'Generate Sitemap'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>GENERATION RESULTS</h2>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>
              Download Sitemap
            </button>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4" style={{ gap: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary-color)' }}>124</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>URLs Found</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success-color)' }}>120</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Valid URLs</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning-color)' }}>3</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Redirects</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--error-color)' }}>1</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Errors (404)</div>
            </div>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>URL Sample</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>https://example.com/</td>
                  <td><span className="badge badge-success">200 OK</span></td>
                </tr>
                <tr>
                  <td>https://example.com/about</td>
                  <td><span className="badge badge-success">200 OK</span></td>
                </tr>
                <tr>
                  <td>https://example.com/old-page</td>
                  <td><span className="badge badge-warning">301 Redirect</span></td>
                </tr>
                <tr>
                  <td>https://example.com/broken-link</td>
                  <td><span className="badge badge-error">404 Not Found</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
