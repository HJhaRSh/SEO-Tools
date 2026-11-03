'use client';

import React from 'react';
import ToolLayout from '@/components/ToolLayout';
import CommonCrawlClient from './CommonCrawlClient';

export default function CommonCrawlCheckerPage() {
  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Tools', href: '/tools' },
    { label: 'Common Crawl Visibility Checker' }
  ];

  const howItWorks = [
    'Enter your domain name (e.g., hoabl.com) or an exact webpage URL to check its archival presence in official Common Crawl indexes.',
    'We query Common Crawl CDX APIs across the latest published monthly crawl collections to identify captured URLs, timestamps, and crawl volumes.',
    'Historical robots.txt snapshots stored in Common Crawl WARC archives are evaluated under official RFC 9309 rules to determine whether CCBot was permitted or disallowed.',
    'Live simulated crawler probes test edge firewall routing across desktop browser, CCBot/2.0, neutral control crawler, and Googlebot user-agents.',
    'Compare XML sitemap URLs against Common Crawl captures and identify crawl coverage gaps across published collections.'
  ];

  const faq = [
    {
      question: 'What is Common Crawl and why does it matter for SEO and AI visibility?',
      answer: 'Common Crawl is a non-profit 501(c)(3) organization that maintains an open web repository containing petabytes of raw web page data gathered since 2008. Major AI and Large Language Model (LLM) research teams—including OpenAI, Anthropic, Google DeepMind, and Meta—have historically utilized Common Crawl datasets as a primary training corpus for foundation models. Ensuring your site appears in Common Crawl helps maintain presence in open web research datasets and AI training pools.'
    },
    {
      question: 'Does appearing in Common Crawl guarantee my content is used in ChatGPT or Google AI?',
      answer: 'No. Appearing in Common Crawl confirms that the CCBot web crawler successfully captured your server-delivered HTML into an open crawl collection. Commercial AI developers filter, clean, deduplicate, and curate crawl datasets before training. Data presence is a necessary prerequisite for inclusion in Common Crawl-derived training data, but it does not guarantee citation or usage by any specific AI model.'
    },
    {
      question: 'Why does my website have captures in some months but none in others?',
      answer: 'Common Crawl does not crawl every page on the web in every monthly run. Its crawler prioritizes queues based on external link graph algorithms (such as harmonic centrality and PageRank) and homepage depth. Sampling frequency varies based on crawl budgets, server response latency, and domain discovery graphs. A lower count in a single month does not necessarily indicate a crawler block.'
    },
    {
      question: 'How does CCBot differ from Googlebot or Bingbot?',
      answer: 'Unlike Googlebot, which runs a headless Chromium browser engine to render complex client-side JavaScript, Common Crawl (CCBot) captures raw HTTP server responses without executing heavy client-side scripts. If your website relies exclusively on client-side rendering (SPA framework) without Server-Side Rendering (SSR) or prerendering, CCBot only archives an empty HTML template shell.'
    },
    {
      question: 'How do I permit or block Common Crawl in my robots.txt?',
      answer: 'Common Crawl strictly respects the Robots Exclusion Protocol (RFC 9309). To allow Common Crawl, declare "User-agent: CCBot\\nAllow: /" in your robots.txt. To disallow Common Crawl from indexing your site, declare "User-agent: CCBot\\nDisallow: /".'
    },
    {
      question: 'How does this tool detect if Cloudflare is blocking Common Crawl?',
      answer: 'The tool performs real-time edge probes and inspects live HTTP headers alongside your robots.txt. If Cloudflare AI Scrape Shield is enabled, Cloudflare automatically injects managed bot block rules or issues 403 Forbidden / Challenge headers (cf-mitigated) specifically against CCBot and other AI crawlers.'
    },
    {
      question: 'Why is XML sitemap comparison important for Common Crawl visibility?',
      answer: 'Common Crawl uses web link graphs to discover pages rather than directly ingesting sitemaps. By comparing your XML sitemap URLs against captured Common Crawl records, you can immediately identify critical orphan pages or high-priority landing pages that CCBot has failed to discover.'
    },
    {
      question: 'Why does the tool show "Historical robots.txt unavailable" for certain collections?',
      answer: 'Common Crawl only stores a historical robots.txt if its crawler fetched and archived the robots.txt file during that specific collection cycle. If a domain was not queued or the robots.txt fetch was not stored in that collection, our tool displays "Historical robots.txt unavailable" rather than guessing current rules retroactively.'
    }
  ];

  const aboutText = (
    <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
      <p>
        The <strong>Common Crawl Visibility Checker</strong> is a free, professional-grade technical SEO and AI crawl visibility audit tool developed by <strong>Indian Marketers</strong>. It provides genuine data sourced directly from official Common Crawl CDX APIs (<span className="font-mono text-xs">index.commoncrawl.org</span>) and WARC archives (<span className="font-mono text-xs">data.commoncrawl.org</span>). Unlike proprietary dashboards that report arbitrary AI readiness scores, our tool presents verified historical records, exact vs. estimated crawl capture counts, historical robots.txt snapshots evaluated under official RFC 9309 rules, live edge firewall probes, and comprehensive XML sitemap coverage audits.
      </p>
    </div>
  );

  return (
    <ToolLayout
      title="Common Crawl Visibility Checker"
      description="Check whether your webpages appear in Common Crawl, review historical captures, detect crawler restrictions, compare sitemap coverage, and identify archive gaps."
      category="Crawling & Access"
      breadcrumbs={breadcrumbs}
      aboutText={aboutText}
      howItWorks={howItWorks}
      faq={faq}
    >
      <CommonCrawlClient />
    </ToolLayout>
  );
}

