"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_SELECTED_AGENTS = exports.CATEGORY_LABELS = exports.USER_AGENTS = void 0;
exports.getUserAgentById = getUserAgentById;
exports.USER_AGENTS = [
    // Browsers
    {
        id: 'chrome-desktop',
        name: 'Google Chrome Desktop',
        token: 'chrome',
        category: 'browser',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        isDefault: true,
    },
    {
        id: 'chrome-mobile',
        name: 'Google Chrome Mobile',
        token: 'chrome-mobile',
        category: 'browser',
        userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
    },
    // Search Engine Crawlers
    {
        id: 'googlebot-smartphone',
        name: 'Googlebot Smartphone',
        token: 'googlebot',
        category: 'search',
        userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        isDefault: true,
    },
    {
        id: 'googlebot-desktop',
        name: 'Googlebot Desktop',
        token: 'googlebot',
        category: 'search',
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        isDefault: true,
    },
    {
        id: 'bingbot',
        name: 'Bingbot',
        token: 'bingbot',
        category: 'search',
        userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/133.0.0.0 Safari/537.36',
        isDefault: true,
    },
    {
        id: 'applebot',
        name: 'Applebot',
        token: 'applebot',
        category: 'search',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
    },
    // AI Crawlers
    {
        id: 'gptbot',
        name: 'GPTBot',
        token: 'gptbot',
        category: 'ai',
        userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    },
    {
        id: 'chatgpt-user',
        name: 'ChatGPT-User',
        token: 'chatgpt-user',
        category: 'ai',
        userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
    },
    {
        id: 'claudebot',
        name: 'ClaudeBot',
        token: 'claudebot',
        category: 'ai',
        userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +https://anthropic.com/claudebot)',
    },
    {
        id: 'perplexitybot',
        name: 'PerplexityBot',
        token: 'perplexitybot',
        category: 'ai',
        userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    },
    // Social Crawlers
    {
        id: 'facebook-crawler',
        name: 'Facebook External Hit',
        token: 'facebookexternalhit',
        category: 'social',
        userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    },
];
exports.CATEGORY_LABELS = {
    browser: 'Browsers',
    search: 'Search Engine Crawlers',
    ai: 'AI Crawlers',
    social: 'Social Crawlers',
};
exports.MAX_SELECTED_AGENTS = 10;
function getUserAgentById(id) {
    return exports.USER_AGENTS.find((ua) => ua.id.toLowerCase() === id.toLowerCase().trim());
}
