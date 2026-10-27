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
  aboutText: React.ReactNode;
  howItWorks: (string | React.ReactNode)[];
  faq: { question: string; answer: string }[];
  fullWidth?: boolean;
  relatedTools?: { name: string; href: string; desc: string }[];
}

const TOOL_SPECIFIC_RELATED_MAP: Record<string, { name: string; href: string; desc: string }[]> = {
  'robots.txt tester': [
    { name: 'AI Bot Access Tester', href: '/tools/ai-bot-access-tester', desc: 'Verify whether AI crawlers like GPTBot and ClaudeBot can access your site.' },
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Create and validate clean XML sitemaps to declare crawlable URLs.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Inspect how crawlers render pages and detect blocked subresources (CSS/JS).' }
  ],
  'ai bot access tester': [
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Inspect RFC 9309 rules, specificity tie-breaking, and live robots.txt directives.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Simulate bot rendering and inspect HTTP response headers across user agents.' },
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: 'Review Google Search Console index status for URLs permitted or blocked for crawlers.' }
  ],
  '.htaccess tester': [
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Verify that your Apache 301 redirects and rewritten URLs return clean HTTP status.' },
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate an updated XML sitemap reflecting your canonical and rewritten URL structure.' },
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Ensure crawler access directives match your server redirect configurations.' }
  ],
  'sitemap generator': [
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Check that your sitemap URLs and sitemap declaration header are crawlable by bots.' },
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: "Inspect Google's actual index coverage status for URLs submitted in your sitemap." },
    { name: 'hreflang Tags Tester', href: '/tools/hreflang-tester', desc: 'Verify that multilingual sitemap entries have valid ISO language codes and return tags.' }
  ],
  'xml sitemap generator': [
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Check that your sitemap URLs and sitemap declaration header are crawlable by bots.' },
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: "Inspect Google's actual index coverage status for URLs submitted in your sitemap." },
    { name: 'hreflang Tags Tester', href: '/tools/hreflang-tester', desc: 'Verify that multilingual sitemap entries have valid ISO language codes and return tags.' }
  ],
  'fetch & render': [
    { name: 'Pre-rendering Tester', href: '/tools/prerendering-tester', desc: 'Compare initial server HTML against the fully executed client-side JavaScript DOM.' },
    { name: 'Mobile-First Index Tool', href: '/tools/mobile-first-index', desc: 'Audit content and SEO signal parity between desktop and mobile versions of your page.' },
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Identify whether any critical CSS, script, or image resources are blocked from crawlers.' }
  ],
  'pre-rendering tester': [
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Render JavaScript-heavy pages in headless Chromium and capture visual DOM snapshots.' },
    { name: 'Mobile-Friendly Test', href: '/tools/mobile-friendly-test', desc: 'Evaluate mobile layout responsiveness, viewport configuration, and touch elements.' },
    { name: 'Mobile-First Index Tool', href: '/tools/mobile-first-index', desc: 'Audit heading, canonical, and structured data parity between mobile and desktop bots.' }
  ],
  'mobile-first index tool': [
    { name: 'Mobile-Friendly Test', href: '/tools/mobile-friendly-test', desc: 'Test viewport meta tag settings, touch target spacing, and font readability on smartphones.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Inspect how search bots execute client-side scripts and render responsive components.' },
    { name: 'Pre-rendering Tester', href: '/tools/prerendering-tester', desc: 'Detect server response differences across mobile Googlebot and desktop user agents.' }
  ],
  'mobile-friendly test': [
    { name: 'Mobile-First Index Tool', href: '/tools/mobile-first-index', desc: 'Check content, heading, and structured data parity across desktop and mobile Googlebot.' },
    { name: 'Pre-rendering Tester', href: '/tools/prerendering-tester', desc: 'Compare initial source markup against rendered DOM across user agents.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Simulate Googlebot Smartphone browser execution and capture rendering screenshots.' }
  ],
  'hreflang tags tester': [
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate valid multilingual XML sitemaps with XHTML alternate namespace tags.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Verify that international head tags and hreflang annotations render in initial HTML.' },
    { name: 'Local Search Tool', href: '/tools/local-search', desc: 'Simulate location-specific search engine results pages across target international countries.' }
  ],
  'local search tool': [
    { name: 'Review Link Generator', href: '/tools/review-link-generator', desc: 'Create direct 5-star Google review links and printable QR codes for local customers.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how local business title tags and meta descriptions appear in Google search results.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate LocalBusiness structured data to help search engines understand your address.' }
  ],
  'local search results tool': [
    { name: 'Review Link Generator', href: '/tools/review-link-generator', desc: 'Create direct 5-star Google review links and printable QR codes for local customers.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how local business title tags and meta descriptions appear in Google search results.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate LocalBusiness structured data to help search engines understand your address.' }
  ],
  'review link generator': [
    { name: 'Local Search Tool', href: '/tools/local-search', desc: 'Audit localized Google Search and Google Maps results from specific city locations.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how your business snippet and review rating stars display in Google SERPs.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate LocalBusiness JSON-LD markup to reinforce local business identity.' }
  ],
  'google review link generator': [
    { name: 'Local Search Tool', href: '/tools/local-search', desc: 'Audit localized Google Search and Google Maps results from specific city locations.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how your business snippet and review rating stars display in Google SERPs.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate LocalBusiness JSON-LD markup to reinforce local business identity.' }
  ],
  'serp simulator': [
    { name: 'Schema Checker', href: '/tools/schema-checker', desc: 'Detect structured data types on your page that unlock rich snippets in Google search results.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Create valid JSON-LD schema markup to earn star ratings, FAQs, and event enhancements.' },
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: 'Review live page titles and descriptions alongside actual Google Search Console index status.' }
  ],
  'knowledge graph search': [
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate Organization or Person JSON-LD markup referencing your official Google Entity MID.' },
    { name: 'Schema Checker', href: '/tools/schema-checker', desc: 'Audit your live pages to confirm that entity structured data is detected in source HTML.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how brand entity titles and descriptions appear in desktop and mobile Google search.' }
  ],
  'schema markup generator': [
    { name: 'Schema Checker', href: '/tools/schema-checker', desc: 'Validate and detect structured data markup across single pages or bulk URLs up to 100 pages.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how rich snippet enhancements (like star ratings and publication dates) appear in SERPs.' },
    { name: 'Knowledge Graph Search', href: '/tools/knowledge-graph-search', desc: "Search Google's Knowledge Graph to find official Entity Machine IDs (MIDs) for your schema." }
  ],
  'schema checker': [
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Create valid Schema.org JSON-LD structured data for rich snippet eligibility.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how detected schema features like review stars affect search snippet appearance.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Check whether structured data is rendered in initial HTML or injected dynamically by JavaScript.' }
  ],
  'bulk schema checker': [
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Create valid Schema.org JSON-LD structured data for rich snippet eligibility.' },
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview how detected schema features like review stars affect search snippet appearance.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Check whether structured data is rendered in initial HTML or injected dynamically by JavaScript.' }
  ],
  'domain age checker': [
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: 'Inspect Google Search Console indexing coverage for URLs on newly registered or aged domains.' },
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate standard XML sitemaps to accelerate crawl discovery for fresh domain assets.' },
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Ensure newly acquired or restructured domains have clean crawler access directives.' }
  ],
  'free domain age checker online': [
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: 'Inspect Google Search Console indexing coverage for URLs on newly registered or aged domains.' },
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate standard XML sitemaps to accelerate crawl discovery for fresh domain assets.' },
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Ensure newly acquired or restructured domains have clean crawler access directives.' }
  ],
  'bulk google index checker': [
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate and format XML sitemaps to submit unindexed URLs to Google Search Console.' },
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Verify that URLs reported as Not Indexed or Crawl Anomaly are not blocked in robots.txt.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'Inspect whether JavaScript rendering discrepancies prevent Googlebot from indexing page content.' }
  ]
};

