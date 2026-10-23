'use client';

import React, { useState, useRef } from 'react';
import ToolLayout from '@/components/ToolLayout';

interface GeneratedFile {
  filename: string;
  type: 'urlset' | 'sitemapindex';
  urlCount: number;
  byteSize: number;
  content?: string;
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
  // Input method tabs (crawl, upload, manual)
  const [inputMethod, setInputMethod] = useState<'crawl' | 'upload' | 'manual'>('crawl');

  // Website Crawl state
  const [crawlUrl, setCrawlUrl] = useState<string>('https://example.com');
  const [crawlDiscoverSitemaps, setCrawlDiscoverSitemaps] = useState<boolean>(true);
  const [isCrawling, setIsCrawling] = useState<boolean>(false);
  const [crawlStats, setCrawlStats] = useState<{
    crawledCount: number;
    queueCount: number;
    validCount: number;
    skippedCount: number;
    currentUrl: string;
    logs: { url: string; status: number | string; isIndexable: boolean; reason?: string }[];
  }>({
    crawledCount: 0,
    queueCount: 0,
    validCount: 0,
    skippedCount: 0,
    currentUrl: '',
    logs: []
  });

  const crawlAbortRef = useRef<AbortController | null>(null);
  const accumulatedEntriesRef = useRef<any[]>([]);

  // Manual URL entry
  const [manualText, setManualText] = useState<string>(
    'https://example.com/\nhttps://example.com/about/\nhttps://example.com/services/\nhttps://example.com/contact/'
  );

  // Priority & Change Frequency settings (Option 4 URL depth + Frequency toggle)
  const [includePriority, setIncludePriority] = useState<boolean>(true);
  const [priorityMode, setPriorityMode] = useState<'depth' | 'fixed'>('depth');
  const [fixedPriority, setFixedPriority] = useState<string>('0.8');

  const [includeChangefreq, setIncludeChangefreq] = useState<boolean>(true);
  const [changefreqValue, setChangefreqValue] = useState<string>('weekly');

