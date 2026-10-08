'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';

export default function SchemaGenerator() {
  const [schemaType, setSchemaType] = useState('Organization');

  return (
    <ToolLayout
      title="Schema Markup Generator"
      description="Generate structured data JSON-LD code for your pages."
      category="Search Appearance & Structured Data"
      breadcrumbs={[{ label: 'Schema Markup Generator' }]}
      aboutText="Structured data helps search engines understand the context of your content, leading to Rich Snippets (like review stars or event details) in search results. This tool generates valid JSON-LD code that you can copy and paste into your HTML."
      howItWorks={[
        "Select the type of Schema you want to create.",
        "Fill out the required form fields.",
        "The JSON-LD code is generated in real-time.",
        "Copy the code and paste it into the <head> of your webpage."
      ]}
      faq={[
        { question: "What is JSON-LD?", answer: "JSON-LD (JavaScript Object Notation for Linked Data) is the format recommended by Google for implementing structured data." }
      ]}
    >
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>INPUT SECTION</h2>
        </div>
        
        <div className="input-group">
          <label className="label">Schema Type</label>
          <select 
            className="select"
            value={schemaType}
            onChange={(e) => setSchemaType(e.target.value)}
          >
            <option>Organization</option>
            <option>LocalBusiness</option>
            <option>Product</option>
            <option>Article</option>
            <option>FAQPage</option>
            <option>BreadcrumbList</option>
            <option>Service</option>
            <option>Event</option>
            <option>Person</option>
            <option>WebSite</option>
          </select>
        </div>
        
        {schemaType === 'Organization' && (
          <div className="grid md:grid-cols-2" style={{ gap: '16px', marginTop: '24px' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="label">Name</label>
              <input type="text" className="input" placeholder="Indian Marketers" />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="label">URL</label>
              <input type="url" className="input" placeholder="https://indianmarketers.in" />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="label">Logo URL</label>
              <input type="url" className="input" placeholder="https://indianmarketers.in/logo.png" />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="label">Description</label>
              <input type="text" className="input" placeholder="SEO Agency" />
            </div>
            <div className="input-group md:col-span-2" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              <label className="label">SameAs (Social Profiles)</label>
              <textarea className="textarea" rows={3} placeholder="https://twitter.com/indianmarketers&#10;https://linkedin.com/company/indianmarketers"></textarea>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px' }}>GENERATED SCHEMA</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>Download</button>
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }}>Copy Code</button>
          </div>
        </div>
        
        <pre style={{ backgroundColor: 'var(--secondary-color)', color: '#e5e7eb', padding: '24px', borderRadius: 'var(--radius-md)', overflowX: 'auto', fontSize: '14px', fontFamily: 'monospace' }}>
{`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "${schemaType}",
  "name": "Indian Marketers",
  "url": "https://indianmarketers.in",
  "logo": "https://indianmarketers.in/logo.png",
  "description": "SEO Agency",
  "sameAs": [
    "https://twitter.com/indianmarketers",
    "https://linkedin.com/company/indianmarketers"
  ]
}
</script>`}
        </pre>
      </div>
    </ToolLayout>
  );
}
