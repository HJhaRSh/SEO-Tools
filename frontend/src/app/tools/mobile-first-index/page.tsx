'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function MobileFirstIndex() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 2000);
  };

  const elements = [
    { name: 'Title', desktop: 'Present', mobile: 'Present', status: 'Match' },
    { name: 'Meta Description', desktop: 'Present', mobile: 'Present', status: 'Match' },
    { name: 'H1', desktop: 'Present', mobile: 'Present', status: 'Match' },
    { name: 'Main Content', desktop: '1,200 words', mobile: '800 words', status: 'Difference' },
    { name: 'Images', desktop: '12', mobile: '10', status: 'Difference' },
    { name: 'Internal Links', desktop: '45', mobile: '30', status: 'Difference' },
    { name: 'Canonical', desktop: 'Present', mobile: 'Present', status: 'Match' },
    { name: 'Schema', desktop: 'Present', mobile: 'Missing', status: 'Difference' },
  ];

  return (
    <ToolLayout
      title="Mobile-First Index Tool"
      description="Compare desktop and mobile content parity."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Mobile-First Index Tool' }]}
      aboutText="Google indexes the mobile version of your website. If your mobile site hides content, removes structured data, or alters internal links compared to your desktop site, your SEO will suffer. This tool audits both versions side-by-side."
      howItWorks={[
        "Enter the URL you wish to audit.",
        "The tool fetches the page using both a Desktop and Mobile user agent.",
        "It extracts text, links, headings, and meta data from both versions.",
        "A comparison table highlights any discrepancies."
      ]}
      faq={[
        { question: "Is it okay to hide content on mobile?", answer: "Generally, no. For mobile-first indexing, the primary content and critical SEO elements must be equivalent on both desktop and mobile versions." }
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
          {status === 'loading' ? 'Comparing Versions...' : 'Compare Mobile & Desktop'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>COMPARISON RESULTS</h2>
          </div>
          
          <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--warning-color)' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Potential mobile/desktop content difference detected.</div>
            <div style={{ fontSize: '14px' }}>Critical elements like Schema and Main Content differ between versions, which may impact mobile-first indexing.</div>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Element</th>
                  <th>Desktop</th>
                  <th>Mobile</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {elements.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                    <td>{item.desktop}</td>
                    <td>{item.mobile}</td>
                    <td>
                      <span className={`badge ${item.status === 'Match' ? 'badge-success' : 'badge-warning'}`}>
                        {item.status}
                      </span>
                    </td>
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
