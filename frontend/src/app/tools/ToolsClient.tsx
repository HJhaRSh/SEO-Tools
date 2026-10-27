'use client';

import { useState } from 'react';
import Link from 'next/link';

const TOOLS_DATA = [
  {
    category: 'Crawling & Access',
    description: 'Tools to analyse how search engines and AI crawlers access your website.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
    ),
    tools: [
      { name: 'robots.txt Tester', description: 'Test whether URLs are allowed or blocked by robots.txt under official RFC 9309 rules with live editor and sitemap checks.', href: '/tools/robots-txt-tester' },
      { name: 'AI Bot Access Tester', description: 'Check whether AI crawlers like GPTBot, ClaudeBot, and PerplexityBot can access your website.', href: '/tools/ai-bot-access-tester' },
      { name: '.htaccess Tester', description: 'Analyse common Apache .htaccess rewrite rules, HTTPS redirects, and header directives.', href: '/tools/htaccess-tester' },
      { name: 'Sitemap Generator', description: 'Generate and validate XML sitemaps to ensure search engine indexation coverage.', href: '/tools/sitemap-generator' },
      { name: 'Domain Age Checker', description: 'Check domain registration age, creation date, expiry details, and more for single or multiple domains.', href: '/tools/domain-age-checker' },
      { name: 'Bulk Google Index Checker', description: "Check Google's indexing status for multiple URLs with Search Console and view live meta titles and descriptions.", href: '/tools/bulk-google-index-checker' }
    ]
  },
  {
    category: 'Rendering & Mobile SEO',
    description: 'Tools for inspecting how search engines render your pages and evaluate mobile friendliness.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
    ),
    tools: [
      { name: 'Fetch & Render', description: 'See your webpage exactly how Google and other search engine bots render JavaScript content.', href: '/tools/fetch-render' },
      { name: 'Pre-rendering Tester', description: 'Compare raw server-side source HTML with the fully rendered JavaScript DOM.', href: '/tools/prerendering-tester' },
      { name: 'Mobile-First Index Tool', description: 'Compare desktop and mobile content parity to prevent ranking drops.', href: '/tools/mobile-first-index' },
      { name: 'Mobile-Friendly Test', description: 'Test if a page viewport, touch elements, and text sizes are optimized for smartphones.', href: '/tools/mobile-friendly-test' }
    ]
  },
  {
    category: 'International SEO',
    description: 'Tools for analysing multi-language and multi-regional website configurations.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
    ),
    tools: [
      { name: 'hreflang Tags Tester', description: 'Validate hreflang annotations, language codes, and bidirectional self-referencing tags.', href: '/tools/hreflang-tester' }
    ]
  },
  {
    category: 'Local SEO',
    description: 'Tools to improve your local business visibility.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    ),
    tools: [
      { name: 'Local Search Tool', description: 'Simulate localized search engine results pages from specific geographic coordinates and postal codes.', href: '/tools/local-search' },
      { name: 'Review Link Generator', description: 'Create direct, frictionless Google Business Review links for your customers.', href: '/tools/review-link-generator' }
    ]
  },
  {
    category: 'Search Appearance & Structured Data',
    description: 'Tools to optimise how your website appears in search results.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" /></svg>
    ),
    tools: [
      { name: 'SERP Simulator', description: 'Preview title tags, meta descriptions, and rich snippets across desktop and mobile displays.', href: '/tools/serp-simulator' },
      { name: 'Knowledge Graph Search', description: 'Inspect Google Knowledge Graph entities, schema types, and topic authority scores.', href: '/tools/knowledge-graph-search' },
      { name: 'Schema Markup Generator', description: 'Generate valid JSON-LD structured data code for Organizations, Articles, FAQs, and Products.', href: '/tools/schema-generator' },
      { name: 'Schema Checker', description: 'Check schema presence and detected schema types across single or bulk URLs.', href: '/tools/schema-checker' }
    ]
  }
];

