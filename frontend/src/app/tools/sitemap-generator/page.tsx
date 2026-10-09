'use client';

import React, { useState, useRef } from 'react';
import ToolLayout from '@/components/ToolLayout';

interface ColumnMapping {
  locColumn: string;
  lastmodColumn?: string;
  changefreqColumn?: string;
  priorityColumn?: string;
  wideHreflangColumns?: Record<string, string>;
  longHreflangCodeColumn?: string;
  longHreflangUrlColumn?: string;
}

interface ValidationIssue {
  rowNumber?: number;
  url?: string;
  field?: string;
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface GeneratedFile {
  filename: string;
  type: 'urlset' | 'sitemapindex';
  urlCount: number;
  byteSize: number;
  downloadId: string;
}

interface GenerationSummary {
  submittedRows: number;
  validUrls: number;
  invalidUrls: number;
  duplicateUrls: number;
  hreflangAnnotations: number;
  warningsCount: number;
  errorsCount: number;
  estimatedFileCount: number;
}

export default function SitemapGenerator() {
  // Input method tabs
  const [inputMethod, setInputMethod] = useState<'manual' | 'csv' | 'xlsx'>('manual');

  // Manual URL entry
  const [manualText, setManualText] = useState<string>(
    'https://example.com/\nhttps://example.com/about/\nhttps://example.com/services/\nhttps://example.com/contact/'
  );

  // File parsing states
  const [parsedData, setParsedData] = useState<{
    format: 'csv' | 'xlsx';
    headers: string[];
    sheetNames?: string[];
    selectedSheet?: string;
    totalRows: number;
    previewRows: Record<string, any>[];
    detectedMapping?: Partial<ColumnMapping>;
    suggestedType: 'simple' | 'hreflang-wide' | 'hreflang-long';
    rawFileBase64?: string;
    rawCsvText?: string;
  } | null>(null);

  const [fileName, setFileName] = useState<string>('');
  const [fileParsing, setFileParsing] = useState<boolean>(false);

  // Mapping state
  const [formatType, setFormatType] = useState<'simple' | 'hreflang-wide' | 'hreflang-long'>('simple');
  const [locCol, setLocCol] = useState<string>('');
  const [lastmodCol, setLastmodCol] = useState<string>('');
  const [changefreqCol, setChangefreqCol] = useState<string>('');
  const [priorityCol, setPriorityCol] = useState<string>('');
  const [longCodeCol, setLongCodeCol] = useState<string>('');
  const [longUrlCol, setLongUrlCol] = useState<string>('');
  const [wideCols, setWideCols] = useState<Record<string, string>>({});

  // Sitemap Options
  const [includeLastmod, setIncludeLastmod] = useState<boolean>(true);
  const [includeHreflang, setIncludeHreflang] = useState<boolean>(true);
  const [includeChangefreq, setIncludeChangefreq] = useState<boolean>(false);
  const [includePriority, setIncludePriority] = useState<boolean>(false);
  const [deduplicate, setDeduplicate] = useState<boolean>(true);
  const [generateIndex, setGenerateIndex] = useState<boolean>(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('https://example.com/sitemaps/');
  const [autoExpandReciprocal, setAutoExpandReciprocal] = useState<boolean>(false);

  // Generation status & results
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<GenerationSummary | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [xmlPreview, setXmlPreview] = useState<string>('');
  const [isPreviewTruncated, setIsPreviewTruncated] = useState<boolean>(false);
  const [warnings, setWarnings] = useState<ValidationIssue[]>([]);
  const [errors, setErrors] = useState<ValidationIssue[]>([]);
  const [zipDownloadId, setZipDownloadId] = useState<string | null>(null);
  const [reportDownloadId, setReportDownloadId] = useState<string | null>(null);

  // UI tabs & filters
  const [issueFilter, setIssueFilter] = useState<'all' | 'errors' | 'warnings'>('all');
  const [copiedXml, setCopiedXml] = useState<boolean>(false);
  const [copiedRobotsDirective, setCopiedRobotsDirective] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick template download
  const handleDownloadTemplate = (type: 'simple' | 'hreflang-wide' | 'hreflang-long') => {
    window.open(`/api/seo/sitemap/templates/${type}`, '_blank');
  };

  // Handle CSV/XLSX File selection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileParsing(true);
    setErrorMessage(null);

    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx');

    if (!isCsv && !isXlsx) {
      setErrorMessage('Please upload a valid .csv or .xlsx file.');
      setFileParsing(false);
      return;
    }

    try {
      if (isCsv) {
        const text = await file.text();
        const res = await fetch('/api/seo/sitemap/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'csv', content: text })
        });

        const contentType = res.headers.get('content-type') || '';
        let data: any;
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const rawText = await res.text();
          throw new Error(rawText || `Server returned unexpected status ${res.status}`);
        }

        if (!data.success) {
          throw new Error(data.errors?.join(', ') || 'Failed to parse CSV file');
        }

        applyParsedData(data, 'csv', text, undefined);
      } else {
        const arrayBuf = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        const res = await fetch('/api/seo/sitemap/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'xlsx', content: base64 })
        });

        const contentType = res.headers.get('content-type') || '';
        let data: any;
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const rawText = await res.text();
          throw new Error(rawText || `Server returned unexpected status ${res.status}`);
        }

