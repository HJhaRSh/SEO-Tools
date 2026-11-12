'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import ToolLayout from '@/components/ToolLayout';
import {
  AllSchemasState,
  OutputFormat,
  SupportedSchemaType,
} from '@/lib/seo/schema/types';
import {
  RICH_RESULT_META_MAP,
  SUPPORTED_SCHEMA_TYPES,
} from '@/lib/seo/schema/constants';
import {
  getDefaultSchemasState,
  getBlankSchemasState,
} from '@/lib/seo/schema/schemaConfig';
import {
  copyTextToClipboard,
  generateSchemaOutput,
  triggerFileDownload,
} from '@/lib/seo/schema/export';
import { validateSchema } from '@/lib/seo/schema/validators';
import { importExistingJsonLd } from '@/lib/seo/schema/importer';
import SchemaFormFields from '@/components/schema/SchemaFormFields';
import SchemaTypeDropdown from '@/components/schema/SchemaTypeDropdown';
import SchemaValidationPanel from '@/components/schema/SchemaValidationPanel';

export default function SchemaGenerator() {
  // Current active schema type selection
  const [schemaType, setSchemaType] = useState<SupportedSchemaType>('Organization');

  // Master state holding form drafts for all schemas to preserve user work across tabs (starts blank by default)
  const [schemasState, setSchemasState] = useState<AllSchemasState>(() => getBlankSchemasState());

  // UI state controls
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('script');
  const [copySuccess, setCopySuccess] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Active form data
  const currentFormData = schemasState[schemaType] || ({} as Record<string, unknown>);

  // Update specific field in the active schema draft
  const handleFieldChange = (field: string, value: unknown) => {
    setSchemasState((prev) => ({
      ...prev,
      [schemaType]: {
        ...prev[schemaType],
        [field]: value,
      },
    }));
  };

  // Live generated output derived synchronously from current state
  const generated = useMemo(() => {
    return generateSchemaOutput(
      schemaType,
      currentFormData as unknown as Record<string, unknown>,
      outputFormat
    );
  }, [schemaType, currentFormData, outputFormat]);

  // Live validation checks
  const validationIssues = useMemo(() => {
    return validateSchema(schemaType, currentFormData as unknown as Record<string, unknown>);
  }, [schemaType, currentFormData]);

  // Current rich result metadata
  const richResultMeta = RICH_RESULT_META_MAP[schemaType] || {
    status: 'supported',
    statusBadge: 'Schema.org Standard',
    badgeClass: 'badge-neutral',
    note: 'Valid Schema.org linked data format.',
    docUrl: 'https://schema.org',
  };

  // Copy action
  const handleCopyCode = async () => {
    const success = await copyTextToClipboard(generated.code);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  // Download action
  const handleDownload = () => {
    const filename = `${schemaType.toLowerCase()}-schema.${outputFormat === 'script' ? 'html' : 'json'}`;
    const mime = outputFormat === 'script' ? 'text/html' : 'application/ld+json';
    triggerFileDownload(generated.code, filename, mime);
  };

  // Reset active schema draft
  const handleResetCurrent = () => {
    const blanks = getBlankSchemasState();
    setSchemasState((prev) => ({
      ...prev,
      [schemaType]: blanks[schemaType],
    }));
  };

  // Reset all schema drafts to defaults
  const handleLoadDefaults = () => {
    const defaults = getDefaultSchemasState();
    setSchemasState(defaults);
  };

  // Import JSON-LD handler
  const handleExecuteImport = () => {
    setImportError(null);
    setImportNotice(null);
    const result = importExistingJsonLd(importInput);
    if (!result.success || !result.detectedType || !result.parsedData) {
      setImportError(result.error || 'Failed to parse JSON-LD data.');
      return;
    }

    setSchemaType(result.detectedType);
    setSchemasState((prev) => ({
      ...prev,
      [result.detectedType!]: {
        ...prev[result.detectedType!],
        ...result.parsedData,
      },
    }));

    setImportNotice(
      result.warning
        ? `Imported ${result.detectedType} schema data. ${result.warning}`
        : `Successfully imported ${result.detectedType} schema data!`
    );
    setTimeout(() => {
      setShowImportModal(false);
      setImportInput('');
      setImportNotice(null);
    }, result.warning ? 2400 : 1200);
  };

  // External validator openers
  const handleOpenGoogleRichResultsTest = () => {
    window.open('https://search.google.com/test/rich-results', '_blank', 'noopener,noreferrer');
  };

  const handleOpenSchemaOrgValidator = () => {
    window.open('https://validator.schema.org/', '_blank', 'noopener,noreferrer');
  };

  return (
    <ToolLayout
      title="Free Schema Markup Generator – JSON-LD Tool"
      description="Use Indian Marketers' free Schema Markup Generator to create Schema.org JSON-LD structured data for your website. Choose a supported schema type, complete the relevant fields, review validation feedback and copy or download the generated code."
      category="Search Appearance"
      breadcrumbs={[{ label: 'Schema Markup Generator' }]}
      aboutTitle="What Is a Schema Markup Generator?"
      aboutText={
        <div className="space-y-3">
          <p>
            A <strong>schema markup generator</strong> is a technical SEO tool that produces standardized, machine-readable structured data in <strong>JSON-LD</strong> (JavaScript Object Notation for Linked Data) format. Search engines such as Google, Bing, and Yahoo use structured data based on the open-source <a href="https://schema.org" target="_blank" rel="noopener noreferrer" className="text-[var(--im-primary-deep)] underline font-medium">Schema.org</a> vocabulary to disambiguate webpage entities, understand page content, and extract key attributes.
          </p>
          <p>
            Instead of manually handwriting error-prone JSON syntax, a <strong>JSON-LD generator</strong> allows you to input your webpage details into structured form fields and instantly outputs validated code ready for implementation. The generator creates the code block for you to copy or download; it does not automatically publish or inject markup onto your live site.
          </p>
          <p>
            While Schema.org defines hundreds of entity types and thousands of properties across the web, Google Search actively supports a specific subset for rich result appearances in search engine result pages (SERPs). Implementing valid structured data provides search crawlers with explicit semantic context, but search engines ultimately determine whether any visual enhancements are shown.
          </p>
        </div>
      }
      howItWorksTitle="How to Generate JSON-LD Schema Markup"
      howItWorks={[
        'Select a Schema.org type from the dropdown, such as Organization, Local Business, Article, Product, or Breadcrumb List.',
        'Choose a specific subtype when applicable (e.g., Corporation, Restaurant, or NewsArticle) to provide granular entity context.',
        'Fill out the required and recommended form fields with accurate information matching your webpage\'s visible content.',
        'Review live validation checks to verify required syntax, URL protocol schemes, and date formats.',
        'Choose between HTML <script> tag output or raw JSON-LD format depending on your CMS requirements.',
        'Copy the generated code or download the file, and test your markup using the Google Rich Results Test or Schema.org Validator before publishing.',
      ]}
      extraSections={
        <>
          {/* SECTION: WHAT SCHEMA TYPES CAN YOU CREATE? */}
          <section>
            <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
              <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">What Schema Types Can You Create?</h2>
            </div>
            <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-4">
              <p>
                Our <strong>free schema generator</strong> supports 19 core Schema.org types grouped into functional technical SEO categories:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                    Entity &amp; Brand Identity
                  </h3>
                  <ul className="text-xs sm:text-sm text-[var(--im-text)] space-y-1.5 list-disc list-inside">
                    <li><strong>Organization:</strong> Represents companies, non-profits, or institutions. Supports 12 subtypes (e.g., Corporation, EducationalOrganization, NGO), logo, and sameAs profiles.</li>
                    <li><strong>LocalBusiness:</strong> Defines storefronts, clinics, or regional offices with street address, geo-coordinates, telephone, and opening hours. Supports subtypes like Restaurant and Store.</li>
                    <li><strong>Person:</strong> Identifies authors, founders, or public figures for author attribution and E-E-A-T signals.</li>
                    <li><strong>Service:</strong> Outlines commercial or professional service offerings linked to an organization.</li>
                  </ul>
                </div>

                <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                    Content &amp; Editorial
                  </h3>
                  <ul className="text-xs sm:text-sm text-[var(--im-text)] space-y-1.5 list-disc list-inside">
                    <li><strong>Article:</strong> Editorial publications, blogs (BlogPosting), and journalistic articles (NewsArticle) with headline, author, image, and publication dates.</li>
                    <li><strong>Recipe:</strong> Culinary recipes with ingredients, preparation steps, prep time, and nutrition info.</li>
                    <li><strong>FAQPage:</strong> Standard Schema.org markup for frequently asked questions (note: Google discontinued general FAQ rich results in May 2026).</li>
                    <li><strong>HowTo:</strong> Step-by-step guides with materials and sequential steps (Schema.org semantic syntax).</li>
                  </ul>
                </div>

                <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                    Commerce &amp; Careers
                  </h3>
                  <ul className="text-xs sm:text-sm text-[var(--im-text)] space-y-1.5 list-disc list-inside">
                    <li><strong>Product:</strong> E-commerce items with brand, SKU, offers, price, currency, availability, and aggregate reviews.</li>
                    <li><strong>JobPosting:</strong> Employment vacancies including title, hiring organization, employment type, location, and base salary.</li>
                  </ul>
                </div>

                <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-xs">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--im-heading)] mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--im-primary-deep)]"></span>
                    Navigation, Media &amp; Specialized
                  </h3>
                  <ul className="text-xs sm:text-sm text-[var(--im-text)] space-y-1.5 list-disc list-inside">
                    <li><strong>BreadcrumbList:</strong> Declares website hierarchical trails displayed in search snippets.</li>
                    <li><strong>WebSite &amp; WebPage:</strong> Declares domain identity, site navigation, and Sitelinks Searchbox potential actions.</li>
                    <li><strong>Media Objects:</strong> VideoObject and ImageObject (including Google licensable metadata).</li>
                    <li><strong>Specialized:</strong> SoftwareApplication, Course, Dataset, and Event structured data.</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION: HOW TO ADD JSON-LD STRUCTURED DATA TO YOUR WEBSITE */}
          <section>
            <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
              <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">How to Add JSON-LD Structured Data to Your Website</h2>
            </div>
            <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-3">
              <p>
                Structured data in JSON-LD is embedded into your HTML document using an enclosed script block:
              </p>
              <pre className="p-3 sm:p-4 rounded-xl bg-[#0f172a] text-[#e2e8f0] font-mono text-xs overflow-x-auto">
                <code>{`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Brand Name",
  "url": "https://example.com"
}
</script>`}</code>
              </pre>
              <p>
                <strong>Script Placement:</strong> Google supports JSON-LD script blocks placed in either the <code>&lt;head&gt;</code> or the <code>&lt;body&gt;</code> section of the HTML document. Placing the markup in the <code>&lt;head&gt;</code> is traditional practice, but placing it in the <code>&lt;body&gt;</code> (such as via Google Tag Manager or modern single-page frameworks) is fully compliant with Googlebot.
              </p>
              <p>
                <strong>Content Parity Principle:</strong> Structured data must always reflect the actual, visible content that human visitors see on the page. Never generate markup for products, reviews, or services that are not present or accessible on the target URL. Adding markup for hidden or misleading information violates Google&apos;s General Structured Data Guidelines and risks manual actions.
              </p>
            </div>
          </section>

          {/* SECTION: HOW TO TEST GENERATED SCHEMA MARKUP */}
          <section>
            <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
              <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">How to Test Generated Schema Markup</h2>
            </div>
            <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-3">
              <p>
                Before publishing schema markup to your production website, always validate the code using official testing tools. Our generator includes direct shortcuts to both primary validators:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl p-4">
                  <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">1. Schema Markup Validator (Schema.org)</h3>
                  <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                    Operated by Schema.org, this tool validates syntax, entity relationships, and property names against the global Schema.org standard. It confirms whether your linked data is structurally valid, regardless of whether a specific search engine feature exists.
                  </p>
                </div>
                <div className="bg-[var(--im-bg-soft)] border border-[var(--im-border)] rounded-xl p-4">
                  <h3 className="font-bold text-sm sm:text-base text-[var(--im-heading)] mb-1.5">2. Google Rich Results Test</h3>
                  <p className="text-xs sm:text-sm text-[var(--im-text)] leading-relaxed">
                    Operated by Google, this test verifies whether your structured data satisfies Google-specific requirements for supported search features (such as Product rich results or Breadcrumbs). It flags missing required or recommended properties specific to Google Search.
                  </p>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-[var(--im-text-muted)]">
                A passing result in the Schema Markup Validator does not guarantee that a page qualifies for a Google rich result. To audit structured data already deployed across live URLs, use our <Link href="/tools/schema-checker" className="text-[var(--im-primary-deep)] font-semibold underline">Bulk Schema Checker</Link>.
              </p>
            </div>
          </section>

          {/* SECTION: SCHEMA MARKUP AND GOOGLE RICH RESULTS */}
          <section>
            <div className="flex items-center gap-3 mb-3.5 sm:mb-4">
              <div className="p-2 sm:p-2.5 bg-[var(--im-accent-tint)] text-[var(--im-secondary)] rounded-[var(--im-radius-sm)]">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-[var(--im-heading)]">Schema Markup and Google Rich Results</h2>
            </div>
            <div className="text-[var(--im-text)] leading-relaxed text-sm sm:text-base space-y-3">
              <p>
                Structured data helps Google understand the explicit context of your content and unlocks eligibility for enhanced search appearances. However, webmasters must keep realistic expectations:
              </p>
              <ul className="text-xs sm:text-sm text-[var(--im-text)] space-y-2 list-disc list-inside">
                <li><strong>No Rich Result Guarantees:</strong> Google does not guarantee that rich snippets (such as review stars, price tags, or event dates) will appear in search results, even when your JSON-LD passes all validation tests. Search algorithms decide whether to display enhancements based on query intent, user location, and algorithmic quality assessments.</li>
                <li><strong>No Direct Ranking Boost:</strong> Structured data is not a direct ranking factor that automatically propels a webpage to top search rankings. Its primary function is semantic clarity and eligibility for search features.</li>
                <li><strong>Google Search Feature Changes:</strong> Google periodically adjusts supported search features. For example, Google discontinued HowTo rich results in 2023 and sunset general FAQ rich results in May 2026 for commercial sites. While FAQPage and HowTo remain valid Schema.org vocabulary, standard websites should not expect rich search snippets from them.</li>
                <li><strong>Entity Disambiguation:</strong> Organization and Person markup help reinforce brand entities. To discover official Google Entity Machine IDs (MIDs) for your schema, try our <Link href="/tools/knowledge-graph-search" className="text-[var(--im-primary-deep)] font-semibold underline">Knowledge Graph Search</Link>, or test search appearance snippets with our <Link href="/tools/serp-simulator" className="text-[var(--im-primary-deep)] font-semibold underline">SERP Simulator</Link>.</li>
              </ul>
            </div>
          </section>
        </>
      }
      faqTitle="Frequently Asked Questions"
      faq={[
        {
          question: 'What is a Schema Markup Generator?',
          answer:
            'A schema markup generator is a technical SEO tool that produces standardized, machine-readable structured data in JSON-LD format based on inputs you provide in a guided form. It eliminates manual coding errors and creates Schema.org code ready to add to your website.',
        },
        {
          question: 'What is JSON-LD and why is it recommended?',
          answer:
            'JSON-LD (JavaScript Object Notation for Linked Data) is a lightweight Linked Data format that embeds structured data inside a <script type="application/ld+json"> tag. It is the format recommended by Google and the W3C because it remains clean and separate from visible HTML elements.',
        },
        {
          question: 'Do I need to paste JSON-LD schema into the <head> or <body>?',
          answer:
            'Google supports JSON-LD script blocks placed in either the <head> or the <body> of the HTML document. Placing it in the <head> is traditional industry practice, but placing it in the <body> is fully supported and processed by Googlebot.',
        },
        {
          question: 'Does schema markup guarantee Google rich results or higher rankings?',
          answer:
            "No. Valid structured data makes your page eligible for supported Google search enhancements, but Google's algorithms decide whether to display them based on user intent and quality signals. Structured data does not guarantee rich results or higher organic rankings.",
        },
        {
          question: 'Which Schema.org types does this generator support?',
          answer:
            'The generator supports 19 primary Schema.org types and numerous subtypes, including Organization (with 12 subtypes), LocalBusiness (with 7 subtypes), Article, Product, BreadcrumbList, Event, Recipe, JobPosting, Person, VideoObject, ImageObject, SoftwareApplication, and WebSite.',
        },
        {
          question: 'Can I import and edit existing JSON-LD code?',
          answer:
            'Yes. Click the "Import / Edit Existing JSON-LD" button, paste your raw JSON-LD or full <script> tag, and the tool will parse your markup, detect the schema type, and populate the editable form fields. Properties outside the supported schema definitions may be omitted.',
        },
        {
          question: 'Does FAQ schema still generate Google FAQ rich results?',
          answer:
            'No. Google discontinued general FAQ rich snippets in May 2026 for commercial and standard websites. FAQPage remains a valid Schema.org vocabulary type for semantic structuring and voice search, but standard websites will not receive accordion rich results.',
        },
        {
          question: 'What is the difference between a Schema Generator and a Schema Checker?',
          answer:
            "A Schema Generator creates new Schema.org JSON-LD code from scratch for you to implement on your website. A Schema Checker (such as Indian Marketers' Bulk Schema Checker) inspects already published URLs to detect, extract, and audit deployed structured data.",
        },
      ]}
      relatedTools={[
        {
          name: 'Bulk Schema Checker',
          href: '/tools/schema-checker',
          desc: 'Validate and detect structured data markup across single pages or bulk URLs up to 100 pages.',
        },
        {
          name: 'Knowledge Graph Search',
          href: '/tools/knowledge-graph-search',
          desc: "Search Google's Knowledge Graph to find official Entity Machine IDs (MIDs) for your schema.",
        },
        {
          name: 'SERP Simulator',
          href: '/tools/serp-simulator',
          desc: 'Preview how rich snippet enhancements (like star ratings and publication dates) appear in SERPs.',
        },
      ]}
    >
      {/* ---------------------------------------------------- */}
      {/* TOP CONTROLS & IMPORT MODAL TOGGLE */}
      {/* ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary text-xs sm:text-sm py-2 px-3.5 font-bold inline-flex items-center gap-1.5"
          >
            <span>📥</span> Import / Edit Existing JSON-LD
          </button>
          <button
            type="button"
            onClick={handleLoadDefaults}
            className="btn btn-secondary text-xs sm:text-sm py-2 px-3.5 font-bold"
            title="Load realistic example preset data"
          >
            ↺ Load Examples
          </button>
        </div>

        <button
          type="button"
          onClick={handleResetCurrent}
          className="text-xs sm:text-sm text-slate-500 hover:text-rose-600 font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors"
        >
          Clear Current Form
        </button>
      </div>

      {/* ---------------------------------------------------- */}
      {/* INPUT SECTION CARD */}
      {/* ---------------------------------------------------- */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <div
          style={{
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            paddingBottom: '16px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>INPUT SECTION</h2>
          <span className="text-xs font-semibold text-slate-500">
            Fields marked with <span className="text-red-500 font-bold">*</span> are required for search eligibility
          </span>
        </div>

        {/* Schema Type Selector */}
        <div className="input-group">
          <label className="label">Schema Type</label>
          <SchemaTypeDropdown
            value={schemaType}
            onChange={(type) => setSchemaType(type)}
          />
        </div>

        {/* Dynamic Form Controls for the selected schema */}
        <SchemaFormFields
          schemaType={schemaType}
          state={currentFormData as unknown as Record<string, unknown>}
          onChange={handleFieldChange}
        />

        {/* Real-time Validation & Google Status Panel */}
        <SchemaValidationPanel
          issues={validationIssues}
          richResultMeta={richResultMeta}
        />
      </div>

      {/* ---------------------------------------------------- */}
      {/* GENERATED SCHEMA OUTPUT CARD */}
      {/* ---------------------------------------------------- */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            paddingBottom: '16px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div className="flex items-center gap-3">
            <h2 style={{ fontSize: '18px', fontWeight: 800 }}>GENERATED SCHEMA</h2>
            <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setOutputFormat('script')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  outputFormat === 'script'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                HTML &lt;script&gt;
              </button>
              <button
                type="button"
                onClick={() => setOutputFormat('json')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  outputFormat === 'json'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Raw JSON-LD
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleOpenGoogleRichResultsTest}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '13px' }}
              title="Test generated schema in Google Rich Results Test"
            >
              Test with Google ↗
            </button>
            <button
              type="button"
              onClick={handleOpenSchemaOrgValidator}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '13px' }}
              title="Validate with Schema.org official validator"
            >
              Schema Validator ↗
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '13px' }}
            >
              Download
            </button>
            <button
              type="button"
              onClick={handleCopyCode}
              className={`btn ${copySuccess ? 'btn-secondary text-green-700 border-green-500' : 'btn-primary'}`}
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              {copySuccess ? '✓ Copied to Clipboard!' : 'Copy Code'}
            </button>
          </div>
        </div>

        <pre className="p-3.5 sm:p-6 rounded-2xl overflow-x-auto touch-scroll text-xs sm:text-[13.5px] leading-relaxed max-h-[560px] bg-[#0f172a] text-[#e2e8f0] font-mono">
          <code>{generated.code}</code>
        </pre>
      </div>

      {/* ---------------------------------------------------- */}
      {/* IMPORT JSON-LD MODAL */}
      {/* ---------------------------------------------------- */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                Import Existing Schema JSON-LD
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportError(null);
                  setImportNotice(null);
                }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Paste your raw JSON-LD or an entire <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">&lt;script type=&quot;application/ld+json&quot;&gt;</code> tag. The tool will parse it and populate the form fields.
            </p>

            <textarea
              className="textarea font-mono text-xs"
              rows={8}
              placeholder={`{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "My Business",\n  "url": "https://example.com"\n}`}
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
            />

            {importError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-300 text-xs font-semibold">
                {importError}
              </div>
            )}

            {importNotice && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
                {importNotice}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="btn btn-secondary text-sm py-2 px-4 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                className="btn btn-primary text-sm py-2 px-5 font-bold"
              >
                Parse & Populate Form
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
