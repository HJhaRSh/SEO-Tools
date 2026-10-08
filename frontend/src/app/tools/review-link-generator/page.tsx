'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function ReviewLinkGenerator() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1000);
  };

  return (
    <ToolLayout
      title="Review Link Generator"
      description="Create direct Google Review links for your business."
      category="Local SEO"
      breadcrumbs={[{ label: 'Review Link Generator' }]}
      aboutText="Getting customers to leave a Google Review can be difficult if the process involves too many steps. This tool generates a direct link that opens exactly on the 'Write a Review' modal for your Google Business Profile."
      howItWorks={[
        "Start typing your business name in the input field.",
        "Select your business from the Google Maps autocomplete suggestions.",
        "Click 'Generate Review Link'.",
        "Copy the short link and share it with your customers via email, SMS, or QR code."
      ]}
      faq={[
        { question: "Why do I need a special link?", answer: "It removes friction. The link goes straight to the 5-star rating popup, making it much easier for customers to leave a review quickly." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>INPUT SECTION</h2>
        </div>
        
        <div className="input-group">
          <label className="label">Business Name</label>
          <input type="text" className="input" placeholder="e.g. Indian Marketers" />
        </div>
        
        <div className="input-group">
          <label className="label">Location / Place ID</label>
          <input type="text" className="input" placeholder="e.g. Mumbai or ChIJxyz123" />
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={handleTest}
          disabled={status === 'loading'}
          style={{ width: '100%', marginTop: '16px' }}
        >
          {status === 'loading' ? 'Generating...' : 'Generate Review Link'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>GENERATED LINK</h2>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <label className="label">Google Review Link</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input 
                type="text" 
                className="input" 
                readOnly 
                value="https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4" 
                style={{ backgroundColor: 'var(--bg-color)', color: 'var(--primary-color)' }}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary">
              <svg style={{ marginRight: '8px' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy Link
            </button>
            <button className="btn btn-secondary">
              Open Link
            </button>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
