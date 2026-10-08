'use client';

import { useState } from 'react';
import Link from 'next/link';

const TOOLS_DATA = [
  {
    category: 'Crawling & Access',
    description: 'Tools to analyse how search engines and crawlers access your website.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
    ),
    tools: [
      { name: 'robots.txt Tester', description: 'Test whether URLs are allowed or blocked by robots.txt.', href: '/tools/robots-txt-tester' },
      { name: 'AI Bot Access Tester', description: 'Check whether AI crawlers can access your website.', href: '/tools/ai-bot-access-tester' },
      { name: '.htaccess Tester', description: 'Analyse common .htaccess rules and redirects.', href: '/tools/htaccess-tester' },
      { name: 'Sitemap Generator', description: 'Generate and analyse XML sitemaps.', href: '/tools/sitemap-generator' }
    ]
  },
  {
    category: 'Rendering & Mobile SEO',
    description: 'Tools for inspecting how search engines render your pages and evaluate mobile friendliness.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
    ),
    tools: [
      { name: 'Fetch & Render', description: 'See your webpage exactly how search engines see it.', href: '/tools/fetch-render' },
      { name: 'Pre-rendering Tester', description: 'Compare source HTML with fully rendered DOM.', href: '/tools/prerendering-tester' },
      { name: 'Mobile-First Index Tool', description: 'Compare desktop and mobile content parity.', href: '/tools/mobile-first-index' },
      { name: 'Mobile-Friendly Test', description: 'Test if a page is optimized for mobile devices.', href: '/tools/mobile-friendly-test' }
    ]
  },
  {
    category: 'International SEO',
    description: 'Tools for analysing multi-language and multi-regional website configurations.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
    ),
    tools: [
      { name: 'hreflang Tags Tester', description: 'Validate hreflang tags for international targeting.', href: '/tools/hreflang-tester' }
    ]
  },
  {
    category: 'Local SEO',
    description: 'Tools to improve your local business visibility.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    ),
    tools: [
      { name: 'Local Search Tool', description: 'Simulate local search results for specific locations.', href: '/tools/local-search' },
      { name: 'Review Link Generator', description: 'Create direct Google Review links for your business.', href: '/tools/review-link-generator' }
    ]
  },
  {
    category: 'Search Appearance & Structured Data',
    description: 'Tools to optimise how your website appears in search results.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" /></svg>
    ),
    tools: [
      { name: 'SERP Simulator', description: 'Preview your title and meta description in search results.', href: '/tools/serp-simulator' },
      { name: 'Knowledge Graph Search', description: 'Search and inspect Google Knowledge Graph entities.', href: '/tools/knowledge-graph-search' },
      { name: 'Schema Markup Generator', description: 'Generate structured data JSON-LD code for your pages.', href: '/tools/schema-generator' }
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
      
        {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-16 relative">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 text-sm font-semibold mb-6 shadow-sm border border-green-100 dark:border-green-800/50">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Indian Marketers Suite
        </div>
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-slate-800 dark:text-white mb-6 leading-tight">
          Professional <span className="text-green-500 relative inline-block">
            SEO Tools
            <span className="absolute bottom-1 left-0 w-full h-1.5 bg-green-500"></span>
          </span>
        </h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-10 leading-relaxed">
          The ultimate collection of free, practical tools to analyse, troubleshoot and drastically improve your website's search performance.
        </p>

        {/* Search Bar */}
        <div className="relative max-w-2xl mx-auto group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-green-500 transition-colors">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input
            type="text"
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 shadow-lg shadow-slate-200/50 dark:shadow-none text-lg transition-all"
            placeholder="Search for an SEO tool..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 justify-center mb-16">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
              activeCategory === cat 
                ? 'bg-slate-800 text-white shadow-md shadow-slate-900/20 dark:bg-green-600 dark:text-white' 
                : 'bg-white text-slate-600 border border-slate-200 hover:border-green-300 hover:text-green-600 hover:bg-green-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Tools Grid */}
      {filteredData.length === 0 ? (
        <div className="text-center py-20 px-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
             <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No tools found</h3>
          <p className="text-slate-500 dark:text-slate-400">We couldn't find anything matching "{searchQuery}". Try a different search term.</p>
        </div>
      ) : (
        <div className="space-y-20">
          {filteredData.map((categoryData, idx) => (
            <div key={categoryData.category} className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-xl">
                  {categoryData.icon}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{categoryData.category}</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{categoryData.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {categoryData.tools.map(tool => (
                  <Link href={tool.href} key={tool.name} className="group block h-full">
                    <div className="h-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-1 transition-all duration-300 flex flex-col relative overflow-hidden">
                      
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/20 dark:to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                        {tool.name}
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 text-sm flex-1 mb-6 leading-relaxed">
                        {tool.description}
                      </p>
                      
                      <div className="mt-auto flex items-center text-sm font-semibold text-green-600 dark:text-green-400 group-hover:gap-2 transition-all">
                        Launch Tool
                        <svg className="w-4 h-4 ml-1 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
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
