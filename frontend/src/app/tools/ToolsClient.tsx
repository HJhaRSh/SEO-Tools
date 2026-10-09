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
      { name: 'robots.txt Tester', description: 'Test whether URLs are allowed or blocked by robots.txt under official RFC 9309 rules with live editor and sitemap checks.', href: '/tools/robots-txt-tester', badge: 'Active' },
      { name: 'AI Bot Access Tester', description: 'Check whether AI crawlers like GPTBot, ClaudeBot, and PerplexityBot can access your website.', href: '/tools/ai-bot-access-tester' },
      { name: '.htaccess Tester', description: 'Analyse common Apache .htaccess rewrite rules, HTTPS redirects, and header directives.', href: '/tools/htaccess-tester' },
      { name: 'Sitemap Generator', description: 'Generate and validate XML sitemaps to ensure search engine indexation coverage.', href: '/tools/sitemap-generator' }
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
      { name: 'Schema Markup Generator', description: 'Generate valid JSON-LD structured data code for Organizations, Articles, FAQs, and Products.', href: '/tools/schema-generator' }
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
    <div className="w-full pt-2 pb-10">
      
      {/* Hero Section */}
      <div className="text-center max-w-4xl mx-auto mb-10 relative">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 dark:text-white mb-4 leading-tight">
          Professional <span className="text-green-600 relative inline-block">
            SEO Tools
            <span className="absolute bottom-1 left-0 w-full h-2 bg-green-500/30 -z-10 rounded"></span>
          </span>
        </h1>
        <p className="text-xl sm:text-2xl text-slate-700 dark:text-slate-300 mb-8 leading-relaxed font-normal">
          The ultimate suite of production-grade SEO tools to test crawlability, debug technical indexing issues, and boost search performance.
        </p>

        {/* Search Bar */}
        <div className="relative max-w-2xl mx-auto group">
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-green-600 transition-colors">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input
            type="text"
            className="w-full pl-14 pr-5 py-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 focus:border-green-600 focus:ring-4 focus:ring-green-500/20 shadow-md text-lg text-slate-900 dark:text-white font-medium transition-all placeholder:text-slate-400"
            placeholder="Search for an SEO tool (e.g. robots.txt, sitemap, hreflang)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2.5 justify-center mb-10">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-6 py-3 rounded-full text-base font-bold transition-all duration-300 cursor-pointer ${
              activeCategory === cat 
                ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20 dark:bg-green-600 dark:text-white ring-2 ring-slate-900' 
                : 'bg-white text-slate-700 border border-slate-300 hover:border-green-500 hover:text-green-700 hover:bg-green-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Tools Grid */}
      {filteredData.length === 0 ? (
        <div className="text-center py-20 px-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-5">
             <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">No tools found</h3>
          <p className="text-slate-600 dark:text-slate-400 text-base">We couldn&apos;t find anything matching &quot;{searchQuery}&quot;. Try a different search term.</p>
        </div>
      ) : (
        <div className="space-y-16">
          {filteredData.map((categoryData) => (
            <div key={categoryData.category} className="space-y-6">
              
              <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded-2xl">
                  {categoryData.icon}
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">{categoryData.category}</h2>
                  <p className="text-slate-600 dark:text-slate-400 text-base mt-1">{categoryData.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {categoryData.tools.map(tool => (
                  <Link href={tool.href} key={tool.name} className="group block h-full">
                    <div className="h-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 p-7 sm:p-8 shadow-sm hover:shadow-xl hover:border-green-500 hover:-translate-y-1 transition-all duration-300 flex flex-col relative overflow-hidden">
                      
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors">
                          {tool.name}
                        </h3>
                        {tool.badge && (
                          <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-black rounded-full uppercase tracking-wider border border-green-300">
                            {tool.badge}
                          </span>
                        )}
                      </div>

                      <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg flex-1 mb-6 leading-relaxed font-normal">
                        {tool.description}
                      </p>
                      
                      <div className="mt-auto pt-4 border-t border-slate-100 flex items-center text-base font-bold text-green-700 dark:text-green-400 group-hover:gap-2.5 transition-all">
                        Launch Tool
                        <svg className="w-5 h-5 ml-1 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
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