        if (!data.success) {
          throw new Error(data.errors?.join(', ') || 'Failed to parse Excel file');
        }

        applyParsedData(data, 'xlsx', undefined, base64);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error processing spreadsheet file');
    } finally {
      setFileParsing(false);
    }
  };

  const applyParsedData = (data: any, format: 'csv' | 'xlsx', rawCsv?: string, rawBase64?: string) => {
    setParsedData({
      format,
      headers: data.headers,
      sheetNames: data.sheetNames,
      selectedSheet: data.selectedSheet,
      totalRows: data.totalRows,
      previewRows: data.previewRows,
      detectedMapping: data.detectedMapping,
      suggestedType: data.suggestedType,
      rawCsvText: rawCsv,
      rawFileBase64: rawBase64
    });

    setFormatType(data.suggestedType);
    setLocCol(data.detectedMapping?.locColumn || data.headers[0] || '');
    setLastmodCol(data.detectedMapping?.lastmodColumn || '');
    setChangefreqCol(data.detectedMapping?.changefreqColumn || '');
    setPriorityCol(data.detectedMapping?.priorityColumn || '');
    setLongCodeCol(data.detectedMapping?.longHreflangCodeColumn || '');
    setLongUrlCol(data.detectedMapping?.longHreflangUrlColumn || '');
    setWideCols(data.detectedMapping?.wideHreflangColumns || {});
  };

  const handleGenerate = async () => {
    setStatus('loading');
    setErrorMessage(null);

    const options = {
      includeLastmod,
      includeHreflang,
      includeChangefreq,
      includePriority,
      deduplicate,
      generateIndex,
      publicBaseUrl: generateIndex ? publicBaseUrl : undefined,
      autoExpandReciprocalHreflang: autoExpandReciprocal
    };

    try {
      let payload: any = { options };

      if (inputMethod === 'manual') {
        if (!manualText.trim()) {
          throw new Error('Please enter at least one URL in the manual input.');
        }
        payload.manualUrls = manualText;
      } else {
        if (!parsedData) {
          throw new Error('Please upload a CSV or Excel file first.');
        }
        if (!locCol) {
          throw new Error('Please select a column for Primary URL (loc).');
        }

        const mapping: ColumnMapping = {
          locColumn: locCol,
          lastmodColumn: lastmodCol || undefined,
          changefreqColumn: changefreqCol || undefined,
          priorityColumn: priorityCol || undefined,
          wideHreflangColumns: formatType === 'hreflang-wide' ? wideCols : undefined,
          longHreflangCodeColumn: formatType === 'hreflang-long' ? longCodeCol : undefined,
          longHreflangUrlColumn: formatType === 'hreflang-long' ? longUrlCol : undefined
        };

        payload.rows = parsedData.previewRows;
        payload.mapping = mapping;
        payload.formatType = formatType;
      }

      const res = await fetch('/api/seo/sitemap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        throw new Error(rawText || `Backend server returned status ${res.status}`);
      }

      if (!res.ok && !data.summary) {
        throw new Error(data.error || 'Failed to generate XML sitemap');
      }

      setSummary(data.summary);
      setFiles(data.files || []);
      setXmlPreview(data.xmlPreview || '');
      setIsPreviewTruncated(data.isPreviewTruncated || false);
      setWarnings(data.warnings || []);
      setErrors(data.errors || []);
      setZipDownloadId(data.zipDownloadId || null);
      setReportDownloadId(data.reportDownloadId || null);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while generating XML sitemap');
      setStatus('error');
    }
  };

  const handleCopyXml = () => {
    if (!xmlPreview) return;
    navigator.clipboard.writeText(xmlPreview);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 2000);
  };

  const handleCopyRobotsLine = () => {
    const sitemapTarget = files.find(f => f.filename === 'sitemap_index.xml') || files[0];
    const sitemapName = sitemapTarget?.filename || 'sitemap.xml';
    const baseUrl = publicBaseUrl.endsWith('/') ? publicBaseUrl : `${publicBaseUrl}/`;
    const fullUrl = `${baseUrl}${sitemapName}`;
    navigator.clipboard.writeText(`Sitemap: ${fullUrl}`);
    setCopiedRobotsDirective(true);
    setTimeout(() => setCopiedRobotsDirective(false), 2000);
  };

  const filteredIssues = [...errors, ...warnings].filter(issue => {
    if (issueFilter === 'errors') return issue.severity === 'error';
    if (issueFilter === 'warnings') return issue.severity === 'warning';
    return true;
  });

  return (
    <ToolLayout
      title="XML Sitemap Generator"
      description="Create standards-compliant XML sitemaps and sitemap indexes from CSV, Excel, or manual URL lists, with deep support for hreflang alternate annotations."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'XML Sitemap Generator' }]}
      aboutText="An XML sitemap communicates indexable URLs and multilingual hreflang variations to search engines. Built in compliance with sitemaps.org Protocol and Google Search specifications, this tool handles single URLs, spreadsheets, ISO language codes, self-referencing clusters, and 50,000 URL / 50MB file splitting."
      howItWorks={[
        "Choose your input method: Paste URLs directly, upload a CSV, or upload an Excel (.xlsx) spreadsheet.",
        "Map your columns for primary URL (loc), last modified date, and hreflang annotations (wide or long format).",
        "Configure options: automatic splitting, reciprocal alternate tags, and public hosting base URL.",
        "Generate and validate: Inspect validation alerts, copy the preview, and download individual XML files or a bundled ZIP."
      ]}
      faq={[
        {
          question: "What is the maximum file size and URL limit per sitemap?",
          answer: "According to the official Sitemap Protocol, each sitemap file can contain a maximum of 50,000 URLs and must not exceed 50 MB uncompressed UTF-8 XML. If your input exceeds either limit, this tool automatically partitions the output into sitemap-1.xml, sitemap-2.xml, etc., and builds a sitemap_index.xml."
        },
        {
          question: "How does hreflang alternate language mapping work?",
          answer: "Google requires that multilingual pages declare reciprocal hreflang annotations: if page A points to page B as an alternate, page B must point back to page A, and both should include self-referencing links. This tool validates ISO 639-1 language codes, ISO 3166-1 regions, and x-default, flagging incomplete clusters."
        },
        {
          question: "Does Google still support unauthenticated sitemap pings?",
          answer: "No. Google formally deprecated and closed its unauthenticated sitemap ping endpoint (google.com/ping?sitemap=...). Sitemaps must now be declared in your robots.txt file or submitted directly inside Google Search Console."
        }
      ]}
    >
      {/* SECTION B: INPUT METHOD */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">1. Select URL Input Method</h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Choose how you want to provide your URLs for sitemap generation</p>
            </div>
          </div>

          {/* Quick template download buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sample CSVs:</span>
            <button
              onClick={() => handleDownloadTemplate('simple')}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Simple
            </button>
            <button
              onClick={() => handleDownloadTemplate('hreflang-wide')}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Hreflang (Wide)
            </button>
            <button
              onClick={() => handleDownloadTemplate('hreflang-long')}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Hreflang (Long)
            </button>
          </div>
        </div>

        {/* Input Method Switcher */}
        <div className="grid grid-cols-3 gap-3 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-xl mb-6">
          <button
            onClick={() => setInputMethod('manual')}
            className={`py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              inputMethod === 'manual'
                ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Manual URL Entry
          </button>
          <button
            onClick={() => setInputMethod('csv')}
            className={`py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              inputMethod === 'csv'
                ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
            Upload CSV (.csv)
          </button>
          <button
            onClick={() => setInputMethod('xlsx')}
            className={`py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              inputMethod === 'xlsx'
                ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
            Upload Excel (.xlsx)
          </button>
        </div>

        {/* Tab 1: Manual Input */}
        {inputMethod === 'manual' && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Paste URLs (one per line)
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {manualText.split('\n').filter(l => l.trim()).length} lines detected
              </span>
            </div>
            <textarea
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              rows={7}
              placeholder="https://example.com/&#10;https://example.com/about/&#10;https://example.com/services/"
              className="w-full p-4 font-mono text-xs sm:text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-slate-100"
            />
          </div>
        )}

        {/* Tab 2 & 3: File Upload */}
        {(inputMethod === 'csv' || inputMethod === 'xlsx') && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept={inputMethod === 'csv' ? '.csv' : '.xlsx'}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-green-500 dark:hover:border-green-400 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-900/50 transition-colors"
            >
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                {fileParsing ? 'Parsing spreadsheet...' : fileName ? `Selected: ${fileName}` : `Click to browse or drop your ${inputMethod.toUpperCase()} file`}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Supports UTF-8, quoted fields, Excel date cells, and up to 100,000 rows
              </p>
            </div>

            {parsedData && (
              <div className="mt-4 p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Detected: <strong className="text-green-600 dark:text-green-400">{parsedData.totalRows}</strong> rows | <strong className="text-green-600 dark:text-green-400">{parsedData.headers.length}</strong> columns
                </span>
                <span className="font-mono text-slate-500">
                  Headers: {parsedData.headers.join(', ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION C: SPREADSHEET COLUMN MAPPING */}
      {parsedData && inputMethod !== 'manual' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">2. Spreadsheet Column Mapping</h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Map detected columns from your spreadsheet to sitemap elements</p>
            </div>
          </div>

          {/* Mapping Format Selector */}
          <div className="mb-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Sitemap Data Structure
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormatType('simple')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  formatType === 'simple'
                    ? 'border-green-500 bg-green-50/50 dark:bg-green-950/30 text-green-800 dark:text-green-300 font-bold'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-sm">Standard (Simple)</div>
                <div className="text-xs opacity-75 mt-0.5">loc, lastmod, changefreq, priority</div>
              </button>
              <button
                type="button"
                onClick={() => setFormatType('hreflang-wide')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  formatType === 'hreflang-wide'
                    ? 'border-green-500 bg-green-50/50 dark:bg-green-950/30 text-green-800 dark:text-green-300 font-bold'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-sm">Hreflang (Wide Format)</div>
                <div className="text-xs opacity-75 mt-0.5">Each language code is its own column (en, fr, es)</div>
              </button>
              <button
                type="button"
                onClick={() => setFormatType('hreflang-long')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  formatType === 'hreflang-long'
                    ? 'border-green-500 bg-green-50/50 dark:bg-green-950/30 text-green-800 dark:text-green-300 font-bold'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-sm">Hreflang (Long Format)</div>
                <div className="text-xs opacity-75 mt-0.5">loc, hreflang code, alternate_url rows</div>
              </button>
            </div>
          </div>

          {/* Core column dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Primary URL (loc) <span className="text-red-500">*</span>
              </label>
              <select
                value={locCol}
                onChange={e => setLocCol(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-white"
              >
                <option value="">-- Select URL Column --</option>
                {parsedData.headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Last Modified (lastmod)
              </label>
              <select
                value={lastmodCol}
                onChange={e => setLastmodCol(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-white"
              >
                <option value="">-- Omit lastmod --</option>
                {parsedData.headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Change Frequency
              </label>
              <select
                value={changefreqCol}
                onChange={e => setChangefreqCol(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-white"
              >
                <option value="">-- Omit changefreq --</option>
                {parsedData.headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Priority (0.0 to 1.0)
              </label>
              <select
                value={priorityCol}
                onChange={e => setPriorityCol(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-white"
              >
                <option value="">-- Omit priority --</option>
                {parsedData.headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Hreflang Long Format Column Mapping */}
          {formatType === 'hreflang-long' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 mb-5">
              <div>
                <label className="block text-xs font-bold text-blue-900 dark:text-blue-200 mb-1">
                  Language Code Column (e.g. en, fr, x-default) <span className="text-red-500">*</span>
                </label>
                <select
                  value={longCodeCol}
                  onChange={e => setLongCodeCol(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-white"
                >
                  <option value="">-- Select Code Column --</option>
                  {parsedData.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-blue-900 dark:text-blue-200 mb-1">
                  Alternate URL Column <span className="text-red-500">*</span>
                </label>
                <select
                  value={longUrlCol}
                  onChange={e => setLongUrlCol(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-white"
                >
                  <option value="">-- Select Alternate URL Column --</option>
                  {parsedData.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION D: SITEMAP CONFIGURATION OPTIONS */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </span>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">3. Sitemap Generation Options</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Configure XML tags, deduplication, and index rules</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeLastmod}
              onChange={e => setIncludeLastmod(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Include &lt;lastmod&gt; dates</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeHreflang}
              onChange={e => setIncludeHreflang(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Include &lt;xhtml:link&gt; hreflang</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={deduplicate}
              onChange={e => setDeduplicate(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Deduplicate repeated URLs</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoExpandReciprocal}
              onChange={e => setAutoExpandReciprocal(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Auto-expand reciprocal hreflang</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeChangefreq}
              onChange={e => setIncludeChangefreq(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Include &lt;changefreq&gt; (Ignored by Google)</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includePriority}
              onChange={e => setIncludePriority(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Include &lt;priority&gt; (Ignored by Google)</span>
          </label>
        </div>

        {/* Public Base URL for Sitemap Index */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={generateIndex}
                onChange={e => setGenerateIndex(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              Force Sitemap Index Generation
            </label>
            <span className="text-xs text-slate-500">Auto-created whenever file splitting occurs</span>
          </div>

          <div className="mt-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Public Hosting Base URL (Required for &lt;sitemapindex&gt; &lt;loc&gt; paths)
            </label>
            <input
              type="url"
              value={publicBaseUrl}
              onChange={e => setPublicBaseUrl(e.target.value)}
              placeholder="https://example.com/sitemaps/"
              className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-white"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Example: Entering <code className="text-green-600 dark:text-green-400">https://example.com/sitemaps/</code> produces <code className="text-green-600 dark:text-green-400">https://example.com/sitemaps/sitemap-1.xml</code>.
            </p>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={status === 'loading'}
            className="flex-1 sm:flex-none px-8 py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-sm tracking-wide transition-all shadow-md hover:shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'loading' ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Generating XML Sitemap...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Generate XML Sitemap
              </>
            )}
          </button>
        </div>
      </div>

      {/* SECTION E: RESULTS SUMMARY CARDS */}
      {summary && (
        <div className="mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
              <div className="text-2xl font-black text-slate-900 dark:text-white">{summary.submittedRows}</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Submitted</div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
              <div className="text-2xl font-black text-green-600 dark:text-green-400">{summary.validUrls}</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Valid URLs</div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{summary.hreflangAnnotations}</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Hreflang Tags</div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
              <div className="text-2xl font-black text-amber-500">{summary.duplicateUrls}</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Duplicates</div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
              <div className="text-2xl font-black text-red-500">{summary.invalidUrls}</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Invalid</div>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400">{files.length}</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Files Created</div>
            </div>
          </div>

          {/* SECTION F: DOWNLOADS & EXPORTS */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Download Generated Files</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Download individual XML files or complete bundle</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {zipDownloadId && (
                  <a
                    href={`/api/seo/sitemap/download/${zipDownloadId}`}
                    className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download ZIP (All Sitemaps)
                  </a>
                )}
                {reportDownloadId && (
                  <a
                    href={`/api/seo/sitemap/download/${reportDownloadId}`}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors flex items-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    Validation Report CSV
                  </a>
                )}
              </div>
            </div>

            {/* Individual File Chips */}
            <div className="flex flex-wrap gap-2">
              {files.map(file => (
                <a
                  key={file.filename}
                  href={`/api/seo/sitemap/download/${file.downloadId}`}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-green-500 dark:hover:border-green-400 text-xs font-mono text-slate-800 dark:text-slate-200 transition-colors flex items-center gap-2"
                >
                  <span className={`w-2 h-2 rounded-full ${file.type === 'sitemapindex' ? 'bg-purple-500' : 'bg-green-500'}`}></span>
                  <strong>{file.filename}</strong>
                  <span className="text-slate-400">({(file.byteSize / 1024).toFixed(1)} KB | {file.urlCount} URLs)</span>
                </a>
              ))}
            </div>
          </div>

          {/* SECTION G: XML PREVIEW */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">XML Sitemap Preview</h3>
                {isPreviewTruncated && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Preview truncated for browser performance. Download full file to inspect all entries.
                  </p>
                )}
              </div>
              <button
                onClick={handleCopyXml}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copiedXml ? 'Copied!' : 'Copy XML'}
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto max-h-96 leading-relaxed select-all">
              {xmlPreview}
            </pre>
          </div>

          {/* SECTION H: VALIDATION WARNINGS & ERROR LOG */}
          {(errors.length > 0 || warnings.length > 0) && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Data Quality &amp; Validation Alerts ({errors.length + warnings.length})
                </h3>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIssueFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      issueFilter === 'all'
                        ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    All ({errors.length + warnings.length})
                  </button>
                  <button
                    onClick={() => setIssueFilter('errors')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      issueFilter === 'errors'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                    }`}
                  >
                    Errors ({errors.length})
                  </button>
                  <button
                    onClick={() => setIssueFilter('warnings')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      issueFilter === 'warnings'
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    Warnings ({warnings.length})
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 sticky top-0">
                    <tr>
                      <th className="p-2.5">Severity</th>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">URL / Field</th>
                      <th className="p-2.5">Code</th>
                      <th className="p-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredIssues.map((iss, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                            iss.severity === 'error'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}>
                            {iss.severity}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-slate-500">{iss.rowNumber ?? '-'}</td>
                        <td className="p-2.5 font-mono max-w-[200px] truncate text-slate-800 dark:text-slate-200">
                          {iss.url || iss.field || '-'}
                        </td>
                        <td className="p-2.5 font-mono text-slate-500">{iss.code}</td>
                        <td className="p-2.5 text-slate-700 dark:text-slate-300">{iss.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION I: ACCURATE SITEMAP SUBMISSION GUIDANCE */}
          <div className="bg-gradient-to-br from-green-500/10 via-transparent to-transparent rounded-2xl border border-green-200 dark:border-green-800/40 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Next Step: Official Sitemap Submission Guidance
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
              Google&apos;s unauthenticated ping endpoint (google.com/ping) was deprecated and permanently shut down. Follow the official methods below to submit your sitemap to search engines:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                  1. Declare in robots.txt (Recommended)
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Add this directive anywhere in your website&apos;s robots.txt file for all crawlers to discover:
                </p>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200">
                  <span className="truncate mr-2">
                    Sitemap: {publicBaseUrl.endsWith('/') ? publicBaseUrl : `${publicBaseUrl}/`}{files[0]?.filename || 'sitemap.xml'}
                  </span>
                  <button
                    onClick={handleCopyRobotsLine}
                    className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold hover:text-green-600 transition-colors"
                  >
                    {copiedRobotsDirective ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                  2. Submit via Search Consoles
                </div>
                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside mt-2">
                  <li>
                    <strong>Google Search Console:</strong> Go to Indexing &gt; Sitemaps &gt; Enter your sitemap filename &gt; Submit.
                  </li>
                  <li>
                    <strong>Bing Webmaster Tools:</strong> Navigate to Sitemaps &gt; Submit Sitemap URL.
                  </li>
                  <li>
                    <strong>IndexNow:</strong> For fast URL discovery on Bing and Yandex, consider submitting individual URLs via IndexNow API.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
