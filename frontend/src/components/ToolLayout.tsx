import Link from 'next/link';
import React from 'react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface ToolLayoutProps {
  title: string;
  description: string;
  category: string;
  breadcrumbs: Breadcrumb[];
  children: React.ReactNode; 
  aboutText: string;
  howItWorks: string[];
  faq: { question: string; answer: string }[];
  fullWidth?: boolean;
}

const RELATED_TOOLS_MAP: Record<string, { name: string; href: string; desc: string }[]> = {
  'Crawling & Access': [
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Inspect & debug robots.txt rules under RFC 9309.' },
    { name: 'AI Bot Access Tester', href: '/tools/ai-bot-access-tester', desc: 'Check if GPTBot, ClaudeBot, and AI crawlers can access your site.' },
    { name: '.htaccess Tester', href: '/tools/htaccess-tester', desc: 'Simulate Apache rewrite rules and 301 redirects.' },
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate and validate standard XML sitemaps.' }
  ],
  'Rendering & Mobile SEO': [
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'See how Googlebot and crawlers render JavaScript content.' },
    { name: 'Pre-rendering Tester', href: '/tools/prerendering-tester', desc: 'Compare raw HTML vs rendered DOM across user agents.' },
    { name: 'Mobile-First Index Tool', href: '/tools/mobile-first-index', desc: 'Compare desktop and mobile content parity.' },
    { name: 'Mobile-Friendly Test', href: '/tools/mobile-friendly-test', desc: 'Test viewport, touch targets, and mobile usability.' }
  ],
  'International SEO': [
    { name: 'hreflang Tags Tester', href: '/tools/hreflang-tester', desc: 'Validate international hreflang tags and reciprocal return links.' },
    { name: 'Local Search Tool', href: '/tools/local-search', desc: 'Simulate geo-targeted Google search and Maps results.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Inspect crawler rendering and international HTML signals.' }
  ],
  'Local SEO': [
    { name: 'Local Search Tool', href: '/tools/local-search', desc: 'Simulate localized search results using canonical Google UULE.' },
    { name: 'Review Link Generator', href: '/tools/review-link-generator', desc: 'Create direct 5-star Google Review links and QR codes.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview title tags, meta descriptions, and search snippets.' }
  ],
  'Search Appearance & Structured Data': [
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview title and description pixel widths in Google SERPs.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate valid JSON-LD structured data for rich snippets.' },
    { name: 'Schema Checker', href: '/tools/schema-checker', desc: 'Detect and audit schema markup across bulk URLs.' },
    { name: 'Knowledge Graph Search', href: '/tools/knowledge-graph-search', desc: 'Search Google Knowledge Graph entities, schema, and MIDs.' }
  ],
  'Search Appearance': [
    { name: 'Schema Checker', href: '/tools/schema-checker', desc: 'Detect and audit schema markup across bulk URLs.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate valid JSON-LD structured data for rich snippets.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview title and description pixel widths in Google SERPs.' }
  ]
};

