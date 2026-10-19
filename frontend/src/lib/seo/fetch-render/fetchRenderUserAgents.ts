import { FetchRenderUserAgentOption } from './fetchRenderTypes';
import { USER_AGENTS } from '../userAgents';

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

export function findFetchRenderUserAgent(idOrName: string): FetchRenderUserAgentOption | undefined {
  if (!idOrName) return undefined;
  const query = idOrName.toLowerCase().trim();
  const direct = FETCH_RENDER_USER_AGENTS.find(
    ua => ua.id.toLowerCase() === query || ua.name.toLowerCase() === query
  );
  if (direct) return direct;

  // Check if it matches an AI bot or search crawler from USER_AGENTS registry
  const matchedDefinition = USER_AGENTS.find(
    ua => ua.token.toLowerCase() === query || ua.name.toLowerCase() === query
  );
  if (matchedDefinition) {
    const isMobile = matchedDefinition.token.toLowerCase().includes('mobile') || matchedDefinition.name.toLowerCase().includes('smartphone');
    return {
      id: matchedDefinition.token.toLowerCase(),
      name: matchedDefinition.name,
      token: matchedDefinition.token,
      fullUserAgent: matchedDefinition.fullUserAgent,
      viewport: isMobile
        ? { width: 412, height: 869, isMobile: true, deviceScaleFactor: 2.625 }
        : { width: 1920, height: 1080, isMobile: false, deviceScaleFactor: 1 },
      isGooglebot: matchedDefinition.token.toLowerCase().includes('googlebot'),
      category: matchedDefinition.category === 'search' ? 'search' : 'ai',
      disclaimer: `Simulated ${matchedDefinition.name} user-agent. Does not originate from verified crawler IP blocks.`
    };
  }

  return undefined;
}

export function isSupportedUserAgentId(id: string): boolean {
  return findFetchRenderUserAgent(id) !== undefined;
}

export function getFetchRenderUserAgent(idOrName?: string): FetchRenderUserAgentOption {
  if (!idOrName) {
    return FETCH_RENDER_USER_AGENTS[0]; // Default: Googlebot Smartphone
  }

  const found = findFetchRenderUserAgent(idOrName);
  if (found) return found;

  throw new Error(
    `Unknown User-Agent ID: "${idOrName}". Supported user-agents include: ${FETCH_RENDER_USER_AGENTS.map(u => u.id).join(', ')}.`
  );
}
