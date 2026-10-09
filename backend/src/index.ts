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
app.use(express.json({ limit: '5mb' }));

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

app.listen(PORT, () => {
  console.log(`[Indian Marketers SEO Tools] Backend Server running on http://localhost:${PORT}`);
});
