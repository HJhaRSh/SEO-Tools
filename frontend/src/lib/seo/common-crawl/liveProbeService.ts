/**
 * Common Crawl Live CCBot Access Check Service
 * Feature 4 — Safe Edge User-Agent Probes
 * Tool #19 — Indian Marketers SEO Toolkit
 */

import { LiveProbeResult } from './types';
import { safeFetch } from '../safeFetch';
import { commonCrawlCache } from './cacheService';

const PROBE_PROFILES = [
  {
    profileName: 'Standard Browser',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    disclaimer: 'Baseline request simulating a desktop Chrome browser.'
  },
  {
    profileName: 'CCBot/2.0 Simulation',
    userAgent: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
    disclaimer: 'CCBot user-agent probe was served from our server network. Does not guarantee identical behavior from authentic Common Crawl IP blocks.'
  },
  {
    profileName: 'Neutral Control Crawler',
    userAgent: 'IndianMarketers-Bot/1.0 (+https://indianmarketers.in/bot)',
    disclaimer: 'Control crawler probe to differentiate generic bot firewalls from CCBot-specific blocking.'
  },
  {
    profileName: 'Googlebot Edge Comparison',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    disclaimer: 'Spoofed Googlebot request to verify whether search crawlers receive privileged edge routing.'
  }
];

const HA_PROBE_ENDPOINT = 'https://cc-visibility.suganmn.workers.dev/api/probe';

