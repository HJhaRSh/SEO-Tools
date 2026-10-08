'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function LocalSearchTool() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1500);
  };

  const results = [
    { position: 1, business: 'Spice Delight Mumbai', rating: '4.8 (1,240)', location: 'Bandra West, Mumbai' },
    { position: 2, business: 'The Bombay Canteen', rating: '4.6 (3,100)', location: 'Lower Parel, Mumbai' },
    { position: 3, business: 'Trishna', rating: '4.5 (2,800)', location: 'Fort, Mumbai' },
  ];

  return (
    <ToolLayout
      title="Local Search Tool"
      description="Simulate local search results for specific locations."
      category="Local SEO"
      breadcrumbs={[{ label: 'Local Search Tool' }]}
      aboutText="Search engine results pages (SERPs) are highly localized. What you see in New York is completely different from what a user sees in Mumbai. This tool simulates a search query from any location to help you understand your local ranking."
      howItWorks={[
        "Enter your target search query.",
        "Specify a geographic location (City or Zip Code).",
        "Click 'Search'.",
        "The tool retrieves the localized Google Search map pack and organic results."
      ]}
      faq={[
        { question: "Why is tracking local search important?", answer: "Over 46% of all Google searches have local intent. If you have a physical storefront, ranking in the local 'Map Pack' is crucial for foot traffic." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>INPUT SECTION</h2>
        </div>
        
        <div className="input-group">
          <label className="label">Search Query</label>
          <input type="text" className="input" placeholder="e.g. best restaurants" />
        </div>
        
        <div className="input-group">
          <label className="label">Location</label>
          <input type="text" className="input" placeholder="e.g. Mumbai" />
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
            <h2 style={{ fontSize: '18px' }}>LOCAL SEARCH RESULTS (MAP PACK)</h2>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Business</th>
                  <th>Rating (Reviews)</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={item.position}>
                    <td style={{ fontWeight: 600 }}>{item.position}</td>
                    <td style={{ fontWeight: 500, color: 'var(--primary-color)' }}>{item.business}</td>
                    <td>
                      <span style={{ color: '#f59e0b', marginRight: '4px' }}>★</span>
                      {item.rating}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{item.location}</td>
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
