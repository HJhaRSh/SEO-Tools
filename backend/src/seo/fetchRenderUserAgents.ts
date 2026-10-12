import { FetchRenderUserAgentOption } from './fetchRenderTypes.js';

export const FETCH_RENDER_USER_AGENTS: FetchRenderUserAgentOption[] = [
  {
    id: 'googlebot-smartphone',
    name: 'Googlebot Smartphone',
    token: 'googlebot',
    fullUserAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    viewport: {
      width: 412,
      height: 869,
      isMobile: true,
      deviceScaleFactor: 2.625
    },
    isGooglebot: true,
    category: 'search',
    disclaimer: 'User-agent simulation. Does not originate from verified Googlebot IP blocks or reverse-DNS (1e100.net).'
  },
  {
    id: 'googlebot-desktop',
    name: 'Googlebot Desktop',
    token: 'googlebot',
    fullUserAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    viewport: {
      width: 1920,
      height: 1080,
      isMobile: false,
      deviceScaleFactor: 1
    },
    isGooglebot: true,
    category: 'search',
    disclaimer: 'User-agent simulation. Does not originate from verified Googlebot IP blocks.'
  },
  {
    id: 'bingbot',
    name: 'Bingbot',
    token: 'bingbot',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/133.0.0.0 Safari/537.36',
    viewport: {
      width: 1920,
      height: 1080,
      isMobile: false,
      deviceScaleFactor: 1
    },
    isGooglebot: false,
    category: 'search',
    disclaimer: 'Simulated user-agent. Server responses may vary based on IP geolocation or bot-mitigation systems.'
  },
  {
    id: 'chrome-desktop',
    name: 'Google Chrome Desktop',
    token: 'chrome',
    fullUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport: {
      width: 1920,
      height: 1080,
      isMobile: false,
      deviceScaleFactor: 1
    },
    isGooglebot: false,
    category: 'browser',
    disclaimer: 'Standard modern desktop browser emulation.'
  },
  {
    id: 'chrome-mobile',
    name: 'Google Chrome Mobile',
    token: 'chrome-mobile',
    fullUserAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
    viewport: {
      width: 412,
      height: 915,
      isMobile: true,
      deviceScaleFactor: 2.625
    },
    isGooglebot: false,
    category: 'browser',
    disclaimer: 'Standard modern mobile device emulation.'
  }
];

export function getFetchRenderUserAgent(idOrName?: string): FetchRenderUserAgentOption {
  if (!idOrName) {
    return FETCH_RENDER_USER_AGENTS[0]; // Default: Googlebot Smartphone
  }

  const query = idOrName.toLowerCase().trim();
  const found = FETCH_RENDER_USER_AGENTS.find(
    ua => ua.id.toLowerCase() === query || ua.name.toLowerCase() === query
  );

  if (found) return found;

  // Fallback to default
  return FETCH_RENDER_USER_AGENTS[0];
}
