'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import {
  generateLocalSearchResults,
  LocalSearchResult,
  POPULAR_COUNTRIES,
  POPULAR_LANGUAGES
} from '@/lib/seo/localSearchService';

interface LocationSuggestion {
  canonicalName: string;
  title: string;
  subtitle: string;
  countryCode: string;
}

export default function LocalSearchTool() {
  // Primary Form State
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [countryCode, setCountryCode] = useState('in');
  const [languageCode, setLanguageCode] = useState('en');
  const [reducePersonalization, setReducePersonalization] = useState(true);

  // Advanced section toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Active Embedded Viewer View
  const [activeTab, setActiveTab] = useState<'search' | 'maps'>('search');
  const [deviceViewport, setDeviceViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [queryMode, setQueryMode] = useState<'strict_uule' | 'location_intent'>('strict_uule');

  // Execution & Feedback State
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LocalSearchResult | null>(null);
  const [copiedType, setCopiedType] = useState<'search' | 'maps' | null>(null);

  // Live Location Search Autocomplete State (Queries dynamic locations as user types)
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const locationWrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch real-time matching locations as user types (debounced, min 2 chars, never preloaded)
  useEffect(() => {
    const trimmed = location.trim();
    if (trimmed.length < 2) {
      setLocationSuggestions([]);
      setIsLoadingLocations(false);
      setShowLocationDropdown(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsLoadingLocations(true);

      try {
        const res = await fetch(`/api/seo/local-search/locations?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        });
        if (res.ok) {
          const data = (await res.json()) as { locations?: LocationSuggestion[] };
          const results = data.locations || [];
          setLocationSuggestions(results);
          setShowLocationDropdown(results.length > 0);
          setSelectedSuggestionIndex(-1);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setLocationSuggestions([]);
      } finally {
        setIsLoadingLocations(false);
      }
    }, 280);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [location]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (locationWrapperRef.current && !locationWrapperRef.current.contains(event.target as Node)) {
        setShowLocationDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectLocation = (loc: LocationSuggestion) => {
    setLocation(loc.canonicalName);
    if (loc.countryCode) {
      setCountryCode(loc.countryCode);
    }
    setShowLocationDropdown(false);
    setSelectedSuggestionIndex(-1);
    setLocationSuggestions([]);
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showLocationDropdown || locationSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev < locationSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : locationSuggestions.length - 1));
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      handleSelectLocation(locationSuggestions[selectedSuggestionIndex]);
    } else if (e.key === 'Escape') {
      setShowLocationDropdown(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!query.trim()) {
      setError('Please enter a search keyword or query.');
      return;
    }

    try {
      const generated = generateLocalSearchResults({
        query: query.trim(),
        location: location.trim() || undefined,
        countryCode: countryCode.trim() || undefined,
        languageCode: languageCode.trim() || undefined,
        reducePersonalization
      });
      setResult(generated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while formulating search targets.');
    }
  };

  const handleCopy = async (text: string, type: 'search' | 'maps') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-standard clipboard contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      // Ignore clipboard write failures gracefully
    }
  };

  // Compute active target URLs safely using WHATWG URL without duplicate q parameters
  const activeEmbedUrl = React.useMemo(() => {
    if (!result) return '';
    if (activeTab === 'maps') return result.googleMapsEmbedUrl;
    if (queryMode === 'location_intent' && result.searchLocation) {
      try {
        const u = new URL(result.googleSearchEmbedUrl);
        const cityPart = result.searchLocation.split(',')[0].trim();
        u.searchParams.set('q', `${result.searchQuery} in ${cityPart}`);
        return u.toString();
      } catch {
        return result.googleSearchEmbedUrl;
      }
    }
    return result.googleSearchEmbedUrl;
  }, [result, activeTab, queryMode]);

  const activeExternalUrl = React.useMemo(() => {
    if (!result) return '';
    if (activeTab === 'maps') return result.googleMapsUrl;
    if (queryMode === 'location_intent' && result.searchLocation) {
      try {
        const u = new URL(result.googleSearchUrl);
        const cityPart = result.searchLocation.split(',')[0].trim();
        u.searchParams.set('q', `${result.searchQuery} in ${cityPart}`);
        return u.toString();
      } catch {
        return result.googleSearchUrl;
      }
    }
    return result.googleSearchUrl;
  }, [result, activeTab, queryMode]);

  const faqItems = [
    {
      question: 'What is a local SERP checker?',
      answer: 'A local SERP checker is a search inspection utility that enables marketers, technical SEOs, and local business owners to view Google search engine results pages (SERPs) associated with a specific geographic location. Because Google tailors results based on geographic signals, a local SERP checker helps audit how organic rankings, Local 3-Packs, Knowledge Panels, and local business listings appear to users in different cities or regions without requiring physical relocation.'
    },
    {
      question: 'How can I check Google search results from another city?',
      answer: "To check Google results for another city: enter your target search query (e.g., 'plumber' or 'SEO agency'), specify your target city or region in the geographic location field (e.g., 'Austin, Texas, United States' or 'Mumbai, Maharashtra, India'), configure optional country (gl) and language (hl) settings, and click 'Generate & Inspect Local Search'. You can inspect the localized search directly in the embedded interactive pane or click 'Open Tab' to view the live query directly on Google."
    },
    {
      question: 'What is Google UULE and how does it work?',
      answer: "UULE is an unofficial, widely recognized URL parameter utilized by Google Search to associate queries with a specific canonical geographic location. It encodes the location name using a length-keyed character prefix followed by standard Base64 encoding (e.g., w+CAIQICI...). When appended to a search URL, it instructs Google's search infrastructure to evaluate the query within the specified geographic market, though it operates as a query-level targeting hint rather than an absolute device-level GPS override."
    },
    {
      question: 'What is the difference between gl, hl, and pws=0 parameters?',
      answer: "The 'gl' parameter defines the regional country market (e.g., gl=us for United States, gl=in for India), which determines country-specific domain handling and regional index selection. The 'hl' parameter controls Google's interface and snippet display language (e.g., hl=en for English). The 'pws=0' parameter instructs Google to suppress historical search personalization, helping provide a more standardized search perspective free from past browsing session bias."
    },
    {
      question: 'How does local Google Search differ from Google Maps results?',
      answer: 'Google Search displays a blended results page featuring traditional organic search listings, localized snippet features, People Also Ask blocks, and an embedded Local Map Pack (typically 3 featured local businesses). Google Maps, conversely, is a dedicated navigation and directory interface focused strictly on geographical business profiles, user reviews, directions, and proximity pins. Our tool generates dedicated links and embedded views for both environments so you can evaluate both organic and map-based visibility.'
    },
    {
      question: 'Does this tool simulate physical GPS coordinates or residential IP addresses?',
      answer: "No. Simulating physical GPS hardware signals or residential IP addresses requires specialized browser automation software or paid residential proxy networks. This tool leverages Google's native canonical location parameter (UULE) alongside geographic query parameters (gl, hl, pws=0). This provides a fast, frictionless, and free method to audit localized search results without violating Google guidelines or incurring proxy and API expenses."
    },
    {
      question: 'Why do local search results vary across different locations?',
      answer: "According to Google's official local search documentation, local results are determined primarily by three core ranking factors: relevance (how closely a business profile matches the user's search intent), distance (how far the business is from the user's location or the location specified in the query), and prominence (how well-known, established, and authoritative the business is based on web mentions, reviews, and organic links). Because distance and local relevance change by city, Google dynamically tailors the results."
    },
    {
      question: 'Is this Local SERP Checker completely free to use?',
      answer: 'Yes, 100% free. The tool runs entirely in your browser without requiring account registration, credit cards, Google Cloud project billing, Google Places API keys, or paid proxy subscriptions.'
    }
  ];

  const relatedTools = [
    {
      name: 'Review Link Generator',
      href: '/tools/review-link-generator',
      desc: 'Create direct 5-star Google review links and printable QR codes for local customers.'
    },
    {
      name: 'SERP Simulator',
      href: '/tools/serp-simulator',
      desc: 'Preview how local business title tags and meta descriptions appear in Google search results.'
    },
    {
      name: 'Schema Markup Generator',
      href: '/tools/schema-generator',
      desc: 'Generate LocalBusiness structured data to help search engines understand your address.'
    }
  ];

  const extraSections = (
    <div className="space-y-8 sm:space-y-12">
      {/* SECTION: HOW DOES OUR SEARCH LOCATION SIMULATOR WORK */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 sm:p-2.5 bg-blue-50 text-blue-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A2 2 0 013 15.488V5.092a2 2 0 011.056-1.764L9 1m0 19l6-3m-6 3V1m6 16.276l5.447 2.724A2 2 0 0021 18.092V7.692a2 2 0 00-1.056-1.764L15 3m0 16.276V3m0 0L9 1" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900">
            How Does Our Google Search Location Simulator Work?
          </h2>
        </div>
        <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6">
          Google personalizes and geo-targets search engine results based on several signals, including IP addresses, browser location settings, device sensors, and explicit search query terms. Our search location simulator constructs authentic, location-encoded query URLs that signal your intended geographic market directly to Google&apos;s search infrastructure.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5">
            <h3 className="text-base font-bold text-slate-900 mb-2.5 flex items-center gap-2">
              <span className="text-blue-600 font-mono text-sm bg-blue-100 px-2 py-0.5 rounded">uule</span>
              <span>Geographic Location &amp; UULE</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Google uses the canonical <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-xs text-slate-800">uule</code> parameter to represent a geographic location. Our tool calculates the canonical length key and encodes your chosen city, state, and country into standard Base64 format (e.g. <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-[11px] text-slate-700">w+CAIQICI...</code>), instructing Google to return results aligned with that target region.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5">
            <h3 className="text-base font-bold text-slate-900 mb-2.5 flex items-center gap-2">
              <span className="text-emerald-600 font-mono text-sm bg-emerald-100 px-2 py-0.5 rounded">gl &amp; hl</span>
              <span>Country &amp; Language Settings</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              The <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-xs text-slate-800">gl</code> parameter sets the two-letter ISO country market bias (e.g., <code className="text-xs">gl=in</code> for India or <code className="text-xs">gl=us</code> for the United States). Meanwhile, <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-xs text-slate-800">hl</code> controls Google&apos;s interface and snippet language, ensuring you view SERPs exactly as local language searchers see them.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5">
            <h3 className="text-base font-bold text-slate-900 mb-2.5 flex items-center gap-2">
              <span className="text-purple-600 font-mono text-sm bg-purple-100 px-2 py-0.5 rounded">pws=0</span>
              <span>Reduced Personalization</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              When enabled, <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-xs text-slate-800">pws=0</code> asks Google to minimize historical search profiling, cookies, and personalized browsing bias. This provides a cleaner baseline SERP inspection, though active Google Account logins and regional popularity trends may still exert subtle influence.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION: GOOGLE SEARCH VS GOOGLE MAPS LOCAL RESULTS */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 sm:p-2.5 bg-emerald-50 text-emerald-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900">
            Google Search vs Google Maps Local Results
          </h2>
        </div>
        <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6">
          Local search visibility spans two closely connected but distinct Google environments. Understanding how each ecosystem presents local businesses is essential for comprehensive local SEO audits:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
            <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
              <span>🔍</span> Google Search &amp; the Local 3-Pack
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
              Standard Google Search presents a blended SERP containing organic website links, sponsored ads, rich snippets, and—for local intent queries—a prominent <strong>Local 3-Pack</strong> map snippet. Ranking in the organic search results depends on traditional on-page SEO, technical architecture, and backlink authority, while Local 3-Pack placement heavily factors in Google Business Profile completeness and proximity.
            </p>
            <p className="text-xs text-slate-500">
              💡 <em>Tip: Use our <Link href="/tools/serp-simulator" className="text-blue-600 font-medium hover:underline">SERP Simulator</Link> to preview how your organic title tags and meta descriptions appear alongside local snippets.</em>
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
            <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
              <span>📍</span> Google Maps Dedicated Interface
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3">
              Google Maps is a dedicated geospatial discovery tool designed for navigation, direct store visits, and local directory filtering. In Google Maps, searchers browse extended lists of businesses plotted on an interactive map, sorted primarily by distance radius, customer star ratings, review velocity, opening hours, and category relevance.
            </p>
            <p className="text-xs text-slate-500">
              ⭐ <em>Tip: Strengthen your Google Maps visibility by generating frictionless review invitations with our <Link href="/tools/review-link-generator" className="text-blue-600 font-medium hover:underline">Review Link Generator</Link>.</em>
            </p>
          </div>
        </div>
      </section>

      {/* SECTION: WHY LOCAL SEARCH RESULTS CHANGE BY LOCATION */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 sm:p-2.5 bg-amber-50 text-amber-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900">
            Why Local Search Results Change by Location
          </h2>
        </div>
        <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6">
          According to official Google search documentation, local results are primarily based on three foundational criteria: <strong>relevance</strong>, <strong>distance</strong>, and <strong>prominence</strong>. These factors combine to help Google match searchers with the most helpful nearby businesses:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
            <div className="text-amber-600 font-bold text-sm mb-1 uppercase tracking-wider">Factor 1</div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Relevance</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Relevance measures how well a local business profile matches what someone is searching for. Detailed business descriptions, accurate primary and secondary categories, in-depth service menus, and relevant on-page website copy help Google understand your business and surface it for pertinent local queries.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
            <div className="text-amber-600 font-bold text-sm mb-1 uppercase tracking-wider">Factor 2</div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Distance</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Distance considers how far each potential business location is from the location term used in the search. If a searcher doesn&apos;t specify a location, Google calculates distance based on available location signals. Proximity creates hyper-localized variations, meaning searchers just a few kilometers apart often see different top rankings.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50">
            <div className="text-amber-600 font-bold text-sm mb-1 uppercase tracking-wider">Factor 3</div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Prominence</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Prominence reflects how well-known or authoritative a business is in the physical world and online. Google assesses prominence through web mentions, articles, local business directory citations, high-quality backlinks, and the volume and score of authentic Google customer reviews.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION: UNDERSTANDING LOCAL SEARCH SIMULATION LIMITATIONS */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 sm:p-2.5 bg-rose-50 text-rose-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900">
            Understanding Local Search Simulation Limitations
          </h2>
        </div>
        <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6">
          To maintain technical accuracy and transparent SEO methodology, users should understand what an on-demand location simulator can and cannot reproduce:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <strong className="block text-slate-900 font-bold mb-1">Simulated Parameters vs Physical GPS</strong>
            This tool formats query parameters (<code className="text-xs">uule</code>, <code className="text-xs">gl</code>, <code className="text-xs">hl</code>) to instruct Google which market to evaluate. It does not spoof hardware-level mobile GPS coordinates or route traffic through residential proxy IP addresses.
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <strong className="block text-slate-900 font-bold mb-1">On-Demand Audit vs Automated Rank Tracking</strong>
            This is an interactive search inspection utility designed for spot-checking localized SERPs in real time. It is not an automated rank tracker, geogrid matrix crawler, or automated SERP scraper.
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <strong className="block text-slate-900 font-bold mb-1">Viewport Dimensions vs Device Emulation</strong>
            The Mobile View toggle adjusts container dimensions to preview responsive layout presentation. It does not alter your device&apos;s underlying operating system, browser user-agent header, or touchscreen touch events.
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <strong className="block text-slate-900 font-bold mb-1">Embedded Viewer vs Browser Security Policies</strong>
            While the embedded pane provides fast in-app inspection using Google&apos;s <code className="text-xs">igu=1</code> reference parameter, certain browsers or extensions may restrict third-party frames. If blocked, clicking <strong>Open Tab</strong> immediately launches the authoritative query directly on Google.
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <ToolLayout
      title="Free Local SERP Checker & Search Location Simulator"
      description="Use Indian Marketers' free Local SERP Checker to inspect Google Search results for different cities and regions. Enter a keyword, choose a geographic location and generate location-targeted Google Search or Maps results to understand how search visibility can vary by location."
      category="Local SEO"
      breadcrumbs={[{ label: 'Local SERP Checker' }]}
      aboutTitle="What Is a Local SERP Checker?"
      aboutText={
        <div className="space-y-4">
          <p>
            A <strong>Local SERP Checker</strong> (or Google search location simulator) is an essential diagnostic utility for technical SEOs, digital agencies, and multi-location businesses. Because Google dynamically customizes search results, Local 3-Packs, Knowledge Panels, and local service ads based on where a searcher is located, evaluating search visibility from your own office or home only reveals your own neighborhood results.
          </p>
          <p>
            Our free <strong>Local SERP Checker</strong> solves this challenge by formulating authentic location-targeted Google Search and Google Maps URLs equipped with canonical Google UULE location parameters, country market bias (<code className="bg-slate-100 px-1 py-0.5 rounded text-xs">gl</code>), interface language controls (<code className="bg-slate-100 px-1 py-0.5 rounded text-xs">hl</code>), and reduced search personalization (<code className="bg-slate-100 px-1 py-0.5 rounded text-xs">pws=0</code>). This allows you to simulate searches from any city or region globally and inspect live search results directly inside an interactive browser pane or in separate browser tabs.
          </p>
          <div className="p-3.5 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
            <strong>Diagnostic inspection notice:</strong> This utility is designed for on-demand search inspection and local SERP analysis. It formulates search URLs using Google&apos;s canonical UULE specification rather than spoofing physical device GPS hardware or utilizing automated residential proxies. Real search outputs may also be influenced by active Google Account sessions and ISP routing.
          </div>
        </div>
      }
      howItWorksTitle="How to Check Google Search Results from Different Locations"
      howItWorks={[
        "Enter your target keyword or phrase in the Search Keyword / Query field (e.g., 'dentist near me', 'SEO services', 'plumber in Dallas'). Queries are preserved exactly without alteration.",
        "Specify your target geographic location in the Geographic Location field (e.g., 'Mumbai, Maharashtra, India' or 'Austin, Texas, United States') using the canonical City, State, Country format or selecting from the dynamic autocomplete dropdown.",
        "Optionally expand Advanced Options to configure your target country market bias (gl), interface language (hl), and reduced personalization (pws=0).",
        "Click 'Generate & Inspect Local Search' to compute the length-keyed Base64 Google UULE parameter and generate localized Google Search and Google Maps URLs.",
        "Inspect the live localized query directly in the embedded interactive browser pane below, switching between Google Search (SERP) and Google Maps tabs.",
        "Toggle between Desktop and Mobile View container dimensions to inspect how localized search snippets and local packs display across different viewports.",
        "Click 'Open Tab' or 'Copy' to view or share the authoritative live search query directly in your web browser."
      ]}
      extraSections={extraSections}
      faqTitle="Frequently Asked Questions"
      faq={faqItems}
      relatedTools={relatedTools}
    >
      {/* SECTION 1: SEARCH & LOCATION CONFIGURATION */}
      <div className="card mb-8">
        <div className="border-b border-slate-200 pb-4 mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Configure Local Search</h2>
            <p className="text-sm text-slate-500 mt-0.5">Specify your target keyword, search territory, and geographic parameters.</p>
          </div>
          <span className="badge badge-success hidden sm:inline-flex">100% Free &amp; No API Mandate</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Keyword Input */}
          <div className="input-group mb-4">
            <label className="label" htmlFor="local-search-query">
              Search Keyword / Query <span className="text-rose-600">*</span>
            </label>
            <input
              id="local-search-query"
              type="text"
              className="input font-medium"
              placeholder="e.g. dentist near me, SEO services, coffee shop"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (error) setError(null);
              }}
              required
              maxLength={300}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Enter any query: local services, commercial keywords, or &quot;near me&quot; searches. Queries are preserved exactly without alteration.
            </p>
          </div>

          {/* Location Input with Live Autocomplete Dropdown */}
          <div className="input-group mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0" htmlFor="local-search-location">
                Geographic Location
              </label>
              <span className="text-xs text-slate-400 font-medium">Canonical City / Region / Country</span>
            </div>

            <div className="relative" ref={locationWrapperRef}>
              <div className="relative">
                <input
                  id="local-search-location"
                  type="text"
                  autoComplete="off"
                  className="input font-medium pr-10"
                  placeholder="Type any neighborhood, city, or state (e.g. Bandra, Mumbai, Whitefield, London...)"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setSelectedSuggestionIndex(-1);
                  }}
                  onFocus={() => {
                    if (location.trim().length >= 2 && locationSuggestions.length > 0) {
                      setShowLocationDropdown(true);
                    }
                  }}
                  onKeyDown={handleLocationKeyDown}
                  maxLength={200}
                />
                {isLoadingLocations ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="animate-spin h-4 w-4 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                ) : location ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLocation('');
                      setLocationSuggestions([]);
                      setShowLocationDropdown(false);
                      setSelectedSuggestionIndex(-1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
                    title="Clear location"
                  >
                    ✕
                  </button>
                ) : (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-sm">
                    📍
                  </span>
                )}
              </div>

              {/* Autocomplete Dropdown - dynamic to user's search */}
              {showLocationDropdown && location.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-100">
                  <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between border-b border-slate-100">
                    <span>Locations for &quot;{location.trim()}&quot;</span>
                    {isLoadingLocations ? (
                      <span className="text-emerald-600 font-normal">Searching...</span>
                    ) : (
                      <span>Use ↑↓ and Enter</span>
                    )}
                  </div>
                  {locationSuggestions.map((loc, idx) => {
                    const isSelected = idx === selectedSuggestionIndex;

                    return (
                      <button
                        key={`${loc.canonicalName}-${idx}`}
                        type="button"
                        onClick={() => handleSelectLocation(loc)}
                        className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 transition-colors text-xs ${
                          isSelected ? 'bg-emerald-50 text-emerald-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-emerald-600 text-sm shrink-0">📍</span>
                          <span className="truncate">
                            <strong className="text-slate-900 font-bold">{loc.title}</strong>
                            {loc.subtitle && <span className="text-slate-500 ml-1">, {loc.subtitle}</span>}
                          </span>
                        </div>
                        {loc.countryCode && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {loc.countryCode}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {locationSuggestions.length === 0 && !isLoadingLocations && (
                    <div className="p-3 text-xs text-slate-500 text-center">
                      No matching locations found for &quot;{location.trim()}&quot;. Custom query will be used.
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 mt-1.5">
              💡 <strong>Pro-Tip for Google UULE:</strong> Choose from the dropdown or enter <code>City, State, Country</code> (e.g. <strong>Ahmednagar, Maharashtra, India</strong>). Appending the country ensures Google overrides your physical IP instead of falling back to your local city.
            </p>
          </div>

          {/* ADVANCED SETTINGS ACCORDION */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left text-sm font-bold text-slate-800 hover:bg-slate-100/80 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>⚙️</span> Advanced Options (Country, Language &amp; Personalization)
              </span>
              <span className="text-xs text-slate-500">
                {showAdvanced ? '▲ Hide Advanced' : '▼ Show Advanced'}
              </span>
            </button>

            {showAdvanced && (
              <div className="p-5 border-t border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Country Code (gl) */}
                <div>
                  <label className="label text-sm" htmlFor="country-select">
                    Target Country / Market (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">gl</code>)
                  </label>
                  <select
                    id="country-select"
                    className="select text-sm"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                  >
                    <option value="">No Country Restriction</option>
                    {POPULAR_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Directs Google to serve country-specific regional index (e.g. <code className="text-xs">gl=in</code> for India).
                  </p>
                </div>

                {/* Interface Language (hl) */}
                <div>
                  <label className="label text-sm" htmlFor="language-select">
                    Google Language (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">hl</code>)
                  </label>
                  <select
                    id="language-select"
                    className="select text-sm"
                    value={languageCode}
                    onChange={(e) => setLanguageCode(e.target.value)}
                  >
                    <option value="">Default Language</option>
                    {POPULAR_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Sets Google interface &amp; snippet language (e.g. <code className="text-xs">hl=hi</code> for Hindi).
                  </p>
                </div>

                {/* Personalization Setting */}
                <div className="sm:col-span-2 pt-2 border-t border-slate-100 flex items-start gap-3">
                  <input
                    id="reduce-personalization"
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    checked={reducePersonalization}
                    onChange={(e) => setReducePersonalization(e.target.checked)}
                  />
                  <label htmlFor="reduce-personalization" className="text-sm font-semibold text-slate-800 cursor-pointer">
                    Reduce Personalized Search (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">pws=0</code>)
                    <span className="block text-xs text-slate-500 font-normal mt-0.5">
                      Minimizes historical profile bias in search results. While helpful, it cannot guarantee fully neutral or anonymous output if Google Account history or device telemetry is present.
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Validation Error Feedback */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Submit Action */}
          <button
            type="submit"
            className="btn btn-primary w-full text-base py-3.5 shadow-md flex items-center justify-center gap-2"
          >
            <span>🔍</span> Generate &amp; Inspect Local Search
          </button>
        </form>
      </div>

      {/* SECTION 2: RESULTS & EMBEDDED IN-PANE BROWSER */}
      {result && (
        <div className="card space-y-6 mb-8 border-green-200 shadow-md">
          {/* Header */}
          <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span>📍</span> Local Search Targets Ready
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Target Query: <strong className="text-slate-800">&quot;{result.searchQuery}&quot;</strong>
                {result.searchLocation && (
                  <span> • Market Location: <strong className="text-slate-800">&quot;{result.searchLocation}&quot;</strong></span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-success text-xs">Live Pane Ready</span>
            </div>
          </div>

          {/* Parameter Summary Panel */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="block font-semibold text-slate-500">Query:</span>
              <span className="font-bold text-slate-800 truncate block" title={result.searchQuery}>
                {result.searchQuery}
              </span>
            </div>
            <div>
              <span className="block font-semibold text-slate-500">Search Location:</span>
              <span className="font-bold text-slate-800 truncate block" title={result.searchLocation || 'None Specified'}>
                {result.searchLocation || 'None Specified'}
              </span>
            </div>
            <div>
              <span className="block font-semibold text-slate-500">Country &amp; Language:</span>
              <span className="font-bold text-slate-800">
                gl={result.countryCode || 'default'} • hl={result.languageCode || 'default'}
              </span>
            </div>
            <div>
              <span className="block font-semibold text-slate-500">Location Encoding:</span>
              <span className="font-bold">
                {result.uuleStatus === 'encoded' ? (
                  <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                    ✓ Google UULE Active
                  </span>
                ) : result.uuleStatus === 'fallback_length_exceeded' ? (
                  <span className="text-amber-700 font-extrabold">Query-based Fallback</span>
                ) : (
                  <span className="text-slate-500">Standard Query</span>
                )}
              </span>
            </div>
          </div>

          {/* Warning if any */}
          {result.warning && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
              <strong>Notice:</strong> {result.warning}
            </div>
          )}

          {/* EMBEDDED IN-PANE BROWSER VIEWER */}
          <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            {/* Viewer Bar Controls */}
            <div className="bg-slate-100 p-2.5 sm:p-3 sm:px-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
              {/* Tab Selector: Google Search vs Google Maps */}
              <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    activeTab === 'search'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🔍</span> Google Search (SERP)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('maps')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    activeTab === 'maps'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>📍</span> Google Maps
                </button>
              </div>

              {/* Location Targeting Mode Toggle (when on search tab) */}
              {activeTab === 'search' && result.searchLocation && (
                <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-xs">
                  <span className="text-[10px] text-slate-400 uppercase px-1.5 hidden sm:inline">Strategy:</span>
                  <button
                    type="button"
                    onClick={() => setQueryMode('strict_uule')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                      queryMode === 'strict_uule'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Searches the exact keyword unmodified (e.g. 'dentist') while applying location strictly via Google's UULE parameter"
                  >
                    🏷️ Exact Keyword Only (UULE)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueryMode('location_intent')}
                    className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                      queryMode === 'location_intent'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Appends the city name to the query keyword (e.g. 'dentist in Mumbai') to test explicit local intent queries"
                  >
                    📍 Append City ({result.searchLocation.split(',')[0].trim()})
                  </button>
                </div>
              )}

              {/* Viewport Dimension Toggle: Desktop vs Mobile */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden sm:flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setDeviceViewport('desktop')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      deviceViewport === 'desktop'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🖥️ Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceViewport('mobile')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      deviceViewport === 'mobile'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📱 Mobile View
                  </button>
                </div>

                {/* External Launch & Copy Quick Buttons */}
                <a
                  href={activeExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs py-1.5 px-3 bg-white text-slate-800 border-slate-300 hover:bg-slate-50 flex items-center gap-1"
                >
                  <span>Open Tab ↗</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleCopy(activeExternalUrl, activeTab)}
                  className="btn btn-secondary text-xs py-1.5 px-3 bg-white text-slate-800 border-slate-300 hover:bg-slate-50 flex items-center gap-1"
                >
                  {copiedType === activeTab ? (
                    <span className="text-emerald-700 font-bold">✓ Copied</span>
                  ) : (
                    <span>📋 Copy</span>
                  )}
                </button>
              </div>
            </div>

            {/* Embedded Browser Frame Display */}
            <div className="bg-slate-200/60 p-2 sm:p-4 flex items-center justify-center min-h-[420px] sm:min-h-[550px]">
              <div
                className={`transition-all duration-300 bg-white rounded-xl shadow-md border border-slate-300 overflow-hidden ${
                  deviceViewport === 'mobile'
                    ? 'w-full max-w-[420px] h-[540px] sm:h-[680px] rounded-2xl sm:rounded-3xl border-2 sm:border-4 border-slate-800'
                    : 'w-full h-[480px] sm:h-[620px]'
                }`}
              >
                {/* Simulated Device Header (if in mobile view) */}
                {deviceViewport === 'mobile' && (
                  <div className="bg-slate-800 px-4 py-1.5 text-[11px] font-medium text-slate-300 flex items-center justify-between">
                    <span>9:41</span>
                    <span className="flex items-center gap-1.5 text-[10px]">
                      <span>📶</span> <span>🔋 100%</span>
                    </span>
                  </div>
                )}

                <iframe
                  key={`${activeTab}-${queryMode}-${result.searchQuery}-${result.searchLocation}-${result.countryCode}`}
                  src={activeEmbedUrl}
                  title="Localized Search Results"
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Frame Helper Bar */}
            <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
              <span className="truncate max-w-xl">
                Active Source: <code className="bg-white px-1 py-0.5 rounded border border-slate-200">{activeEmbedUrl}</code>
              </span>
              <span>
                Tip: If your browser blocks 3rd-party cookies/frames for Google, click <strong>Open Full Tab ↗</strong>
              </span>
            </div>
          </div>

          {/* Technical Accuracy & Transparency Notice */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>ℹ️</span> SEO Accuracy &amp; Location Targeting Transparency
            </div>
            <p>
              This tool formulates direct Google Search and Google Maps URLs using standard geographic parameters (<code className="text-xs">uule</code>, <code className="text-xs">gl</code>, <code className="text-xs">hl</code>, <code className="text-xs">pws=0</code>). The embedded browser pane displays the localized results directly inside the tool pane for convenient side-by-side inspection. It does <strong>not</strong> claim to simulate a physical GPS device or display fabricated rank positions. Real results may also be influenced by your active Google Account state and network provider IP.
            </p>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
