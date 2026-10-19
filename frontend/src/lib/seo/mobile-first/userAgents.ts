/**
 * Verified User-Agent definitions for Mobile-First Index Checker.
 * Adheres to Google's official crawler documentation without placeholders.
 */

export interface MobileFirstUserAgentProfile {
  id: 'googlebot' | 'chrome';
  name: string;
  desktop: {
    name: string;
    token: string; // for robots.txt evaluation
    userAgent: string;
  };
  mobile: {
    name: string;
    token: string; // for robots.txt evaluation
    userAgent: string;
  };
}

export const USER_AGENT_PROFILES: Record<'googlebot' | 'chrome', MobileFirstUserAgentProfile> = {
  googlebot: {
    id: 'googlebot',
    name: 'Googlebot (Search Engine Crawler - Default)',
    desktop: {
      name: 'Desktop Googlebot',
      token: 'googlebot',
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    },
    mobile: {
      name: 'Googlebot Smartphone',
      token: 'googlebot',
      userAgent:
        'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.116 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    },
  },
  chrome: {
    id: 'chrome',
    name: 'Standard Chrome (Desktop & Mobile Browser)',
    desktop: {
      name: 'Desktop Chrome',
      token: '*',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    },
    mobile: {
      name: 'Mobile Chrome',
      token: '*',
      userAgent:
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
    },
  },
};
