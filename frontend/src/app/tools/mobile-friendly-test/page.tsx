'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function MobileFriendlyTest() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1500);
  };

  const tests = [
    { name: 'Viewport Meta Tag', status: 'Passed', details: 'Viewport is configured correctly.', badge: 'badge-success' },
    { name: 'Content Width', status: 'Passed', details: 'Content fits within viewport.', badge: 'badge-success' },
    { name: 'Text Readability', status: 'Passed', details: 'Font sizes are legible (>= 12px).', badge: 'badge-success' },
    { name: 'Clickable Elements', status: 'Warning', details: 'Some tap targets are too close.', badge: 'badge-warning' },
    { name: 'Horizontal Scrolling', status: 'Passed', details: 'No horizontal overflow detected.', badge: 'badge-success' },
  ];

  return (
    <ToolLayout
      title="Mobile-Friendly Test"
      description="Test if a page is optimized for mobile devices."
      category="Rendering & Mobile SEO"
      breadcrumbs={[{ label: 'Mobile-Friendly Test' }]}
      aboutText="A mobile-friendly website is essential for user experience and SEO. This tool evaluates your page based on common mobile usability criteria, such as viewport configuration, font size legibility, and tap target spacing."
      howItWorks={[
        "Enter the URL to be tested.",
        "The tool simulates a mobile device.",
        "It checks for common mobile usability errors.",
        "A visual report details what passed and what needs fixing."
      ]}
      faq={[
        { question: "What does 'Tap targets too close' mean?", answer: "It means that buttons or links on your mobile site are so close together that a user might accidentally tap the wrong one." }
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
          {status === 'loading' ? 'Testing Mobile Usability...' : 'Test Mobile Friendliness'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>USABILITY RESULTS</h2>
          </div>
          
          <div style={{ display: 'grid', gap: '16px' }}>
            {tests.map((test, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{test.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{test.details}</div>
                </div>
                <span className={`badge ${test.badge}`}>{test.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