export default function ToolLayout({
  title,
  description,
  category,
  breadcrumbs,
  children,
  aboutText,
  howItWorks,
  faq,
  fullWidth = true
}: ToolLayoutProps) {
  // Related tools excluding current tool
  const categoryRelated = RELATED_TOOLS_MAP[category] || RELATED_TOOLS_MAP['Search Appearance & Structured Data'] || [];
  const relatedTools = categoryRelated.filter(t => t.name.toLowerCase() !== title.toLowerCase()).slice(0, 3);

  return (
    <div className="w-full py-4 lg:py-6">
      
      {/* Breadcrumb Navigation & Back Link */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-[var(--im-text-muted)]">
          <ol className="flex items-center flex-wrap gap-1.5 font-medium">
            <li>
              <a href="https://indianmarketers.in/" className="hover:text-[var(--im-heading)] transition-colors">
                Home
              </a>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li>
              <Link href="/tools" className="hover:text-[var(--im-heading)] transition-colors">
                SEO Tools
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li className="font-semibold text-[var(--im-heading)]" aria-current="page">
              {title}
            </li>
          </ol>
        </nav>

        <Link href="/tools" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--im-text-muted)] hover:text-[var(--im-heading)] transition-colors group self-start sm:self-auto">
          <div className="p-1.5 rounded-full bg-[var(--im-surface)] border border-[var(--im-border)] group-hover:border-[var(--im-primary-deep)] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </div>
          Back to all tools
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 sm:mb-8 bg-[var(--im-secondary)] text-[var(--im-on-dark)] p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-3xl shadow-[var(--im-shadow-md)] relative overflow-hidden">
        <div className="inline-block px-3 py-1 rounded-[var(--im-radius-pill)] bg-[var(--im-primary)] text-[var(--im-secondary)] text-[11px] sm:text-xs font-bold uppercase tracking-wider mb-3">
          {category}
        </div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[var(--im-on-dark)] mb-2.5 tracking-tight">{title}</h1>
        <p className="text-sm sm:text-base text-[var(--im-on-dark)]/85 max-w-3xl leading-relaxed">{description}</p>
      </div>

      {/* Main Tool Content */}
      <div className="mb-10 sm:mb-14">
        {children}
      </div>

      {/* Info Section */}
      <div className="grid gap-8 sm:gap-10 bg-[var(--im-surface)] border border-[var(--im-border)] p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-3xl shadow-[var(--im-shadow-sm)] mb-8">
        <section>
          <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
            <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">About this tool</h2>
          </div>
          <p className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base">
            {aboutText}
          </p>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            </div>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">How it works</h2>
          </div>
          <ol className="relative border-l-2 border-[var(--im-border)] ml-3 sm:ml-3.5 space-y-4 sm:space-y-6">
            {howItWorks.map((step, idx) => (
              <li key={idx} className="pl-6 sm:pl-8 relative">
                <span className="absolute -left-3.5 sm:-left-4 top-0.5 w-7 h-7 sm:w-8 sm:h-8 bg-[var(--im-surface)] border-2 border-[var(--im-primary-deep)] rounded-full flex items-center justify-center text-xs font-bold text-[var(--im-secondary)] shadow-xs">
                  {idx + 1}
                </span>
                <p className="text-sm sm:text-base text-[var(--im-text)] pt-0.5 leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {faq.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {faq.map((item, idx) => (
                <div key={idx} className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-1.5 sm:mb-2">{item.question}</h3>
                  <p className="text-[var(--im-text)] text-xs sm:text-base leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Related SEO Tools (Internal Linking) */}
      {relatedTools.length > 0 && (
        <div className="bg-[var(--im-surface)] border border-[var(--im-border)] p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-[var(--im-shadow-sm)]">
          <div className="flex items-center justify-between mb-4 sm:mb-6 border-b border-[var(--im-border)] pb-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[var(--im-heading)]">Related SEO Tools</h2>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] mt-0.5">Explore additional technical SEO utilities in the {category} category.</p>
            </div>
            <Link href="/tools" className="text-xs sm:text-sm font-bold text-[var(--im-primary-deep)] hover:underline hidden sm:inline-block">
              View all 15 tools &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {relatedTools.map((relTool) => (
              <Link
                key={relTool.href}
                href={relTool.href}
                className="group block p-4 rounded-xl border border-[var(--im-border)] hover:border-[var(--im-primary-deep)] bg-[var(--im-bg-soft)] hover:bg-white transition-all shadow-xs"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-sm font-bold text-[var(--im-heading)] group-hover:text-[var(--im-primary-deep)] transition-colors">
                    {relTool.name}
                  </h3>
                  <span className="text-xs text-[var(--im-text-muted)] group-hover:translate-x-0.5 transition-transform">
                    &rarr;
                  </span>
                </div>
                <p className="text-xs text-[var(--im-text-muted)] leading-relaxed">
                  {relTool.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
