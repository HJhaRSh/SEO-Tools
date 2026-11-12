'use client';

import React from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import CommonCrawlClient from './CommonCrawlClient';

export default function CommonCrawlCheckerPage() {
  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Tools', href: '/tools' },
    { label: 'Common Crawl Checker' }
  ];

  const howItWorks = [
    'Enter your domain name (e.g., example.com) or an exact webpage URL to check its archival presence in official Common Crawl indexes.',
    'Choose your crawl scope (Root + www, All Subdomains, or Exact Host) and select your historical crawl depth from 3 up to 12 published monthly collections.',
    'Click "Audit Archive" to query official CDX server indices (index.commoncrawl.org) and extract historical capture timestamps, URLs, and volume trends.',
    'Examine historical robots.txt snapshots evaluated under RFC 9309 rules alongside live simulated edge firewall probes for CCBot and Googlebot.',
    'Compare your XML sitemap URLs against Common Crawl captures to calculate archive coverage percentages and identify uncaptured pages.'
  ];

  const faq = [
    {
      question: 'What is a Common Crawl checker?',
      answer: 'A Common Crawl checker is a technical SEO and archive lookup tool that queries official Common Crawl CDX APIs to verify whether a domain or individual URL has been captured and stored in Common Crawl datasets. It reveals historical capture timestamps, crawl frequency trends, CCBot robots.txt permissions, and crawl coverage comparisons against XML sitemaps.'
    },
    {
      question: 'How do I check if my website or URL is in Common Crawl?',
      answer: 'To check your website: enter your root domain or exact webpage URL into the input field, select your desired crawl scope (Root + www, All Subdomains, or Exact Host), choose how many past monthly crawl collections to inspect (3 to 12 months), and click "Audit Archive". The tool queries official CDX indexes and displays matching records, capture counts, and historical trend lines.'
    },
    {
      question: 'Is Common Crawl index presence the same as Google Search indexing?',
      answer: 'No. Common Crawl and Google Search are entirely separate crawling and indexing entities. Common Crawl (CCBot) archives raw web pages into an open research repository, whereas Googlebot crawls the web to rank content in Google Search. A URL present in Common Crawl is not necessarily indexed by Google, and a URL missing from Common Crawl can still be fully indexed and ranking on Google.'
    },
    {
      question: 'How do I find when Common Crawl last captured my website?',
      answer: 'When you run an audit with our checker, the tool organizes captures across published monthly crawl collections (such as CC-MAIN-2024-51). The most recent monthly collection containing matching records indicates the latest capture period, and the capture table displays the exact ISO timestamp of each archived snapshot.'
    },
    {
      question: 'Why is my website missing from Common Crawl archives?',
      answer: 'Common Crawl does not crawl the entire web in every monthly run. Crawl queues are prioritised using link graph metrics (such as PageRank and harmonic centrality) and depth limits. A website may be absent due to low external backlink volume, robots.txt disallow rules against CCBot, edge firewall or CDN blocks (such as Cloudflare AI Scrape Shield), slow server response times, or simply not being sampled in the searched collections.'
    },
    {
      question: 'Does appearing in Common Crawl mean my website is used in ChatGPT or Google AI?',
      answer: 'Appearing in Common Crawl confirms that CCBot successfully archived your server-delivered HTML into an open crawl collection. While foundational AI datasets (such as C4, RefinedWeb, and FineWeb) are derived from Common Crawl, AI labs apply extensive deduplication, quality filtering, safety screening, and editorial curation. Archive presence is a prerequisite for inclusion in Common Crawl-derived corpora, but does not guarantee citation, memory, or usage by ChatGPT, Claude, or Gemini.'
    },
    {
      question: 'Why are some Common Crawl capture counts estimated rather than exact?',
      answer: 'Common Crawl CDX APIs provide exact capture counts for smaller and medium query matches. For high-volume domains or broad wildcard queries with tens of thousands of records, the index server returns paginated block estimates to maintain query performance within rate limits. Our checker explicitly labels counts as exact or estimated to ensure transparency.'
    },
    {
      question: 'How does CCBot crawl JavaScript single-page applications (SPAs)?',
      answer: 'Unlike Googlebot, which runs an evergreen headless Chromium browser to execute client-side JavaScript, CCBot fetches and archives raw HTTP server responses without executing heavy scripts. If your website relies exclusively on client-side rendering without Server-Side Rendering (SSR) or prerendering, CCBot only archives an empty HTML template container (#root or #app).'
    },
    {
      question: 'How do I check whether CCBot is blocked by robots.txt or edge firewalls?',
      answer: 'To check crawler permissions: inspect your robots.txt file for "User-agent: CCBot" directives under RFC 9309 standards. Our checker evaluates both historical archived robots.txt snapshots and performs live simulated crawler probes across CCBot, desktop browser, and Googlebot user-agents to detect HTTP 403 Forbidden responses, WAF challenges, and Cloudflare AI Scrape Shield blocks.'
    },
    {
      question: 'Can I compare XML sitemap URLs against Common Crawl archive records?',
      answer: 'Yes. Our tool allows you to input your XML sitemap URL alongside your domain audit. It extracts all sitemap URLs and compares them directly against archived Common Crawl captures in the selected collections, calculating a sitemap coverage percentage and highlighting specific URLs that have never been captured.'
    }
  ];

  const aboutText = (
    <div className="space-y-4 text-[var(--im-text)] text-sm sm:text-base leading-relaxed">
      <p>
        The <strong>Common Crawl Checker</strong> by <strong>Indian Marketers</strong> is a free, professional-grade technical SEO tool and archive lookup utility. It connects directly to official Common Crawl CDX APIs (<span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">index.commoncrawl.org</span>) and WARC archives (<span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">data.commoncrawl.org</span>) to verify whether your domain or specific webpage URLs appear in open crawl datasets.
      </p>
      <p>
        Common Crawl is a 501(c)(3) nonprofit organization that maintains an openly accessible, petabyte-scale repository of web data gathered since 2008. Its monthly crawls are extensively utilized across academic web research, data mining, historical web analysis, natural language processing (NLP), machine learning, and AI training dataset development. Rather than assigning arbitrary scores, our checker reports verified historical captures, exact versus estimated capture counts, RFC 9309 historical robots.txt evaluations, live edge firewall probes, and XML sitemap crawl coverage comparisons.
      </p>
    </div>
  );

  const extraSections = (
    <>
      {/* WHAT DOES OUR COMMON CRAWL CHECKER ANALYSE? */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does Our Common Crawl Checker Analyse?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Historical Crawl Records
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Queries published Common Crawl monthly collections (e.g. <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">CC-MAIN-2024-51</code>) to uncover archived URLs, exact capture timestamps, and monthly volume trends. Repeated captures of the same URL across different collections indicate ongoing discovery, while total records reflect cumulative crawl volume rather than distinct pages.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              CCBot and Historical Robots.txt
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Retrieves archived <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">robots.txt</code> files stored in Common Crawl WARC archives and evaluates them under official RFC 9309 rules. This reveals whether CCBot was permitted or disallowed during each crawl run. If no archived robots.txt exists for a cycle, it indicates the crawler did not record the file during that run, not that restrictions were absent. Test current rules with our <Link href="/tools/robots-txt-tester" className="text-blue-600 hover:underline font-semibold">robots.txt Tester</Link>.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              HTTP and Firewall Access Checks
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Sends simulated crawler requests across desktop browser, CCBot/2.0, neutral crawler, and Googlebot tokens to detect edge firewall blocks, Cloudflare AI Scrape Shield challenges, or HTTP 403 Forbidden responses. Simulated probes test web server header responses, though requests do not originate from official CCBot AWS network ranges. For comprehensive multi-bot diagnostics, use our <Link href="/tools/ai-bot-access-tester" className="text-blue-600 hover:underline font-semibold">AI Bot Access Tester</Link>.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              XML Sitemap Coverage
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Compares URLs listed in your XML sitemap against records captured in the selected Common Crawl collections. This calculates an archive coverage percentage and flags URLs that CCBot has not captured. Missing captures indicate absence in the queried collections, not necessarily orphan status or Google Search exclusion. Validate or build sitemaps with our <Link href="/tools/sitemap-generator" className="text-blue-600 hover:underline font-semibold">XML Sitemap Generator</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* UNDERSTANDING COMMON CRAWL RESULTS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Understanding Common Crawl Results</h2>
        </div>
        <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-5 sm:p-8 space-y-4 text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
          <p>
            When interpreting Common Crawl data, it is essential to distinguish between <strong>total capture records</strong> and <strong>unique webpages</strong>. A single URL may be captured multiple times across monthly collections or even multiple times within a single crawl if linked through different paths. Therefore, a count of 500 captures may represent 100 unique URLs captured over multiple monthly crawls.
          </p>
          <p>
            Additionally, Common Crawl crawls the web via external link graph prioritization—using PageRank and harmonic centrality algorithms—rather than exhaustive sitemap traversal. High-authority pages with abundant external backlinks are crawled frequently, while deep or internal-only pages may be captured infrequently or not at all. A missing capture does not imply a penalty or an HTTP crawl error; it simply means the page was not queued during that crawl cycle.
          </p>
          <p>
            Finally, CCBot captures raw server HTTP responses without executing client-side JavaScript. If your web application relies on Single-Page Application (SPA) frameworks like client-rendered React, Angular, or Vue without Server-Side Rendering (SSR) or dynamic prerendering, Common Crawl archives only the unrendered root shell. To inspect how bots render your raw HTML compared to client JavaScript DOM, explore our <Link href="/tools/fetch-render" className="text-blue-600 hover:underline font-semibold">Fetch &amp; Render Tool</Link>.
          </p>
        </div>
      </section>

      {/* COMMON CRAWL AND AI TRAINING DATA */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Common Crawl and AI Training Data</h2>
        </div>
        <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-5 sm:p-8 space-y-4 text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
          <p>
            Common Crawl datasets have historically served as foundational training corpora for Large Language Models (LLMs) and open research datasets, including C4 (Colossal Clean Crawled Corpus), RefinedWeb, FineWeb, and early GPT models. Because Common Crawl data is publicly accessible, AI research teams frequently utilize it to train and evaluate natural language models.
          </p>
          <p>
            However, <strong>presence in Common Crawl does not guarantee that your website is included in ChatGPT, Claude, or Google Gemini</strong>. Commercial AI developers apply aggressive multi-stage filtering pipelines—including MinHash deduplication, heuristic quality scoring, language identification, toxicity filtering, and domain-level exclusion lists. Conversely, absence from Common Crawl does not mean a website is invisible to AI systems, as AI providers also operate proprietary search crawlers (such as OAI-SearchBot and Googlebot) for real-time retrieval-augmented generation (RAG).
          </p>
          <p>
            Furthermore, updating your <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded text-slate-800">robots.txt</code> to disallow CCBot will prevent Common Crawl from capturing your pages in future monthly collections, but it cannot retroactively remove content from past archive snapshots already published and distributed across the global research community.
          </p>
        </div>
      </section>
    </>
  );

  const relatedTools = [
    { name: 'AI Bot Access Tester', href: '/tools/ai-bot-access-tester', desc: 'Verify whether AI crawlers like GPTBot and ClaudeBot can access your site.' },
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Inspect RFC 9309 rules, specificity tie-breaking, and live robots.txt directives.' },
    { name: 'XML Sitemap Generator', href: '/tools/sitemap-generator', desc: 'Generate and validate XML sitemaps to maximize crawler discoverability.' }
  ];

  return (
    <ToolLayout
      title="Free Common Crawl Checker & Visibility Tool"
      description="Use Indian Marketers' free Common Crawl Checker to see whether your website or individual URLs appear in Common Crawl archives. Explore historical crawl records, review CCBot access, inspect robots.txt restrictions and compare archived pages with your XML sitemap."
      category="Crawling & Access"
      breadcrumbs={breadcrumbs}
      aboutTitle="What Is a Common Crawl Checker?"
      aboutText={aboutText}
      howItWorksTitle="How to Check if Your Website Is in Common Crawl"
      howItWorks={howItWorks}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faq}
      relatedTools={relatedTools}
    >
      <CommonCrawlClient />
    </ToolLayout>
  );
}