export default function ToolsClient() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = ['All', ...TOOLS_DATA.map(c => c.category)];

  const filteredData = TOOLS_DATA.map(categoryData => {
    if (activeCategory !== 'All' && categoryData.category !== activeCategory) {
      return { ...categoryData, tools: [] };
    }

    const filteredTools = categoryData.tools.filter(tool => 
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      tool.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      ...categoryData,
      tools: filteredTools
    };
  }).filter(categoryData => categoryData.tools.length > 0);

  return (
    <div className="w-full pb-10">
      
      {/* Header & Search Bar */}
      <div className="text-center max-w-3xl mx-auto mb-5 sm:mb-6 px-1">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[var(--im-heading)] mb-3 sm:mb-4">
          Professional <span className="text-[var(--im-primary)]">SEO Tools</span>
        </h1>

        {/* Search Bar */}
        <div className="relative max-w-2xl mx-auto group">
          <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-5 flex items-center pointer-events-none text-[var(--im-text-muted)] group-focus-within:text-[var(--im-primary-deep)] transition-colors">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            className="w-full pl-11 sm:pl-14 pr-4 sm:pr-5 py-3 sm:py-3.5 rounded-[var(--im-radius-md)] bg-[var(--im-surface)] border border-[var(--im-border)] focus:border-[var(--im-primary)] focus:ring-4 focus:ring-[var(--im-accent-tint)] shadow-[var(--im-shadow-sm)] text-base text-[var(--im-text)] font-medium transition-all placeholder:text-[var(--im-text-muted)] focus:outline-none"
            placeholder="Search for an SEO tool (e.g. robots.txt, sitemap, hreflang)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category Tabs: Swipeable on mobile, wrapped & centered on desktop */}
      <div className="flex items-center gap-2 overflow-x-auto touch-scroll scrollbar-none py-1.5 px-2 -mx-3.5 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center mb-6 sm:mb-8">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`whitespace-nowrap px-4 py-2 sm:px-5 sm:py-2.5 rounded-[var(--im-radius-pill)] text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer shrink-0 ${
              activeCategory === cat 
                ? 'bg-[#47A048] text-white shadow-sm ring-1 ring-[#47A048]' 
                : 'bg-[var(--im-surface)] text-[var(--im-text)] border border-[var(--im-border)] hover:border-[#47A048] hover:bg-[var(--im-bg-soft)]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Tools Grid */}
      {filteredData.length === 0 ? (
        <div className="text-center py-12 sm:py-16 px-5 bg-[var(--im-surface)] rounded-[var(--im-radius-md)] border border-[var(--im-border)] shadow-[var(--im-shadow-sm)] max-w-2xl mx-auto">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[var(--im-bg-soft)] rounded-full flex items-center justify-center mx-auto mb-3.5 border border-[var(--im-border)]">
             <svg className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--im-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-[var(--im-heading)] mb-1.5">No tools found</h3>
          <p className="text-[var(--im-text-muted)] text-sm sm:text-base">We couldn&apos;t find anything matching &quot;{searchQuery}&quot;. Try a different search term.</p>
        </div>
      ) : (
        <div className="space-y-10 sm:space-y-16">
          {filteredData.map((categoryData) => (
            <div key={categoryData.category} className="space-y-4 sm:space-y-6">
              
              <div className="flex items-center gap-3 sm:gap-4 border-b border-[var(--im-border)] pb-3 sm:pb-4">
                <div className="p-2.5 sm:p-3 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-xl">
                  {categoryData.icon}
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-[var(--im-heading)] tracking-tight">{categoryData.category}</h2>
                  <p className="text-[var(--im-text-muted)] text-xs sm:text-sm mt-0.5">{categoryData.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                {categoryData.tools.map(tool => (
                  <Link href={tool.href} key={tool.name} className="group block h-full">
                    <div className="h-full bg-[var(--im-surface)] rounded-2xl border border-[var(--im-border)] p-5 sm:p-7 shadow-[var(--im-shadow-sm)] hover:shadow-[var(--im-shadow-md)] hover:border-[var(--im-primary-deep)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col relative overflow-hidden">
                      
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="text-lg font-semibold text-[var(--im-heading)] group-hover:text-[var(--im-primary-deep)] transition-colors">
                          {tool.name}
                        </h3>
                      </div>

                      <p className="text-[var(--im-text)] text-sm leading-relaxed flex-1 mb-5 font-normal">
                        {tool.description}
                      </p>
                      
                      <div className="mt-auto pt-4 border-t border-[var(--im-border)] flex items-center text-sm font-semibold text-[var(--im-heading)] group-hover:text-[var(--im-primary-deep)] group-hover:gap-2 transition-all">
                        Launch Tool
                        <svg className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1 text-[var(--im-primary-deep)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
