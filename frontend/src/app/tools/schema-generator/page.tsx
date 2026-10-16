'use client';

import React, { useState, useMemo } from 'react';
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
      title="Schema Markup Generator"
      description="Generate and validate production-ready Schema.org JSON-LD structured data in real-time."
      category="Search Appearance & Structured Data"
      breadcrumbs={[{ label: 'Schema Markup Generator' }]}
      aboutText="Structured data helps search engines understand the context of your content, leading to Rich Snippets (like review stars or event details) in search results. This tool generates valid JSON-LD code that you can copy and paste into your HTML."
      howItWorks={[
        'Select the type of Schema you want to create.',
        'Fill out the required form fields.',
        'The JSON-LD code is generated in real-time.',
        'Copy the code and paste it into the <head> of your webpage.',
      ]}
      faq={[
        {
          question: 'What is JSON-LD?',
          answer:
            'JSON-LD (JavaScript Object Notation for Linked Data) is the format recommended by Google and W3C for implementing structured data.',
        },
        {
          question: 'Do I need to paste the script tag in the <head> or <body>?',
          answer:
            'Google supports JSON-LD script blocks placed in either the <head> or <body> of the HTML. Placing it inside <head> is the standard industry best practice.',
        },
        {
          question: 'Does schema markup guarantee rich snippets in Google search results?',
          answer:
            'No. Structured data makes your site eligible for rich enhancements, but search algorithms determine final display based on query intent, user value, and E-E-A-T relevance.',
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
          <select
            className="select font-medium"
            value={schemaType}
            onChange={(e) => setSchemaType(e.target.value as SupportedSchemaType)}
          >
            {SUPPORTED_SCHEMA_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.group})
              </option>
            ))}
          </select>
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

        <pre
          style={{
            backgroundColor: '#0f172a',
            color: '#e2e8f0',
            padding: '24px',
            borderRadius: '1rem',
            overflowX: 'auto',
            fontSize: '13.5px',
            lineHeight: '1.6',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            maxHeight: '560px',
          }}
        >
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
