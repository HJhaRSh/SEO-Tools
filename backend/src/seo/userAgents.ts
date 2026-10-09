/**
 * Predefined User-Agents and tokens for SEO crawlers according to RFC 9309 and search engine docs.
 */
export interface UserAgentDefinition {
  name: string;
  token: string; // The primary token used in robots.txt 'User-agent: <token>'
  fallbackToken?: string; // Fallback token if applicable (e.g., Googlebot for Googlebot-Image)
  fullUserAgent: string;
  category: 'search' | 'ai' | 'generic';
}

export const USER_AGENTS: UserAgentDefinition[] = [
  {
    name: 'Googlebot',
    token: 'googlebot',
    fullUserAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    category: 'search'
  },
  {
    name: 'Googlebot Smartphone',
    token: 'googlebot', // Matches 'Googlebot' in robots.txt per Google guidelines
    fullUserAgent: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    category: 'search'
  },
  {
    name: 'Googlebot-Image',
    token: 'googlebot-image',
    fallbackToken: 'googlebot',
    fullUserAgent: 'Googlebot-Image/1.0',
    category: 'search'
  },
  {
    name: 'Googlebot-News',
    token: 'googlebot-news',
    fallbackToken: 'googlebot',
    fullUserAgent: 'Googlebot-News',
    category: 'search'
  },
  {
    name: 'Googlebot-Video',
    token: 'googlebot-video',
    fallbackToken: 'googlebot',
    fullUserAgent: 'Googlebot-Video/1.0',
    category: 'search'
  },
  {
    name: 'Bingbot',
    token: 'bingbot',
    fullUserAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    category: 'search'
  },
  {
    name: 'DuckDuckBot',
    token: 'duckduckbot',
    fullUserAgent: 'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
    category: 'search'
  },
  {
    name: 'YandexBot',
    token: 'yandexbot',
    fullUserAgent: 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    category: 'search'
  },
  {
    name: 'Baiduspider',
    token: 'baiduspider',
    fullUserAgent: 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    category: 'search'
  },
  {
    name: 'Applebot',
    token: 'applebot',
    fullUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
    category: 'search'
  },
  {
    name: 'GPTBot',
    token: 'gptbot',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    category: 'ai'
  },
  {
    name: 'OAI-SearchBot',
    token: 'oai-searchbot',
    fallbackToken: 'gptbot',
    fullUserAgent: 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
    category: 'ai'
  },
  {
    name: 'ChatGPT-User',
    token: 'chatgpt-user',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
    category: 'ai'
  },
  {
    name: 'ClaudeBot',
    token: 'claudebot',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +https://anthropic.com/claudebot)',
    category: 'ai'
  },
  {
    name: 'PerplexityBot',
    token: 'perplexitybot',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    category: 'ai'
  },
  {
    name: 'Google-Extended',
    token: 'google-extended',
    fullUserAgent: 'Google-Extended',
    category: 'ai'
  },
  {
    name: 'Generic crawler (*)',
    token: '*',
    fullUserAgent: 'Mozilla/5.0 (compatible; GenericCrawler/1.0)',
    category: 'generic'
  }
];

export function findUserAgent(nameOrToken: string): UserAgentDefinition {
  const query = nameOrToken.trim().toLowerCase();
  const matched = USER_AGENTS.find(
    ua => ua.name.toLowerCase() === query || ua.token.toLowerCase() === query
  );
  if (matched) return matched;

  // If custom user agent string, treat it as custom token
  return {
    name: nameOrToken,
    token: query,
    fullUserAgent: nameOrToken,
    category: 'generic'
  };
}
