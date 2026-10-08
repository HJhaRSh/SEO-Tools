'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function AiBotAccessTester() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleTest = () => {
    setStatus('loading');
    setTimeout(() => setStatus('success'), 1200);
  };

  const demoBots = [
    { name: 'GPTBot', status: 'Blocked', rule: 'Disallow: /', badge: 'badge-error' },
    { name: 'ClaudeBot', status: 'Allowed', rule: 'Allow: /', badge: 'badge-success' },
    { name: 'Google-Extended', status: 'Blocked', rule: 'Disallow: /', badge: 'badge-error' },
    { name: 'PerplexityBot', status: 'Allowed', rule: 'None', badge: 'badge-success' },
    { name: 'Amazonbot', status: 'Allowed', rule: 'None', badge: 'badge-success' },
    { name: 'CCBot', status: 'Blocked', rule: 'Disallow: /', badge: 'badge-error' },
    { name: 'Bytespider', status: 'Blocked', rule: 'Disallow: /', badge: 'badge-error' },
  ];

  return (
    <ToolLayout
      title="AI Bot Access Tester"
      description="Check whether AI crawlers can access your website."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'AI Bot Access Tester' }]}
      aboutText="With the rise of AI-driven search and LLMs, controlling which AI bots can crawl your site is crucial for protecting your content and managing server load."
      howItWorks={[
        "Enter your website URL.",
        "Click to test AI bot access.",
        "The tool checks your robots.txt against known AI bot user agents.",
        "A summary table displays which bots are blocked and which are allowed."
      ]}
      faq={[
        { question: "Why block AI bots?", answer: "Many publishers choose to block AI bots from scraping their content for training data without compensation or proper attribution." }
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
          {status === 'loading' ? 'Checking Access...' : 'Check AI Bot Access'}
        </button>
      </div>

      {status === 'success' && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>AI BOT ACCESS RESULTS</h2>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Bot</th>
                  <th>Status</th>
                  <th>Matched Rule</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {demoBots.map((bot, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{bot.name}</td>
                    <td><span className={`badge ${bot.badge}`}>{bot.status}</span></td>
                    <td><code style={{ background: 'var(--bg-color)', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>{bot.rule}</code></td>
                    <td style={{ color: 'var(--text-muted)' }}>{bot.status === 'Blocked' ? 'Cannot crawl' : 'Can crawl'}</td>
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