  // File upload state
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generation Results
  const [summary, setSummary] = useState<GenerationSummary | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [zipDownloadId, setZipDownloadId] = useState<string | null>(null);
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const [reportDownloadId, setReportDownloadId] = useState<string | null>(null);
  const [reportCsv, setReportCsv] = useState<string | null>(null);
  const [xmlPreview, setXmlPreview] = useState<string>('');
  const [isPreviewTruncated, setIsPreviewTruncated] = useState<boolean>(false);
  const [copiedXml, setCopiedXml] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStatus('idle');
    setErrorMessage(null);
    setSummary(null);
    setFiles([]);
    setZipDownloadId(null);
    setZipBase64(null);
    setReportDownloadId(null);
    setReportCsv(null);
    setXmlPreview('');
    setIsPreviewTruncated(false);
    setCopiedXml(false);
  };

  /**
   * Client-side Blob download triggers: guarantees durable downloads across serverless instances
   */
  const downloadXmlFile = (file: GeneratedFile) => {
    if (file.content) {
      const blob = new Blob([file.content], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (file.downloadId) {
      window.location.href = `/api/seo/sitemap/download/${file.downloadId}`;
    }
  };

  const downloadZipArchive = () => {
    if (zipBase64) {
      try {
        const binaryString = window.atob(zipBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sitemaps.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      } catch {
        // Fallback to server endpoint if base64 decoding fails
      }
    }
    if (zipDownloadId) {
      window.location.href = `/api/seo/sitemap/download/${zipDownloadId}`;
    }
  };

  const downloadReportCsv = () => {
    if (reportCsv) {
      const blob = new Blob([reportCsv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sitemap-validation-report.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (reportDownloadId) {
      window.location.href = `/api/seo/sitemap/download/${reportDownloadId}`;
    }
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
        changefreqColumn: detectedMapping.changefreqColumn,
        priorityColumn: detectedMapping.priorityColumn,
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
            includePriority,
            priorityMode,
            defaultPriority: fixedPriority,
            includeChangefreq,
            defaultChangefreq: changefreqValue,
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
      setZipBase64(genData.zipBase64 || null);
      setReportDownloadId(genData.reportDownloadId || null);
      setReportCsv(genData.reportCsv || null);
      setXmlPreview(genData.xmlPreview || '');
      setIsPreviewTruncated(genData.isPreviewTruncated || false);
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
            includePriority,
            priorityMode,
            defaultPriority: fixedPriority,
            includeChangefreq,
            defaultChangefreq: changefreqValue,
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
      setZipBase64(data.zipBase64 || null);
      setReportDownloadId(data.reportDownloadId || null);
      setReportCsv(data.reportCsv || null);
      setXmlPreview(data.xmlPreview || '');
      setIsPreviewTruncated(data.isPreviewTruncated || false);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error generating XML sitemap');
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Complete crawl and generate standard XML Sitemap from crawled entries
   */
  const finishAndGenerateSitemap = async (entries: any[]) => {
    if (!entries || entries.length === 0) {
      setErrorMessage('No valid, indexable pages were discovered on the specified website.');
      setStatus('error');
      setIsProcessing(false);
      setIsCrawling(false);
      return;
    }

    setIsProcessing(true);
    setStatus('processing');

    try {
      const res = await fetch('/api/seo/sitemap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: entries,
          options: {
            includePriority,
            priorityMode,
            defaultPriority: fixedPriority,
            includeChangefreq,
            defaultChangefreq: changefreqValue,
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
        throw new Error(data.error || 'Failed to generate XML sitemap from crawl results.');
      }

      setSummary(data.summary);
      setFiles(data.files || []);
      setZipDownloadId(data.zipDownloadId || null);
      setZipBase64(data.zipBase64 || null);
      setReportDownloadId(data.reportDownloadId || null);
      setReportCsv(data.reportCsv || null);
      setXmlPreview(data.xmlPreview || '');
      setIsPreviewTruncated(data.isPreviewTruncated || false);
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error generating XML sitemap from crawl.');
      setStatus('error');
    } finally {
      setIsProcessing(false);
      setIsCrawling(false);
    }
  };

  /**
   * Stop crawling early and immediately generate sitemap with URLs found so far
   */
  const stopCrawlEarly = () => {
    if (crawlAbortRef.current) {
      crawlAbortRef.current.abort();
      crawlAbortRef.current = null;
    }
    setIsCrawling(false);
    if (accumulatedEntriesRef.current.length > 0) {
      finishAndGenerateSitemap([...accumulatedEntriesRef.current]);
    } else {
      setStatus('idle');
      setIsProcessing(false);
    }
  };

  /**
   * Handle Website Crawling with SSE Streaming
   */
  const handleCrawlWebsite = async () => {
    resetState();
    if (!crawlUrl || !crawlUrl.trim()) {
      setErrorMessage('Please enter a website URL to crawl.');
      setStatus('error');
      return;
    }

    let urlToTest = crawlUrl.trim();
    if (!urlToTest.startsWith('http://') && !urlToTest.startsWith('https://')) {
      urlToTest = 'https://' + urlToTest;
      setCrawlUrl(urlToTest);
    }

    setIsCrawling(true);
    setStatus('processing');
    setCrawlStats({
      crawledCount: 0,
      queueCount: 1,
      validCount: 0,
      skippedCount: 0,
      currentUrl: urlToTest,
      logs: []
    });
    accumulatedEntriesRef.current = [];

    const controller = new AbortController();
    crawlAbortRef.current = controller;

    try {
      const response = await fetch('/api/seo/sitemap/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          url: urlToTest,
          discoverFromRobotsTxt: crawlDiscoverSitemaps
        }),
        signal: controller.signal
      });

      const contentType = response.headers.get('content-type') || '';

      // Fallback if not an SSE stream (e.g. error or direct JSON)
      if (!contentType.includes('text/event-stream')) {
        let jsonRes: any;
        if (contentType.includes('application/json')) {
          jsonRes = await response.json();
        } else {
          const rawText = await response.text();
          throw new Error(rawText || `Server returned status ${response.status}`);
        }

        if (!response.ok || !jsonRes.success) {
          throw new Error(jsonRes.error || 'Failed to crawl website.');
        }

        accumulatedEntriesRef.current = jsonRes.validEntries || [];
        await finishAndGenerateSitemap(accumulatedEntriesRef.current);
        return;
      }

      // Handle Server-Sent Events stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response body is unavailable.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const eventMatch = block.match(/^event:\s*(\w+)/m);
          const dataMatch = block.match(/^data:\s*(.+)$/m);
          if (dataMatch) {
            try {
              const eventType = eventMatch ? eventMatch[1] : 'message';
              const data = JSON.parse(dataMatch[1]);

              if (eventType === 'url_discovered') {
                if (data.discoveredUrl) {
                  accumulatedEntriesRef.current.push({
                    loc: data.discoveredUrl.loc,
                    lastmod: data.discoveredUrl.lastmod || undefined
                  });
                  setCrawlStats(prev => ({
                    ...prev,
                    crawledCount: data.crawledCount ?? prev.crawledCount,
                    queueCount: data.queueCount ?? prev.queueCount,
                    validCount: data.validUrlsCount ?? prev.validCount + 1,
                    currentUrl: data.currentUrl || prev.currentUrl,
                    logs: [
                      {
                        url: data.discoveredUrl.loc,
                        status: data.discoveredUrl.statusCode || 200,
                        isIndexable: true
                      },
                      ...prev.logs.slice(0, 49)
                    ]
                  }));
                }
              } else if (eventType === 'url_skipped') {
                if (data.discoveredUrl) {
                  setCrawlStats(prev => ({
                    ...prev,
                    crawledCount: data.crawledCount ?? prev.crawledCount,
                    queueCount: data.queueCount ?? prev.queueCount,
                    skippedCount: prev.skippedCount + 1,
                    currentUrl: data.currentUrl || prev.currentUrl,
                    logs: [
                      {
                        url: data.discoveredUrl.loc,
                        status: data.discoveredUrl.statusCode || 'skip',
                        isIndexable: false,
                        reason: data.discoveredUrl.skipReason
                      },
                      ...prev.logs.slice(0, 49)
                    ]
                  }));
                }
              } else if (eventType === 'progress') {
                setCrawlStats(prev => ({
                  ...prev,
                  crawledCount: data.crawledCount ?? prev.crawledCount,
                  queueCount: data.queueCount ?? prev.queueCount,
                  validCount: data.validUrlsCount ?? prev.validCount,
                  currentUrl: data.currentUrl || prev.currentUrl
                }));
              } else if (eventType === 'complete') {
                const finalEntries = data.validEntries || accumulatedEntriesRef.current;
                await finishAndGenerateSitemap(finalEntries);
                return;
              } else if (eventType === 'error') {
                throw new Error(data.error || 'Crawling failed');
              }
            } catch (jsonErr: any) {
              if (jsonErr.message && !jsonErr.message.includes('Unexpected token')) {
                throw jsonErr;
              }
            }
          }
        }
      }

      // If stream ended without explicit complete event:
      if (accumulatedEntriesRef.current.length > 0) {
        await finishAndGenerateSitemap(accumulatedEntriesRef.current);
      } else {
        throw new Error('Crawl completed with 0 indexable URLs discovered.');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User manually stopped/cancelled crawl - already handled
        return;
      }
      setErrorMessage(err.message || 'Error occurred while crawling website.');
      setStatus('error');
      setIsCrawling(false);
      setIsProcessing(false);
    } finally {
      crawlAbortRef.current = null;
    }
  };

  const handleCopyXml = () => {
    if (!xmlPreview) return;
    navigator.clipboard.writeText(xmlPreview);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 2000);
  };

  return (
    <ToolLayout
      title="XML Sitemap Generator"
      description="Upload CSV or Excel to automatically generate and download standard XML sitemaps compliant with Google and sitemaps.org Protocol."
      category="Crawling & Access"
      breadcrumbs={[{ label: 'XML Sitemap Generator' }]}
      aboutText="An XML sitemap communicates indexable URLs to search engines. Built in compliance with sitemaps.org Protocol, this tool accepts CSV or Excel spreadsheets, automatically validates URLs, calculates intelligent URL-depth priorities, applies change frequencies, and generates ready-to-download sitemap.xml files."
      howItWorks={[
        "Upload your spreadsheet (.csv or .xlsx) or paste URLs directly into the manual input box.",
        "Configure <priority> with intelligent URL-depth auto-scaling and <changefreq> toggles.",
        "The tool automatically detects columns, validates entries, strips duplicates, and applies your chosen logic.",
        "Download your valid sitemap.xml immediately, with automatic splitting into index files for large datasets."
      ]}
      faq={[
        {
          question: "How does the URL-depth Priority calculation work?",
          answer: "Our intelligent depth logic automatically assigns priorities based on search engine crawl hierarchy: 1.0 for the root homepage (/), 0.8 for primary landing sections (depth 1, e.g. /services/), 0.6 for sub-categories/articles (depth 2, e.g. /services/seo/), and 0.4 for deep or nested pages (depth 3+). You can also switch to a fixed custom priority or disable the tag completely."
        },
        {
          question: "What does the Change Frequency toggle do?",
          answer: "The <changefreq> tag provides hints to search engine crawlers regarding how frequently content updates (e.g., weekly, daily, monthly, or auto-depth). You can enable or disable this tag as needed, and individual URL values in spreadsheets or delimited text will always take precedence."
        },
        {
          question: "Can I still paste URLs with custom priorities or frequencies?",
          answer: "Yes! In manual paste mode, you can paste raw URLs or use delimiters like pipe (|), tab, or comma: e.g. 'https://example.com/promo | 0.9 | daily'. Any explicitly provided value will be preserved."
        },
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
              Upload spreadsheets or paste URLs with smart URL-depth priority and change frequency logic
            </p>
          </div>
        </div>

        {/* SITEMAP SETTINGS: PRIORITY & CHANGE FREQUENCY */}
        <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80">
          <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600 dark:text-green-400">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Sitemap Tags & Logic Configuration
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              Controls &lt;priority&gt; and &lt;changefreq&gt; in generated XML
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PRIORITY CARD (OPTION 4) */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              includePriority
                ? 'bg-white dark:bg-slate-800 border-green-500/30 dark:border-green-500/20 shadow-xs'
                : 'bg-slate-100/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 opacity-75'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Priority Tag
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-600 dark:text-slate-300">
                      &lt;priority&gt;
                    </code>
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePriority}
                    onChange={e => setIncludePriority(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>

              {includePriority ? (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setPriorityMode('depth')}
                      className={`flex-1 py-1.5 px-2.5 rounded-lg font-semibold text-xs transition-all border ${
                        priorityMode === 'depth'
                          ? 'bg-green-50 dark:bg-green-950/40 border-green-500 text-green-700 dark:text-green-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      ⚡ Auto by URL Depth
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriorityMode('fixed')}
                      className={`py-1.5 px-2.5 rounded-lg font-semibold text-xs transition-all border ${
                        priorityMode === 'fixed'
                          ? 'bg-green-50 dark:bg-green-950/40 border-green-500 text-green-700 dark:text-green-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      Fixed Value
                    </button>
                  </div>

                  {priorityMode === 'depth' ? (
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center justify-between">
                        <span>Hierarchy Scale:</span>
                        <span className="text-[10px] text-green-600 dark:text-green-400 font-bold">Active</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px]">
                        <div>• Root / Home (<span className="text-slate-900 dark:text-slate-200">/</span>): <strong className="text-green-600 dark:text-green-400">1.0</strong></div>
                        <div>• 1st Level (<span className="text-slate-900 dark:text-slate-200">/item</span>): <strong className="text-green-600 dark:text-green-400">0.8</strong></div>
                        <div>• 2nd Level (<span className="text-slate-900 dark:text-slate-200">/a/b</span>): <strong className="text-green-600 dark:text-green-400">0.6</strong></div>
                        <div>• Deep pages (<span className="text-slate-900 dark:text-slate-200">/a/b/c+</span>): <strong className="text-green-600 dark:text-green-400">0.4</strong></div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        Assigned Priority:
                      </label>
                      <select
                        value={fixedPriority}
                        onChange={e => setFixedPriority(e.target.value)}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-green-500"
                      >
                        <option value="1.0">1.0</option>
                        <option value="0.9">0.9</option>
                        <option value="0.8">0.8</option>
                        <option value="0.7">0.7</option>
                        <option value="0.6">0.6</option>
                        <option value="0.5">0.5</option>
                        <option value="0.4">0.4</option>
                        <option value="0.3">0.3</option>
                        <option value="0.2">0.2</option>
                        <option value="0.1">0.1</option>
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  &lt;priority&gt; tags will be excluded from the generated sitemap XML.
                </p>
              )}
            </div>

            {/* CHANGE FREQUENCY CARD */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              includeChangefreq
                ? 'bg-white dark:bg-slate-800 border-green-500/30 dark:border-green-500/20 shadow-xs'
                : 'bg-slate-100/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 opacity-75'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Change Frequency
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-600 dark:text-slate-300">
                      &lt;changefreq&gt;
                    </code>
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeChangefreq}
                    onChange={e => setIncludeChangefreq(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>

              {includeChangefreq ? (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      Frequency:
                    </label>
                    <select
                      value={changefreqValue}
                      onChange={e => setChangefreqValue(e.target.value)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      <option value="weekly">weekly</option>
                      <option value="daily">daily</option>
                      <option value="monthly">monthly</option>
                      <option value="yearly">yearly</option>
                    </select>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Provides crawl recommendations per Sitemap Protocol. Custom values in spreadsheets or delimited lines are respected.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  &lt;changefreq&gt; tags will be excluded from the generated sitemap XML.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Input Method Switcher */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl mb-6 max-w-md">
          <button
            onClick={() => {
              if (isCrawling) stopCrawlEarly();
              resetState();
              setInputMethod('crawl');
            }}
            className={`py-2 px-3 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
              inputMethod === 'crawl'
                ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>Crawl Website</span>
          </button>
          <button
            onClick={() => {
              if (isCrawling) stopCrawlEarly();
              resetState();
              setInputMethod('upload');
            }}
            className={`py-2 px-3 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
              inputMethod === 'upload'
                ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Upload File</span>
          </button>
          <button
            onClick={() => {
              if (isCrawling) stopCrawlEarly();
              resetState();
              setInputMethod('manual');
            }}
            className={`py-2 px-3 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
              inputMethod === 'manual'
                ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span>Paste URLs</span>
          </button>
        </div>

        {/* TAB 1: CRAWL ENTIRE WEBSITE */}
        {inputMethod === 'crawl' && (
          <div className="space-y-5">
            {/* Website URL Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Website URL to Crawl
                </label>
                <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                  <span>✓ Full Website Crawl (No Page Limit)</span>
                </span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </span>
                <input
                  type="url"
                  value={crawlUrl}
                  onChange={e => setCrawlUrl(e.target.value)}
                  disabled={isCrawling}
                  placeholder="https://example.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm focus:ring-2 focus:ring-green-500 focus:outline-none dark:text-white disabled:opacity-60"
                />
              </div>
            </div>

            {/* Discovery & Advanced Options */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crawlDiscoverSitemaps}
                  onChange={e => setCrawlDiscoverSitemaps(e.target.checked)}
                  disabled={isCrawling}
                  className="w-4 h-4 rounded text-green-600 focus:ring-green-500 border-slate-300 dark:border-slate-700 dark:bg-slate-800"
                />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Discover orphan pages from <code className="text-[11px] font-mono px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">robots.txt</code> & existing XML sitemaps
                </span>
              </label>
              <div className="flex items-center gap-2">
                {includePriority && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-300 font-semibold whitespace-nowrap">
                    {priorityMode === 'depth' ? '⚡ Depth Priority' : `Priority: ${fixedPriority}`}
                  </span>
                )}
                {includeChangefreq && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold whitespace-nowrap">
                    Freq: {changefreqValue}
                  </span>
                )}
              </div>
            </div>

            {/* LIVE CRAWLER MONITOR / DASHBOARD */}
            {isCrawling && (
              <div className="p-4 rounded-xl border border-green-500/30 bg-green-50/20 dark:bg-green-950/10 space-y-4">
                {/* Status Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      Crawling website in real-time...
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={stopCrawlEarly}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-all shadow-xs"
                    >
                      Finish & Generate ({crawlStats.validCount} URLs)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (crawlAbortRef.current) crawlAbortRef.current.abort();
                        setIsCrawling(false);
                        setIsProcessing(false);
                        setStatus('idle');
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {/* Live Metric Counters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                    <div className="text-xl font-bold text-slate-900 dark:text-white">{crawlStats.crawledCount}</div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500">Crawled</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                    <div className="text-xl font-bold text-green-600 dark:text-green-400">{crawlStats.validCount}</div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500">Valid Indexable</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                    <div className="text-xl font-bold text-amber-500">{crawlStats.queueCount}</div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500">In Queue</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                    <div className="text-xl font-bold text-slate-400">{crawlStats.skippedCount}</div>
                    <div className="text-[10px] uppercase font-semibold text-slate-500">Non-Indexable</div>
                  </div>
                </div>

                {/* Current URL being visited */}
                {crawlStats.currentUrl && (
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-400 truncate bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-bold uppercase">Visiting</span>
                    <span className="truncate">{crawlStats.currentUrl}</span>
                  </div>
                )}

                {/* Live Crawl Feed */}
                {crawlStats.logs.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto p-2 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] border border-slate-800">
                    {crawlStats.logs.slice(0, 20).map((log, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 py-0.5 border-b border-slate-800/60 last:border-0">
                        <span className="truncate">{log.url}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold whitespace-nowrap ${
                          log.isIndexable
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {log.isIndexable ? '200 OK' : (log.reason || 'skipped')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Launch Crawl Button */}
            {!isCrawling && (
              <button
                type="button"
                onClick={handleCrawlWebsite}
                disabled={isProcessing}
                className="px-6 py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-all shadow-sm hover:shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span>Crawl Website & Generate Sitemap</span>
              </button>
            )}
          </div>
        )}

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

            {/* Sample Templates Download Links */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Need a template?</span>
              <a
                href="/api/seo/sitemap/templates/simple"
                download="template-simple-sitemap.csv"
                className="text-green-600 dark:text-green-400 font-semibold hover:underline"
              >
                Simple CSV
              </a>
              <span>•</span>
              <a
                href="/api/seo/sitemap/templates/hreflang-wide"
                download="template-hreflang-wide.csv"
                className="text-green-600 dark:text-green-400 font-semibold hover:underline"
              >
                Hreflang (Wide) CSV
              </a>
              <span>•</span>
              <a
                href="/api/seo/sitemap/templates/hreflang-long"
                download="template-hreflang-long.csv"
                className="text-green-600 dark:text-green-400 font-semibold hover:underline"
              >
                Hreflang (Long) CSV
              </a>
            </div>
          </div>
        )}

        {/* STEP 1: MANUAL URLS INPUT */}
        {inputMethod === 'manual' && (
          <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Paste URLs (one per line)
              </label>
              <div className="flex items-center gap-2">
                {includePriority && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-300 font-semibold">
                    {priorityMode === 'depth' ? '⚡ Depth Priority' : `Priority: ${fixedPriority}`}
                  </span>
                )}
                {includeChangefreq && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold">
                    Freq: {changefreqValue}
                  </span>
                )}
                <span className="text-xs text-slate-400 font-mono">
                  {manualText.split('\n').filter(l => l.trim()).length} URLs detected
                </span>
              </div>
            </div>
            <textarea
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              rows={7}
              placeholder="https://example.com/&#10;https://example.com/about/&#10;https://example.com/services/&#10;https://example.com/contact/&#10;# Optional custom line overrides:&#10;# https://example.com/featured | 0.9 | daily"
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
                <button
                  type="button"
                  onClick={() => downloadXmlFile(files[0])}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-base transition-all shadow-md hover:shadow-green-500/25 flex items-center justify-center gap-3 cursor-pointer"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download XML Sitemap
                </button>
              )}

              {files.length > 1 && (zipBase64 || zipDownloadId) && (
                <button
                  type="button"
                  onClick={downloadZipArchive}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-base transition-all shadow-md hover:shadow-green-500/25 flex items-center justify-center gap-3 cursor-pointer"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download XML Sitemap (ZIP - {files.length} Files)
                </button>
              )}

              {(reportCsv || reportDownloadId) && (
                <button
                  type="button"
                  onClick={downloadReportCsv}
                  className="w-full sm:w-auto px-6 py-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-sm transition-all border border-slate-200 dark:border-slate-600 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  Download Validation Report (CSV)
                </button>
              )}
            </div>

            {/* Multiple files chips if dataset exceeded protocol limits */}
            {files.length > 1 && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Generated Sitemap Files (Protocol Split):
                </span>
                <div className="flex flex-wrap gap-2">
                  {files.map(file => (
                    <button
                      type="button"
                      key={file.filename}
                      onClick={() => downloadXmlFile(file)}
                      className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-green-500 text-xs font-mono text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <strong>{file.filename}</strong>
                      <span className="text-slate-400">({file.urlCount} URLs)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* XML SITEMAP PREVIEW */}
            {xmlPreview && (
              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Sitemap XML Preview
                    </span>
                    {isPreviewTruncated && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        (Preview truncated for performance — download file for full output)
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleCopyXml}
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    {copiedXml ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copy XML
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto max-h-80 leading-relaxed border border-slate-800 select-all">
                  {xmlPreview}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
