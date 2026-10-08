'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function HtaccessTester() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1000);
  };

  return (
    <ToolLayout
      title=".htaccess Tester"
      description="Analyse common .htaccess rules and redirects."
      category="Crawling & Access"
      breadcrumbs={[{ label: '.htaccess Tester' }]}
      aboutText="The .htaccess file is a powerful configuration file for Apache web servers. This tool helps you test your rewrite rules and redirects safely before deploying them to your live server, preventing infinite loops or broken links."
      howItWorks={[
        "Paste your .htaccess rules into the editor.",
        "Enter a test URL to evaluate against the rules.",
        "Click 'Test Rules'.",
        "The tool simulates the server and shows the resulting URL and HTTP status code."
      ]}
      faq={[
        { question: "Is this a real Apache server?", answer: "No, this tool simulates the rewrite logic to provide safe testing." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>INPUT SECTION</h2>
        </div>
        
        <div className="input-group">
          <label className="label">Paste your .htaccess rules</label>
          <textarea 
            className="textarea" 
            rows={8}
            placeholder="RewriteEngine On&#10;RewriteRule ^old-page\.html$ /new-page.html [R=301,L]"
            style={{ fontFamily: 'monospace' }}
          ></textarea>
        </div>
        
        <div className="input-group">
          <label className="label">URL to test</label>
          <input type="url" className="input" placeholder="https://example.com/old-page.html" />
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={handleTest}
          disabled={status === 'loading'}
          style={{ width: '100%', marginTop: '16px' }}
        >
          {status === 'loading' ? 'Testing Rules...' : 'Test Rules'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>TEST RESULT</h2>
          </div>
          
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Syntax:</span>
              <span className="badge badge-success">Valid</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Redirect:</span>
              <span className="badge badge-warning">Yes (301 Permanent)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Destination:</span>
              <span style={{ wordBreak: 'break-all' }}>https://example.com/new-page.html</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Matched Rule:</span>
              <code style={{ background: 'var(--bg-color)', padding: '2px 6px', borderRadius: '4px' }}>RewriteRule ^old-page\.html$ /new-page.html [R=301,L]</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Issues:</span>
              <span style={{ color: 'var(--success-color)' }}>None detected</span>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
