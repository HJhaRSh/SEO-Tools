export type BotCategory = 'training' | 'search' | 'user' | 'general' | 'policy';

export interface AiBotDefinition {
  id: string;
  name: string; // Display Name (matches reference table e.g. "OpenAI", "SearchGPT", "ChatGPT-User")
  token: string; // robots.txt User-Agent Token (e.g. "GPTBot", "OAI-SearchBot", "ChatGPT-User")
  provider: string;
  category: BotCategory;
  categoryLabel: string;
  fallbackToken?: string;
  fullUserAgent?: string; // Documented HTTP user agent string (undefined if policy-only / not documented)
  isHttpTestable: boolean; // false for policy-only tokens (Google-Extended, Applebot-Extended, etc.)
  isPolicyOnlyToken?: boolean;
  documentationUrl?: string;
  description?: string;
  defaultSelected?: boolean;
}

/**
 * TechnicalSEO Reference 35 AI Bots / User-Agents
 * Ordered exactly according to reference tool specification:
 * 1. OpenAI (GPTBot)
 * 2. SearchGPT (OAI-SearchBot)
 * 3. ChatGPT-User (ChatGPT-User)
 * 4. Perplexity (PerplexityBot)
 * 5. Perplexity-User (Perplexity-User)
 * 6. ClaudeBot (ClaudeBot)
 * 7. Claude-User (Claude-User)
 * 8. Claude-SearchBot (Claude-SearchBot)
 * 9. Claude-Web (Claude-Web)
 * 10. Anthropic (anthropic-ai)
 * 11. Common Crawl (CCBot)
 * 12. Meta (FacebookBot)
 * 13. Meta External Agent (meta-externalagent)
 * 14. Meta External Fetcher (Meta-ExternalFetcher)
 * 15. You.com (YouBot)
 * 16. Amazon (Amazonbot)
 * 17. Cohere (cohere-ai)
 * 18. cohere-training-data-crawler (cohere-training-data-crawler)
 * 19. Webzio (Webzio)
 * 20. Webzio-Extended (Webzio-Extended)
 * 21. omgili (omgili)
 * 22. Omgilibot (Omgilibot)
 * 23. Diffbot (Diffbot)
 * 24. ByteDance (Bytespider)
 * 25. Google-Extended (Google-Extended)
 * 26. Gemini-Deep-Research (Gemini-Deep-Research)
 * 27. Google-CloudVertexBot (Google-CloudVertexBot)
 * 28. Applebot-Extended (Applebot-Extended)
 * 29. DuckAssistBot (DuckAssistBot)
 * 30. MistralAI-User (MistralAI-User)
 * 31. AI2 Bot (AI2Bot)
 * 32. Kangaroo Bot (Kangaroo Bot)
 * 33. PanguBot (PanguBot)
 * 34. PetalBot (PetalBot)
 * 35. SemrushBot-OCOB (SemrushBot-OCOB)
 */
