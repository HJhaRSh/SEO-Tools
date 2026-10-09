export interface ToolItem {
  name: string;
  description: string;
  href: string;
  isNew?: boolean;
}

export interface ToolCategory {
  category: string;
  description: string;
  tools: ToolItem[];
}

export const NAVIGATION_TOOLS: ToolCategory[] = [
  {
    category: 'Crawling & Access',
    description: 'Tools to analyse how search engines and crawlers access your website.',
    tools: [
      { name: 'robots.txt Tester', description: 'Test whether URLs are allowed or blocked by robots.txt.', href: '/tools/robots-txt-tester' },
      { name: 'AI Bot Access Tester', description: 'Check whether AI crawlers can access your website.', href: '/tools/ai-bot-access-tester' },
      { name: '.htaccess Tester', description: 'Analyse common .htaccess rules and redirects.', href: '/tools/htaccess-tester' },
      { name: 'Sitemap Generator', description: 'Generate and analyse XML sitemaps.', href: '/tools/sitemap-generator' }
    ]
  },
  {
    category: 'Rendering & Mobile SEO',
    description: 'Tools for inspecting how search engines render your pages and evaluate mobile friendliness.',
    tools: [
      { name: 'Fetch & Render', description: 'See your webpage exactly how search engines see it.', href: '/tools/fetch-render' },
      { name: 'Pre-rendering Tester', description: 'Compare source HTML with fully rendered DOM.', href: '/tools/prerendering-tester' },
      { name: 'Mobile-First Index Tool', description: 'Compare desktop and mobile content parity.', href: '/tools/mobile-first-index' },
      { name: 'Mobile-Friendly Test', description: 'Test if a page is optimized for mobile devices.', href: '/tools/mobile-friendly-test' }
    ]
  },
  {
    category: 'International SEO',
    description: 'Tools for analysing multi-language and multi-regional website configurations.',
    tools: [
      { name: 'hreflang Tags Tester', description: 'Validate hreflang tags for international targeting.', href: '/tools/hreflang-tester' }
    ]
  },
  {
    category: 'Local SEO',
    description: 'Tools to improve your local business visibility.',
    tools: [
      { name: 'Local Search Tool', description: 'Simulate local search results for specific locations.', href: '/tools/local-search' },
      { name: 'Review Link Generator', description: 'Create direct Google Review links for your business.', href: '/tools/review-link-generator' }
    ]
  },
  {
    category: 'Search Appearance',
    description: 'Tools to optimise how your website appears in search results.',
    tools: [
      { name: 'SERP Simulator', description: 'Preview your title and meta description in search results.', href: '/tools/serp-simulator' },
      { name: 'Knowledge Graph Search', description: 'Search and inspect Google Knowledge Graph entities.', href: '/tools/knowledge-graph-search' },
      { name: 'Schema Markup Generator', description: 'Generate structured data JSON-LD code for your pages.', href: '/tools/schema-generator' }
    ]
  }
];
