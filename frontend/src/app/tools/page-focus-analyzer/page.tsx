'use client';

import React, { useState } from 'react';
import ToolLayout from '@/components/ToolLayout';
import type { PageFocusReport, SectionAnalysis } from '@/lib/seo/page-focus/types';
import { generatePageFocusPdf } from '@/components/page-focus/pdfExporter';

type ActiveTab = 'topics' | 'relevance' | 'competitor' | 'sections' | 'recommendations';

export default function PageFocusAnalyzerPage() {
  const [url, setUrl] = useState('');
  const [targetTopic, setTargetTopic] = useState('');
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [isManualText, setIsManualText] = useState(false);
  const [manualText, setManualText] = useState('');

  const [activeTab, setActiveTab] = useState<ActiveTab>('topics');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PageFocusReport | null>(null);

  // Section viewer modal / expander state
  const [selectedSection, setSelectedSection] = useState<SectionAnalysis | null>(null);
  const [copiedRecIndex, setCopiedRecIndex] = useState<number | null>(null);

  // Validate URL format
  function isValidHttpUrl(str: string): boolean {
    try {
      const u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function handleAnalyze() {
    setError(null);

    if (!isManualText) {
      if (!url.trim()) {
        setError('Please enter a valid webpage URL to analyze.');
        return;
      }
      if (!isValidHttpUrl(url.trim())) {
        setError('URL must start with http:// or https://');
        return;
      }
    } else {
      if (!manualText.trim() || manualText.trim().length < 50) {
        setError('Please paste at least 50 words of webpage content to analyze.');
        return;
      }
    }

    if (activeTab === 'competitor' || competitorUrl.trim()) {
      if (!competitorUrl.trim() || !isValidHttpUrl(competitorUrl.trim())) {
        setError('Please enter a valid competitor URL for comparison.');
        return;
      }
      if (!targetTopic.trim()) {
        setError('Please provide a target topic for competitor comparison.');
        return;
      }
    }

    setIsLoading(true);

    try {
      let endpoint = '/api/seo/page-focus/analyze';
      let payload: Record<string, unknown> = {
        url: url.trim() || 'https://manual-input.local',
        targetTopic: targetTopic.trim() || undefined,
        manualText: isManualText ? manualText : undefined,
      };

      if (competitorUrl.trim() && targetTopic.trim()) {
        endpoint = '/api/seo/page-focus/compare';
        payload = {
          url: url.trim(),
          competitorUrl: competitorUrl.trim(),
          targetTopic: targetTopic.trim(),
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          throw new Error(errData.error || 'Rate limit reached (5 scans/min or 50 scans/day). Please pause for a moment before trying again.');
        }
        throw new Error(errData.error || `Server returned HTTP ${res.status}`);
      }

      const data: PageFocusReport = await res.json();
      setReport(data);

      // Default active tab based on input
      if (data.competitorReport) {
        setActiveTab('competitor');
      } else if (data.overallRelevanceScore !== null) {
        setActiveTab('relevance');
      } else {
        setActiveTab('topics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please check the URL and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setUrl('');
    setTargetTopic('');
    setCompetitorUrl('');
    setManualText('');
    setIsManualText(false);
    setReport(null);
    setError(null);
    setActiveTab('topics');
    setSelectedSection(null);
  }

  function handleCopyRecommendation(index: number, rec: PageFocusReport['recommendations'][0]) {
    const text = `Recommendation: ${rec.title}\nPriority: ${rec.priority.toUpperCase()}\nIssue: ${rec.issue}\nProposed Action: ${rec.proposedImprovement}\nRationale: ${rec.seoRationale}\nExpected Benefit: ${rec.expectedUserBenefit}`;
    navigator.clipboard.writeText(text);
    setCopiedRecIndex(index);
    setTimeout(() => setCopiedRecIndex(null), 2500);
  }

  function handleExportJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `page-focus-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(u);
  }

  function handleExportPdf() {
    if (!report) return;
    generatePageFocusPdf(report);
  }

  return (
    <ToolLayout
      title="AI Page Focus & Semantic Relevance Analyzer"
      description="Analyse webpage topics, measure semantic relevance, compare competitors and discover AI-powered content improvements."
      category="Content & Semantic SEO"
      breadcrumbs={[{ label: 'Page Focus Analyzer' }]}
      aboutText="Search engines have evolved beyond naive keyword density. Modern algorithms evaluate topical authority, semantic depth, contextual entity relevance, and search intent satisfaction across entire documents. The AI Page Focus & Semantic Relevance Analyzer extracts visible webpage content, segments it into natural passage hierarchies, computes true 3072-dimensional vector embeddings, and leverages advanced generative AI to determine what your page actually communicates, how strongly it answers a target query, and exactly what content improvements will make it more complete and authoritative."
      howItWorks={[
        'Enter any webpage URL (or paste content directly) along with your target search topic or keyword.',
        'The extraction engine fetches the page securely with SSRF protection and strips boilerplate headers, navigation, ads, and footers.',
        'The page is split into semantic passages, and real high-dimensional vector embeddings are computed via gemini-embedding-2 to measure semantic proximity.',
        'Our AI reasoning engine (Gemini 3 Flash) evaluates search intent alignment, entity coverage, unanswered user needs, and content gaps.',
        'An auditable 6-component Indian Marketers Topic Relevance Index (0–100) is generated alongside actionable, evidence-backed content recommendations.',
      ]}
      faq={[
        {
          question: 'What is the Indian Marketers Topic Relevance Index?',
          answer:
            'It is a transparent, auditable 0–100 score measuring how effectively a webpage covers a given subject. It combines 6 weighted components: Semantic Vector Similarity (35%), Search Intent Alignment (20%), Topical Coverage (20%), Heading & Structural Alignment (10%), Supporting Context Depth (10%), and Topical Coherence (5%). It is an analytical quality metric, not a Google ranking guarantee.',
        },
        {
          question: 'How is this different from keyword density checkers?',
          answer:
            'Keyword density only counts exact word matches, which leads to artificial keyword stuffing. Our tool uses 3072-dimensional neural embeddings and generative AI to understand meaning, synonyms, related entities, topical breadth, and user search intent regardless of exact phrasing.',
        },
        {
          question: 'What are the usage and rate limits for this analyzer?',
          answer:
            'To ensure fast, reliable performance and fair access for all users, each IP address is allocated 5 analyses per minute and up to 50 analyses per day. Cached reports (valid for 1 hour) do not consume additional quota.',
        },
        {
          question: 'Can I analyze competitors targeting the same keyword?',
          answer:
            'Yes. By providing a competitor URL in Competitor mode, both pages are analyzed symmetrically under identical scoring parameters. The system highlights topics the competitor covers that you miss (content gaps), areas you cover better (advantages), and section-by-section semantic alignment.',
        },
        {
          question: 'Why does JavaScript-heavy content show low extraction quality?',
          answer:
            'If a webpage renders entirely on the client side via React or Vue without server-side rendering (SSR), search crawlers see a minimal HTML shell. When this occurs, our tool detects the SPA framework, flags the issue, and allows you to paste the rendered text manually or use Fetch & Render.',
        },
        {
          question: 'How are the AI content recommendations generated?',
          answer:
            'Recommendations are synthesized dynamically by Gemini using your actual extracted document sections, the target topic, and identified intent gaps. Each suggestion cites concrete section IDs as evidence, provides clear SEO rationale, and advises on placement without fabricating external facts.',
        },
      ]}
    >
      <div className="space-y-6">
        {/* Input Panel */}
        <div className="bg-white rounded-2xl border border-[var(--im-border)] p-5 md:p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-bold text-[var(--im-heading)] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#4caf50]"></span>
                Webpage &amp; Target Topic Input
              </h2>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-medium rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Free-Tier Allocation: <strong>5 scans/min</strong> · <strong>15 scans/day</strong> per IP (Shared daily AI limit: 20 analyses/day)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsManualText(!isManualText)}
              className="text-xs font-semibold text-[#4caf50] hover:underline cursor-pointer"
            >
              {isManualText ? '← Switch to URL input' : 'Or paste text manually →'}
            </button>
          </div>

          <div className="space-y-4">
            {!isManualText ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--im-heading)] mb-1.5">
                    Webpage URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/blog/my-guide"
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-[var(--im-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4caf50] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--im-heading)] mb-1.5">
                    Target Topic or Keyword <span className="text-gray-400 font-normal">(Optional for auto-detection)</span>
                  </label>
                  <input
                    type="text"
                    value={targetTopic}
                    onChange={(e) => setTargetTopic(e.target.value)}
                    placeholder="e.g. residential plots in Nagpur"
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-[var(--im-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4caf50] focus:bg-white transition-all"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-[var(--im-heading)] mb-1.5">
                  Paste Webpage Content / Article Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={6}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Paste article body text, headings, and paragraphs here..."
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-[var(--im-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4caf50] focus:bg-white transition-all font-mono text-xs"
                />
                <div className="mt-3">
                  <label className="block text-xs font-bold text-[var(--im-heading)] mb-1.5">
                    Target Topic or Keyword
                  </label>
                  <input
                    type="text"
                    value={targetTopic}
                    onChange={(e) => setTargetTopic(e.target.value)}
                    placeholder="e.g. residential plots in Nagpur"
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-[var(--im-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4caf50] focus:bg-white transition-all"
                  />
                </div>
              </div>
            )}

            {/* Optional Competitor URL Field */}
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-xs font-bold text-[var(--im-heading)] mb-1.5 flex items-center justify-between">
                <span>Competitor URL <span className="text-gray-400 font-normal">(Optional — enables Mode 3 Comparison)</span></span>
              </label>
              <input
                type="url"
                value={competitorUrl}
                onChange={(e) => setCompetitorUrl(e.target.value)}
                placeholder="https://competitor.com/competing-page"
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-[var(--im-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4caf50] focus:bg-white transition-all"
              />
            </div>

            {error && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                  error.toLowerCase().includes('rate limit')
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {error.toLowerCase().includes('rate limit') ? (
                  <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <span className="font-bold shrink-0">Error:</span>
                )}
                <div className="flex-1">
                  <div className="font-bold">
                    {error.toLowerCase().includes('rate limit') ? 'Rate Limit Reached' : 'Analysis Notice'}
                  </div>
                  <div className="mt-0.5">{error}</div>
                  {error.toLowerCase().includes('rate limit') && (
                    <div className="text-[11px] text-amber-700 mt-1.5 font-medium">
                      Tip: Each IP is allowed 5 scans per minute and 50 per day to ensure fair server capacity. Please wait a moment before running another scan.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-[var(--im-text-muted)] flex-wrap">
                <span className="font-medium text-gray-700">
                  {competitorUrl ? 'Mode: Competitor Comparison' : targetTopic ? 'Mode: Topic Relevance & AI Analysis' : 'Mode: Automatic Topic Detection'}
                </span>
                {report?.rateLimit ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[11px]">
                    Remaining quota: <strong>{report.rateLimit.remainingMinute}/{report.rateLimit.perMinute}</strong> this min · <strong>{report.rateLimit.remainingDay}/{report.rateLimit.perDay}</strong> today
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400">
                    · Fair Usage Quota: 5/min, 50/day
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {report && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#4caf50] to-[#388e3c] hover:from-[#43a047] hover:to-[#2e7d32] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <span>Analyze Webpage Focus</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Truthful Indeterminate Loading Indicator */}
        {isLoading && (
          <div className="bg-white rounded-2xl border border-[var(--im-border)] p-8 shadow-sm text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 text-[#4caf50] mb-4">
              <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-[var(--im-heading)]">
              {competitorUrl ? 'Running Live Cross-Page Semantic Comparison' : 'Performing Live Webpage Focus Analysis'}
            </h3>
            <p className="text-xs text-[var(--im-text-muted)] mt-2 max-w-md mx-auto leading-relaxed">
              Extracting clean DOM content, computing 3072-dimensional vector embeddings, and running empirical semantic relevance calibration...
            </p>
          </div>
        )}

        {/* Results Dashboard */}
        {report && !isLoading && (
          <div className="space-y-6">
            {/* Partial Report Alert Banner (Strict Truth in Reporting) */}
            {report.isPartialReport && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-xs">
                <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h4 className="font-bold text-amber-900 text-sm">Partial Analysis Notice</h4>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    Some mandatory scoring components were unavailable: <strong>{report.missingComponents.join(', ')}</strong>.
                    Per our data integrity policy, estimated or fabricated scores are not shown. The available components and section heatmap below remain accurate.
                  </p>
                </div>
              </div>
            )}
            {/* Top Bar with Export & Overview */}
            <div className="bg-white rounded-2xl border border-[var(--im-border)] p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#4caf50] bg-green-50 px-2.5 py-1 rounded-md">
                  Audit Completed
                </span>
                <h2 className="text-lg font-bold text-[var(--im-heading)] mt-1.5 truncate max-w-xl">
                  {report.page.title || report.targetUrl}
                </h2>
                <p className="text-xs text-[var(--im-text-muted)] mt-0.5">
                  {report.page.wordCount} words extracted • {report.page.sections.length} sections analyzed • Engine: {report.scoringVersion}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>JSON</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#4caf50] hover:bg-[#43a047] rounded-lg shadow-xs hover:shadow transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Download PDF Report</span>
                </button>
              </div>
            </div>

            {/* Segmented Tab Navigation */}
            <div className="bg-white rounded-xl border border-[var(--im-border)] p-1.5 flex items-center gap-1 overflow-x-auto shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab('topics')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'topics'
                    ? 'bg-[#4caf50] text-white shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                1. What Google Sees (Topics)
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('relevance')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'relevance'
                    ? 'bg-[#4caf50] text-white shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span>2. Topic Match Score</span>
                {report.overallRelevanceScore !== null && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                    activeTab === 'relevance' ? 'bg-white/25 text-white' : 'bg-green-100 text-green-800'
                  }`}>
                    {report.overallRelevanceScore.toFixed(0)}/100
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('competitor')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'competitor'
                    ? 'bg-[#4caf50] text-white shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                3. Competitor Head-to-Head
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('sections')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'sections'
                    ? 'bg-[#4caf50] text-white shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span>4. Paragraph Heatmap</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  activeTab === 'sections' ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                  {report.page.sections.length} parts
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('recommendations')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'recommendations'
                    ? 'bg-[#4caf50] text-white shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span>5. Step-by-Step Fixes</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  activeTab === 'recommendations' ? 'bg-white/25 text-white' : 'bg-green-100 text-green-800'
                }`}>
                  {report.recommendations.length} action items
                </span>
              </button>
            </div>

            {/* TAB 1: PAGE TOPICS */}
            {activeTab === 'topics' && (
              <div className="space-y-6">
                {/* Plain-Language Explainer Banner */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-950 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">ℹ</div>
                  <div>
                    <h4 className="font-bold text-emerald-900 text-sm">How Search Engines Understand This Page</h4>
                    <p className="mt-0.5 text-emerald-800 leading-relaxed">
                      Instead of just counting keywords, AI models evaluate what your page is fundamentally about. Below is the main subject Google identifies, followed by the secondary themes and an executive overview.
                    </p>
                  </div>
                </div>

                {/* Primary Topic Card */}
                <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#4caf50] bg-green-50 px-2 py-0.5 rounded">
                        Main Identified Topic
                      </span>
                      <h3 className="text-xl font-bold text-[var(--im-heading)] mt-2">
                        {report.primaryTopic.name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-2 max-w-2xl leading-relaxed">
                        {report.primaryTopic.explanation}
                      </p>
                    </div>

                    <div className="text-right bg-green-50/60 border border-green-200/80 rounded-xl p-4 min-w-[150px]">
                      <div className="text-3xl font-black text-[#2e7d32]">
                        {report.primaryTopic.centralityScore}
                        <span className="text-xs font-normal text-gray-500">/100</span>
                      </div>
                      <div className="text-[11px] font-semibold text-gray-700 mt-0.5">
                        Focus Score
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {report.primaryTopic.centralityScore >= 80 ? 'Heavy Core Focus' : report.primaryTopic.centralityScore >= 60 ? 'Moderate Core Focus' : 'Weakly Focused'}
                      </div>
                    </div>
                  </div>

                  {report.primaryTopic.supportingSectionIds.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-semibold text-gray-500">Reinforced in page sections:</span>
                      {report.primaryTopic.supportingSectionIds.map(sid => (
                        <span key={sid} className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-800 text-[11px] rounded-md font-medium">
                          {sid.replace('sec-', 'Section ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Executive Summary */}
                <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>📄</span> Summary of What Your Page Says
                  </h4>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {report.pageSummary}
                  </p>
                </div>

                {/* Secondary Topics Grid */}
                <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Supporting Sub-Themes Covered ({report.secondaryTopics.length})
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Sub-topics add depth to your page. High scores indicate well-developed areas; lower scores show brief mentions.
                    </p>
                  </div>

                  {report.secondaryTopics.length === 0 ? (
                    <p className="text-xs text-gray-500">No distinct secondary topics identified.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {report.secondaryTopics.map((st, i) => (
                        <div key={i} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 hover:border-[#4caf50] transition-colors">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-bold text-gray-900">{st.name}</span>
                            <span className="px-2 py-0.5 bg-white border text-[11px] font-bold text-gray-700 rounded-md">
                              {st.centralityScore}/100
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed mb-2">
                            {st.explanation}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-500 pt-1 border-t border-gray-100">
                            <span className="capitalize px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-semibold text-[10px]">
                              {st.type} theme
                            </span>
                            {st.supportingSectionIds.length > 0 && (
                              <span className="text-[11px] text-gray-500">
                                In: {st.supportingSectionIds.map(sid => sid.replace('sec-', 'Sec ')).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Topic Distribution Chart (SVG Bar Chart) */}
                <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Topic Prominence Distribution
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Relative share of page content dedicated to each identified theme. The dominant topic should align with what you want to rank for.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {[report.primaryTopic, ...report.secondaryTopics.slice(0, 7)].map((t, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-gray-800">{t.name}</span>
                          <span className="font-mono text-gray-500">{t.centralityScore}%</span>
                        </div>
                        <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              i === 0 ? 'bg-[#4caf50]' : 'bg-[#81c784]'
                            }`}
                            style={{ width: `${Math.max(5, t.centralityScore)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: TOPIC RELEVANCE */}
            {activeTab === 'relevance' && (
              <div className="space-y-6">
                {!report.targetTopic ? (
                  <div className="bg-white rounded-2xl border border-[var(--im-border)] p-8 text-center text-gray-500">
                    <p className="text-sm font-semibold">No target topic was specified during scan.</p>
                    <p className="text-xs mt-1 text-gray-400">Enter a target keyword/topic above to calculate the Topic Relevance Index.</p>
                  </div>
                ) : (
                  <>
                    {/* Overall Score Banner */}
                    <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <div className="text-center md:text-left">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#4caf50] bg-green-50 px-2.5 py-1 rounded-md">
                            Overall Match Score
                          </span>
                          <div className="mt-3 flex items-baseline justify-center md:justify-start gap-2">
                            <span className="text-5xl font-black text-[#2e7d32]">
                              {report.overallRelevanceScore !== null ? report.overallRelevanceScore.toFixed(1) : 'N/A'}
                            </span>
                            <span className="text-gray-400 font-bold text-lg">/ 100</span>
                          </div>
                          <div className="mt-1 font-bold text-gray-800 text-sm">
                            {report.scoreInterpretation}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1">
                            Compared against query: &ldquo;<strong>{report.targetTopic}</strong>&rdquo;
                          </div>
                          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                            A balanced composite combining vector meaning (35%), search intent (20%), topical depth (20%), page structure (10%), supporting context (10%), and focus coherence (5%).
                          </p>
                        </div>

                        {/* Search Intent Card */}
                        {report.searchIntent && (
                          <div className="col-span-2 bg-gray-50 rounded-xl p-5 border border-gray-200/80">
                            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                              <div>
                                <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">What the Searcher Wants (Intent)</span>
                                <p className="text-[11px] text-gray-500 mt-0.5">Why someone searches this phrase and whether your page gives them what they came for.</p>
                              </div>
                              <span className="px-2.5 py-1 bg-[#f0fdf4] text-[#2e7d32] border border-green-200 rounded-md text-xs font-bold capitalize">
                                {report.searchIntent.primaryIntent} Intent
                              </span>
                            </div>
                            <p className="text-xs text-gray-700 leading-relaxed mt-2.5 bg-white p-3 rounded-lg border border-gray-100">
                              {report.searchIntent.explanation}
                            </p>
                            <div className="mt-3.5 flex items-center gap-3 flex-wrap text-xs pt-3 border-t border-gray-200/60">
                              <span className="font-semibold text-gray-700">Does your page satisfy this?</span>
                              <span className={`px-2.5 py-0.5 rounded-full font-bold capitalize ${
                                report.searchIntent.pageIntentSatisfaction === 'fully'
                                  ? 'bg-green-100 text-green-800'
                                  : report.searchIntent.pageIntentSatisfaction === 'partially'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {report.searchIntent.pageIntentSatisfaction === 'fully' ? '✓ Fully Satisfied' : report.searchIntent.pageIntentSatisfaction === 'partially' ? '⚠ Partially Satisfied' : '✕ Not Satisfied'}
                              </span>
                              {report.searchIntent.unaddressedNeeds && report.searchIntent.unaddressedNeeds.length > 0 && (
                                <span className="text-gray-500 text-[11px]">
                                  (Missing: {report.searchIntent.unaddressedNeeds.join(', ')})
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 6 Component Breakdown */}
                    {report.scoreComponents && (
                      <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                        <div className="mb-4">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Detailed Scoring Breakdown (Why Your Score is {report.overallRelevanceScore !== null ? report.overallRelevanceScore.toFixed(0) : 'N/A'}/100)
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Each factor measures a specific dimension of SEO content quality. Hover or inspect each bar to see where to improve.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { name: 'Semantic Meaning Similarity', weight: '35% weight', val: report.scoreComponents.semanticSimilarity, desc: 'Do your sentences share the same topical meaning as the keyword, even if using different words?', tip: 'Higher score = closely matched concepts without needing keyword repetition.' },
                            { name: 'Search Intent Match', weight: '20% weight', val: report.scoreComponents.searchIntentAlignment, desc: 'Does your page provide the exact action or answer searchers expect (e.g. prices, steps, booking)?', tip: 'Higher score = answers user questions directly without fluff.' },
                            { name: 'Topic Completeness (Coverage)', weight: '20% weight', val: report.scoreComponents.topicalCoverage, desc: 'How many essential sub-topics and related questions did your content touch upon?', tip: 'Higher score = comprehensive coverage of the theme.' },
                            { name: 'Headings & Outline Match', weight: '10% weight', val: report.scoreComponents.headingStructuralAlignment, desc: 'Are your H1, H2, and H3 headers clearly organized around the subject?', tip: 'Higher score = clear outline that search crawlers easily parse.' },
                            { name: 'Supporting Context & Proof', weight: '10% weight', val: report.scoreComponents.supportingContextDepth, desc: 'Did you include real details, numbers, locations, or evidence rather than surface-level statements?', tip: 'Higher score = detailed, informative prose.' },
                            { name: 'Page Focus Coherence', weight: '5% weight', val: report.scoreComponents.topicalCoherence, desc: 'Do all sections stay on-topic, or does the page wander off into unrelated subjects?', tip: 'Higher score = tightly focused page without off-topic filler.' },
                          ].map((item, idx) => (
                            <div key={idx} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/70 hover:border-gray-300 transition-colors">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-gray-800">
                                  {item.name} <span className="text-gray-400 font-normal">({item.weight})</span>
                                </span>
                                {item.val !== null ? (
                                  <span className="text-xs font-black text-gray-900">{item.val}/100</span>
                                ) : (
                                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    Unavailable
                                  </span>
                                )}
                              </div>
                              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-1.5">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${item.val !== null ? (item.val >= 70 ? 'bg-[#4caf50]' : item.val >= 50 ? 'bg-yellow-500' : 'bg-red-500') : 'bg-gray-300'}`}
                                  style={{ width: `${item.val !== null ? Math.max(4, item.val) : 0}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-gray-600 leading-tight mb-1">{item.desc}</p>
                              <p className="text-[10px] text-gray-400 italic">💡 {item.tip}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Topic Concepts Coverage */}
                    <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Key Concept Checklist ({report.topicCoverage.length} core themes)
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Essential themes and sub-topics Google expects to find on pages targeting &ldquo;{report.targetTopic}&rdquo;.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded font-semibold text-[11px]">
                            ✓ {report.topicCoverage.filter(c => c.status === 'covered').length} Covered
                          </span>
                          <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded font-semibold text-[11px]">
                            ⚠ {report.topicCoverage.filter(c => c.status === 'partial').length} Partial
                          </span>
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-semibold text-[11px]">
                            ✕ {report.topicCoverage.filter(c => c.status === 'missing').length} Missing
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {report.topicCoverage.map((c, i) => (
                          <div
                            key={i}
                            className={`p-3.5 rounded-xl border text-xs flex flex-col justify-between transition-all hover:shadow-2xs ${
                              c.status === 'covered'
                                ? 'bg-green-50/50 border-green-200 text-green-950'
                                : c.status === 'partial'
                                ? 'bg-yellow-50/50 border-yellow-200 text-yellow-950'
                                : c.status === 'missing'
                                ? 'bg-red-50/50 border-red-200 text-red-950'
                                : 'bg-gray-50 border-gray-200 text-gray-600'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-gray-900 text-sm leading-snug">{c.concept}</div>
                              <div className="mt-1 text-[11px] text-gray-600">
                                {c.status === 'covered'
                                  ? 'Well-developed subject on your page.'
                                  : c.status === 'partial'
                                  ? 'Only briefly mentioned; needs more detail.'
                                  : 'Not covered; searchers seeking this may bounce.'}
                              </div>
                            </div>
                            <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-[11px]">
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wide ${
                                c.status === 'covered'
                                  ? 'bg-green-100 text-green-800'
                                  : c.status === 'partial'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {c.status === 'covered' ? '✓ Covered' : c.status === 'partial' ? '⚠ Mentioned Briefly' : '✕ Missing Topic'}
                              </span>
                              {c.sectionId && (
                                <span className="font-mono text-gray-500 text-[10px]">
                                  {c.sectionId.replace('sec-', 'Section ')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 3: COMPETITOR COMPARISON */}
            {activeTab === 'competitor' && (
              <div className="space-y-6">
                {!report.competitorReport ? (
                  <div className="bg-white rounded-2xl border border-[var(--im-border)] p-8 text-center text-gray-500">
                    <p className="text-sm font-semibold">No competitor URL was provided for this scan.</p>
                    <p className="text-xs mt-1 text-gray-400">
                      Enter a competitor webpage URL and target topic in the input panel to run a symmetrical side-by-side analysis.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Comparative Explainer Banner */}
                    <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 text-xs text-blue-950 flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">⚔️</div>
                      <div>
                        <h4 className="font-bold text-blue-900 text-sm">Head-to-Head Semantic Comparison</h4>
                        <p className="mt-0.5 text-blue-800 leading-relaxed">
                          This side-by-side benchmark shows how effectively your page answers the target query compared to your competitor. Identify what sub-topics they cover that you miss, and protect the unique advantages you hold.
                        </p>
                      </div>
                    </div>

                    {/* Comparative Score Card */}
                    <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Topic Relevance Comparison
                        </h3>
                        {report.competitorReport.ourScore !== null && report.competitorReport.competitorScore !== null && (
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                            report.competitorReport.ourScore >= report.competitorReport.competitorScore
                              ? 'bg-green-100 text-green-800 border border-green-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {report.competitorReport.ourScore >= report.competitorReport.competitorScore
                              ? `+${(report.competitorReport.ourScore - report.competitorReport.competitorScore).toFixed(1)} pts Ahead`
                              : `${(report.competitorReport.ourScore - report.competitorReport.competitorScore).toFixed(1)} pts Behind`}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-green-50/70 rounded-xl border border-green-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-white px-2 py-0.5 rounded border border-green-100">
                            Your Page
                          </span>
                          <div className="text-xs text-gray-600 truncate mt-1">{report.targetUrl}</div>
                          <div className="text-3xl font-black text-[#2e7d32] mt-2">
                            {report.competitorReport.ourScore?.toFixed(1) || 'N/A'}
                            <span className="text-xs font-normal text-gray-500"> / 100</span>
                          </div>
                          <p className="text-[11px] text-gray-600 mt-1">
                            {report.competitorReport.ourScore !== null && report.competitorReport.ourScore >= 70
                              ? 'Strong search intent alignment'
                              : 'Has room for deeper topical coverage'}
                          </p>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">
                            Competitor Page
                          </span>
                          <div className="text-xs text-gray-600 truncate mt-1">{report.competitorReport.competitorUrl}</div>
                          <div className="text-3xl font-black text-gray-800 mt-2">
                            {report.competitorReport.competitorScore?.toFixed(1) || 'N/A'}
                            <span className="text-xs font-normal text-gray-500"> / 100</span>
                          </div>
                          <p className="text-[11px] text-gray-600 mt-1">
                            {report.competitorReport.competitorScore !== null && report.competitorReport.competitorScore >= 70
                              ? 'Competitor demonstrates solid topic depth'
                              : 'Competitor has notable topic gaps'}
                          </p>
                        </div>
                      </div>

                      {/* Comparative Verdict */}
                      <div className={`mt-4 p-4 rounded-xl text-xs leading-relaxed border ${
                        (report.competitorReport.ourScore ?? 0) >= (report.competitorReport.competitorScore ?? 0)
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                          : 'bg-amber-50/80 border-amber-200 text-amber-950'
                      }`}>
                        <div className="font-bold text-sm mb-1 flex items-center gap-1.5">
                          <span>{(report.competitorReport.ourScore ?? 0) >= (report.competitorReport.competitorScore ?? 0) ? '🏆' : '🎯'}</span>
                          <span>Comparative Verdict</span>
                        </div>
                        <p>{report.competitorReport.verdict}</p>
                      </div>
                    </div>

                    {/* Content Gaps & Advantages */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Content Gaps */}
                      <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm flex flex-col justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <span>⚠️</span> Content Gaps (Competitor covers, you miss)
                          </h4>
                          <p className="text-[11px] text-gray-500 mb-3">
                            Sub-topics explained on the competing page that your content omits. Adding these will bridge the topical authority gap.
                          </p>
                          {report.competitorReport.topicGaps.length === 0 ? (
                            <div className="p-4 bg-green-50/50 rounded-xl border border-green-200 text-xs text-green-900">
                              ✓ <strong>No major content gaps detected!</strong> Your page matches or exceeds the competitor on all core themes.
                            </div>
                          ) : (
                            <ul className="space-y-2">
                              {report.competitorReport.topicGaps.map((gap, i) => (
                                <li key={i} className="text-xs text-gray-800 p-2.5 bg-red-50/50 rounded-lg border border-red-100 flex items-start gap-2">
                                  <span className="text-red-500 font-bold shrink-0 mt-0.5">•</span>
                                  <span className="leading-snug">{gap}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      {/* Content Advantages */}
                      <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm flex flex-col justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <span>✓</span> Your Content Advantages (You cover better)
                          </h4>
                          <p className="text-[11px] text-gray-500 mb-3">
                            Unique angles, specific details, or sections where your page outperforms the competitor. Protect and highlight these.
                          </p>
                          {report.competitorReport.ourAdvantages.length === 0 ? (
                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-600">
                              No distinct unique content angles found yet compared to this competitor. Add specialized insights or examples to stand out.
                            </div>
                          ) : (
                            <ul className="space-y-2">
                              {report.competitorReport.ourAdvantages.map((adv, i) => (
                                <li key={i} className="text-xs text-gray-800 p-2.5 bg-green-50/50 rounded-lg border border-green-100 flex items-start gap-2">
                                  <span className="text-green-600 font-bold shrink-0 mt-0.5">•</span>
                                  <span className="leading-snug">{adv}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Cross-Page Section Comparisons */}
                    {report.competitorReport.sectionComparisons.length > 0 && (
                      <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                        <div className="mb-4">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Section-by-Section Matchup (Cross-Page Topic Alignment)
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            How individual sections of your page compare to corresponding sections on the competitor&apos;s page. High overlap means both cover the exact same subject.
                          </p>
                        </div>
                        <div className="space-y-3">
                          {report.competitorReport.sectionComparisons.map((sc, i) => {
                            const matchPct = Math.round(sc.similarity * 100);
                            const matchBadge = matchPct >= 75
                              ? { label: `${matchPct}% Match • Direct Overlap`, bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
                              : matchPct >= 50
                              ? { label: `${matchPct}% Match • Partial Overlap`, bg: 'bg-blue-50 text-blue-800 border-blue-200' }
                              : { label: `${matchPct}% Match • Unique Focus`, bg: 'bg-gray-100 text-gray-700 border-gray-200' };

                            return (
                              <div key={i} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs hover:border-gray-300 transition-colors">
                                <div className="flex justify-between items-center mb-1.5 flex-wrap gap-2">
                                  <span className="font-semibold text-gray-900">
                                    {sc.ourSectionId.replace('sec-', 'Your Section ')} ↔ {sc.competitorSectionId ? sc.competitorSectionId.replace('sec-', 'Competitor Section ') : 'No Direct Equivalent'}
                                  </span>
                                  <span className={`px-2 py-0.5 border rounded-md text-[11px] font-bold ${matchBadge.bg}`}>
                                    {matchBadge.label}
                                  </span>
                                </div>
                                <p className="text-gray-600 text-[11px] leading-relaxed">{sc.notes}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 4: SECTION ANALYSIS */}
            {activeTab === 'sections' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[var(--im-heading)]">
                        Page Section Health &amp; Focus Heatmap
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Google ranks pages partly by how well individual paragraphs stay on topic. Click any section below to inspect the extracted text and AI evaluation.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500"></span> Strong (≥75)</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span> Moderate (50-74)</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span> Weak (25-49)</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400"></span> Off-Topic (&lt;25)</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {report.sectionAnalyses.map((sec, idx) => {
                      const score = sec.topicAlignmentScore;
                      const borderCol = score >= 75 ? 'border-green-300 hover:border-green-500' : score >= 50 ? 'border-yellow-300 hover:border-yellow-500' : score >= 25 ? 'border-orange-300 hover:border-orange-500' : 'border-red-300 hover:border-red-500';
                      const bgCol = score >= 75 ? 'bg-green-50/30' : score >= 50 ? 'bg-yellow-50/30' : score >= 25 ? 'bg-orange-50/30' : 'bg-red-50/30';
                      const labelText = score >= 75 ? 'Strong Focus' : score >= 50 ? 'Moderate Context' : score >= 25 ? 'Weak Relevance' : 'Off-Topic';

                      return (
                        <div
                          key={sec.sectionId}
                          onClick={() => setSelectedSection(sec)}
                          className={`p-4 rounded-xl border ${borderCol} ${bgCol} cursor-pointer transition-all hover:shadow-xs`}
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 rounded text-gray-700">
                                  Section {idx + 1}
                                </span>
                                <h4 className="text-sm font-bold text-gray-900">
                                  {sec.heading || `Paragraphs under Section ${idx + 1}`}
                                </h4>
                              </div>
                              <p className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">
                                {sec.explanation}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-lg font-black text-gray-900">
                                {score}
                              </span>
                              <span className="text-[10px] text-gray-500 block font-semibold">
                                {labelText}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section Detail Drawer */}
                {selectedSection && (
                  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-xl border border-gray-200">
                      <div className="flex justify-between items-start gap-3 pb-3 border-b border-gray-100">
                        <div>
                          <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                            {selectedSection.sectionId.replace('sec-', 'Section ')}
                          </span>
                          <h3 className="text-base font-bold text-gray-900 mt-1">
                            {selectedSection.heading || 'Section Detail & Content'}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedSection(null)}
                          className="text-gray-400 hover:text-gray-600 text-lg cursor-pointer px-2"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="mt-4 space-y-4 text-xs">
                        <div>
                          <span className="font-bold text-gray-700 block mb-1">Topic Alignment Score:</span>
                          <span className="text-xl font-black text-[#2e7d32]">
                            {selectedSection.topicAlignmentScore}/100
                          </span>
                          <span className="text-gray-500 ml-2 font-medium">
                            ({selectedSection.topicAlignmentScore >= 75 ? 'Deeply aligned with core search intent' : selectedSection.topicAlignmentScore >= 50 ? 'Helpful secondary information' : 'Weakly aligned with query'})
                          </span>
                        </div>

                        <div>
                          <span className="font-bold text-gray-700 block mb-1">AI Semantic Evaluation:</span>
                          <p className="text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-200">
                            {selectedSection.explanation}
                          </p>
                        </div>

                        {selectedSection.stronglyCoveredConcepts.length > 0 && (
                          <div>
                            <span className="font-bold text-green-800 block mb-1">Topics Handled Well in this Section:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedSection.stronglyCoveredConcepts.map((c, i) => (
                                <span key={i} className="px-2 py-0.5 bg-green-100 text-green-900 rounded font-semibold text-[11px]">
                                  ✓ {c}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedSection.recommendation && (
                          <div>
                            <span className="font-bold text-blue-800 block mb-1">💡 Suggested Improvement:</span>
                            <p className="text-blue-900 bg-blue-50 p-3 rounded-lg border border-blue-200 leading-relaxed">
                              {selectedSection.recommendation}
                            </p>
                          </div>
                        )}

                        <div>
                          <span className="font-bold text-gray-700 block mb-1">Exact Extracted Webpage Text:</span>
                          <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg font-mono text-[11px] text-gray-800 whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
                            {report.page.sections.find(s => s.id === selectedSection.sectionId)?.content || '(Content not found)'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: AI RECOMMENDATIONS */}
            {activeTab === 'recommendations' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-[var(--im-border)] p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[var(--im-heading)]">
                        Actionable Step-by-Step Fixes ({report.recommendations.length} Action Items)
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Prioritized recommendations based on search intent gaps, missing concepts, and competitor benchmarks.
                      </p>
                    </div>
                  </div>

                  {report.recommendations.length === 0 ? (
                    <div className="p-6 bg-green-50/50 rounded-xl border border-green-200 text-center text-xs text-green-900">
                      ✓ No critical fixes required! Your content cleanly matches user intent and search engine expectations.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {report.recommendations.map((rec, idx) => (
                        <div
                          key={idx}
                          className="p-5 rounded-xl border border-gray-200 bg-gray-50/40 hover:border-[#4caf50] transition-colors"
                        >
                          <div className="flex justify-between items-start gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 bg-white border px-2 py-0.5 rounded">
                                #{idx + 1}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 text-[10px] font-black rounded-md uppercase tracking-wide ${
                                  rec.priority === 'high'
                                    ? 'bg-red-100 text-red-800 border border-red-200'
                                    : rec.priority === 'medium'
                                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {rec.priority === 'high' ? '🔥 High Priority' : rec.priority === 'medium' ? '⚡ Medium Priority' : '✨ Low Priority'}
                              </span>
                              <h4 className="text-sm font-bold text-gray-900">
                                {rec.title}
                              </h4>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCopyRecommendation(idx, rec)}
                              className="text-xs font-semibold text-[#4caf50] hover:text-[#388e3c] bg-white border border-green-200 px-3 py-1 rounded-md shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1"
                            >
                              {copiedRecIndex === idx ? '✓ Copied to Clipboard!' : '📋 Copy Fix'}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
                            <div className="bg-white p-3.5 rounded-lg border border-red-100">
                              <span className="font-bold text-red-700 block mb-1">🚨 Identified Issue:</span>
                              <p className="text-gray-700 leading-relaxed">{rec.issue}</p>
                            </div>

                            <div className="bg-white p-3.5 rounded-lg border border-green-100">
                              <span className="font-bold text-green-700 block mb-1">💡 What to Write / Add:</span>
                              <p className="text-gray-700 leading-relaxed">{rec.proposedImprovement}</p>
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-gray-700 bg-gray-100/80 p-3.5 rounded-lg space-y-1.5">
                            <div><strong className="text-gray-900">🎯 Why Google Cares:</strong> {rec.seoRationale}</div>
                            {rec.suggestedPlacement && (
                              <div><strong className="text-gray-900">📍 Where to Put It on Page:</strong> {rec.suggestedPlacement}</div>
                            )}
                            <div><strong className="text-gray-900">📈 Reader Benefit:</strong> {rec.expectedUserBenefit}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}

