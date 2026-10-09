import express, { Request, Response } from 'express';
import cors from 'cors';
import { AI_BOT_REGISTRY, getAiBotById } from './seo/aiBotRegistry.js';
import { runAiBotAccessTest } from './seo/aiBotTesterService.js';
import { testRobotsTxt } from './seo/robotsService.js';
import { checkPageResources } from './seo/resourceService.js';
import { safeFetch } from './seo/safeFetch.js';
import { testHtaccessRules } from './seo/htaccessService.js';
import { sanitizeHtaccessSettings } from './seo/htaccessValidation.js';
import { HTACCESS_EXAMPLES } from './seo/htaccessExamples.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend
app.use(cors());
// Consistent upload boundary limit: 10MB raw spreadsheet, with 15MB JSON limit to account for Base64 overhead
app.use(express.json({ limit: '15mb' }));

// Custom middleware to catch 413 Payload Too Large and return clean JSON response
app.use((err: any, req: Request, res: Response, next: any) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      error: 'Upload payload is too large. Maximum supported spreadsheet size is 10 MB.'
    });
  }
  next(err);
});

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ==========================================
// TOOL 1: ROBOTS.TXT TESTER ENDPOINTS
// ==========================================

// POST /api/seo/robots/test
app.post('/api/seo/robots/test', async (req: Request, res: Response) => {
  try {
    const { websiteUrl, customContent, customRobotsTxt, path, userAgent, mode, forceRefresh } = req.body;
    if (!websiteUrl) {
      return res.status(400).json({ success: false, error: 'websiteUrl is required' });
    }

    const result = await testRobotsTxt({
      websiteUrl,
      customRobotsTxt: customRobotsTxt || customContent || null,
      path: path || '/',
      userAgent: userAgent || 'Googlebot',
      mode: mode || (customRobotsTxt || customContent ? 'editor' : 'live'),
      forceRefresh: Boolean(forceRefresh)
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
});

// POST /api/seo/robots/resources
app.post('/api/seo/robots/resources', async (req: Request, res: Response) => {
  try {
    const { pageUrl, userAgent } = req.body;
    if (!pageUrl) {
      return res.status(400).json({ success: false, error: 'pageUrl is required' });
    }

    const result = await checkPageResources(pageUrl, userAgent || 'Googlebot');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
});

// POST /api/seo/robots/sitemaps/check
app.post('/api/seo/robots/sitemaps/check', async (req: Request, res: Response) => {
  try {
    const { sitemapUrl } = req.body;
    if (!sitemapUrl) {
      return res.status(400).json({ success: false, error: 'sitemapUrl is required' });
    }

    const fetchRes = await safeFetch(sitemapUrl, { timeoutMs: 8000, maxBytes: 512 * 1024 });
    const isXml = fetchRes.contentType.toLowerCase().includes('xml') || fetchRes.body.includes('<?xml');

    res.json({
      url: sitemapUrl,
      statusCode: fetchRes.statusCode,
      statusText: fetchRes.statusText,
      contentType: fetchRes.contentType,
      isAccessible: fetchRes.statusCode >= 200 && fetchRes.statusCode < 300,
      isXmlFormat: isXml
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  }
});

// ==========================================
// TOOL 2: AI BOT ACCESS TESTER ENDPOINTS
// ==========================================

// GET /api/seo/ai-bot-access/bots
app.get('/api/seo/ai-bot-access/bots', (req: Request, res: Response) => {
  res.json({
    total: AI_BOT_REGISTRY.length,
    bots: AI_BOT_REGISTRY
  });
});

// POST /api/seo/ai-bot-access/test
app.post('/api/seo/ai-bot-access/test', async (req: Request, res: Response) => {
  try {
    const { urls, botIds, checks } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide at least one URL to test.' });
    }

    if (!botIds || !Array.isArray(botIds) || botIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one AI bot to test.' });
    }

    const result = await runAiBotAccessTest({
      urls,
      botIds,
      checks: {
        robotsTxt: true,
        httpStatus: true,
        content: true
      }
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed testing AI bot access.' });
  }
});

// ==========================================
// TOOL 3: .HTACCESS TESTER ENDPOINTS
// ==========================================

// GET /api/seo/htaccess/examples
app.get('/api/seo/htaccess/examples', (_req: Request, res: Response) => {
  res.json({
    success: true,
    examples: HTACCESS_EXAMPLES
  });
});

// POST /api/seo/htaccess/test
app.post('/api/seo/htaccess/test', async (req: Request, res: Response) => {
  try {
    const { url, htaccess, serverVariables, settings } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'A valid target URL is required.' });
    }
    if (!htaccess || typeof htaccess !== 'string') {
      return res.status(400).json({ success: false, error: 'The .htaccess content is required.' });
    }

    const cleanSettings = sanitizeHtaccessSettings(settings);

    const result = await testHtaccessRules({
      url,
      htaccess,
      serverVariables: serverVariables || {},
      settings: cleanSettings
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error evaluating .htaccess' });
  }
});

// ==========================================
// TOOL 4: XML SITEMAP GENERATOR ENDPOINTS
// ==========================================
import { parseCsvContent, parseXlsxContent, extractUrlEntriesFromRows } from './seo/sitemapParser.js';
import { generateSitemapXml } from './seo/sitemapGenerator.js';
import { validatePublicSitemapOptions } from './seo/sitemapValidation.js';
import { storeDownload, getDownload, createSitemapsZip, generateIssuesCsv, SAMPLE_TEMPLATES } from './seo/sitemapExport.js';

// GET /api/seo/sitemap/templates/:type
app.get('/api/seo/sitemap/templates/:type', (req: Request, res: Response) => {
  const type = String(req.params.type || '');
  const tpl = SAMPLE_TEMPLATES[type];
  if (!tpl) {
    return res.status(404).json({ success: false, error: `Template "${type}" not found.` });
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${tpl.filename}"`);
  res.send(tpl.content);
});

// POST /api/seo/sitemap/parse
app.post('/api/seo/sitemap/parse', async (req: Request, res: Response) => {
  try {
    const { format, content, sheetName } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'No content or file data provided.' });
    }

    if (format === 'csv') {
      const result = parseCsvContent(content);
      return res.json(result);
    } else if (format === 'xlsx') {
      // Buffer from base64 string
      const buffer = Buffer.from(content, 'base64');
      const result = await parseXlsxContent(buffer, sheetName);
      return res.json(result);
    } else {
      return res.status(400).json({ success: false, error: `Unsupported format: ${format}. Use 'csv' or 'xlsx'.` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to parse spreadsheet file.' });
  }
});

// POST /api/seo/sitemap/generate
app.post('/api/seo/sitemap/generate', async (req: Request, res: Response) => {
  try {
    const { rows, mapping, formatType, options, manualUrls } = req.body;

    // FIX 7: Strict boundary validation for public options
    const validatedOpts = validatePublicSitemapOptions(options);
    if (!validatedOpts.isValid) {
      return res.status(400).json({ success: false, error: validatedOpts.error || 'Invalid generation options.' });
    }

    let entries: any[] = [];

    if (manualUrls && typeof manualUrls === 'string') {
      // Manual URL entry
      const lines = manualUrls.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => Boolean(l));
      entries = lines.map((url: string) => ({ loc: url }));
    } else if (Array.isArray(rows) && mapping && formatType) {
      // Spreadsheet rows mapped
      entries = extractUrlEntriesFromRows(rows, mapping, formatType);
    } else if (Array.isArray(rows)) {
      // Direct raw entry objects
      entries = rows;
    } else {
      return res.status(400).json({ success: false, error: 'Please provide either manualUrls, mapped spreadsheet rows, or URL entry objects.' });
    }

    const genResult = generateSitemapXml(entries, validatedOpts.options);

    // Store individual files in download manager and build zip
    for (const file of genResult.files) {
      const token = storeDownload(file.filename, 'application/xml; charset=utf-8', Buffer.from(file.content, 'utf-8'));
      file.downloadId = token;
    }

    // Generate ZIP package containing all XML files + validation report (if any issues exist)
    const allIssues = [...genResult.errors, ...genResult.warnings];
    const zipBuffer = await createSitemapsZip(genResult.files, allIssues);
    const zipToken = storeDownload('sitemaps.zip', 'application/zip', zipBuffer);

    // Only generate separate validation report if issues (errors or warnings) were found
    let reportToken: string | undefined = undefined;
    if (allIssues.length > 0) {
      const reportCsv = generateIssuesCsv(allIssues);
      reportToken = storeDownload('sitemap-validation-report.csv', 'text/csv; charset=utf-8', Buffer.from(reportCsv, 'utf-8'));
    }

    res.json({
      success: genResult.success,
      summary: genResult.summary,
      files: genResult.files.map(f => ({
        filename: f.filename,
        type: f.type,
        urlCount: f.urlCount,
        byteSize: f.byteSize,
        downloadId: f.downloadId
      })),
      zipDownloadId: zipToken,
      reportDownloadId: reportToken,
      xmlPreview: genResult.xmlPreview,
      isPreviewTruncated: genResult.isPreviewTruncated,
      warnings: genResult.warnings,
      errors: genResult.errors
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to generate XML sitemap.' });
  }
});

// GET /api/seo/sitemap/download/:downloadId
app.get('/api/seo/sitemap/download/:downloadId', (req: Request, res: Response) => {
  const downloadId = String(req.params.downloadId || '');
  const pkg = getDownload(downloadId);

  if (!pkg) {
    return res.status(404).send('Download link expired or not found. Please regenerate sitemap.');
  }

  res.setHeader('Content-Type', pkg.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${pkg.filename}"`);
  res.send(pkg.buffer);
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Indian Marketers SEO Tools] Backend Server running on http://localhost:${PORT}`);
  });
}

export default app;