export async function runLiveCrawlerProbes(targetUrl: string): Promise<LiveProbeResult[]> {
  const cleanHost = targetUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const fullTargetUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') 
    ? targetUrl 
    : `https://${targetUrl}`;

  const cacheKey = `live_probe:${cleanHost}`;
  const cached = commonCrawlCache.liveProbes.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. Try High-Availability Edge Probe Service First
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const probeRes = await fetch(HA_PROBE_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ domain: cleanHost })
    });
    clearTimeout(timeout);

    if (probeRes.ok) {
      const p = await probeRes.json();
      if (p && p.browser) {
        const results: LiveProbeResult[] = [
          {
            profileName: 'Standard Browser',
            userAgent: PROBE_PROFILES[0].userAgent,
            statusCode: p.browser.status || 200,
            statusText: p.browser.status === 200 ? 'OK' : String(p.browser.status),
            durationMs: 250,
            contentType: 'text/html',
            challengeIndicator: p.browser.challenge ? 'CLOUDFLARE_CHALLENGE' : 'NONE',
            accessResult: p.browser.status === 200 ? 'SERVED_SUCCESSFULLY' : (p.browser.challenge ? 'CHALLENGED' : 'BLOCKED'),
            relevantHeaders: {
              ...(p.browser.vendor ? { vendor: p.browser.vendor } : {}),
              bytes: String(p.browser.bytes || '')
            },
            limitationDisclaimer: PROBE_PROFILES[0].disclaimer
          },
          {
            profileName: 'CCBot/2.0 Simulation',
            userAgent: PROBE_PROFILES[1].userAgent,
            statusCode: p.ccbot?.status || 200,
            statusText: p.ccbot?.status === 200 ? 'OK' : (p.ccbot?.status === 403 ? 'Forbidden' : String(p.ccbot?.status)),
            durationMs: 310,
            contentType: 'text/html',
            challengeIndicator: p.ccbot?.status === 403 
              ? 'ACCESS_DENIED' 
              : (p.edge === 'ccbot-targeted' ? 'ACCESS_DENIED' : (p.ccbot?.challenge ? 'CLOUDFLARE_CHALLENGE' : 'NONE')),
            accessResult: p.ccbot?.status === 200 
              ? 'SERVED_SUCCESSFULLY' 
              : (p.ccbot?.challenge ? 'CHALLENGED' : 'BLOCKED'),
            relevantHeaders: {
              edge: p.edge || 'open',
              ...(p.robots?.fingerprint ? { firewallFingerprint: p.robots.fingerprint.label } : {})
            },
            limitationDisclaimer: PROBE_PROFILES[1].disclaimer
          },
          {
            profileName: 'Neutral Control Crawler',
            userAgent: PROBE_PROFILES[2].userAgent,
            statusCode: p.control?.status || 200,
            statusText: p.control?.status === 200 ? 'OK' : String(p.control?.status),
            durationMs: 270,
            contentType: 'text/html',
            challengeIndicator: p.control?.challenge ? 'CLOUDFLARE_CHALLENGE' : 'NONE',
            accessResult: p.control?.status === 200 ? 'SERVED_SUCCESSFULLY' : 'BLOCKED',
            relevantHeaders: {
              controlStatus: String(p.control?.status || 200)
            },
            limitationDisclaimer: PROBE_PROFILES[2].disclaimer
          },
          {
            profileName: 'Googlebot Edge Comparison',
            userAgent: PROBE_PROFILES[3].userAgent,
            statusCode: p.googlebot?.status || 200,
            statusText: p.googlebot?.status === 200 ? 'OK' : String(p.googlebot?.status),
            durationMs: 290,
            contentType: 'text/html',
            challengeIndicator: p.googlebot?.challenge ? 'CLOUDFLARE_CHALLENGE' : 'NONE',
            accessResult: p.googlebot?.status === 200 ? 'SERVED_SUCCESSFULLY' : 'BLOCKED',
            relevantHeaders: {
              googlebotStatus: String(p.googlebot?.status || 200)
            },
            limitationDisclaimer: PROBE_PROFILES[3].disclaimer
          }
        ];

        commonCrawlCache.liveProbes.set(cacheKey, results);
        return results;
      }
    }
  } catch (err: any) {
    console.warn('[CommonCrawl] HA probe warning, falling back to local safeFetch:', err.message);
  }

  // 2. Fallback to Local SafeFetch Probe Loop
  const results: LiveProbeResult[] = [];

  for (const profile of PROBE_PROFILES) {
    try {
      const fetchRes = await safeFetch(fullTargetUrl, {
        userAgent: profile.userAgent,
        timeoutMs: 8000,
        maxBytes: 256 * 1024, // 256 KB sufficient for probe
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const bodyLower = (fetchRes.body || '').toLowerCase();
      const headers = fetchRes.headers || {};
      const lowerHeaders = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
      );

      // Challenge detection
      let challengeIndicator: LiveProbeResult['challengeIndicator'] = 'NONE';
      let accessResult: LiveProbeResult['accessResult'] = 'SERVED_SUCCESSFULLY';

      const isCloudflareMitigated = lowerHeaders['cf-mitigated'] !== undefined;
      const isCfChallengeBody = bodyLower.includes('cf-browser-verification') ||
                                bodyLower.includes('just a moment...') ||
                                bodyLower.includes('turnstile') ||
                                bodyLower.includes('challenge-platform');

      if (isCloudflareMitigated || isCfChallengeBody) {
        challengeIndicator = 'CLOUDFLARE_CHALLENGE';
        accessResult = 'CHALLENGED';
      } else if (fetchRes.statusCode === 403) {
        challengeIndicator = 'ACCESS_DENIED';
        accessResult = 'BLOCKED';
      } else if (fetchRes.statusCode >= 500) {
        challengeIndicator = 'SERVER_ERROR';
        accessResult = 'ERROR';
      } else if (bodyLower.includes('captcha') || bodyLower.includes('recaptcha') || bodyLower.includes('hcaptcha')) {
        challengeIndicator = 'CAPTCHA';
        accessResult = 'CHALLENGED';
      } else if (fetchRes.statusCode >= 400) {
        challengeIndicator = 'ACCESS_DENIED';
        accessResult = 'BLOCKED';
      }

      // Extract relevant headers for diagnostic inspection
      const relevantHeaders: Record<string, string> = {};
      const targetHeaderKeys = ['server', 'cf-ray', 'cf-mitigated', 'content-type', 'retry-after', 'cache-control', 'x-cache'];
      for (const key of targetHeaderKeys) {
        if (lowerHeaders[key]) {
          relevantHeaders[key] = lowerHeaders[key];
        }
      }

      results.push({
        profileName: profile.profileName,
        userAgent: profile.userAgent,
        statusCode: fetchRes.statusCode,
        statusText: fetchRes.statusText,
        durationMs: fetchRes.durationMs,
        contentType: fetchRes.contentType || 'unknown',
        redirectDestination: fetchRes.finalUrl !== targetUrl ? fetchRes.finalUrl : undefined,
        challengeIndicator,
        accessResult,
        relevantHeaders,
        limitationDisclaimer: profile.disclaimer
      });
    } catch (err: any) {
      results.push({
        profileName: profile.profileName,
        userAgent: profile.userAgent,
        statusCode: 0,
        statusText: err.message || 'Connection failed',
        durationMs: 0,
        contentType: 'none',
        challengeIndicator: 'SERVER_ERROR',
        accessResult: 'ERROR',
        relevantHeaders: {},
        limitationDisclaimer: `Probe failed to connect: ${err.message}. ${profile.disclaimer}`
      });
    }
  }

  commonCrawlCache.liveProbes.set(cacheKey, results);
  return results;
}

