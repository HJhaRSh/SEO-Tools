/**
 * Common Crawl Live CCBot Access Check Service
 * Feature 4 — Safe Edge User-Agent Probes
 * Tool #19 — Indian Marketers SEO Toolkit
 *
 * Performs real, non-fabricated HTTP requests across 4 distinct crawler identities.
 * Accurately measures actual response durations and records authentic HTTP status codes.
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
    disclaimer: 'Simulated CCBot request from our application server network to test edge firewall and CDN bot-mitigation policies.'
  },
  {
    profileName: 'Neutral Control Crawler',
    userAgent: 'IndianMarketers-Bot/1.0 (+https://indianmarketers.in/bot)',
    disclaimer: 'Control crawler probe to differentiate generic bot firewalls from CCBot-specific blocking.'
  },
  {
    profileName: 'Googlebot Edge Comparison',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    disclaimer: 'Googlebot identity comparison to verify whether search crawlers receive privileged edge routing.'
  }
];

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

  // Execute authentic parallel requests using safeFetch (measures real durations & real status codes)
  const results = await Promise.all(
    PROBE_PROFILES.map(async (profile): Promise<LiveProbeResult> => {
      const startTime = Date.now();
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

        const actualDuration = Math.max(1, fetchRes.durationMs || (Date.now() - startTime));
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
        } else if (fetchRes.statusCode === 0) {
          challengeIndicator = 'SERVER_ERROR';
          accessResult = 'UNAVAILABLE';
        }

        const relevantHeaders: Record<string, string> = {};
        const targetHeaderKeys = ['server', 'cf-ray', 'cf-mitigated', 'content-type', 'retry-after', 'cache-control', 'x-cache'];
        for (const key of targetHeaderKeys) {
          if (lowerHeaders[key]) {
            relevantHeaders[key] = lowerHeaders[key];
          }
        }

        return {
          profileName: profile.profileName,
          userAgent: profile.userAgent,
          statusCode: fetchRes.statusCode,
          statusText: fetchRes.statusText || (fetchRes.statusCode === 200 ? 'OK' : String(fetchRes.statusCode)),
          durationMs: actualDuration,
          contentType: fetchRes.contentType || 'unknown',
          redirectDestination: fetchRes.finalUrl !== targetUrl ? fetchRes.finalUrl : undefined,
          challengeIndicator,
          accessResult,
          relevantHeaders,
          limitationDisclaimer: profile.disclaimer
        };
      } catch (err: any) {
        const elapsed = Math.max(1, Date.now() - startTime);
        return {
          profileName: profile.profileName,
          userAgent: profile.userAgent,
          statusCode: 0,
          statusText: err.message || 'Probe request failed',
          durationMs: elapsed,
          contentType: 'none',
          challengeIndicator: 'SERVER_ERROR',
          accessResult: 'UNAVAILABLE',
          relevantHeaders: {},
          limitationDisclaimer: `Probe was unable to complete: ${err.message}. ${profile.disclaimer}`
        };
      }
    })
  );

  commonCrawlCache.liveProbes.set(cacheKey, results);
  return results;
}