export const AI_BOT_REGISTRY: AiBotDefinition[] = [
  // 1. OpenAI (GPTBot)
  {
    id: 'gptbot',
    name: 'OpenAI',
    token: 'GPTBot',
    provider: 'OpenAI',
    category: 'training',
    categoryLabel: 'AI Model Training',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    isHttpTestable: true,
    documentationUrl: 'https://platform.openai.com/docs/gptbot',
    description: 'OpenAI web crawler used to expand AI models.',
    defaultSelected: true
  },
  // 2. SearchGPT (OAI-SearchBot)
  {
    id: 'oai-searchbot',
    name: 'SearchGPT',
    token: 'OAI-SearchBot',
    provider: 'OpenAI',
    category: 'search',
    categoryLabel: 'AI Search & Citations',
    fallbackToken: 'GPTBot',
    fullUserAgent: 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
    isHttpTestable: true,
    documentationUrl: 'https://platform.openai.com/docs/oai-searchbot',
    description: 'Powers real-time search queries and citations in SearchGPT and ChatGPT.',
    defaultSelected: true
  },
  // 3. ChatGPT-User (ChatGPT-User)
  {
    id: 'chatgpt-user',
    name: 'ChatGPT-User',
    token: 'ChatGPT-User',
    provider: 'OpenAI',
    category: 'user',
    categoryLabel: 'User-Initiated Retrieval',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
    isHttpTestable: true,
    documentationUrl: 'https://platform.openai.com/docs/bots',
    description: 'Triggered when ChatGPT users direct the model to retrieve a specific URL.',
    defaultSelected: true
  },
  // 4. Perplexity (PerplexityBot)
  {
    id: 'perplexitybot',
    name: 'Perplexity',
    token: 'PerplexityBot',
    provider: 'Perplexity AI',
    category: 'search',
    categoryLabel: 'AI Search & Citations',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    isHttpTestable: true,
    documentationUrl: 'https://docs.perplexity.ai/docs/perplexitybot',
    description: 'Perplexity search crawler for indexing and answer generation.',
    defaultSelected: true
  },
  // 5. Perplexity-User (Perplexity-User)
  {
    id: 'perplexity-user',
    name: 'Perplexity-User',
    token: 'Perplexity-User',
    provider: 'Perplexity AI',
    category: 'user',
    categoryLabel: 'User-Initiated Retrieval',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai)',
    isHttpTestable: true,
    documentationUrl: 'https://docs.perplexity.ai',
    description: 'User-prompted URL fetching in Perplexity AI.',
    defaultSelected: true
  },
  // 6. ClaudeBot (ClaudeBot)
  {
    id: 'claudebot',
    name: 'ClaudeBot',
    token: 'ClaudeBot',
    provider: 'Anthropic',
    category: 'training',
    categoryLabel: 'AI Model Training',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +https://anthropic.com/claudebot)',
    isHttpTestable: true,
    documentationUrl: 'https://support.anthropic.com',
    description: 'Anthropic web crawler used to train Claude foundation models.',
    defaultSelected: true
  },
  // 7. Claude-User (Claude-User)
  {
    id: 'claude-user',
    name: 'Claude-User',
    token: 'Claude-User',
    provider: 'Anthropic',
    category: 'user',
    categoryLabel: 'User-Initiated Retrieval',
    fullUserAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +https://anthropic.com)',
    isHttpTestable: true,
    documentationUrl: 'https://support.anthropic.com',
    description: 'User-initiated URL analysis in Claude.',
    defaultSelected: true
  },
  // 8. Claude-SearchBot (Claude-SearchBot)
  {
    id: 'claude-searchbot',
    name: 'Claude-SearchBot',
    token: 'Claude-SearchBot',
    provider: 'Anthropic',
    category: 'search',
    categoryLabel: 'AI Search & Citations',
    fallbackToken: 'ClaudeBot',
    fullUserAgent: 'Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://anthropic.com/searchbot)',
    isHttpTestable: true,
    documentationUrl: 'https://support.anthropic.com',
    description: 'Crawls web pages to power search and reference answers in Claude.',
    defaultSelected: true
  },
  // 9. Claude-Web (Claude-Web)
  {
    id: 'claude-web',
    name: 'Claude-Web',
    token: 'Claude-Web',
    provider: 'Anthropic',
    category: 'user',
    categoryLabel: 'User-Initiated Retrieval',
    fullUserAgent: 'Mozilla/5.0 (compatible; Claude-Web/1.0; +https://anthropic.com)',
    isHttpTestable: true,
    documentationUrl: 'https://support.anthropic.com',
    description: 'Web browsing agent for Anthropic Claude interactive queries.',
    defaultSelected: true
  },
  // 10. Anthropic (anthropic-ai)
  {
    id: 'anthropic-ai',
    name: 'Anthropic',
    token: 'anthropic-ai',
    provider: 'Anthropic',
    category: 'training',
    categoryLabel: 'AI Model Training (Legacy)',
    fullUserAgent: 'anthropic-ai (compatible; Anthropic/1.0; +https://anthropic.com)',
    isHttpTestable: true,
    documentationUrl: 'https://support.anthropic.com',
    description: 'Legacy Anthropic robots.txt user-agent identifier.',
    defaultSelected: true
  },
  // 11. Common Crawl (CCBot)
  {
    id: 'ccbot',
    name: 'Common Crawl',
    token: 'CCBot',
    provider: 'Common Crawl',
    category: 'training',
    categoryLabel: 'Open Training Datasets',
    fullUserAgent: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
    isHttpTestable: true,
    documentationUrl: 'https://commoncrawl.org/faq/',
    description: 'Open repository of web crawl data widely ingested by foundation models.',
    defaultSelected: true
  },
  // 12. Meta (FacebookBot)
  {
    id: 'facebookbot',
    name: 'Meta',
    token: 'FacebookBot',
    provider: 'Meta',
    category: 'general',
    categoryLabel: 'Web Crawler & AI',
    fullUserAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    isHttpTestable: true,
    documentationUrl: 'https://developers.facebook.com/docs/sharing/webmasters/crawler',
    description: 'Meta web crawler and link preview indexing agent.',
    defaultSelected: true
  },
  // 13. Meta External Agent (meta-externalagent)
  {
    id: 'meta-externalagent',
    name: 'Meta External Agent',
    token: 'meta-externalagent',
    provider: 'Meta',
    category: 'training',
    categoryLabel: 'AI Model Training',
    fullUserAgent: 'Mozilla/5.0 (compatible; Meta-ExternalAgent/1.0; +https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    isHttpTestable: true,
    documentationUrl: 'https://developers.facebook.com/docs/sharing/webmasters/crawler',
    description: 'Used by Meta to collect web content for AI model training (Llama).',
    defaultSelected: true
  },
  // 14. Meta External Fetcher (Meta-ExternalFetcher)
  {
    id: 'meta-externalfetcher',
    name: 'Meta External Fetcher',
    token: 'Meta-ExternalFetcher',
    provider: 'Meta',
    category: 'user',
    categoryLabel: 'User-Initiated Retrieval',
    fullUserAgent: 'Mozilla/5.0 (compatible; Meta-ExternalFetcher/1.0; +https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    isHttpTestable: true,
    documentationUrl: 'https://developers.facebook.com/docs/sharing/webmasters/crawler',
    description: 'Fetches content requested by users across Meta AI assistant products.',
    defaultSelected: true
  },
  // 15. You.com (YouBot)
  {
    id: 'youbot',
    name: 'You.com',
    token: 'YouBot',
    provider: 'You.com',
    category: 'search',
    categoryLabel: 'AI Search & Citations',
    fullUserAgent: 'Mozilla/5.0 (compatible; YouBot/1.0; +https://you.com/youbot)',
    isHttpTestable: true,
    documentationUrl: 'https://you.com',
    description: 'Crawler for You.com conversational search engine and AI assistant.',
    defaultSelected: true
  },
  // 16. Amazon (Amazonbot)
  {
    id: 'amazonbot',
    name: 'Amazon',
    token: 'Amazonbot',
    provider: 'Amazon',
    category: 'general',
    categoryLabel: 'Search & AI Assistant',
    fullUserAgent: 'Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)',
    isHttpTestable: true,
    documentationUrl: 'https://developer.amazon.com/support/amazonbot',
    description: 'Amazon crawler used to answer Alexa queries and improve AI services.',
    defaultSelected: true
  },
  // 17. Cohere (cohere-ai)
  {
    id: 'cohere-ai',
    name: 'Cohere',
    token: 'cohere-ai',
    provider: 'Cohere',
    category: 'training',
    categoryLabel: 'AI Model Training',
    fullUserAgent: 'Mozilla/5.0 (compatible; cohere-ai/1.0; +https://cohere.com/bot)',
    isHttpTestable: true,
    documentationUrl: 'https://cohere.com',
    description: 'Cohere crawler for enterprise LLM model training.',
    defaultSelected: true
  },
  // 18. cohere-training-data-crawler (cohere-training-data-crawler)
  {
    id: 'cohere-training-data-crawler',
    name: 'cohere-training-data-crawler',
    token: 'cohere-training-data-crawler',
    provider: 'Cohere',
    category: 'training',
    categoryLabel: 'AI Model Training',
    fullUserAgent: 'Mozilla/5.0 (compatible; cohere-training-data-crawler/1.0; +https://cohere.com)',
    isHttpTestable: true,
    documentationUrl: 'https://cohere.com',
    description: 'Cohere crawler token specifically designated for training datasets.',
    defaultSelected: true
  },
  // 19. Webzio (Webzio)
  {
    id: 'webzio',
    name: 'Webzio',
    token: 'Webzio',
    provider: 'Webz.io',
    category: 'general',
    categoryLabel: 'Data & AI Indexing',
    fullUserAgent: 'Mozilla/5.0 (compatible; Webzio-Crawler/2.0; +http://webz.io/webzio_crawler.html)',
    isHttpTestable: true,
    documentationUrl: 'https://webz.io',
    description: 'Webz.io commercial big-data and AI training feed crawler.',
    defaultSelected: true
  },
  // 20. Webzio-Extended (Webzio-Extended)
  {
    id: 'webzio-extended',
    name: 'Webzio-Extended',
    token: 'Webzio-Extended',
    provider: 'Webz.io',
    category: 'policy',
    categoryLabel: 'Robots.txt Policy Token',
    isHttpTestable: false,
    isPolicyOnlyToken: true,
    documentationUrl: 'https://webz.io',
    description: 'Policy token allowing webmasters to govern Webz.io AI content syndication.',
    defaultSelected: true
  },
  // 21. omgili (omgili)
  {
    id: 'omgili',
    name: 'omgili',
    token: 'omgili',
    provider: 'Webz.io',
    category: 'training',
    categoryLabel: 'Data & AI Indexing (Legacy)',
    fullUserAgent: 'omgili/0.5 +http://omgili.com',
    isHttpTestable: true,
    documentationUrl: 'https://webz.io',
    description: 'Legacy web crawler token operated by Webz.io.',
    defaultSelected: true
  },
  // 22. Omgilibot (Omgilibot)
  {
    id: 'omgilibot',
    name: 'Omgilibot',
    token: 'Omgilibot',
    provider: 'Webz.io',
    category: 'training',
    categoryLabel: 'Data & AI Indexing (Legacy)',
    fullUserAgent: 'Omgilibot/0.4 +http://omgili.com/Omgilibot.html',
    isHttpTestable: true,
    documentationUrl: 'https://webz.io',
    description: 'Legacy variant of Webz.io forum and blog crawling robot.',
    defaultSelected: true
  },
  // 23. Diffbot (Diffbot)
  {
    id: 'diffbot',
    name: 'Diffbot',
    token: 'Diffbot',
    provider: 'Diffbot',
    category: 'training',
    categoryLabel: 'AI Knowledge Graph',
    fullUserAgent: 'Mozilla/5.0 (compatible; Diffbot/0.1; +http://www.diffbot.com)',
    isHttpTestable: true,
    documentationUrl: 'https://www.diffbot.com',
    description: 'Diffbot crawler structured for Knowledge Graph synthesis and AI models.',
    defaultSelected: true
  },
  // 24. ByteDance (Bytespider)
  {
    id: 'bytespider',
    name: 'ByteDance',
    token: 'Bytespider',
    provider: 'ByteDance',
    category: 'training',
    categoryLabel: 'AI Model Training',
    fullUserAgent: 'Mozilla/5.0 (compatible; Bytespider; https://zhanzhang.toutiao.com/)',
    isHttpTestable: true,
    documentationUrl: 'https://zhanzhang.toutiao.com/',
    description: 'ByteDance (TikTok) web spider used for search and AI model training.',
    defaultSelected: true
  },
  // 25. Google-Extended (Google-Extended)
  {
    id: 'google-extended',
    name: 'Google-Extended',
    token: 'Google-Extended',
    provider: 'Google',
    category: 'policy',
    categoryLabel: 'Robots.txt Policy Token',
    isHttpTestable: false,
    isPolicyOnlyToken: true,
    documentationUrl: 'https://developers.google.com/search/docs/crawling-indexing/google-extended',
    description: 'Robots.txt policy token to control Google Gemini and Vertex AI training data collection. No independent HTTP crawler.',
    defaultSelected: true
  },
  // 26. Gemini-Deep-Research (Gemini-Deep-Research)
  {
    id: 'gemini-deep-research',
    name: 'Gemini-Deep-Research',
    token: 'Gemini-Deep-Research',
    provider: 'Google',
    category: 'search',
    categoryLabel: 'AI Deep Research',
    fullUserAgent: 'Mozilla/5.0 (compatible; Gemini-Deep-Research/1.0; +https://google.com)',
    isHttpTestable: true,
    documentationUrl: 'https://developers.google.com',
    description: 'Autonomous research retrieval agent for Google Gemini Deep Research tasks.',
    defaultSelected: true
  },
  // 27. Google-CloudVertexBot (Google-CloudVertexBot)
  {
    id: 'google-cloudvertexbot',
    name: 'Google-CloudVertexBot',
    token: 'Google-CloudVertexBot',
    provider: 'Google Cloud',
    category: 'general',
    categoryLabel: 'Enterprise AI Agent',
    fullUserAgent: 'Mozilla/5.0 (compatible; Google-CloudVertexBot/1.0; +https://cloud.google.com/vertex-ai)',
    isHttpTestable: true,
    documentationUrl: 'https://cloud.google.com/vertex-ai',
    description: 'Google Cloud Vertex AI data grounder and enterprise indexing crawler.',
    defaultSelected: true
  },
  // 28. Applebot-Extended (Applebot-Extended)
  {
    id: 'applebot-extended',
    name: 'Applebot-Extended',
    token: 'Applebot-Extended',
    provider: 'Apple',
    category: 'policy',
    categoryLabel: 'Robots.txt Policy Token',
    isHttpTestable: false,
    isPolicyOnlyToken: true,
    documentationUrl: 'https://support.apple.com/en-us/119829',
    description: 'Robots.txt policy token to opt out of Apple Intelligence training datasets. No independent HTTP crawler.',
    defaultSelected: true
  },
  // 29. DuckAssistBot (DuckAssistBot)
  {
    id: 'duckassistbot',
    name: 'DuckAssistBot',
    token: 'DuckAssistBot',
    provider: 'DuckDuckGo',
    category: 'search',
    categoryLabel: 'AI Search & Answers',
    fullUserAgent: 'DuckAssistBot/1.0; (+https://duckduckgo.com/duckassistbot)',
    isHttpTestable: true,
    documentationUrl: 'https://duckduckgo.com/duckassistbot',
    description: 'Powers DuckDuckGo DuckAssist AI summarization and answer generation.',
    defaultSelected: true
  },
  // 30. MistralAI-User (MistralAI-User)
  {
    id: 'mistralai-user',
    name: 'MistralAI-User',
    token: 'MistralAI-User',
    provider: 'Mistral AI',
    category: 'user',
    categoryLabel: 'User-Initiated Retrieval',
    fullUserAgent: 'Mozilla/5.0 (compatible; MistralAI-User/1.0; +https://mistral.ai)',
    isHttpTestable: true,
    documentationUrl: 'https://mistral.ai',
    description: 'Invoked by users chatting with Le Chat (Mistral AI) to fetch URLs.',
    defaultSelected: true
  },
  // 31. AI2 Bot (AI2Bot)
  {
    id: 'ai2bot',
    name: 'AI2 Bot',
    token: 'AI2Bot',
    provider: 'Allen Institute for AI',
    category: 'training',
    categoryLabel: 'Open AI Research Datasets',
    fullUserAgent: 'AI2Bot/1.0 (+http://allenai.org/crawler.html)',
    isHttpTestable: true,
    documentationUrl: 'https://allenai.org',
    description: 'Crawler operated by the Allen Institute for AI to build scientific open datasets (e.g. Dolma).',
    defaultSelected: true
  },
  // 32. Kangaroo Bot (Kangaroo Bot)
  {
    id: 'kangaroo-bot',
    name: 'Kangaroo Bot',
    token: 'Kangaroo Bot',
    provider: 'AI Search Provider',
    category: 'general',
    categoryLabel: 'AI Crawler',
    fullUserAgent: 'Mozilla/5.0 (compatible; Kangaroo Bot/1.0)',
    isHttpTestable: true,
    documentationUrl: 'https://technicalseo.com',
    description: 'AI web discovery crawler token.',
    defaultSelected: true
  },
  // 33. PanguBot (PanguBot)
  {
    id: 'pangubot',
    name: 'PanguBot',
    token: 'PanguBot',
    provider: 'Huawei',
    category: 'training',
    categoryLabel: 'AI Model Training',
    fullUserAgent: 'Mozilla/5.0 (compatible; PanguBot/1.0; +https://www.huaweicloud.com)',
    isHttpTestable: true,
    documentationUrl: 'https://www.huaweicloud.com',
    description: 'Huawei Pangu foundation model training crawler.',
    defaultSelected: true
  },
  // 34. PetalBot (PetalBot)
  {
    id: 'petalbot',
    name: 'PetalBot',
    token: 'PetalBot',
    provider: 'Huawei / Aspiegel',
    category: 'search',
    categoryLabel: 'AI Search & Services',
    fullUserAgent: 'Mozilla/5.0 (compatible; PetalBot; +https://webmaster.petalsearch.com/site/petalbot)',
    isHttpTestable: true,
    documentationUrl: 'https://webmaster.petalsearch.com/site/petalbot',
    description: 'Petal Search and AI assistant crawler operated by Aspiegel/Huawei.',
    defaultSelected: true
  },
  // 35. SemrushBot-OCOB (SemrushBot-OCOB)
  {
    id: 'semrushbot-ocob',
    name: 'SemrushBot-OCOB',
    token: 'SemrushBot-OCOB',
    provider: 'Semrush',
    category: 'general',
    categoryLabel: 'Commercial AI/SEO Crawler',
    fullUserAgent: 'Mozilla/5.0 (compatible; SemrushBot-OCOB/1.0; +http://www.semrush.com/bot.html)',
    isHttpTestable: true,
    documentationUrl: 'https://www.semrush.com/bot.html',
    description: 'Semrush specialized content crawler for One2One Content Optimization and AI features.',
    defaultSelected: true
  }
];

export function getAiBotById(idOrToken: string): AiBotDefinition | undefined {
  const norm = idOrToken.trim().toLowerCase();
  return AI_BOT_REGISTRY.find(
    b =>
      b.id.toLowerCase() === norm ||
      b.token.toLowerCase() === norm ||
      b.name.toLowerCase() === norm
  );
}
