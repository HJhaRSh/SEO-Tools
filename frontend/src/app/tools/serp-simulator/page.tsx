'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function SerpSimulator() {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  
  const titleLength = title.length;
  const descLength = desc.length;
  
  const titleWarning = titleLength > 60;
  const descWarning = descLength > 155;

  return (
    <ToolLayout
      title="SERP Simulator"
      description="Preview your title and meta description in search results."
      category="Search Appearance & Structured Data"
      breadcrumbs={[{ label: 'SERP Simulator' }]}
      aboutText="The Search Engine Results Page (SERP) is your first opportunity to attract a user. This tool helps you write optimal Title tags and Meta Descriptions by showing you exactly how they will look in Google Search, ensuring they aren't truncated."
      howItWorks={[
        "Type your target SEO Title.",
        "Enter the URL of your page.",
        "Write your Meta Description.",
        "Watch the real-time preview update for both Desktop and Mobile."
      ]}
      faq={[
        { question: "Why is my title truncated?", answer: "Google limits titles based on pixel width, typically around 600px. As a rule of thumb, titles longer than 60 characters are likely to be truncated." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>INPUT SECTION</h2>
        </div>
        
        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label className="label" style={{ marginBottom: 0 }}>SEO Title</label>
            <span style={{ fontSize: '12px', color: titleWarning ? 'var(--error-color)' : 'var(--text-muted)' }}>
              {titleLength} / ~60 chars
            </span>
          </div>
          <input 
            type="text" 
            className="input" 
            placeholder="Enter your page title" 
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          {titleWarning && <div style={{ fontSize: '12px', color: 'var(--error-color)', marginTop: '4px' }}>Title may be truncated.</div>}
        </div>
        
        <div className="input-group">
          <label className="label">URL</label>
          <input 
            type="url" 
            className="input" 
            placeholder="https://example.com/your-page" 
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
        </div>
        
        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label className="label" style={{ marginBottom: 0 }}>Meta Description</label>
            <span style={{ fontSize: '12px', color: descWarning ? 'var(--error-color)' : 'var(--text-muted)' }}>
              {descLength} / ~155 chars
            </span>
          </div>
          <textarea 
            className="textarea" 
            rows={3} 
            placeholder="Write a compelling meta description..."
            value={desc}
            onChange={e => setDesc(e.target.value)}
          ></textarea>
          {descWarning && <div style={{ fontSize: '12px', color: 'var(--error-color)', marginTop: '4px' }}>Description may be truncated.</div>}
        </div>
      </div>

      <div className="card">
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>SERP PREVIEW</h2>
        </div>
        
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desktop Preview</h3>
          <div style={{ maxWidth: '600px', backgroundColor: '#fff', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ width: '28px', height: '28px', backgroundColor: '#f1f3f4', borderRadius: '50%', marginRight: '12px' }}></div>
              <div>
                <div style={{ fontSize: '14px', color: '#202124', lineHeight: 1.2 }}>Example Brand</div>
                <div style={{ fontSize: '12px', color: '#4d5156' }}>{url || 'https://example.com'}</div>
              </div>
            </div>
            <div style={{ fontSize: '20px', color: '#1a0dab', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title || 'Example Title for Your Webpage'}
            </div>
            <div style={{ fontSize: '14px', color: '#4d5156', lineHeight: 1.58, wordBreak: 'break-word' }}>
              {desc || 'This is an example of a meta description. It should be concise and compelling, summarizing the content of the page and encouraging users to click.'}
            </div>
          </div>
        </div>
        
        <div>
          <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mobile Preview</h3>
          <div style={{ maxWidth: '375px', backgroundColor: '#fff', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ width: '24px', height: '24px', backgroundColor: '#f1f3f4', borderRadius: '50%', marginRight: '8px' }}></div>
              <div style={{ fontSize: '12px', color: '#202124' }}>
                <span style={{ fontWeight: 'bold' }}>Example Brand</span><br/>
                <span style={{ color: '#4d5156' }}>{url || 'example.com'}</span>
              </div>
            </div>
            <div style={{ fontSize: '18px', color: '#1a0dab', marginBottom: '4px', lineHeight: 1.3 }}>
              {title || 'Example Title for Your Webpage'}
            </div>
            <div style={{ fontSize: '14px', color: '#4d5156', lineHeight: 1.58 }}>
              {desc || 'This is an example of a meta description. It should be concise and compelling, summarizing the content of the page.'}
            </div>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
