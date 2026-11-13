'use client';

import React from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import TimeoutRiskClient from './TimeoutRiskClient';

export default function TimeoutRiskCheckerPage() {
  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Tools', href: '/tools' },
    { label: '499 Timeout Risk Checker' }
  ];

  const howItWorks = [
    'Enter a public webpage URL (e.g. https://example.com/page). Bare domains will be auto-prepended with https://.',
    'Click "Check Timeout Risk" to run four sequential HTTP probes: three with distinct AI user-agent identities (ChatGPT-User, Claude-User, Perplexity-User) and one cache-busting probe.',
    'Each probe measures response-header timing (TTFB approximation), HTTP status, redirect chain, HTML body size, and cache-related headers. Probes run in fixed order to avoid concurrent request interference.',
    'Review the summary cards, per-probe timing table, cache comparison, and generated recommendations. Export results as CSV or copy the summary.',
    'Investigate slow responses or access issues using your server and CDN access logs. This tool measures response timing — it cannot verify actual AI-provider requests or 499 events.'
  ];

  const faq = [
    {
      question: 'What is a 499 error?',
      answer: 'A 499 status code is a non-standard HTTP response used by some web servers (notably Nginx) to indicate that the client closed the connection before the server finished sending the response. In the context of AI fetchers, a 499 can occur when a time-sensitive crawler (e.g. ChatGPT, Claude, or Perplexity) abandons a request because the server took too long to respond. A 499 is recorded in server logs — the client never receives the status code itself.'
    },
    {
      question: 'Can this tool detect actual 499 errors?',
      answer: 'No. A 499 is logged server-side when the client disconnects. This tool cannot access your server logs and therefore cannot confirm whether actual 499 events have occurred. What this tool does measure is how quickly your server responds to requests using simulated AI user-agent strings, which helps estimate whether slow responses could contribute to timeout risk.'
    },
    {
      question: 'Does it send real AI-provider requests?',
      answer: 'No. This tool sends HTTP GET requests using the documented user-agent strings of ChatGPT-User, Claude-User, and Perplexity-User. These requests originate from our server infrastructure — not from OpenAI, Anthropic, or Perplexity IP addresses. Sending their user-agent string does not reproduce their verified identities, infrastructure, geographic distribution, or internal timeout policies.'
    },
    {
      question: 'What response-time target does it use?',
      answer: 'This tool uses heuristic timing bands: Fast (below 500 ms), Moderate (500–999 ms), Slow (1,000–1,999 ms), and Very Slow (2,000 ms or more). These are diagnostic thresholds chosen for this tool — they are not published AI-provider timeout deadlines and do not represent a probability of receiving a 499.'
    },
    {
      question: 'Does cache-busting guarantee a cold cache?',
      answer: 'No. The cache-busting probe appends a unique query parameter to the URL. While many CDNs treat URLs with different query strings as distinct cache keys, this behaviour varies. Some CDN configurations ignore query parameters, while others may still serve from cache based on different criteria. The comparison between standard and cache-busting probes is directional, not a verified cold-cache measurement.'
    },
    {
      question: 'Why can results vary between checks?',
      answer: 'Response times are influenced by server load, geographic distance between our server and yours, CDN caching state, network conditions, DNS resolution time, and request ordering effects. Running the same check twice may produce different timing measurements. This is a small directional sample, not a statistically representative performance benchmark.'
    },
    {
      question: 'How is this different from AI Bot Access Tester?',
      answer: 'The AI Bot Access Tester checks whether AI crawlers are permitted or blocked by inspecting robots.txt policies, HTTP status codes, and WAF challenges across 35 bot identities. The 499 Timeout Risk Checker focuses specifically on response speed — measuring how quickly your server delivers response headers to three AI user-agent identities to estimate timeout risk. Use both tools together for a comprehensive AI crawl-readiness assessment.'
    },
    {
      question: 'How can I investigate slow responses?',
      answer: 'Start by reviewing your server access logs for the specific URL and time window tested. Check CDN analytics for cache hit rates and origin response times. Use server monitoring tools to inspect backend processing duration, database query times, and server-side rendering latency. Review your CDN edge caching rules and ensure appropriate Cache-Control headers are set. If using Cloudflare, check Server-Timing headers and the CF-Cache-Status to understand cache behaviour.'
    }
  ];

  const aboutText = (
    <div className="space-y-4 text-[var(--im-text)] text-sm sm:text-base leading-relaxed">
      <p>
        The <strong>499 Timeout Risk Checker</strong> by <strong>Indian Marketers</strong> is a free diagnostic tool that helps you assess whether a public webpage responds slowly enough to create potential problems for time-sensitive AI fetchers such as ChatGPT, Claude, and Perplexity.
      </p>
      <p>
        When AI assistants fetch a webpage on behalf of a user, they typically impose internal timeout limits. If your server takes too long to deliver the response headers, the fetcher may abandon the connection — resulting in a 499 &quot;Client Closed Request&quot; entry in your server logs. The page content never reaches the AI, potentially causing missing citations, incomplete answers, or failed URL analysis.
      </p>
      <p>
        This tool measures response-header timing (TTFB approximation) by sending sequential HTTP requests using three documented AI user-agent identities, plus a cache-busting probe for comparison. It classifies response speed into diagnostic timing bands and generates actionable recommendations based on observed results.
      </p>
      <p>
        <strong>Important:</strong> This tool sends simulated requests using AI user-agent strings. It does not reproduce actual AI-provider IP addresses, verified identities, or internal timeout policies. Real 499 confirmation requires access to your server or CDN access logs.
      </p>
    </div>
  );

  const extraSections = (
    <>
      {/* WHAT DOES THIS CHECKER MEASURE? */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Does This Checker Measure?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Response-Header Timing (TTFB)
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Time from initiating the HTTP request to receiving the final response status and headers, including DNS resolution, TLS handshake, and any redirect hops. This is the tool&apos;s TTFB approximation — not a precision measurement. Node.js event-loop scheduling adds minor jitter.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              AI User-Agent Simulation
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Three probes use documented user-agent strings for ChatGPT-User, Claude-User, and Perplexity-User. This reveals whether your server or CDN responds differently to these identities. However, sending their user-agent string does not verify the requester. For comprehensive multi-bot access testing, use our <Link href="/tools/ai-bot-access-tester" className="text-blue-600 hover:underline font-semibold">AI Bot Access Tester</Link>.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Cache-Busting Comparison
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              A fourth probe appends a unique query parameter to estimate the timing difference between a potentially cached and potentially uncached request. A query parameter does not guarantee CDN bypass — this is a directional comparison, not a verified cold-cache test.
            </p>
          </div>

          <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs">
            <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
              Redirect &amp; Access Analysis
            </h3>
            <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
              Records redirect chains, HTTP status codes, cache headers, and HTML response size. Identifies blocking, rate limiting, challenge pages, and non-HTML responses separately from timing measurements. Check crawler permissions with our <Link href="/tools/robots-txt-tester" className="text-blue-600 hover:underline font-semibold">robots.txt Tester</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* INTERPRETING RESULTS */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Interpreting Response Timings</h2>
        </div>
        <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-5 sm:p-8 space-y-4 text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
          <p>
            This tool classifies response-header timing into four heuristic bands. These are <strong>not</strong> published AI-provider timeout deadlines — they are diagnostic thresholds chosen for this tool:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <span className="font-bold text-green-700 text-sm">Fast</span>
              <span className="text-green-700">Below 500 ms — Response headers arrived quickly.</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <span className="font-bold text-amber-700 text-sm">Moderate</span>
              <span className="text-amber-700">500–999 ms — Noticeable delay.</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
              <span className="font-bold text-orange-700 text-sm">Slow</span>
              <span className="text-orange-700">1,000–1,999 ms — Significant delay; investigate backend performance.</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
              <span className="font-bold text-red-700 text-sm">Very Slow</span>
              <span className="text-red-700">2,000 ms or more — High timeout risk for time-sensitive fetchers.</span>
            </div>
          </div>
          <p>
            A fast response does not guarantee that AI fetchers will successfully process your content — access policies, content quality, and other factors also matter. A slow response is a warning sign, not a certainty of failure.
          </p>
        </div>
      </section>

      {/* COMMON CAUSES */}
      <section>
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Common Causes of Slow Responses</h2>
        </div>
        <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-5 sm:p-8 space-y-3 text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
          <ul className="space-y-2 list-disc list-inside">
            <li><strong>Uncached origin requests:</strong> When CDN cache misses force every request back to the origin server, response times reflect backend processing speed rather than edge delivery.</li>
            <li><strong>Heavy server-side rendering:</strong> Pages that execute complex database queries, API calls, or template rendering on every request without caching can produce high TTFB.</li>
            <li><strong>Geographic latency:</strong> Physical distance between the requesting server and your origin/CDN edge affects round-trip time. This tool measures from its own server location.</li>
            <li><strong>Redirect chains:</strong> Multiple HTTP-to-HTTPS, www-to-non-www, or trailing-slash redirects add cumulative latency before the final response begins.</li>
            <li><strong>TLS handshake overhead:</strong> HTTPS connections require a TLS handshake that adds latency, especially without TLS session resumption or HTTP/2.</li>
            <li><strong>Bot-specific WAF processing:</strong> Some CDN/WAF configurations apply additional processing (challenges, JavaScript checks) to bot-identified requests, adding delay or blocking access entirely.</li>
          </ul>
          <p className="text-[var(--im-text-muted)] italic">
            This tool cannot identify the specific cause of slow responses from timing measurements alone. Use server monitoring, CDN analytics, and access logs for root-cause investigation. For rendering analysis, try our <Link href="/tools/fetch-render" className="text-blue-600 hover:underline font-semibold">Fetch &amp; Render</Link> tool.
          </p>
        </div>
      </section>
    </>
  );

  const relatedTools = [
    { name: 'AI Bot Access Tester', href: '/tools/ai-bot-access-tester', desc: 'Check whether AI crawlers like GPTBot, ClaudeBot, and PerplexityBot can access your website.' },
    { name: 'robots.txt Tester', href: '/tools/robots-txt-tester', desc: 'Inspect RFC 9309 robots.txt rules, specificity tie-breaking, and live crawl directives.' },
    { name: 'Fetch & Render', href: '/tools/fetch-render', desc: 'See how search engine crawlers render your JavaScript content and compare with source HTML.' }
  ];

  return (
    <ToolLayout
      title="499 Timeout Risk Checker"
      description="Check whether your webpage responds slowly enough to risk timeout issues with AI fetchers. Compare response-header timing for ChatGPT-User, Claude-User, and Perplexity-User simulated identities with cache-busting analysis."
      category="Crawling & Access"
      breadcrumbs={breadcrumbs}
      aboutTitle="What Is a 499 Timeout Risk Checker?"
      aboutText={aboutText}
      howItWorksTitle="How to Check AI Fetch Timeout Risk"
      howItWorks={howItWorks}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faq}
      relatedTools={relatedTools}
    >
      <TimeoutRiskClient />
    </ToolLayout>
  );
}

