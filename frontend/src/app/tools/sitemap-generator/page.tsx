'use client';

import React, { useState, useRef } from 'react';
import ToolLayout from '@/components/ToolLayout';

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
  const [inputMethod, setInputMethod] = useState<'upload' | 'manual'>('upload');

  // Manual URL entry
  const [manualText, setManualText] = useState<string>(
    'https://example.com/\nhttps://example.com/about/\nhttps://example.com/services/\nhttps://example.com/contact/'
  );

  // File upload state
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generation Results
  const [summary, setSummary] = useState<GenerationSummary | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [zipDownloadId, setZipDownloadId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStatus('idle');
    setErrorMessage(null);
    setSummary(null);
    setFiles([]);
    setZipDownloadId(null);
  };

  /**
   * Helper: Automatically identify the URL column from spreadsheet headers and rows
   */
  const detectConfidentUrlColumn = (headers: string[], previewRows: Record<string, any>[]): string | null => {
    if (!headers || headers.length === 0) return null;

    // 1. If only 1 column, unambiguously treat it as the URL column
    if (headers.length === 1) {
      return headers[0];
    }

    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    // 2. Check unambiguous standard URL column headers
    const primaryCandidates = ['loc', 'url', 'primary_url', 'primary url', 'page', 'address', 'link'];
    const matchedCols: string[] = [];

    for (const cand of primaryCandidates) {
      const idx = lowerHeaders.indexOf(cand);
      if (idx !== -1) {
        matchedCols.push(headers[idx]);
      }
    }

    // Exactly one standard URL header matched
    if (matchedCols.length === 1) {
      return matchedCols[0];
    }

    // Multiple candidate headers found (e.g. both 'url' and 'link') -> Check if ambiguous
    if (matchedCols.length > 1) {
      // If 'loc' is present, it is the official protocol standard and unambiguous
      const locIdx = lowerHeaders.indexOf('loc');
      if (locIdx !== -1) return headers[locIdx];
      const urlIdx = lowerHeaders.indexOf('url');
      if (urlIdx !== -1) return headers[urlIdx];
      // Ambiguous multiple candidate columns
      return null;
    }

    // 3. Header row may be absent or named differently: inspect preview rows for http:// or https://
    if (previewRows && previewRows.length > 0) {
      const urlColCounts: Record<string, number> = {};
      const sampleRows = previewRows.slice(0, 10);

      for (const h of headers) {
        urlColCounts[h] = 0;
        for (const row of sampleRows) {
          const val = String(row[h] || '').trim().toLowerCase();
          if (val.startsWith('http://') || val.startsWith('https://')) {
            urlColCounts[h]++;
          }
        }
      }

      // Check which columns had valid URL values
      const colsWithUrls = headers.filter(h => urlColCounts[h] > 0);
      if (colsWithUrls.length === 1) {
        return colsWithUrls[0];
      }
    }

    return null;
  };

  /**
   * Handle CSV or XLSX file processing
   */
  const processUploadedFile = async (file: File) => {
    resetState();
    setFileName(file.name);
    setIsProcessing(true);
    setStatus('processing');

    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx');

    if (!isCsv && !isXlsx) {
      setErrorMessage('Please upload a valid .csv or .xlsx file.');
      setStatus('error');
      setIsProcessing(false);
      return;
    }

    if (file.size === 0) {
      setErrorMessage('The selected file is empty (0 bytes). Please upload a file containing URLs.');
      setStatus('error');
      setIsProcessing(false);
      return;
    }

    const MAX_CLIENT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_CLIENT_FILE_SIZE) {
      setErrorMessage(`The selected file is ${(file.size / 1024 / 1024).toFixed(1)} MB, which exceeds the maximum allowed size of 10 MB.`);
      setStatus('error');
      setIsProcessing(false);
      return;
    }

    try {
      let parseResult: any;

      if (isCsv) {
        const text = await file.text();
        const res = await fetch('/api/seo/sitemap/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'csv', content: text })
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          parseResult = await res.json();
        } else {
          const rawText = await res.text();
          throw new Error(rawText || `Server returned status ${res.status}`);
        }
      } else {
        // Read Excel file as Base64 in browser
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64String = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64String);
          };
          reader.onerror = () => reject(new Error('Failed to read Excel file'));
          reader.readAsDataURL(file);
        });

        const res = await fetch('/api/seo/sitemap/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'xlsx', content: base64 })
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          parseResult = await res.json();
        } else {
          const rawText = await res.text();
          throw new Error(rawText || `Server returned status ${res.status}`);
        }
      }

      if (!parseResult.success) {
        throw new Error(parseResult.errors?.join(', ') || 'Failed to parse file.');
      }

      const rows: Record<string, any>[] = parseResult.rows || parseResult.previewRows || [];
      const headers: string[] = parseResult.headers || [];

      if (rows.length === 0) {
        throw new Error('No data rows found in the uploaded file.');
      }

      // Step 2 — Automatically identify URL column
      const urlCol = detectConfidentUrlColumn(headers, rows);
      if (!urlCol) {
        throw new Error('Could not confidently identify the URL column. Please provide a file with a "url" or "loc" column.');
      }

      // Detect optional lastmod only when header is unambiguous
      const lowerMap = new Map<string, string>();
      headers.forEach(h => lowerMap.set(h.toLowerCase().trim(), h));
      const lastmodCandidates = ['lastmod', 'last modified', 'last_modified', 'date', 'updated_at', 'modified'];
      let unambiguousLastmodCol: string | undefined = undefined;
      for (const cand of lastmodCandidates) {
        if (lowerMap.has(cand)) {
          unambiguousLastmodCol = lowerMap.get(cand);
          break;
        }
      }

      // Check if clearly structured hreflang is present without guessing
      const suggestedType = parseResult.suggestedType || 'simple';
      const detectedMapping = parseResult.detectedMapping || {};

      const mapping: any = {
        locColumn: urlCol,
        lastmodColumn: unambiguousLastmodCol,
        wideHreflangColumns: suggestedType === 'hreflang-wide' ? detectedMapping.wideHreflangColumns : undefined,
        longHreflangCodeColumn: suggestedType === 'hreflang-long' ? detectedMapping.longHreflangCodeColumn : undefined,
        longHreflangUrlColumn: suggestedType === 'hreflang-long' ? detectedMapping.longHreflangUrlColumn : undefined
      };

      // Call generate endpoint automatically
      const genRes = await fetch('/api/seo/sitemap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          mapping,
          formatType: suggestedType,
          options: {
            includeLastmod: Boolean(unambiguousLastmodCol),
            includeHreflang: suggestedType !== 'simple',
            deduplicate: true
          }
        })
      });

      const genContentType = genRes.headers.get('content-type') || '';
      let genData: any;
      if (genContentType.includes('application/json')) {
        genData = await genRes.json();
      } else {
        const rawText = await genRes.text();
        throw new Error(rawText || `Server returned status ${genRes.status}`);
      }

      if (!genRes.ok && !genData.summary) {
        throw new Error(genData.error || 'Failed to generate XML sitemap.');
      }

      setSummary(genData.summary);
      setFiles(genData.files || []);
      setZipDownloadId(genData.zipDownloadId || null);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while processing file');
      setStatus('error');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Handle Manual URLs generation
   */
  const handleManualGenerate = async () => {
    resetState();
    if (!manualText.trim()) {
      setErrorMessage('Please enter at least one URL.');
      setStatus('error');
      return;
    }

    setIsProcessing(true);
    setStatus('processing');

    try {
      const res = await fetch('/api/seo/sitemap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualUrls: manualText,
          options: {
            deduplicate: true
          }
        })
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        throw new Error(rawText || `Server returned status ${res.status}`);
      }

      if (!res.ok && !data.summary) {
        throw new Error(data.error || 'Failed to generate XML sitemap.');
      }

      setSummary(data.summary);
      setFiles(data.files || []);
      setZipDownloadId(data.zipDownloadId || null);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error generating XML sitemap');
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolLayout
      title="XML Sitemap Generator"
      description="Upload CSV or Excel to automatically generate and download standard XML sitemaps compliant with Google and sitemaps.org Protocol."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'XML Sitemap Generator' }]}
      aboutText="An XML sitemap communicates indexable URLs to search engines. Built in compliance with sitemaps.org Protocol, this tool accepts CSV or Excel spreadsheets, automatically validates URLs, removes duplicates, and generates ready-to-download sitemap.xml files."
      howItWorks={[
        "Upload your spreadsheet (.csv or .xlsx) or paste URLs directly.",
        "The tool automatically detects the URL column, validates entries, and strips duplicates.",
        "Download your valid sitemap.xml immediately, with automatic splitting for large lists."
      ]}
      faq={[
        {
          question: "What spreadsheet formats are supported?",
          answer: "You can upload standard CSV (.csv) and Excel (.xlsx) files. The tool automatically detects your URL column whether your file includes headers or not."
        },
        {
          question: "What happens if my file has more than 50,000 URLs?",
          answer: "According to the official Sitemap Protocol, each sitemap can contain up to 50,000 URLs. If your file exceeds 50,000 URLs or 50MB, the generator automatically splits them into valid sitemap chunks bundled in a convenient ZIP file."
        },
        {
          question: "How do I submit my generated sitemap to Google?",
          answer: "Upload sitemap.xml to the root directory of your website and submit the full URL inside Google Search Console (Indexing > Sitemaps), or add 'Sitemap: https://yourdomain.com/sitemap.xml' to your robots.txt file."
        }
      ]}
    >
      {/* TOOL MAIN CARD */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-8 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <span className="p-2.5 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </span>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Generate XML Sitemap</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Upload your CSV or Excel file to instantly generate and download your sitemap
            </p>
          </div>
        </div>

        {/* Input Method Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl mb-6 max-w-sm">
          <button
            onClick={() => {
              resetState();
              setInputMethod('upload');
            }}
            className={`py-2 px-3 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
              inputMethod === 'upload'
                ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload File
          </button>
          <button
            onClick={() => {
              resetState();
              setInputMethod('manual');
            }}
            className={`py-2 px-3 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
              inputMethod === 'manual'
                ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Paste URLs
          </button>
        </div>

        {/* STEP 1: UPLOAD AREA */}
        {inputMethod === 'upload' && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) processUploadedFile(file);
              }}
              accept=".csv,.xlsx"
              className="hidden"
            />
            <div
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) processUploadedFile(file);
              }}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-green-500 dark:hover:border-green-400 bg-slate-50/50 dark:bg-slate-900/50'
              } ${isProcessing ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>

              {isProcessing ? (
                <div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Processing {fileName || 'file'} and generating XML...
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Auto-detecting URL column, validating entries, and generating sitemap
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
                    {fileName ? `Selected: ${fileName}` : 'Choose CSV or Excel file'}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-2">
                    Click to browse or drag and drop your spreadsheet here
                  </p>
                  <span className="inline-block px-3 py-1 rounded-md bg-slate-200/60 dark:bg-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    Supports .csv and .xlsx
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 1: MANUAL URLS INPUT */}
        {inputMethod === 'manual' && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Paste URLs (one per line)
              </label>
              <span className="text-xs text-slate-400 font-mono">
                {manualText.split('\n').filter(l => l.trim()).length} URLs detected
              </span>
            </div>
            <textarea
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              rows={7}
              placeholder="https://example.com/&#10;https://example.com/about/&#10;https://example.com/services/"
              className="w-full p-4 font-mono text-xs sm:text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-slate-100 mb-4"
            />
            <button
              onClick={handleManualGenerate}
              disabled={isProcessing}
              className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-all shadow-sm hover:shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
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
        )}

        {/* ERROR NOTIFICATION */}
        {errorMessage && (
          <div className="mt-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 3 & 4: SIMPLE RESULT & DOWNLOAD */}
        {summary && status === 'success' && (
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
            {/* Status message */}
            <div className="flex items-center gap-3 mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <div>
                <span className="font-bold text-sm">
                  XML sitemap generated successfully. {summary.submittedRows} URLs processed.
                </span>
              </div>
            </div>

            {/* Simple Result Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-2xl font-black text-slate-900 dark:text-white">{summary.submittedRows}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Total Processed</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-2xl font-black text-green-600 dark:text-green-400">{summary.validUrls}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Valid URLs</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-2xl font-black text-amber-500">{summary.duplicateUrls}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Duplicates Removed</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-2xl font-black text-red-500">{summary.invalidUrls}</div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Invalid Skipped</div>
              </div>
            </div>

            {/* Prominent Download Button */}
            <div className="flex flex-wrap items-center gap-4">
              {files.length === 1 && (
                <a
                  href={`/api/seo/sitemap/download/${files[0].downloadId}`}
                  download={files[0].filename}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-base transition-all shadow-md hover:shadow-green-500/25 flex items-center justify-center gap-3"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download XML Sitemap
                </a>
              )}

              {files.length > 1 && zipDownloadId && (
                <a
                  href={`/api/seo/sitemap/download/${zipDownloadId}`}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-base transition-all shadow-md hover:shadow-green-500/25 flex items-center justify-center gap-3"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download XML Sitemap (ZIP - {files.length} Files)
                </a>
              )}
            </div>

            {/* Multiple files list if dataset exceeded protocol limits */}
            {files.length > 1 && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Generated Sitemap Files (Protocol Split):
                </span>
                <div className="flex flex-wrap gap-2">
                  {files.map(file => (
                    <a
                      key={file.filename}
                      href={`/api/seo/sitemap/download/${file.downloadId}`}
                      download={file.filename}
                      className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-green-500 text-xs font-mono text-slate-700 dark:text-slate-300 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <strong>{file.filename}</strong>
                      <span className="text-slate-400">({file.urlCount} URLs)</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