const RELATED_TOOLS_MAP: Record<string, { name: string; href: string; desc: string }[]> = {
  'Crawling & Access': [
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Inspect & debug robots.txt rules under RFC 9309.' },
    { name: 'AI Bot Access Tester', href: '/tools/ai-bot-access-tester', desc: 'Check if GPTBot, ClaudeBot, and AI crawlers can access your site.' },
    { name: '.htaccess Tester', href: '/tools/htaccess-tester', desc: 'Simulate Apache rewrite rules and 301 redirects.' },
    { name: 'Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate and validate standard XML sitemaps.' },
    { name: 'Domain Age Checker', href: '/tools/domain-age-checker', desc: 'Check domain registration age, creation date, and expiry details.' },
    { name: 'Bulk Google Index Checker', href: '/tools/bulk-google-index-checker', desc: "Check Google's indexing status for multiple URLs with Search Console and view live meta titles and descriptions." }
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
  'Search Appearance': [
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview title and description pixel widths in Google SERPs.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate valid JSON-LD structured data for rich snippets.' },
    { name: 'Schema Checker', href: '/tools/schema-checker', desc: 'Detect and audit schema markup across bulk URLs.' },
    { name: 'Knowledge Graph Search', href: '/tools/knowledge-graph-search', desc: 'Search Google Knowledge Graph entities, schema, and MIDs.' }
  ],
  'Search Appearance & Structured Data': [
    { name: 'SERP Simulator', href: '/tools/serp-simulator', desc: 'Preview title and description pixel widths in Google SERPs.' },
    { name: 'Schema Markup Generator', href: '/tools/schema-generator', desc: 'Generate valid JSON-LD structured data for rich snippets.' },
    { name: 'Schema Checker', href: '/tools/schema-checker', desc: 'Detect and audit schema markup across bulk URLs.' },
    { name: 'Knowledge Graph Search', href: '/tools/knowledge-graph-search', desc: 'Search Google Knowledge Graph entities, schema, and MIDs.' }
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
  fullWidth = true,
  relatedTools: explicitRelatedTools
}: ToolLayoutProps) {
  // Determine curated related tools for this specific tool, with category fallback
  const titleKey = title.toLowerCase().trim();
  const curated = explicitRelatedTools || TOOL_SPECIFIC_RELATED_MAP[titleKey];
  const categoryRelated = RELATED_TOOLS_MAP[category] || RELATED_TOOLS_MAP['Search Appearance'] || [];
  const relatedTools = (curated && curated.length > 0)
    ? curated.filter(t => t.name.toLowerCase() !== titleKey).slice(0, 3)
    : categoryRelated.filter(t => t.name.toLowerCase() !== titleKey).slice(0, 3);

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
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)] mt-0.5">Explore complementary technical SEO utilities and workflows.</p>
            </div>
            <Link href="/tools" className="text-xs sm:text-sm font-bold text-[var(--im-primary-deep)] hover:underline hidden sm:inline-block">
              View all 17 tools &rarr;
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
