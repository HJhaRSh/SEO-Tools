'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function KnowledgeGraphSearch() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1200);
  };

  return (
    <ToolLayout
      title="Knowledge Graph Search"
      description="Search and inspect Google Knowledge Graph entities."
      category="Search Appearance & Structured Data"
      breadcrumbs={[{ label: 'Knowledge Graph Search' }]}
      aboutText="Google's Knowledge Graph organizes information about entities (people, places, organizations, things). This tool lets you search the Knowledge Graph API directly to see how Google categorizes and understands specific entities."
      howItWorks={[
        "Enter the name of an entity (e.g., 'Apple Inc.', 'Elon Musk').",
        "Click 'Search'.",
        "The tool queries the Knowledge Graph API.",
        "It returns the entity's type, description, and official website."
      ]}
      faq={[
        { question: "How do I get my business in the Knowledge Graph?", answer: "Implement Organization schema markup, create a Google Business Profile, get a Wikipedia page, and ensure consistent NAP (Name, Address, Phone) data across the web." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>INPUT SECTION</h2>
        </div>
        
        <div className="input-group">
          <label className="label">Search Entity</label>
          <input type="text" className="input" placeholder="e.g. Indian Marketers, Sundar Pichai" />
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={handleTest}
          disabled={status === 'loading'}
          style={{ width: '100%', marginTop: '16px' }}
        >
          {status === 'loading' ? 'Searching...' : 'Search'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>ENTITY RESULT</h2>
          </div>
          
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flexShrink: 0, width: '120px', height: '120px', backgroundColor: '#f3f4f6', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>Image<br/>Placeholder</span>
            </div>
            
            <div style={{ flex: 1, minWidth: '250px' }}>
              <h3 style={{ fontSize: '24px', marginBottom: '4px', color: 'var(--primary-color)' }}>Example Entity</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <span className="badge badge-neutral">Organization</span>
                <span className="badge badge-neutral">Corporation</span>
              </div>
              
              <p style={{ color: 'var(--text-main)', marginBottom: '16px', lineHeight: 1.6 }}>
                An example entity represents a notable organization, person, or concept that Google has cataloged in its Knowledge Graph. It typically includes a brief description sourced from Wikipedia or other authoritative sources.
              </p>
              
              <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '150px', color: 'var(--text-muted)' }}>Website:</span>
                  <a href="#" style={{ color: 'var(--primary-color)' }}>https://example.com</a>
                </div>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '150px', color: 'var(--text-muted)' }}>Knowledge Graph ID:</span>
                  <code style={{ background: 'var(--bg-color)', padding: '2px 6px', borderRadius: '4px' }}>/m/01234567</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
