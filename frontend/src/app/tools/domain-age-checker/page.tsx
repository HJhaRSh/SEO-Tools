'use client';

import React, { useState, useId } from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import type { DomainCheckResult, DomainAgeCheckResponse } from '@/lib/seo/domain-age/types';
import { formatDateUtc, formatDomainAgeString } from '@/lib/seo/domain-age/dateUtils';

const MAX_BULK_DOMAINS = 20;

function sanitizeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Protect against spreadsheet formula injection
  const escaped = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (escaped.includes('"') || escaped.includes(',') || escaped.includes('\n') || escaped.includes('\r')) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

function generateBulkCsv(results: DomainCheckResult[]): string {
  const headers = [
    'Domain',
    'Original Input',
    'Status',
    'Domain Age',
    'Total Age Days',
    'Creation Date',
    'Updated Date',
    'Expiry Date',
    'Days Until Expiry',
    'Registrar',
    'Registration Status',
    'Data Source',
    'Error'
  ];

  const rows = results.map(r => [
    r.domain,
    r.input,
    r.status,
    r.age ? formatDomainAgeString(r.age) : '',
    r.totalAgeDays !== null ? r.totalAgeDays : '',
    r.createdAt ? formatDateUtc(r.createdAt) : '',
    r.updatedAt ? formatDateUtc(r.updatedAt) : '',
    r.expiresAt ? formatDateUtc(r.expiresAt) : '',
    r.daysUntilExpiry !== null ? r.daysUntilExpiry : '',
    r.registrar || '',
    r.registrationStatuses.join('; '),
    r.source,
    r.error || ''
  ]);

  return [
    headers.map(h => sanitizeCsvField(h)).join(','),
    ...rows.map(row => row.map(sanitizeCsvField).join(','))
  ].join('\r\n');
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function DomainAgeCheckerPage() {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [singleInput, setSingleInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [singleResult, setSingleResult] = useState<DomainCheckResult | null>(null);
  const [bulkResults, setBulkResults] = useState<DomainCheckResult[]>([]);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedBulk, setCopiedBulk] = useState(false);

  const singleInputId = useId();
  const bulkInputId = useId();

  // Helper to parse lines in bulk textarea
  const parseBulkLines = (raw: string): string[] => {
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
  };

  const detectedBulkCount = parseBulkLines(bulkInput).length;
  const isLoading = status === 'loading';

  // Handle Single Check
  const handleSingleCheck = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;

    const trimmed = singleInput.trim();
    if (!trimmed) {
      setStatus('error');
      setErrorMessage('Please enter a valid public domain name or website URL.');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);
    setSingleResult(null);

    try {
      const res = await fetch('/api/seo/domain-age/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: trimmed })
      });

      const data: DomainAgeCheckResponse = await res.json().catch(() => ({
        success: false,
        error: 'Failed to parse server response.',
        checkedAt: new Date().toISOString(),
        totalCount: 0,
        successfulCount: 0,
        failedCount: 0,
        results: []
      }));

      if (!res.ok || !data.success || !Array.isArray(data.results) || data.results.length === 0) {
        throw new Error(data.error || 'Failed to retrieve domain registration records.');
      }

      const result = data.results[0];
      setSingleResult(result);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An unexpected error occurred while checking domain age.');
    }
  };

  // Handle Bulk Check
  const handleBulkCheck = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;

    const lines = parseBulkLines(bulkInput);

    if (lines.length === 0) {
      setStatus('error');
      setErrorMessage('Please enter at least one domain or URL to check.');
      return;
    }

    if (lines.length > MAX_BULK_DOMAINS) {
      setStatus('error');
      setErrorMessage(`Too many domains. Maximum allowed per batch is ${MAX_BULK_DOMAINS}. You entered ${lines.length} domains.`);
      return;
    }

    setStatus('loading');
    setErrorMessage(null);
    setBulkResults([]);

    try {
      const res = await fetch('/api/seo/domain-age/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: lines })
      });

      const data: DomainAgeCheckResponse = await res.json().catch(() => ({
        success: false,
        error: 'Failed to parse server response.',
        checkedAt: new Date().toISOString(),
        totalCount: 0,
        successfulCount: 0,
        failedCount: 0,
        results: []
      }));

      if (!res.ok || !data.success || !Array.isArray(data.results)) {
        throw new Error(data.error || 'Failed to process bulk domain check.');
      }

      setBulkResults(data.results);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred during bulk checking.');
    }
  };

  const handleClear = () => {
    setSingleInput('');
    setBulkInput('');
    setStatus('idle');
    setErrorMessage(null);
    setSingleResult(null);
    setBulkResults([]);
  };

  const handleCopySingleReport = () => {
    if (!singleResult) return;
    const lines = [
      `Domain: ${singleResult.domain}`,
      singleResult.age ? `Domain Age: ${formatDomainAgeString(singleResult.age)}` : null,
      singleResult.totalAgeDays !== null ? `Total Age: ${singleResult.totalAgeDays.toLocaleString()} days` : null,
      singleResult.createdAt ? `Registered On: ${formatDateUtc(singleResult.createdAt)}` : null,
      singleResult.updatedAt ? `Last Updated: ${formatDateUtc(singleResult.updatedAt)}` : null,
      singleResult.expiresAt ? `Expires On: ${formatDateUtc(singleResult.expiresAt)}` : null,
      singleResult.daysUntilExpiry !== null ? `Days Until Expiry: ${singleResult.daysUntilExpiry}` : null,
      singleResult.registrar ? `Registrar: ${singleResult.registrar}` : null,
      singleResult.registrationStatuses.length > 0 ? `Status: ${singleResult.registrationStatuses.join(', ')}` : null,
      singleResult.nameServers.length > 0 ? `Nameservers: ${singleResult.nameServers.join(', ')}` : null,
      `Source: ${singleResult.source} Authoritative Registry`,
      `Checked via Indian Marketers SEO Tools (https://indianmarketers.in/tools/domain-age-checker)`
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    });
  };

  const handleCopyBulkSummary = () => {
    if (bulkResults.length === 0) return;
    const summary = bulkResults.map(r => {
      const ageStr = r.age ? formatDomainAgeString(r.age) : 'Age unavailable';
      const createdStr = r.createdAt ? formatDateUtc(r.createdAt) : 'Creation date unavailable';
      return `${r.domain} | Age: ${ageStr} | Registered: ${createdStr} | Registrar: ${r.registrar || 'N/A'}`;
    }).join('\n');

    navigator.clipboard.writeText(summary).then(() => {
      setCopiedBulk(true);
      setTimeout(() => setCopiedBulk(false), 2500);
    });
  };

  const handleExportCsv = () => {
    if (bulkResults.length === 0) return;
    const csv = generateBulkCsv(bulkResults);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `domain-age-report-${dateStr}.csv`);
  };

  const handleRetryFailed = () => {
    const failedDomains = bulkResults
      .filter(r => r.status !== 'success' && r.status !== 'partial_data')
      .map(r => r.input);
    if (failedDomains.length > 0) {
      setBulkInput(failedDomains.join('\n'));
      setBulkResults([]);
      setStatus('idle');
    }
  };

  const setSampleDomain = (dom: string) => {
    setSingleInput(dom);
    setMode('single');
    setStatus('idle');
    setErrorMessage(null);
    setSingleResult(null);
  };

  const aboutText = (
    <div className="space-y-4 text-sm sm:text-base leading-relaxed text-[var(--im-text)]">
      <p>
        <strong>Domain age</strong> is the elapsed time since a domain name was registered with an authoritative top-level domain (TLD) registry, calculated from the creation date recorded in its active registry file. It is determined by measuring the calendar difference between that authoritative registration timestamp and today&apos;s date in completed years, months, and days.
      </p>
      <p>
        When using a <strong>domain registration date checker</strong>, it is important to understand registry record lifecycles. Standard domain renewals and registrar transfers preserve the original registration creation date. However, if a domain expires, lapses past all redemption grace periods, and is purged from the registry, any subsequent registration creates a brand new record with a new registration date. As a result, the current registry creation date reflects the ongoing registration cycle rather than proof of uninterrupted historical website activity.
      </p>
    </div>
  );

  const howItWorks = [
    'Enter a domain name or complete website URL (e.g. google.com or https://example.com). To audit multiple web addresses at once, switch to the "Bulk Domains" tab.',
    'Click "Check Domain Age" (or "Check Bulk Domains"). As a high-performance bulk domain age checker, the tool supports batches of up to 20 domains with bounded concurrency to prevent registry throttling.',
    'The tool normalizes each domain name, queries the official IANA bootstrap registry, and retrieves authoritative registration records directly via the Registration Data Access Protocol (RDAP).',
    'Review the exact registration creation date, calculated domain age in years, months, and days, total elapsed days, upcoming expiration date, sponsoring registrar, and authoritative nameservers, with one-click report copying and spreadsheet CSV export.'
  ];

  const extraSections = (
    <>
      {/* Section: Domain Age vs. Website Age */}
      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Domain Age vs. Website Age</h2>
        </div>
        <div className="space-y-4 text-sm sm:text-base leading-relaxed text-[var(--im-text)]">
          <p>
            When people search for a <em>website age checker</em> or look to <em>check website domain age</em>, they often treat domain age and website age as interchangeable. However, they represent fundamentally different metrics in web architecture:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] text-sm mb-1.5">Domain Registration Age</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Reflects the registry record creation timestamp. An investor may register a domain name and leave it parked on a blank page or default placeholder for ten years. The domain age is ten years, but it possesses no website history or search indexation.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] text-sm mb-1.5">Website Publication Age</h3>
              <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                Reflects how long an active, crawlable website with substantive content has been live, accessible to users, and indexed by search engines. A domain registration date cannot confirm when an actual business launched or when content was first published.
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[var(--im-text-muted)]">
            Additionally, an older domain may have changed hands multiple times, experienced complete topic shifts, or been dropped and re-registered. An authoritative domain registration record verifies registry longevity, not continuous website operation or historical editorial continuity.
          </p>
        </div>
      </section>

      {/* Section: How Does Our Domain Age Checker Work? */}
      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">How Does Our Domain Age Checker Work?</h2>
        </div>
        <div className="space-y-4 text-sm sm:text-base leading-relaxed text-[var(--im-text)]">
          <p>
            Unlike legacy online utilities that rely on brittle text scraping of obsolete WHOIS port 43 servers, the Indian Marketers Domain Age Checker queries the <strong>Registration Data Access Protocol (RDAP)</strong>. Under ICANN consensus policy effective January 28, 2025, RDAP serves as the primary, authoritative protocol for generic top-level domain (gTLD) registration data across accredited registries and registrars.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-2 text-xs sm:text-sm">
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] mb-1">IANA Bootstrap Discovery</h3>
              <p className="text-[var(--im-text-muted)] leading-relaxed">
                The tool resolves the domain&apos;s public suffix against the authoritative IANA RDAP bootstrap registry, discovering the correct authoritative endpoint without intermediary proxies.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] mb-1">Exact Calendar Calculation</h3>
              <p className="text-[var(--im-text-muted)] leading-relaxed">
                Domain age is calculated using UTC calendar arithmetic accounting for leap years, month lengths, and anniversary dates, giving you exact completed years, months, days, and total elapsed days.
              </p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] mb-1">Authoritative Transparency</h3>
              <p className="text-[var(--im-text-muted)] leading-relaxed">
                We show registry timestamps, sponsoring registrar names, and nameservers. If a ccTLD restricts public registration dates under local privacy laws, we disclose that clearly rather than estimating.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Does Domain Age Affect Google Rankings? */}
      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Does Domain Age Affect Google Rankings?</h2>
        </div>
        <div className="space-y-4 text-sm sm:text-base leading-relaxed text-[var(--im-text)]">
          <p>
            Google Search representatives have repeatedly stated that <strong>domain registration age is not an algorithmic ranking factor</strong>. Simply holding an older domain name does not confer an automatic advantage in Google Search, nor does registering a domain for multiple years in advance boost search rankings.
          </p>
          <p>
            When older websites rank competitively, their search performance is typically driven by assets accumulated over years of active development:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] text-sm mb-1">Editorial Backlink Equity</h3>
              <p className="text-xs text-[var(--im-text-muted)]">Natural inbound links earned over time from relevant industry websites and publications.</p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] text-sm mb-1">Topic Authority & Content Depth</h3>
              <p className="text-xs text-[var(--im-text-muted)]">Extensive, well-maintained content architectures covering user search queries comprehensively.</p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] text-sm mb-1">Established Brand Signals</h3>
              <p className="text-xs text-[var(--im-text-muted)]">Recognizable brand demand, direct navigation, and habitual audience engagement.</p>
            </div>
            <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
              <h3 className="font-bold text-[var(--im-heading)] text-sm mb-1">Crawling & Indexing Stability</h3>
              <p className="text-xs text-[var(--im-text-muted)]">Clean site architecture, persistent internal links, and a historical record of reliable server uptime.</p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[var(--im-text-muted)]">
            A newly registered domain featuring fast performance, rigorous technical SEO, and genuinely helpful content can readily outrank an older, neglected domain. Registration age alone does not establish authority or quality.
          </p>
        </div>
      </section>

      {/* Section: Practical Uses of Domain Age Verification */}
      <section>
        <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
          <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Practical Uses of Domain Age Verification</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <h3 className="font-bold text-[var(--im-heading)] text-base">Domain Acquisition Due Diligence</h3>
            <p className="text-[var(--im-text)] leading-relaxed">
              Before purchasing a domain on secondary marketplaces, verify that its registration history aligns with seller claims. Check whether the domain was continuously renewed or dropped and recently re-registered. Once acquired, use our <Link href="/tools/bulk-google-index-checker" className="text-[var(--im-primary-deep)] font-semibold hover:underline">Bulk Google Index Checker</Link> to inspect which URLs remain indexed by Google.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-[var(--im-heading)] text-base">Competitor Registration Auditing</h3>
            <p className="text-[var(--im-text)] leading-relaxed">
              Audit the registration timelines of competing domains within your industry. Compare how long competitors have held their domains and verify nameserver configurations. If restructuring a newly acquired domain asset, test crawler directives with our <Link href="/tools/robots-txt-tester" className="text-[var(--im-primary-deep)] font-semibold hover:underline">robots.txt Tester</Link>.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-[var(--im-heading)] text-base">Portfolio Expiration Monitoring</h3>
            <p className="text-[var(--im-text)] leading-relaxed">
              Track renewal schedules and days remaining until expiration across client or company domain portfolios. For newly launched or transferred web properties, generate an updated sitemap using our <Link href="/tools/sitemap-generator" className="text-[var(--im-primary-deep)] font-semibold hover:underline">XML Sitemap Generator</Link> to accelerate search discovery.
            </p>
          </div>
        </div>
      </section>
    </>
  );

  const faqs = [
    {
      question: 'How do I check the age of a domain?',
      answer: 'Enter any domain name or website URL (such as google.com or https://example.com) into the input field and click "Check Domain Age". The tool normalizes the input, queries the authoritative registry via RDAP, and calculates the exact elapsed age in years, months, and days.'
    },
    {
      question: 'Is this Domain Age Checker free?',
      answer: 'Yes. Our Domain Age Checker is 100% free with no account registration, no API key required, and no hidden subscriptions.'
    },
    {
      question: 'Can I check multiple domains at once?',
      answer: 'Yes. Switch to the "Bulk Domains" tab to check up to 20 domains in a single batch. The bulk domain age checker queries authoritative registries with bounded concurrency to respect rate limits, and results can be exported as a spreadsheet CSV.'
    },
    {
      question: 'How is domain age calculated?',
      answer: 'Domain age is calculated using calendar arithmetic from the authoritative UTC registration creation timestamp to the current date. This accounts for leap years, varying month lengths, and anniversary boundaries rather than approximating 365 days per year.'
    },
    {
      question: 'Is domain age the same as website age?',
      answer: 'No. Domain age measures the time since the domain name was registered with an authoritative registry. Website age refers to how long an active, crawlable website has published content on that domain. A domain can remain parked for years without hosting a website.'
    },
    {
      question: "Can a domain's registration date change?",
      answer: 'Yes. If a domain registration lapses completely and the domain is deleted from the registry and later re-registered, the registry assigns a new creation date. However, standard renewals and registrar transfers preserve the original creation date.'
    },
    {
      question: "Why is a domain's registration date unavailable?",
      answer: 'Some country-code top-level domains (ccTLDs) do not operate public RDAP servers or withhold registration timestamps under local privacy regulations. When registry records omit this data, the tool clearly states that it is unavailable rather than guessing.'
    },
    {
      question: 'Does domain age affect Google rankings?',
      answer: 'No. Google search representatives have confirmed that domain registration age is not an algorithmic ranking factor. Older websites often perform well in search because they have built content depth, high-quality backlinks, and brand authority over time, not solely because of their registration date.'
    },
    {
      question: 'Can I check domain expiration dates?',
      answer: 'Yes. When exposed by the authoritative registry, the tool reports the official expiration date and calculates the exact days remaining until renewal.'
    },
    {
      question: 'How accurate is RDAP compared with WHOIS?',
      answer: 'RDAP (Registration Data Access Protocol) is the modern, standardized protocol specified by ICANN and the IETF (RFC 9083). It returns machine-readable JSON directly from authoritative registry databases, eliminating the formatting inconsistencies and fragile text scraping of legacy WHOIS.'
    },
    {
      question: 'How do I check when a domain was first registered?',
      answer: 'Our tool displays the creation date from the current authoritative registry record. If a domain was dropped in the past and subsequently re-registered, the registry record reflects the latest registration cycle. To research historical website deployments from prior cycles, review historical snapshots on the Internet Archive (Wayback Machine).'
    }
  ];

  return (
    <ToolLayout
      title="Free Domain Age Checker Online"
      description="Use Indian Marketers' free Domain Age Checker to find when a domain was registered and calculate its age in years, months and days. Check a single domain or up to 20 domains at once, with available registration, expiration and registrar details."
      category="Crawling & Access"
      breadcrumbs={[
        { label: 'Tools', href: '/tools' },
        { label: 'Domain Age Checker' }
      ]}
      aboutTitle="What Is Domain Age?"
      aboutText={aboutText}
      howItWorksTitle="How to Check Domain Age and Registration Date"
      howItWorks={howItWorks}
      extraSections={extraSections}
      faq={faqs}
    >
      <div className="space-y-6">
        
        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-2 border-b border-[var(--im-border)] pb-4">
          <button
            type="button"
            onClick={() => { setMode('single'); setErrorMessage(null); }}
            className={`px-5 py-2.5 rounded-[var(--im-radius-pill)] text-sm font-bold transition-all cursor-pointer ${
              mode === 'single'
                ? 'bg-[#47A048] text-white shadow-sm ring-1 ring-[#47A048]'
                : 'bg-[var(--im-surface)] text-[var(--im-text)] border border-[var(--im-border)] hover:border-[#47A048]'
            }`}
          >
            Single Domain
          </button>
          <button
            type="button"
            onClick={() => { setMode('bulk'); setErrorMessage(null); }}
            className={`px-5 py-2.5 rounded-[var(--im-radius-pill)] text-sm font-bold transition-all cursor-pointer ${
              mode === 'bulk'
                ? 'bg-[#47A048] text-white shadow-sm ring-1 ring-[#47A048]'
                : 'bg-[var(--im-surface)] text-[var(--im-text)] border border-[var(--im-border)] hover:border-[#47A048]'
            }`}
          >
            Bulk Domains
            <span className="ml-1.5 text-xs opacity-80">(up to {MAX_BULK_DOMAINS})</span>
          </button>
        </div>

        {/* Input Card */}
        <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-[var(--im-radius-md)] p-6 sm:p-8 shadow-[var(--im-shadow-sm)]">
          {mode === 'single' ? (
            <form onSubmit={handleSingleCheck} className="space-y-4">
              <div>
                <label
                  htmlFor={singleInputId}
                  className="block text-sm font-semibold text-[var(--im-heading)] mb-2"
                >
                  Domain Name or Website URL
                </label>
                <div className="relative">
                  <input
                    id={singleInputId}
                    type="text"
                    value={singleInput}
                    onChange={e => setSingleInput(e.target.value)}
                    disabled={isLoading}
                    placeholder="Enter a domain or URL (e.g., google.com or https://example.co.uk)"
                    className="w-full pl-4 pr-10 py-3.5 rounded-[var(--im-radius-sm)] bg-[var(--im-bg-soft)] border border-[var(--im-border)] text-base text-[var(--im-text)] placeholder:text-[var(--im-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--im-accent-tint)] focus:border-[var(--im-primary-deep)] transition-all font-mono disabled:opacity-60"
                  />
                  {singleInput && !isLoading && (
                    <button
                      type="button"
                      onClick={() => setSingleInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--im-text-muted)] hover:text-[var(--im-text)] text-sm font-bold p-1"
                      title="Clear input"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Sample Domain Shortcuts */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[var(--im-text-muted)]">
                <span className="font-semibold text-[var(--im-heading)]">Try samples:</span>
                {['google.com', 'wikipedia.org', 'amazon.in', 'example.co.uk', 'indianmarketers.in'].map(sample => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setSampleDomain(sample)}
                    className="px-2.5 py-1 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-md hover:border-[var(--im-primary)] hover:text-[var(--im-primary-deep)] transition-colors cursor-pointer font-mono"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  id="domain-age-submit-single"
                  disabled={isLoading || !singleInput.trim()}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--im-radius-md)] bg-[#47A048] text-white font-semibold text-sm shadow-[var(--im-shadow-sm)] hover:bg-[#3d8b3e] focus:outline-none focus:ring-2 focus:ring-[#47A048] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Querying RDAP...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Check Domain Age
                    </>
                  )}
                </button>

                {(singleInput || singleResult) && (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={isLoading}
                    className="px-4 py-3 rounded-[var(--im-radius-md)] border border-[var(--im-border)] text-sm font-semibold text-[var(--im-text)] hover:bg-[var(--im-bg-soft)] transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={handleBulkCheck} className="space-y-4">
              <div>
                <label
                  htmlFor={bulkInputId}
                  className="block text-sm font-semibold text-[var(--im-heading)] mb-2"
                >
                  Domains to Check
                  <span className="ml-2 text-xs font-normal text-[var(--im-text-muted)]">
                    One domain or URL per line · maximum {MAX_BULK_DOMAINS}
                  </span>
                </label>
                <textarea
                  id={bulkInputId}
                  rows={6}
                  value={bulkInput}
                  onChange={e => setBulkInput(e.target.value)}
                  disabled={isLoading}
                  placeholder={`google.com\nmicrosoft.com\namazon.in\nexample.co.uk\nwikipedia.org`}
                  className="w-full px-4 py-3 rounded-[var(--im-radius-sm)] bg-[var(--im-bg-soft)] border border-[var(--im-border)] text-sm text-[var(--im-text)] placeholder:text-[var(--im-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--im-accent-tint)] focus:border-[var(--im-primary-deep)] transition-all font-mono resize-y disabled:opacity-60"
                />
                {bulkInput.trim() && (
                  <p className="mt-2 text-xs text-[var(--im-text-muted)]">
                    {detectedBulkCount} domain{detectedBulkCount !== 1 ? 's' : ''} detected
                    {detectedBulkCount > MAX_BULK_DOMAINS && (
                      <span className="ml-1 text-red-600 font-semibold">
                        — exceeds limit of {MAX_BULK_DOMAINS}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  id="domain-age-submit-bulk"
                  disabled={isLoading || !bulkInput.trim() || detectedBulkCount > MAX_BULK_DOMAINS}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--im-radius-md)] bg-[#47A048] text-white font-semibold text-sm shadow-[var(--im-shadow-sm)] hover:bg-[#3d8b3e] focus:outline-none focus:ring-2 focus:ring-[#47A048] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Checking Batch...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Check Bulk Domains
                    </>
                  )}
                </button>

                {(bulkInput || bulkResults.length > 0) && (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={isLoading}
                    className="px-4 py-3 rounded-[var(--im-radius-md)] border border-[var(--im-border)] text-sm font-semibold text-[var(--im-text)] hover:bg-[var(--im-bg-soft)] transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-[var(--im-radius-md)] text-sm text-red-700 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="font-semibold">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* SINGLE RESULT CARD */}
        {mode === 'single' && singleResult && (
          <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-[var(--im-radius-md)] shadow-[var(--im-shadow-sm)] overflow-hidden">
            
            {/* Header Badge & Main Age Highlight */}
            <div className="p-6 sm:p-8 border-b border-[var(--im-border)] bg-[var(--im-bg-soft)]">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-[var(--im-heading)] font-mono">
                      {singleResult.domain}
                    </h2>
                    {singleResult.input !== singleResult.domain && (
                      <p className="text-xs text-[var(--im-text-muted)] font-mono">
                        Input: {singleResult.input}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status Pill */}
                <div>
                  {singleResult.status === 'success' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Authoritative Record Found
                    </span>
                  )}
                  {singleResult.status === 'partial_data' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                      Partial Registration Record
                    </span>
                  )}
                  {singleResult.status === 'not_found' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                      Domain Not Found in Registry
                    </span>
                  )}
                  {singleResult.status === 'unsupported' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
                      Public RDAP Unavailable for TLD
                    </span>
                  )}
                  {(singleResult.status === 'error' || singleResult.status === 'timeout' || singleResult.status === 'rate_limited') && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                      {singleResult.status === 'timeout' ? 'Registry Timeout' : singleResult.status === 'rate_limited' ? 'Rate Limited' : 'Lookup Error'}
                    </span>
                  )}
                </div>
              </div>

              {/* Age Highlight Area */}
              {singleResult.age ? (
                <div className="mt-4 p-5 bg-[var(--im-surface)] border border-[var(--im-border)] rounded-xl shadow-[var(--im-shadow-sm)]">
                  <div className="text-xs font-semibold text-[var(--im-text-muted)] uppercase tracking-wider mb-1">
                    Calculated Domain Age
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-[var(--im-heading)]">
                    {formatDomainAgeString(singleResult.age)}
                  </div>
                  {singleResult.totalAgeDays !== null && (
                    <div className="text-sm font-semibold text-[var(--im-primary-deep)] mt-1">
                      {singleResult.totalAgeDays.toLocaleString()} total elapsed days
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  {singleResult.error || 'Registration creation date is not published by the authoritative registry.'}
                </div>
              )}
            </div>

            {/* Registration Details Grid */}
            <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
              
              {/* Registered Date */}
              <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
                <div className="text-xs font-semibold text-[var(--im-text-muted)] uppercase mb-1">Registered On</div>
                <div className="font-bold text-[var(--im-heading)] text-base">
                  {formatDateUtc(singleResult.createdAt)}
                </div>
                <div className="text-xs text-[var(--im-text-muted)] mt-1 font-mono">
                  {singleResult.createdAt ? new Date(singleResult.createdAt).toISOString() : 'Not provided by registry'}
                </div>
              </div>

              {/* Last Updated Date */}
              <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
                <div className="text-xs font-semibold text-[var(--im-text-muted)] uppercase mb-1">Last Updated</div>
                <div className="font-bold text-[var(--im-heading)] text-base">
                  {formatDateUtc(singleResult.updatedAt)}
                </div>
                <div className="text-xs text-[var(--im-text-muted)] mt-1 font-mono">
                  {singleResult.updatedAt ? new Date(singleResult.updatedAt).toISOString() : 'Not available'}
                </div>
              </div>

              {/* Expiry Date */}
              <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
                <div className="text-xs font-semibold text-[var(--im-text-muted)] uppercase mb-1">Expires On</div>
                <div className="font-bold text-[var(--im-heading)] text-base">
                  {formatDateUtc(singleResult.expiresAt)}
                </div>
                <div className="text-xs text-[var(--im-text-muted)] mt-1">
                  {singleResult.daysUntilExpiry !== null ? (
                    singleResult.daysUntilExpiry > 0 ? (
                      <span className="text-emerald-700 font-semibold">
                        Expires in {singleResult.daysUntilExpiry.toLocaleString()} days
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold">
                        Expiry date passed — verify status
                      </span>
                    )
                  ) : (
                    'Expiration date not provided'
                  )}
                </div>
              </div>

              {/* Registrar */}
              <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
                <div className="text-xs font-semibold text-[var(--im-text-muted)] uppercase mb-1">Registrar</div>
                <div className="font-bold text-[var(--im-heading)] text-base">
                  {singleResult.registrar || 'Not available'}
                </div>
                <div className="text-xs text-[var(--im-text-muted)] mt-1">
                  Authoritative sponsoring registrar
                </div>
              </div>

              {/* Registration Status */}
              <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
                <div className="text-xs font-semibold text-[var(--im-text-muted)] uppercase mb-1">Registry Status</div>
                {singleResult.registrationStatuses.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {singleResult.registrationStatuses.map(st => (
                      <span key={st} className="px-2 py-0.5 bg-[var(--im-surface)] border border-[var(--im-border)] rounded text-xs font-medium text-[var(--im-text)]">
                        {st}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[var(--im-text-muted)]">Standard / Active</div>
                )}
              </div>

              {/* Data Source & Cache */}
              <div className="p-4 bg-[var(--im-bg-soft)] rounded-lg border border-[var(--im-border)]">
                <div className="text-xs font-semibold text-[var(--im-text-muted)] uppercase mb-1">Data Source</div>
                <div className="font-bold text-[var(--im-heading)] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  {singleResult.source} Authoritative Protocol
                </div>
                <div className="text-xs text-[var(--im-text-muted)] mt-1 truncate" title={singleResult.sourceUrl || ''}>
                  {singleResult.sourceUrl ? (
                    <a href={singleResult.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--im-primary-deep)] hover:underline">
                      View registry endpoint
                    </a>
                  ) : (
                    'IANA Bootstrap'
                  )}
                  {singleResult.cached && (
                    <span className="ml-1 text-[var(--im-text-muted)]">(cached)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Nameservers List */}
            {singleResult.nameServers.length > 0 && (
              <div className="px-6 sm:px-8 pb-6 border-t border-[var(--im-border)] pt-4">
                <div className="text-xs font-semibold text-[var(--im-text-muted)] uppercase mb-2">Authoritative Nameservers</div>
                <div className="flex flex-wrap gap-2">
                  {singleResult.nameServers.map(ns => (
                    <span key={ns} className="px-3 py-1 bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-md font-mono text-xs text-[var(--im-text)]">
                      {ns}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Card Footer Actions */}
            <div className="p-6 bg-[var(--im-bg-soft)] border-t border-[var(--im-border)] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCopySingleReport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--im-radius-md)] bg-[var(--im-surface)] border border-[var(--im-border)] text-sm font-semibold text-[var(--im-heading)] hover:border-[var(--im-primary-deep)] transition-all cursor-pointer"
              >
                {copiedSummary ? (
                  <>
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied Summary!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Formatted Report
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setSingleInput(''); setSingleResult(null); }}
                className="text-sm font-semibold text-[var(--im-primary-deep)] hover:underline cursor-pointer"
              >
                Check another domain →
              </button>
            </div>
          </div>
        )}

        {/* BULK RESULTS TABLE */}
        {mode === 'bulk' && bulkResults.length > 0 && (
          <div className="bg-[var(--im-surface)] border border-[var(--im-border)] rounded-[var(--im-radius-md)] shadow-[var(--im-shadow-sm)] overflow-hidden">
            
            {/* Table Header Controls */}
            <div className="p-4 sm:p-6 border-b border-[var(--im-border)] flex flex-wrap items-center justify-between gap-4 bg-[var(--im-bg-soft)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--im-heading)]">
                  Bulk Registration Results
                </h3>
                <p className="text-xs text-[var(--im-text-muted)]">
                  {bulkResults.length} domain{bulkResults.length !== 1 ? 's' : ''} checked · {bulkResults.filter(r => r.status === 'success' || r.status === 'partial_data').length} successful
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#47A048] text-white text-xs font-semibold shadow-sm hover:bg-[#3d8b3e] transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV
                </button>

                <button
                  type="button"
                  onClick={handleCopyBulkSummary}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--im-surface)] border border-[var(--im-border)] text-xs font-semibold text-[var(--im-text)] hover:border-[var(--im-primary-deep)] transition-colors cursor-pointer"
                >
                  {copiedBulk ? 'Copied!' : 'Copy Summary'}
                </button>

                {bulkResults.some(r => r.status !== 'success' && r.status !== 'partial_data') && (
                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    Retry Failed
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 py-2 rounded-lg border border-[var(--im-border)] text-xs font-medium text-[var(--im-text-muted)] hover:text-[var(--im-text)] transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--im-border)] bg-[var(--im-surface)] text-[var(--im-text-muted)] text-xs uppercase font-semibold">
                    <th className="py-3.5 px-4 font-semibold">Domain</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Domain Age</th>
                    <th className="py-3.5 px-4 font-semibold">Registered</th>
                    <th className="py-3.5 px-4 font-semibold">Expires</th>
                    <th className="py-3.5 px-4 font-semibold">Registrar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--im-border)]">
                  {bulkResults.map((r, i) => (
                    <tr key={`${r.domain}-${i}`} className="hover:bg-[var(--im-bg-soft)] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-[var(--im-heading)] whitespace-nowrap">
                        {r.domain}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {r.status === 'success' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                            Success
                          </span>
                        )}
                        {r.status === 'partial_data' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                            Partial
                          </span>
                        )}
                        {r.status === 'not_found' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                            Not Found
                          </span>
                        )}
                        {r.status === 'unsupported' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                            Unsupported TLD
                          </span>
                        )}
                        {r.status === 'invalid_input' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                            Invalid Input
                          </span>
                        )}
                        {(r.status === 'error' || r.status === 'timeout' || r.status === 'rate_limited') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800" title={r.error || ''}>
                            {r.status === 'timeout' ? 'Timeout' : r.status === 'rate_limited' ? 'Rate Limit' : 'Failed'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[var(--im-heading)] whitespace-nowrap">
                        {r.age ? (
                          <span>
                            {r.age.years}y {r.age.months}m {r.age.days}d
                            <span className="text-xs text-[var(--im-text-muted)] block font-mono">
                              {r.totalAgeDays?.toLocaleString()} days
                            </span>
                          </span>
                        ) : (
                          <span className="text-[var(--im-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--im-text)] whitespace-nowrap">
                        {formatDateUtc(r.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--im-text)] whitespace-nowrap">
                        {formatDateUtc(r.expiresAt)}
                        {r.daysUntilExpiry !== null && (
                          <span className="text-xs block text-[var(--im-text-muted)]">
                            {r.daysUntilExpiry > 0 ? `in ${r.daysUntilExpiry.toLocaleString()}d` : 'expired'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--im-text)] truncate max-w-[200px]" title={r.registrar || ''}>
                        {r.registrar || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </ToolLayout>
  );
}
