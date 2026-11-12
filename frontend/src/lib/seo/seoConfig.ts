import type { Metadata } from 'next';

export const SITE_DOMAIN = 'https://indianmarketers.in';
export const TOOLS_BASE_URL = 'https://indianmarketers.in/tools';
export const SITE_NAME = 'Indian Marketers';
export const LOGO_URL = 'https://indianmarketers.in/tools/images/indian-marketers-logo.png';

export const SOCIAL_PROFILES = [
  'https://www.facebook.com/www.indianmarketers.in/',
  'https://x.com/indianmarketer3',
  'https://www.linkedin.com/company/indian-marketers/',
  'https://www.instagram.com/indianmarketers/'
];

export interface ToolFaqItem {
  question: string;
  answer: string;
}

export interface ToolSeoData {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  canonical: string;
  category: string;
  softwareCategory: string;
  keywords?: string[];
  features: string[];
  faqs: ToolFaqItem[];
}

export const TOOLS_REGISTRY: Record<string, ToolSeoData> = {
  'robots-txt-tester': {
    slug: 'robots-txt-tester',
    name: 'robots.txt Tester',
    metaTitle: 'Robots.txt Tester – Free Online Checker | Indian Marketers',
    metaDescription: 'Use our free robots.txt Tester to check if Googlebot and other crawlers can access a URL. Test Allow and Disallow rules, debug directives and check crawl permissions.',
    canonical: `${TOOLS_BASE_URL}/robots-txt-tester`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'robots.txt tester',
      'robots txt tester',
      'google robots tester',
      'google robots txt checker',
      'google robots txt tester',
      'robots txt test',
      'google robots txt test',
      'test robots txt google',
      'googlebot tester',
      'test robots.txt google',
      'robots.txt checker',
      'robots.txt validator',
      'check robots.txt',
      'test robots.txt online'
    ],
    features: [
      'RFC 9309 official robots.txt crawlability evaluation engine',
      'Longest-octet pattern specificity and Allow vs Disallow tie-breaking resolution',
      'Live robots.txt fetching with DNS SSRF protections and HTTP status validation',
      'In-memory live sandbox editor for real-time directive simulation',
      'Automated XML sitemap extraction and HTTP accessibility validation',
      'Embedded page resource crawler for CSS, JavaScript, and image accessibility',
      'Multi-crawler testing for Googlebot, Bingbot, and custom user-agent tokens'
    ],
    faqs: [
      {
        question: 'What is a robots.txt tester?',
        answer: 'A robots.txt tester is a diagnostic technical SEO tool that checks whether specific search engine crawlers (such as Googlebot or Bingbot) are permitted to access and crawl a given URL path on your website according to your robots.txt file. It evaluates your directives against official standards (such as RFC 9309) to reveal whether a URL is allowed or disallowed.'
      },
      {
        question: 'How do I test robots.txt rules for a specific URL?',
        answer: 'To test a URL: enter your website origin (e.g., https://example.com) and the exact path you wish to test (e.g., /category/product or /private-folder). Next, choose your target crawler from the User Agent dropdown—such as Googlebot or Bingbot—and run the test. The tester fetches your live robots.txt file, evaluates your directives, and returns an Allow or Disallow verdict alongside the exact matching rule and line number.'
      },
      {
        question: 'Does Google Search Console still have a robots.txt Tester?',
        answer: 'Google retired its former standalone Search Console robots.txt Tester in late 2023. Search Console now provides a robots.txt report that displays fetched robots.txt files, fetch status, and processing errors. For testing whether a specific live URL is crawlable, Google offers the URL Inspection tool. Indian Marketers provides this independent robots.txt Tester to test URL paths, inspect rule precedence, and simulate edits in a sandbox editor before publishing changes.'
      },
      {
        question: 'Does robots.txt Disallow prevent a page from being indexed by Google?',
        answer: "No. Robots.txt directives govern crawling (requesting and downloading the page), not indexing. If a disallowed URL receives external links, Google can still index the URL and display it in search results without a content snippet. To prevent indexing, a URL must be crawlable by Googlebot so it can read a 'noindex' robots meta tag or X-Robots-Tag HTTP header. Blocking a page in robots.txt prevents Google from reading a 'noindex' directive."
      },
      {
        question: 'How does rule precedence and tie-breaking work under RFC 9309?',
        answer: 'Under RFC 9309, search engine crawlers evaluate directives by pattern specificity, defined by the number of octets (characters) in the matching rule path. The longest matching rule takes precedence regardless of whether it appears first or last in the file. When an Allow and Disallow rule match the exact same octet length, the Allow rule takes precedence over Disallow.'
      },
      {
        question: "Why does Googlebot Smartphone use the 'Googlebot' user-agent group?",
        answer: "According to Google's official crawler documentation, Googlebot Smartphone identifies itself as a Googlebot crawler and reads directives from the 'User-agent: Googlebot' group. It only falls back to the generic 'User-agent: *' wildcard group if no specific 'Googlebot' group exists in your robots.txt file. A separate user-agent group for Googlebot-Smartphone is generally unnecessary unless you specifically want distinct mobile crawling rules."
      },
      {
        question: 'Why should I test embedded page resources like CSS and JavaScript?',
        answer: 'Google renders web pages using an evergreen Chromium browser engine. If your robots.txt file blocks Googlebot from crawling essential CSS stylesheets, JavaScript bundles, or images, Googlebot cannot render the page layout correctly. This can cause rendering discrepancies, negatively affect mobile-friendliness evaluation, and prevent structured data and critical above-the-fold content from being indexed.'
      },
      {
        question: "What happens if a website's robots.txt returns a 404 error?",
        answer: 'According to RFC 9309 Section 2.3.1.2, if a robots.txt file returns an HTTP 404 (Not Found) or 410 (Gone) status code, search engine crawlers interpret this as a complete absence of crawling restrictions. Crawlers assume all URLs on the host are allowed for crawling. In contrast, if the server returns a 5xx server error, crawlers treat the failure as a temporary service outage and typically postpone crawling until the file can be retrieved.'
      }
    ]
  },

  'ai-bot-access-tester': {
    slug: 'ai-bot-access-tester',
    name: 'AI Bot Access Tester',
    metaTitle: 'AI Bot Access Tester & Crawler Checker | Indian Marketers',
    metaDescription: "Test AI crawler access with Indian Marketers' free AI Bot Access Tester. Check robots.txt permissions, HTTP responses and bot blocking for GPTBot, ClaudeBot and more.",
    canonical: `${TOOLS_BASE_URL}/ai-bot-access-tester`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'ai bot access tester',
      'ai crawler checker',
      'ai bot checker',
      'ai crawler access checker',
      'ai bot robots.txt checker',
      'gptbot checker',
      'chatgpt crawler checker',
      'claude bot checker',
      'perplexity bot checker',
      'ai crawler tester',
      'check ai bot access'
    ],
    features: [
      'Multi-layer crawler access diagnostic (RFC 9309 robots.txt, simulated HTTP response, and WAF shield analysis)',
      'Support for 35 AI bot entries: 32 active HTTP crawler identities and 3 robots.txt policy tokens (including GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Applebot, and Google-Extended)',
      'Bulk URL audit up to 100 pages per scan with origin-level robots.txt caching',
      'Detection of Cloudflare Turnstile, CAPTCHA challenges, and 403 Forbidden bot blockers',
      'Downloadable CSV access audit reports and comparison matrix'
    ],
    faqs: [
      {
        question: 'What is an AI Bot Access Tester?',
        answer: 'An AI Bot Access Tester is a technical SEO diagnostic tool that checks whether artificial intelligence web crawlers, AI search indexers, and user-directed AI fetchers can access and crawl specific URLs on your website. It evaluates crawler policy under RFC 9309 robots.txt rules, tests simulated HTTP response codes, and detects CDN or Web Application Firewall (WAF) bot challenges.'
      },
      {
        question: 'How do I check if GPTBot can crawl my website?',
        answer: 'To check if GPTBot can crawl your website, enter your URL into the tester and select OpenAI GPTBot. The tool fetches your live robots.txt file to determine if your User-agent: GPTBot or wildcard (*) directives return an Allowed or Disallowed status under RFC 9309, then verifies whether your web server responds with HTTP 200 OK or blocks the request.'
      },
      {
        question: 'How can I check whether ChatGPT search crawlers are allowed?',
        answer: 'To check whether ChatGPT search can access your pages, select OAI-SearchBot in the tester. OpenAI uses OAI-SearchBot specifically to index content and display web citations in ChatGPT search results. You can inspect whether your robots.txt allows OAI-SearchBot and confirm that your server does not return 403 Forbidden or WAF challenge pages.'
      },
      {
        question: 'What is the difference between GPTBot and OAI-SearchBot?',
        answer: 'GPTBot is OpenAI’s automated crawler used to collect content for training foundational AI models. OAI-SearchBot is a separate crawler dedicated to discovering, indexing, and citing web pages directly within ChatGPT search. Disallowing GPTBot does not automatically block your site from appearing in ChatGPT search results, and allowing OAI-SearchBot does not grant model-training rights.'
      },
      {
        question: 'Can robots.txt block AI crawlers?',
        answer: 'Yes, compliant AI crawlers from reputable providers (including OpenAI, Anthropic, Google, Perplexity, and Apple) follow RFC 9309 robots.txt specifications. Adding a Disallow directive under the specific crawler user-agent group instructs the bot not to crawl those URLs. However, robots.txt is a cooperative policy standard, not a server-level firewall.'
      },
      {
        question: 'Why does an AI bot show as allowed in robots.txt but blocked by HTTP?',
        answer: 'Robots.txt represents crawler policy, not network access. If robots.txt allows an AI bot, the crawler is permitted to request the URL. However, your web hosting, CDN security rules, or Web Application Firewall (WAF)—such as Cloudflare Bot Management or AWS WAF—may block automated requests with HTTP 403 Forbidden or serve interactive CAPTCHA/Turnstile verification challenges.'
      },
      {
        question: 'What is the difference between Google-Extended and Googlebot?',
        answer: 'Googlebot is Google’s primary search crawler responsible for indexing pages for Google Search. Google-Extended is a robots.txt policy token (not a standalone HTTP crawler) used exclusively to opt out of Google’s generative AI model training (such as Gemini and Vertex AI) without impacting your site’s visibility in regular Google Search results.'
      },
      {
        question: 'Does allowing AI crawlers improve AI search visibility?',
        answer: 'Permitting crawler access is a prerequisite for discovery, but it does not guarantee inclusion or ranking in AI search answers or LLM summaries. AI search engines like ChatGPT Search and Perplexity evaluate content relevance, authoritative source signals, factual accuracy, and technical page quality to determine which sources to cite in response to user queries.'
      },
      {
        question: 'Can I test multiple website URLs at once?',
        answer: 'Yes. The AI Bot Access Tester supports bulk testing for up to 100 URLs per scan across single or multiple website origins. The tool groups requests by origin to cache robots.txt lookups efficiently, evaluates RFC 9309 matching rules with line numbers, and displays the results in an interactive comparison matrix with one-click CSV export.'
      }
    ]
  },

  'htaccess-tester': {
    slug: 'htaccess-tester',
    name: '.htaccess Tester',
    metaTitle: '.htaccess Tester – Free Rewrite Rule Checker | Indian Marketers',
    metaDescription: 'Test .htaccess rewrite and redirect rules online for free. Simulate Apache RewriteRule, RewriteCond and 301 redirects with debugging before deployment.',
    canonical: `${TOOLS_BASE_URL}/htaccess-tester`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'htaccess tester',
      '.htaccess tester',
      'htaccess rewrite tester',
      'apache rewrite rule tester',
      'htaccess rewrite rule tester',
      'htaccess redirect checker',
      'htaccess redirect tester',
      'test htaccess rules',
      'htaccess checker',
      'htaccess validator',
      'apache htaccess tester',
      'online htaccess tester',
      'free htaccess tester',
      'mod_rewrite tester',
      'apache rewrite tester',
      'htaccess rule checker',
      'htaccess 301 redirect test',
      'test htaccess redirect',
      'rewrite rule tester',
      'htaccess syntax checker',
      'htaccess rewrite checker'
    ],
    features: [
      'Apache mod_rewrite and mod_alias execution simulation',
      'Simulation of RewriteRule, RewriteCond, RewriteBase, Redirect, and RedirectMatch directives',
      'Line-by-line debug trace displaying matched conditions, regex capture groups, and rewrite flags',
      'Testing for HTTP 301 permanent and 302 temporary redirect status codes',
      'Pre-configured SEO templates for HTTP to HTTPS, www canonicalization, trailing slash, and clean URLs',
      'Customizable server variables including HTTPS, HTTP_HOST, User-Agent, Referer, and directory context',
      'Detection of infinite redirect loops and conflicting rule precedence',
      'Diagnostic result export in CSV and JSON formats',
      '100% safe client-server sandbox environment without modifying production files'
    ],
    faqs: [
      {
        question: "Does this modify my website's actual .htaccess file?",
        answer: 'No. All evaluation is done in an isolated simulation environment. Your live server files remain completely untouched.'
      },
      {
        question: 'How does the tool evaluate rules?',
        answer: 'The tester runs Apache rewrite simulation via the industry-standard madewithlove engine with deterministic local fallback handling, providing line-level diagnostics.'
      },
      {
        question: 'Is this an actual live HTTP redirect?',
        answer: 'No. This tool provides simulated redirect and rewrite outcomes based on Apache configuration rules. To test live HTTP redirects from an existing server, use our HTTP Status / AI Bot Access tools.'
      },
      {
        question: 'What is a .htaccess tester?',
        answer: 'A .htaccess tester is a diagnostic technical SEO and web development tool that simulates how Apache HTTP Server parses and executes per-directory rewrite and redirect directives on a specific URL. It allows webmasters to verify URL transformations, capture group substitutions, and HTTP status codes before committing changes to production.'
      },
      {
        question: 'How do I test .htaccess rewrite rules online?',
        answer: 'Enter your test URL, paste your .htaccess configuration (or select one of the pre-configured SEO templates), optionally adjust advanced server variables such as HTTPS or HTTP_HOST, and click "Test Rules". The tester outputs the final simulated URL, transformation type (external redirect vs internal rewrite), HTTP status code, and a line-by-line debug trace.'
      },
      {
        question: 'Can I test 301 redirects before making them live?',
        answer: 'Yes. The tool simulates external 301 (Moved Permanently) and 302 (Found) redirects triggered by mod_rewrite rules with the [R=301] flag or mod_alias directives like Redirect and RedirectMatch. You can verify both the final destination URL and the exact status code returned.'
      },
      {
        question: 'What is the difference between RewriteRule and Redirect directives?',
        answer: "Redirect and RedirectMatch belong to Apache's mod_alias module and handle straightforward path-based or regex URL redirections, always issuing an external HTTP status code. RewriteRule belongs to mod_rewrite and supports advanced regular expressions, conditional matching via RewriteCond, query string manipulation, and internal silent URL rewriting without changing the browser address bar."
      },
      {
        question: 'Can I test RewriteCond server variable conditions?',
        answer: 'Yes. The simulator evaluates RewriteCond directives against Apache server variables including %{HTTPS}, %{HTTP_HOST}, %{REQUEST_URI}, %{QUERY_STRING}, %{HTTP_USER_AGENT}, and %{HTTP_REFERER}. You can customize these variables in the Advanced Server Variables panel to test device-specific or protocol-specific rules.'
      },
      {
        question: 'How do I identify redirect loops in .htaccess?',
        answer: 'Redirect loops occur when a target URL repeatedly matches a rewrite rule that redirects back to itself or another rule in an endless loop. The tool tracks execution iterations and flags potential recursion or circular redirect chains in the debug trace, helping you insert appropriate exit conditions before deploying to production.'
      },
      {
        question: 'Why might a rule work in the tester but fail on a live Apache server?',
        answer: 'Simulations evaluate rule logic under standard Apache configurations. On a live server, a rule might fail if mod_rewrite is disabled, if AllowOverride FileInfo is set to None (causing Apache to ignore .htaccess directives), if conflicting server-level VirtualHost rules override it, or if file-system permission checks (like -f or -d) behave differently on disk.'
      },
      {
        question: 'Can I use this tool to check .htaccess syntax?',
        answer: 'The tester validates syntax for supported mod_rewrite and mod_alias directives (including RewriteRule, RewriteCond, RewriteBase, Redirect, and RedirectMatch) and reports unrecognized or invalid directives in the line-by-line debug log. It is not an exhaustive validator for every Apache core or third-party module directive.'
      },
      {
        question: 'Does the tool support 302 temporary redirects?',
        answer: 'Yes. When using [R=302] or the default [R] flag in RewriteRule, or using "Redirect 302" in mod_alias, the simulator correctly reports the transformation as an external 302 temporary redirect.'
      }
    ]
  },

  'sitemap-generator': {
    slug: 'sitemap-generator',
    name: 'Free XML Sitemap Generator',
    metaTitle: 'Free XML Sitemap Generator Online | Indian Marketers',
    metaDescription: "Create an XML sitemap for free with Indian Marketers' online Sitemap Generator. Crawl your website, upload CSV or Excel, or paste URLs to download sitemap.xml.",
    canonical: `${TOOLS_BASE_URL}/sitemap-generator`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'xml sitemap generator',
      'sitemap generator',
      'free xml sitemap generator',
      'sitemap creator online',
      'generate xml sitemap',
      'sitemap xml generator',
      'website xml sitemap generator',
      'create sitemap',
      'google sitemap generator',
      'xml sitemap builder'
    ],
    features: [
      'Live website crawler discovering and validating up to 500 internal URLs',
      'CSV and Excel (.xlsx) spreadsheet ingestion with automatic column detection',
      'Manual URL paste with custom pipe-delimited priority and changefreq overrides',
      'Intelligent URL-depth priority calculations (1.0 to 0.4) and change frequency tags',
      'Strict compliance with sitemaps.org Protocol and Google Search specifications',
      'Automatic 50,000 URL chunking, sitemap index generation, and ZIP packaging'
    ],
    faqs: [
      {
        question: 'What is an XML sitemap generator?',
        answer: "An XML sitemap generator is a tool that creates a structured XML document listing your website's canonical URLs according to sitemaps.org standards. It enables search engine crawlers like Googlebot to discover new, updated, and deep pages across your domain, ensuring your important content is crawled and indexed efficiently."
      },
      {
        question: 'How do I generate an XML sitemap for free?',
        answer: "You can create a free XML sitemap with Indian Marketers using three methods: enter your website URL to crawl internal links up to 500 pages, upload a CSV or Excel spreadsheet of URLs, or paste URLs directly. Then click 'Generate XML Sitemap' to download your sitemap.xml file with zero cost or signup required."
      },
      {
        question: 'Can I create an XML sitemap from CSV or Excel spreadsheets?',
        answer: 'Yes. Our sitemap generator natively accepts both CSV (.csv) and Microsoft Excel (.xlsx) files. The parser automatically detects your URL column whether your file contains header rows or not. You can also include custom lastmod, priority, or changefreq columns to preserve specific page-level metadata.'
      },
      {
        question: 'How do I create a sitemap.xml file for Google?',
        answer: 'To build a Google-compliant sitemap, crawl your domain or input your canonical URLs using our spreadsheet upload or manual paste options. The tool formats every URL within valid <urlset> and <loc> tags following Google Search specifications. Once generated, download the file and save it as sitemap.xml.'
      },
      {
        question: 'How many URLs can an XML sitemap contain?',
        answer: 'Under official sitemaps.org protocols, a single XML sitemap can hold up to 50,000 URLs and must not exceed 50 MB uncompressed. When your dataset exceeds 50,000 URLs, our generator automatically chunks them into multiple numbered sitemap files and generates a parent sitemap index file bundled in a downloadable ZIP archive.'
      },
      {
        question: 'How do I submit an XML sitemap to Google Search Console?',
        answer: "First, upload your generated sitemap.xml file to your website's root public directory (e.g., https://yourdomain.com/sitemap.xml). Next, open Google Search Console, navigate to 'Indexing' > 'Sitemaps', enter your sitemap URL path, and click 'Submit'. Additionally, declare the sitemap location inside your robots.txt file."
      },
      {
        question: 'Does an XML sitemap guarantee Google indexing?',
        answer: 'No. Submitting an XML sitemap accelerates crawl discovery, but does not guarantee indexation. Googlebot decides whether to index a URL based on content quality, originality, canonical signals, internal link architecture, and compliance with Google Search Essentials. Pages returning noindex directives or server errors will not be indexed.'
      },
      {
        question: 'Do priority and changefreq tags affect Google rankings?',
        answer: 'No. Official Google Search documentation confirms that Googlebot ignores <priority> and <changefreq> tags for crawling frequency and search rankings. However, they remain valid protocol attributes recognized by other crawlers. In contrast, Google does evaluate <lastmod> timestamps when they accurately reflect genuine, meaningful content updates.'
      }
    ]
  },

  'fetch-render': {
    slug: 'fetch-render',
    name: 'Fetch & Render',
    metaTitle: 'Fetch and Render Tool - JavaScript SEO Test | Indian Marketers',
    metaDescription: 'Inspect how search crawlers fetch and render JavaScript pages. Compare raw server HTML against rendered DOM, capture screenshots, and detect blocked resources.',
    canonical: `${TOOLS_BASE_URL}/fetch-render`,
    category: 'Rendering & Mobile SEO',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Isolated headless Chromium rendering simulation for search engine crawlers',
      'Side-by-side comparison between initial server HTML and post-execution rendered DOM',
      'Automated SEO discrepancy detection (Title, Canonical, Meta Robots, Links, Word count)',
      'Visual screenshot capture and browser console error logging',
      'Blocked subresource analysis against live robots.txt rules'
    ],
    faqs: [
      {
        question: 'Is this simulation identical to real Googlebot rendering?',
        answer: "No. This tool simulates Googlebot's user-agent string and viewport dimensions in a modern Chromium browser. However, genuine Googlebot crawls from Google's verified IP addresses and reverse-DNS infrastructure (1e100.net), and Google's rendering service may batch or cache resources differently."
      },
      {
        question: 'Why does my page have missing content in the Original HTML?',
        answer: 'Client-side rendered frameworks (such as React, Vue, or Angular Single Page Apps) only return a minimal HTML shell from the server. The actual content is injected asynchronously by JavaScript in the browser.'
      },
      {
        question: "How does the 'Respect robots.txt' setting work?",
        answer: 'When enabled, the tool checks whether the target URL and any subresources (scripts, stylesheets) are permitted under robots.txt rules for the chosen user-agent. If a resource is disallowed, Chromium aborts the network request and reports it in the blocked resources table.'
      }
    ]
  },

  'prerendering-tester': {
    slug: 'prerendering-tester',
    name: 'Pre-rendering Tester',
    metaTitle: 'Pre-rendering Tester & Dynamic Rendering Check | Indian Marketers',
    metaDescription: 'Compare HTTP responses and SEO signals across multiple user agents. Detect pre-rendering middleware, dynamic rendering, and bot-specific HTML discrepancies.',
    canonical: `${TOOLS_BASE_URL}/prerendering-tester`,
    category: 'Rendering & Mobile SEO',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Multi-user-agent concurrent HTTP request dispatching with SSRF protection',
      'Side-by-side comparison of HTTP status, redirect chains, and Vary headers',
      'Cryptographic MD5 and SHA-256 HTML payload byte fingerprinting',
      'Automated extraction of SEO signals (Title, Meta Description, Headings, Canonical, Robots, Word count)',
      'Exportable audit matrices in CSV and Excel (.xlsx) formats'
    ],
    faqs: [
      {
        question: 'What is Pre-rendering and Dynamic Rendering?',
        answer: 'Pre-rendering intercepts incoming crawler requests (like Googlebot or Bingbot) and returns pre-rendered static HTML, while serving a standard JavaScript Single Page App (SPA) to human browsers. This ensures search engines discover content without relying on delayed client-side script execution.'
      },
      {
        question: 'Does this tool prove dynamic cloaking or SEO manipulation?',
        answer: 'No. Differences in raw HTML or fingerprints alone do not indicate malicious cloaking. Serving pre-rendered HTML to crawlers is an established architectural pattern when the underlying content and signals remain substantially equivalent to what human users experience.'
      },
      {
        question: 'Does selecting Googlebot guarantee real Googlebot IP verification?',
        answer: 'No. This tool sends requests with Googlebot user-agent strings, but does not originate from Google’s verified 1e100.net IP ranges. Websites employing reverse-DNS IP verification or Cloudflare Bot Management may treat these requests differently from genuine search engine crawlers.'
      }
    ]
  },

  'mobile-first-index': {
    slug: 'mobile-first-index',
    name: 'Mobile-First Index Tool',
    metaTitle: 'Mobile-First Indexing Checker - Parity Audit | Indian Marketers',
    metaDescription: 'Audit technical SEO parity between desktop and mobile pages. Compare headings, content, structured data, canonical tags, and internal links for Googlebot.',
    canonical: `${TOOLS_BASE_URL}/mobile-first-index`,
    category: 'Rendering & Mobile SEO',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Dual independent HTTP crawls using Desktop Googlebot and Googlebot Smartphone user agents',
      'Independent RFC 9309 robots.txt verification for desktop and mobile hosts',
      'Parity auditing for Title, Meta Description, H1-H6 headings, text word counts, and canonical URLs',
      'Structured data (JSON-LD) extraction and schema parity comparison',
      'Comprehensive parity reports exportable to CSV and multi-sheet Excel files'
    ],
    faqs: [
      {
        question: 'What is Google Mobile-First Indexing?',
        answer: "Mobile-first indexing means Google predominantly uses the mobile version of a webpage's content for indexing and ranking. Previously, the desktop version was used. Today, if content or structured data exists only on your desktop version, Google will not index it."
      },
      {
        question: 'Does changing the User-Agent header make requests come from Googlebot IPs?',
        answer: "No. This tool sends custom HTTP requests using Googlebot's official User-Agent header string to inspect the markup your server returns to mobile search engine crawlers. It does not originate from verified Google IP addresses."
      },
      {
        question: 'How should canonical and alternate tags be configured for separate mobile (m-dot) sites?',
        answer: 'According to Google\'s official guidelines, the desktop page must declare a rel="canonical" tag pointing to itself, along with a rel="alternate" tag pointing to the mobile URL. The mobile page must declare a rel="canonical" tag pointing to the desktop URL (NOT to itself).'
      },
      {
        question: 'Is this a mobile-friendly usability test or an indexing parity audit?',
        answer: 'This is a technical Mobile-First Indexing parity audit. Mobile-friendly usability tools inspect touch target spacing and viewport sizing for human readers. This tool checks whether search crawlers receive equivalent HTML markup, content, canonicals, headings, and structured data across desktop and mobile.'
      }
    ]
  },

  'mobile-friendly-test': {
    slug: 'mobile-friendly-test',
    name: 'Mobile-Friendly Test',
    metaTitle: 'Free Mobile-Friendly Test & Website Checker | Indian Marketers',
    metaDescription: "Run a free Mobile-Friendly Test to check your website's viewport, text readability, touch targets and layout issues. Test single or multiple URLs online.",
    canonical: `${TOOLS_BASE_URL}/mobile-friendly-test`,
    category: 'Rendering & Mobile SEO',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'mobile friendly test',
      'mobile friendly website test',
      'mobile friendly checker',
      'mobile friendly website checker',
      'free mobile friendly test',
      'mobile friendly website check',
      'test mobile friendly website',
      'mobile friendly testing tool',
      'mobile usability test',
      'mobile responsive checker'
    ],
    features: [
      'Independent mobile usability testing engine evaluating responsive layouts across real smartphone viewports',
      'Viewport meta tag verification and sub-pixel horizontal content overflow detection',
      'Interactive tap target dimension and touch spacing analysis (44x44 CSS px threshold and 8px spacing)',
      'Computed font legibility measurements and small text node selector identification',
      'Bulk URL audit mode supporting up to 50 URLs per batch with CSV and formatted Excel (.xlsx) export'
    ],
    faqs: [
      {
        question: 'Did Google retire the official Mobile-Friendly Test?',
        answer: 'Google officially retired its standalone Mobile-Friendly Test tool, testing API, and Search Console Mobile Usability report in December 2023. Search engines now evaluate page experience through Core Web Vitals and Lighthouse metrics. Indian Marketers provides this independent mobile-friendly testing tool so developers and site owners can continue auditing viewports, text sizing, tap targets, and layout responsiveness directly.'
      },
      {
        question: 'What is the difference between Mobile-Friendly Testing and Mobile-First Indexing?',
        answer: 'Mobile-friendly testing evaluates front-end user experience on smartphone screens, checking touch target spacing, viewport tags, font legibility, and horizontal overflow. Mobile-first indexing describes how Google crawls and indexes web content using a smartphone bot. A page can be fully crawlable under mobile-first indexing while failing usability tests if buttons are too small or content horizontally overflows.'
      },
      {
        question: "What causes 'Size Content to Viewport' failures?",
        answer: 'Horizontal layout overflow occurs when elements exceed the screen width of the selected mobile viewport. Common culprits include rigid CSS fixed widths (such as width: 800px or min-width: 600px), wide data tables without responsive wrappers, unconstrained high-resolution images, and fixed-position advertising banners. These elements force smartphone visitors to scroll sideways or zoom out.'
      },
      {
        question: 'What are the recommended tap target dimensions?',
        answer: "WCAG accessibility standards and Apple's Human Interface Guidelines recommend interactive touch targets of at least 44 by 44 CSS pixels, with at least 8 pixels of spacing between adjacent clickable elements. Adequate sizing and spacing prevent frustrating mis-taps on smartphones, ensuring users can accurately select links, form fields, hamburger menus, and buttons without zooming."
      },
      {
        question: 'How do I check if my website is mobile-friendly?',
        answer: "To test your website, paste your URL into the single URL input or switch to bulk mode to evaluate up to 50 pages simultaneously. Select your target device viewport baseline, such as iPhone or Android, and click 'Run Mobile-Friendly Test'. The checker evaluates your viewport meta tag, font legibility, tap targets, and layout overflow, returning selector-level diagnostics."
      },
      {
        question: 'Can I test my website on different mobile screen sizes?',
        answer: 'Yes. Our mobile-friendly tester includes multiple device viewport presets: Standard Mobile (iPhone 14 at 390x844px), Android Standard (Pixel 7 at 412x915px), Small Mobile (iPhone SE at 375x667px), and Large Mobile / Phablet (iPhone Pro Max at 430x932px). Selecting different presets helps you identify breakpoint-specific styling bugs across popular smartphone screen dimensions.'
      },
      {
        question: 'Can I check multiple website URLs at once?',
        answer: 'Yes. The bulk mobile-friendly checker allows you to test up to 50 URLs in a single audit session. Enter one URL per line, select your device preset, and start the batch test. You can monitor live progress across chunks, inspect individual URL diagnostics, and export complete results to CSV or Excel (.xlsx) spreadsheets for reporting.'
      },
      {
        question: 'Does a mobile-friendly website automatically rank higher on Google?',
        answer: 'Mobile-friendliness is a foundational user experience signal, but it is not a direct ranking guarantee on its own. While mobile usability prevents high bounce rates and improves engagement, Google ranks pages based on hundreds of factors including content relevance, topical authority, backlinks, and Core Web Vitals. However, failing mobile usability can severely harm user conversion and organic performance.'
      }
    ]
  },

  'hreflang-tester': {
    slug: 'hreflang-tester',
    name: 'Free Hreflang Checker & Validator',
    metaTitle: 'Free Hreflang Checker & Validator | Indian Marketers',
    metaDescription: "Check hreflang tags for free with Indian Marketers' Hreflang Checker. Validate language codes, return links, x-default and hreflang in HTML or XML sitemaps.",
    canonical: `${TOOLS_BASE_URL}/hreflang-tester`,
    category: 'International SEO',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'hreflang checker',
      'hreflang tag checker',
      'hreflang validator',
      'hreflang check',
      'check hreflang tags',
      'hreflang testing tool',
      'hreflang tags tester',
      'hreflang validation tool',
      'hreflang tag validator',
      'hreflang checker online',
      'hreflang SEO checker'
    ],
    features: [
      'Multi-source hreflang extraction across HTML head link elements, HTTP response headers, and XML sitemaps',
      'ISO 639-1 language code and ISO 3166-1 Alpha-2 country code syntax and validity verification',
      'Bidirectional reciprocal return-link validation across alternate URLs',
      'Self-referencing hreflang tag checks and x-default international fallback inspection',
      'Automated HTTP status verification, redirect detection, canonical alignment checks, and crawler indexing restrictions',
      'Direct XML sitemap URL testing and XML file upload parsing with multi-crawler user-agent simulation'
    ],
    faqs: [
      {
        question: 'What is a hreflang checker?',
        answer: 'A hreflang checker is an international SEO validation tool that inspects the alternate language and regional annotations implemented on a website. It verifies that search engines like Google can correctly discover, parse, and associate localized page variations with their intended regional audiences across search engine results.'
      },
      {
        question: 'How do I check hreflang tags on a website?',
        answer: 'To check hreflang tags, enter your webpage URL or XML sitemap URL into our free Hreflang Checker (or upload a local sitemap XML file) and click test. The tool automatically fetches your annotations from HTML head link elements, HTTP headers, or XML sitemap tags, validating ISO language codes, return links, self-references, and alternate URL indexability.'
      },
      {
        question: 'What is the difference between a hreflang checker and validator?',
        answer: 'While the terms are often used interchangeably, an hreflang checker typically identifies and extracts declared alternate language tags from a page or sitemap, whereas an hreflang validator actively audits their syntax against ISO 639-1 language codes, ISO 3166-1 region codes, self-referencing presence, and live reciprocal return links.'
      },
      {
        question: "What is a 'Return Tag' (Reciprocal Link) error?",
        answer: 'If Page A declares Page B as its French alternate via hreflang, Page B must declare Page A as its English alternate. If Page B does not link back, Google ignores the hreflang relationship between those two pages to prevent third parties from falsely associating themselves with your content.'
      },
      {
        question: 'What is a self-referencing hreflang tag and why is it required?',
        answer: "A self-referencing hreflang tag is an annotation on a page that points back to the page's own URL with its matching language and region code. Google's international SEO guidelines require every localized page version to include its own self-reference in the alternate link cluster to ensure consistent clustering across all language variations."
      },
      {
        question: "What is 'x-default' and when should it be used?",
        answer: 'The x-default hreflang attribute designates a fallback URL for international searchers when no other page variant matches their language or country preferences. It is commonly implemented for homepage language selectors, country redirect splash pages, or generic international versions.'
      },
      {
        question: "Can I use 'en-UK' for users in the United Kingdom?",
        answer: "No. 'UK' is not an ISO 3166-1 Alpha-2 country code. Google officially requires the ISO 3166-1 Alpha-2 code 'GB' for the United Kingdom (e.g., 'en-GB'). Specifying 'en-UK' invalidates the regional component of the hreflang declaration."
      },
      {
        question: 'Do hreflang annotations need to be in the HTML head?',
        answer: "Yes. When implementing hreflang via HTML markup, <link rel='alternate' hreflang='...' href='...'> tags must reside within the <head> element. Tags placed in the <body> are invalid and ignored by Googlebot. Alternatively, hreflang can be implemented via HTTP Link response headers or XML sitemaps."
      },
      {
        question: 'Can hreflang tags be added through XML sitemaps?',
        answer: "Yes. XML sitemaps support hreflang using the <xhtml:link rel='alternate' hreflang='...' href='...'/> extension. Sitemap hreflang eliminates page weight overhead in HTML head and is especially effective for large multilingual sites or non-HTML documents like PDFs."
      },
      {
        question: 'What is the difference between hreflang and canonical tags?',
        answer: "Hreflang indicates localized equivalents for different languages and regions, whereas canonical tags (rel='canonical') specify the single master version among duplicate or near-identical URLs within the same language. Each localized variant should have a self-referencing canonical tag alongside reciprocal hreflang tags."
      },
      {
        question: 'Does hreflang improve Google rankings?',
        answer: 'Hreflang is not a direct ranking factor and does not inherently boost search rankings. Instead, it ensures search engines serve the most linguistically and regionally appropriate version of your content to international searchers, reducing bounce rates and improving international user experience.'
      }
    ]
  },

  'local-search': {
    slug: 'local-search',
    name: 'Local Search Tool',
    metaTitle: 'Local Search Simulator - Geo SERP Audit Tool | Indian Marketers',
    metaDescription: 'Simulate localized Google Search and Google Maps results from any geographic location using canonical UULE parameters, country bias, and language controls.',
    canonical: `${TOOLS_BASE_URL}/local-search`,
    category: 'Local SEO',
    softwareCategory: 'BusinessApplication',
    features: [
      'Canonical Google UULE parameter formulation for precise city/postal-code geo-targeting',
      'Country market bias (gl), interface language controls (hl), and personalization suppression (pws=0)',
      'Embedded live interactive browser container with desktop and mobile viewport toggles',
      'Direct 1-click links to live Google Search and Google Maps queries',
      '100% free client-side tool with no Google Cloud billing or API key requirements'
    ],
    faqs: [
      {
        question: 'How does the embedded live browser pane work?',
        answer: "The live browser pane embeds the location-targeted Google Search (utilizing the reference 'igu=1' parameter) and Google Maps in an interactive container. This enables you to inspect the localized query directly inside this application without having to switch tabs. You can also toggle between desktop container width and mobile device container view."
      },
      {
        question: 'How does Google determine location in these generated search URLs?',
        answer: "Google uses the canonical 'uule' parameter to associate search queries with a geographic location. This tool formats the location name into Google's standard length-keyed Base64 UULE specification. Combined with the country domain/market parameter (gl) and interface language (hl), Google serves results tailored to the designated region."
      },
      {
        question: 'Does this simulate exact mobile GPS coordinates or IP addresses?',
        answer: 'No. Emulating physical GPS signals or residential IP addresses requires specialized browser automation or paid residential proxy networks. This tool leverages Google\'s native location parameter (UULE) and geographic query parameters (gl, hl, pws=0), providing a free, highly effective way to audit localized SERPs without incurring API costs or sending automated traffic in violation of guidelines.'
      },
      {
        question: "What does 'Reduce Personalized Search' (pws=0) do?",
        answer: "When enabled, Google appends 'pws=0' to the search request, which instructs Google to minimize user search history bias and personalization. While it reduces historical profile customization, modern Google results are still influenced by regional trends and active Google Account sessions."
      },
      {
        question: 'Are any API keys or payment accounts required?',
        answer: 'None. This tool is completely free, runs client-side, and requires no Google Cloud billing, Google Places API keys, or third-party paid subscriptions.'
      }
    ]
  },

  'review-link-generator': {
    slug: 'review-link-generator',
    name: 'Review Link Generator',
    metaTitle: 'Google Review Link Generator with QR Code | Indian Marketers',
    metaDescription: 'Generate direct 5-star Google review links and printable QR codes. Send frictionless review requests to customers via WhatsApp, SMS, and email with zero setup.',
    canonical: `${TOOLS_BASE_URL}/review-link-generator`,
    category: 'Local SEO',
    softwareCategory: 'BusinessApplication',
    features: [
      'Direct official Google review write URL generator (search.google.com/local/writereview?placeid=...)',
      '1-click Place ID identification helper without requiring Google Cloud billing',
      'Instant high-resolution printable QR code generator (PNG and SVG download)',
      'Pre-written outreach message templates formatted for WhatsApp, SMS, and email',
      'Support for Place IDs, custom business names, and existing Google Maps links'
    ],
    faqs: [
      {
        question: 'How does the direct Google review link work?',
        answer: "It uses Google's official local write-review format: https://search.google.com/local/writereview?placeid=PLACE_ID. When clicked by customers, it opens directly into the 5-star review dialog without requiring extra navigation."
      },
      {
        question: 'How do I find my Google Place ID?',
        answer: "Click the 'Find Place ID in 1 Click' button right above the form. It auto-copies your business name to your clipboard and opens Google's free Place ID finder tool."
      },
      {
        question: 'Does this require Google Cloud billing or API keys?',
        answer: 'No! This tool operates at 100% zero cost. No Google Cloud project, billing accounts, credit cards, or paid APIs are required.'
      }
    ]
  },

  'serp-simulator': {
    slug: 'serp-simulator',
    name: 'SERP Simulator',
    metaTitle: 'Google SERP Simulator - Meta Snippet Preview | Indian Marketers',
    metaDescription: 'Preview title tags and meta descriptions in Google search results. Check pixel widths, prevent snippet truncation, and simulate desktop and mobile displays.',
    canonical: `${TOOLS_BASE_URL}/serp-simulator`,
    category: 'Search Appearance',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Pixel-accurate title container measurement (~600px desktop threshold)',
      'Word-boundary truncation simulation for desktop and mobile search snippets',
      'Keyword bolding preview based on user search queries',
      'Rich snippet enhancements (publication date stamps and star rating display)',
      'Live URL metadata extraction proxy to import existing title and description tags'
    ],
    faqs: [
      {
        question: 'Why does pixel width matter more than character count?',
        answer: "Google calculates title cutoffs using a container width (typically ~600px on desktop), not a fixed 60-character count. Because proportional fonts have varying character widths (for instance, 'W' is much wider than 'i'), a 55-character title with wide letters can be truncated while a 65-character title with narrow letters fits cleanly."
      },
      {
        question: 'Does this guarantee how Google will display my snippet?',
        answer: 'No. This tool is a visual simulator. Google frequently rewrites titles or dynamically selects alternate text from the page content based on the user\'s specific query.'
      },
      {
        question: 'Can I fetch any live URL?',
        answer: 'Yes, publicly accessible HTML pages can be fetched via our secure proxy. Note that pages requiring JavaScript execution or sites that block crawlers might not return server-rendered meta tags.'
      }
    ]
  },

  'knowledge-graph-search': {
    slug: 'knowledge-graph-search',
    name: 'Knowledge Graph Search',
    metaTitle: 'Google Knowledge Graph Search & Entity Finder | Indian Marketers',
    metaDescription: 'Search Google\'s Knowledge Graph to find entity machine IDs (MIDs), schema types, and match scores. Verify brand entity recognition and export findings to CSV.',
    canonical: `${TOOLS_BASE_URL}/knowledge-graph-search`,
    category: 'Search Appearance',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Direct connection to Google official Knowledge Graph Search API',
      'Entity lookup by natural language name or exact Machine ID (/m/ or /g/)',
      'Extraction of Schema.org entity categories and official descriptions',
      'API match relevance score inspection',
      'Exportable structured entity reports in CSV format'
    ],
    faqs: [
      {
        question: "How do I find an entity's Google Knowledge Graph ID (MID)?",
        answer: "The easiest way is to use the 'Search by Name' tab right here in this tool! Just type in your brand, company, or person name. If Google has recognized your entity, this tool will find and show your official Entity ID (like /m/045c7b or /g/11b6tq5_3y). You can also search your brand on Wikidata.org and look for the 'Google Knowledge Graph ID' field."
      },
      {
        question: 'What is an Entity ID (MID)?',
        answer: 'An Entity ID (also called a Machine ID or MID) is a unique permanent ID that Google assigns to a real-world person, company, place, or brand. It usually starts with /m/ or /g/.'
      },
      {
        question: 'What does the API Relevance Score mean?',
        answer: 'The resultScore is a number from Google indicating how closely an entity matched what you searched for. It is an internal match score, not an SEO ranking or domain authority score.'
      },
      {
        question: "What if my entity doesn't show up in search?",
        answer: "If Google doesn't return an Entity ID for your brand, that means Google hasn't officially recognized it as an entity yet. You can help Google recognize your brand by adding Schema markup (Organization or Person) to your website, creating a Wikidata page, and getting consistent mentions on trusted websites."
      },
      {
        question: "Why does the tool show 'Google Knowledge Graph API credentials are not configured'?",
        answer: "The tool makes genuine server-side calls to Google's Knowledge Graph Search API. To enable live lookups, set the GOOGLE_KG_API_KEY environment variable in your Vercel project settings or .env.local."
      }
    ]
  },

  'schema-generator': {
    slug: 'schema-generator',
    name: 'Schema Markup Generator',
    metaTitle: 'Schema Markup Generator - Free JSON-LD Creator | Indian Marketers',
    metaDescription: 'Create valid Schema.org JSON-LD structured data in real time. Generate rich snippet markup for Organizations, Articles, FAQs, Local Businesses, and Products.',
    canonical: `${TOOLS_BASE_URL}/schema-generator`,
    category: 'Search Appearance',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Real-time Schema.org JSON-LD generation with syntax highlighting',
      'Support for Organization, LocalBusiness, Article, FAQPage, Product, Event, JobPosting, Recipe, Person',
      'Live code preview with one-click copy and JSON download',
      'Import modal to edit and re-validate existing JSON-LD markup',
      'Realistic presets to rapidly test schema structures'
    ],
    faqs: [
      {
        question: 'What is JSON-LD?',
        answer: 'JSON-LD (JavaScript Object Notation for Linked Data) is the format recommended by Google and W3C for implementing structured data.'
      },
      {
        question: 'Do I need to paste the script tag in the <head> or <body>?',
        answer: 'Google supports JSON-LD script blocks placed in either the <head> or <body> of the HTML. Placing it inside <head> is the standard industry best practice.'
      },
      {
        question: 'Does schema markup guarantee rich snippets in Google search results?',
        answer: 'No. Structured data makes your site eligible for rich enhancements, but search algorithms determine final display based on query intent, user value, and E-E-A-T relevance.'
      }
    ]
  },

  'schema-checker': {
    slug: 'schema-checker',
    name: 'Bulk Schema Checker',
    metaTitle: 'Bulk Schema Checker – Free Online Tool | Indian Marketers',
    metaDescription: 'Use our free Bulk Schema Checker to check schema markup across multiple URLs. Detect structured data and identify schema types in one place.',
    canonical: `${TOOLS_BASE_URL}/schema-checker`,
    category: 'Search Appearance',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'bulk schema checker',
      'schema checker',
      'schema markup checker',
      'check schema markup',
      'bulk schema markup checker',
      'schema markup tester',
      'schema markup testing tool',
      'structured data testing tool',
      'check structured data',
      'JSON-LD schema checker'
    ],
    features: [
      'Multi-format structured data detection (JSON-LD including @graph, Microdata, and RDFa)',
      'Bulk URL audit mode testing up to 100 URLs simultaneously with automatic deduplication',
      'Identification and extraction of specific Schema.org entity types on each page',
      'Transparent status indicators: Found (Yes), No Schema (No), and Unable to check',
      'Sanitized one-click export to comma-separated CSV spreadsheets'
    ],
    faqs: [
      {
        question: 'What is a bulk schema checker?',
        answer: 'A bulk schema checker is an automated SEO audit utility that tests multiple web pages simultaneously for structured data markup. Instead of manually inspecting URLs one by one in developer tools, a bulk checker extracts declared Schema.org types across dozens of pages at once, helping you verify deployment consistency and identify missing markup across your website.'
      },
      {
        question: 'How can I check schema markup on multiple URLs?',
        answer: 'Paste your list of URLs—up to 100 per check—into the input field, with one URL per line. Click "Check Schema" to begin. The tool fetches each page\'s server HTML response, scans for structured data, and outputs a clean table detailing whether schema was found and which Schema.org types were detected.'
      },
      {
        question: 'What types of structured data can this tool detect?',
        answer: 'The tool detects all three major Schema.org implementations: JSON-LD (including @graph structures and Next.js script payloads), Microdata (using itemscope and itemtype attributes), and RDFa (using typeof attributes with Schema.org vocabularies). It normalizes detected entities and reports their specific Schema.org type names.'
      },
      {
        question: 'Can I check JSON-LD schema markup using this tool?',
        answer: 'Yes. JSON-LD is the format recommended by Google and the W3C. Our checker parses standard application/ld+json script tags, handles MIME variations and charset parameters, extracts entities from @graph arrays, and unpacks embedded Next.js script objects without requiring browser-heavy JavaScript execution.'
      },
      {
        question: 'Why is schema markup not detected on my page?',
        answer: 'Schema might not be detected if it is injected dynamically by client-side JavaScript after initial HTML delivery, if server firewalls block crawler requests, if the script contains invalid syntax, or if non-Schema.org vocabularies are used. If your site relies on client-side rendering, use Fetch & Render to inspect the post-execution DOM.'
      },
      {
        question: 'Is a bulk schema checker different from Google\'s Rich Results Test?',
        answer: 'Yes. This tool is a high-speed presence and format detector designed to audit up to 100 pages at once for declared Schema.org types. In contrast, Google\'s Rich Results Test evaluates whether single URLs satisfy Google\'s specific required and recommended fields for search rich snippet enhancements.'
      }
    ]
  },

  'domain-age-checker': {
    slug: 'domain-age-checker',
    name: 'Domain Age Checker',
    metaTitle: 'Domain Age Checker – Check Domain Age Free | Indian Marketers',
    metaDescription: "Check domain age and registration dates free with Indian Marketers' Domain Age Checker. View domain creation, expiry and registrar details, or check up to 20 domains.",
    canonical: `${TOOLS_BASE_URL}/domain-age-checker`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'domain age checker',
      'check domain age',
      'domain registration date checker',
      'bulk domain age checker',
      'check domain registration date',
      'domain name age checker',
      'check age of domain',
      'how old is a domain',
      'domain age',
      'website domain age'
    ],
    features: [
      'Authoritative RFC 9083 / RFC 9224 RDAP registration data retrieval engine',
      'Accurate calendar domain age calculation (years, months, days, total elapsed days)',
      'Single and bulk domain age checking supporting up to 20 domains per batch',
      'Domain registration creation date and expiration date lookup',
      'Authoritative registrar, registration status, and nameserver inspection',
      'Formula-injection protected CSV report export and one-click summary copying'
    ],
    faqs: [
      {
        question: 'How do I check the age of a domain?',
        answer: 'Enter any domain name or website URL (such as google.com or https://example.com) into the input field and click "Check Domain Age". The tool normalizes the input, queries the authoritative registry via RDAP, and calculates the exact elapsed age in years, months, and days.'
      },
      {
        question: 'Is this Domain Age Checker free?',
        answer: 'Yes. Our Domain Age Checker is 100% free with no account registration, no API key required, and no hidden subscriptions.'
      },
      {
        question: 'Can I check multiple domains at once?',
        answer: 'Yes. Switch to the "Bulk Domains" tab to check up to 20 domains in a single batch. The bulk domain age checker queries authoritative registries with bounded concurrency to respect rate limits, and results can be exported as a spreadsheet CSV.'
      },
      {
        question: 'How is domain age calculated?',
        answer: 'Domain age is calculated using calendar arithmetic from the authoritative UTC registration creation timestamp to the current date. This accounts for leap years, varying month lengths, and anniversary boundaries rather than approximating 365 days per year.'
      },
      {
        question: 'Is domain age the same as website age?',
        answer: 'No. Domain age measures the time since the domain name was registered with an authoritative registry. Website age refers to how long an active, crawlable website has published content on that domain. A domain can remain parked for years without hosting a website.'
      },
      {
        question: "Can a domain's registration date change?",
        answer: 'Yes. If a domain registration lapses completely and the domain is deleted from the registry and later re-registered, the registry assigns a new creation date. However, standard renewals and registrar transfers preserve the original creation date.'
      },
      {
        question: "Why is a domain's registration date unavailable?",
        answer: 'Some country-code top-level domains (ccTLDs) do not operate public RDAP servers or withhold registration timestamps under local privacy regulations. When registry records omit this data, the tool clearly states that it is unavailable rather than guessing.'
      },
      {
        question: 'Does domain age affect Google rankings?',
        answer: 'No. Google search representatives have confirmed that domain registration age is not an algorithmic ranking factor. Older websites often perform well in search because they have built content depth, high-quality backlinks, and brand authority over time, not solely because of their registration date.'
      },
      {
        question: 'Can I check domain expiration dates?',
        answer: 'Yes. When exposed by the authoritative registry, the tool reports the official expiration date and calculates the exact days remaining until renewal.'
      },
      {
        question: 'How accurate is RDAP compared with WHOIS?',
        answer: 'RDAP (Registration Data Access Protocol) is the modern, standardized protocol specified by ICANN and the IETF (RFC 9083). It returns machine-readable JSON directly from authoritative registry databases, eliminating the formatting inconsistencies and fragile text scraping of legacy WHOIS.'
      },
      {
        question: 'How do I check when a domain was first registered?',
        answer: 'Our tool displays the creation date from the current authoritative registry record. If a domain was dropped in the past and subsequently re-registered, the registry record reflects the latest registration cycle. To research historical website deployments from prior cycles, review historical snapshots on the Internet Archive (Wayback Machine).'
      }
    ]
  },

  'bulk-google-index-checker': {
    slug: 'bulk-google-index-checker',
    name: 'Free Bulk Google Index Checker',
    metaTitle: 'Bulk Google Index Checker – Free Tool | Indian Marketers',
    metaDescription: "Check Google indexing status for multiple URLs using Search Console with Indian Marketers' free Bulk Google Index Checker. Review index verdicts and metadata.",
    canonical: `${TOOLS_BASE_URL}/bulk-google-index-checker`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'bulk google index checker',
      'bulk indexing checker',
      'google index checker',
      'bulk index checker',
      'website indexing checker',
      'google site index checker',
      'check Google indexing status',
      'bulk URL index checker',
      'Google Search Console URL Inspection'
    ],
    features: [
      'Official Google Search Console URL Inspection API integration',
      'Batch URL processing up to 100 URLs per session with automated rate limiting',
      'Real recorded Google index statuses: Indexed, Not Indexed, and Alternate / Canonicalized',
      'Granular crawl diagnostics: robots.txt state, page fetch state, and Google-selected canonical URLs',
      'Live server-side HTML meta title and description extraction with character counts',
      'Property scope validation for domain (sc-domain:) and URL-prefix Search Console properties',
      'Secure read-only OAuth 2.0 authorization with PKCE and AES-256-GCM encrypted sessions',
      'Spreadsheet formula-safe CSV export and instant tabular clipboard copy'
    ],
    faqs: [
      {
        question: 'What is a bulk Google index checker?',
        answer: 'A bulk Google index checker is an SEO tool that allows webmasters and SEO professionals to verify the Google indexing status of multiple URLs simultaneously rather than checking them one by one in Google Search Console.'
      },
      {
        question: 'How does this tool check Google indexing status in bulk?',
        answer: "The tool connects securely to the official Google Search Console URL Inspection API. When you paste up to 100 URLs from a verified property, the tool queries Google's inspection service in batches and retrieves Google's authoritative recorded index status, coverage reasons, and canonical details."
      },
      {
        question: 'Why is Google Search Console access required?',
        answer: 'Google treats indexing records, crawl history, and canonical verdicts as private site data. Google only shares authoritative indexing information through its official URL Inspection API with Google accounts that have verified ownership or permission on the property. Competitor sites cannot be inspected via this API.'
      },
      {
        question: 'Is the Bulk Google Index Checker free to use?',
        answer: "Yes. Indian Marketers' Bulk Google Index Checker is 100% free with no subscription or credit card required. You can inspect up to 100 URLs per batch across any verified Search Console property."
      },
      {
        question: 'Why are some of my website URLs not indexed by Google?',
        answer: 'URLs may be excluded from Google\'s index due to noindex directives, robots.txt crawl blocks, canonical tags pointing to alternative URLs, soft 404 errors, server timeouts, thin or duplicate content, or because newly published pages have not yet been evaluated by Googlebot.'
      },
      {
        question: 'How accurate are the indexing results?',
        answer: "The results are 100% authoritative because they come directly from Google's recorded search index via the official URL Inspection API. Note that the API returns the recorded status from Googlebot's most recent crawl rather than performing an immediate live URL fetch."
      },
      {
        question: 'Can I request Google indexing or force crawling through this tool?',
        answer: "No. This tool is strictly an indexing checker, not an indexing submission service. Google's URL Inspection API only permits reading recorded inspection data; it does not support requesting crawls. (Note: Google's Indexing API is a separate service restricted exclusively to JobPosting and BroadcastEvent structured data, not general website URLs.)"
      }
    ]
  },

  'page-focus-analyzer': {
    slug: 'page-focus-analyzer',
    name: 'AI Page Focus & Semantic Relevance Analyzer',
    metaTitle: 'AI Page Focus & Semantic Relevance Analyzer | Indian Marketers',
    metaDescription: 'Analyze webpage topics, measure semantic relevance, evaluate search intent, and benchmark competitor content using 3072-dimensional vector embeddings and AI recommendations.',
    canonical: `${TOOLS_BASE_URL}/page-focus-analyzer`,
    category: 'Content & Semantic SEO',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'page focus analyzer',
      'semantic seo tool',
      'topic relevance checker',
      'search intent analysis',
      'competitor content comparison',
      'gemini embedding seo',
      'content gap analyzer',
      'topical depth analysis',
      'passage ranking analyzer',
      'on page semantic seo',
      'ai content audit tool'
    ],
    features: [
      'Automatic organic primary and secondary topic detection with centrality scoring',
      'Auditable 6-component Indian Marketers Topic Relevance Index (0–100)',
      '3072-dimensional semantic vector embedding analysis via gemini-embedding-2',
      'Contextual search intent evaluation (informational, commercial, transactional, local)',
      'Passage-level semantic alignment heatmap with section-by-section scoring',
      'Symmetrical competitor comparison with topic gap and advantage analysis',
      'Dynamic generative AI content improvement engine citing verified document evidence',
      'Downloadable professional PDF reports and raw JSON export'
    ],
    faqs: [
      {
        question: 'What is the Indian Marketers Topic Relevance Index?',
        answer: 'It is a transparent, auditable 0–100 score measuring how effectively a webpage covers a given subject. It evaluates 6 distinct components: Semantic Vector Similarity (35%), Search Intent Alignment (20%), Topical Coverage (20%), Heading & Structural Alignment (10%), Supporting Context Depth (10%), and Topical Coherence (5%).'
      },
      {
        question: 'How is this different from keyword density checkers?',
        answer: 'Traditional tools merely count exact keyword matches, leading to artificial keyword stuffing. This analyzer uses 3072-dimensional neural embeddings and generative AI to understand meaning, synonyms, related entities, topical breadth, and user search intent regardless of exact phrasing.'
      },
      {
        question: 'What are the usage and rate limits for this analyzer?',
        answer: 'To ensure fast, reliable performance and fair access for all users, each IP address is allocated 5 analyses per minute and up to 50 analyses per day. Cached reports (valid for 1 hour) do not consume additional quota.'
      },
      {
        question: 'Can I analyze competitors targeting the same keyword?',
        answer: 'Yes. Mode 3 provides a side-by-side comparison under identical evaluation rules, identifying content gaps (topics the competitor addresses that you miss), content advantages, and section-by-section alignment.'
      },
      {
        question: 'Why does JavaScript-heavy content show low extraction quality?',
        answer: 'If a webpage renders entirely on the client side via React or Vue without server-side rendering (SSR), search crawlers see a minimal HTML shell. When this occurs, our tool detects the SPA framework, flags the issue, and allows you to paste the rendered text manually or use Fetch & Render.'
      },
      {
        question: 'How are the AI content recommendations generated?',
        answer: 'Recommendations are synthesized dynamically by Gemini using your actual extracted document sections, the target topic, and identified intent gaps. Each suggestion cites concrete section IDs as evidence, provides clear SEO rationale, and advises on placement without fabricating external facts.'
      }
    ]
  },

  'common-crawl-checker': {
    slug: 'common-crawl-checker',
    name: 'Common Crawl Checker',
    metaTitle: 'Common Crawl Checker – Free Visibility Tool | Indian Marketers',
    metaDescription: 'Check if your website appears in Common Crawl. Explore historical captures, CCBot access, robots.txt restrictions and sitemap coverage with our free checker.',
    canonical: `${TOOLS_BASE_URL}/common-crawl-checker`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    keywords: [
      'common crawl checker',
      'common crawl visibility checker',
      'common crawl index checker',
      'common crawl website checker',
      'common crawl url checker',
      'check common crawl',
      'common crawl archive checker',
      'common crawl history checker',
      'common crawl crawler checker',
      'common crawl search tool',
      'common crawl lookup',
      'check if website is in common crawl',
      'check common crawl history',
      'common crawl website coverage',
      'common crawl sitemap coverage',
      'ccbot checker',
      'ccbot robots.txt checker',
      'ai crawl visibility checker',
      'common crawl capture history',
      'common crawl archive search'
    ],
    features: [
      'Genuine Common Crawl CDX index querying across 12 latest published crawl collections',
      'Exact vs estimated monthly crawl capture counts and capture volume trend lines',
      'Historical RFC 9309 robots.txt archival record retrieval and CCBot policy evaluation',
      'Live edge crawler access probes across desktop browser, CCBot/2.0, neutral crawler, and Googlebot',
      'Automated block source detection for Cloudflare AI Scrape Shield, Squarespace, and Dark Visitors',
      'Auto-detected XML sitemap verification and crawl coverage percentage calculation',
      'Deterministic diagnostic status and actionable technical recommendations',
      'Exportable audit reports in CSV, JSON, and PDF formats'
    ],
    faqs: [
      {
        question: 'What is a Common Crawl checker?',
        answer: 'A Common Crawl checker is a technical SEO and archive lookup tool that queries official Common Crawl CDX APIs to verify whether a domain or individual URL has been captured and stored in Common Crawl datasets. It reveals historical capture timestamps, crawl frequency trends, CCBot robots.txt permissions, and crawl coverage comparisons against XML sitemaps.'
      },
      {
        question: 'How do I check if my website or URL is in Common Crawl?',
        answer: 'To check your website: enter your root domain or exact webpage URL into the input field, select your desired crawl scope (Root + www, All Subdomains, or Exact Host), choose how many past monthly crawl collections to inspect (3 to 12 months), and click "Audit Archive". The tool queries official CDX indexes and displays matching records, capture counts, and historical trend lines.'
      },
      {
        question: 'Is Common Crawl index presence the same as Google Search indexing?',
        answer: 'No. Common Crawl and Google Search are entirely separate crawling and indexing entities. Common Crawl (CCBot) archives raw web pages into an open research repository, whereas Googlebot crawls the web to rank content in Google Search. A URL present in Common Crawl is not necessarily indexed by Google, and a URL missing from Common Crawl can still be fully indexed and ranking on Google.'
      },
      {
        question: 'How do I find when Common Crawl last captured my website?',
        answer: 'When you run an audit with our checker, the tool organizes captures across published monthly crawl collections (such as CC-MAIN-2024-51). The most recent monthly collection containing matching records indicates the latest capture period, and the capture table displays the exact ISO timestamp of each archived snapshot.'
      },
      {
        question: 'Why is my website missing from Common Crawl archives?',
        answer: 'Common Crawl does not crawl the entire web in every monthly run. Crawl queues are prioritised using link graph metrics (such as PageRank and harmonic centrality) and depth limits. A website may be absent due to low external backlink volume, robots.txt disallow rules against CCBot, edge firewall or CDN blocks (such as Cloudflare AI Scrape Shield), slow server response times, or simply not being sampled in the searched collections.'
      },
      {
        question: 'Does appearing in Common Crawl mean my website is used in ChatGPT or Google AI?',
        answer: 'Appearing in Common Crawl confirms that CCBot successfully archived your server-delivered HTML into an open crawl collection. While foundational AI datasets (such as C4, RefinedWeb, and FineWeb) are derived from Common Crawl, AI labs apply extensive deduplication, quality filtering, safety screening, and editorial curation. Archive presence is a prerequisite for inclusion in Common Crawl-derived corpora, but does not guarantee citation, memory, or usage by ChatGPT, Claude, or Gemini.'
      },
      {
        question: 'Why are some Common Crawl capture counts estimated rather than exact?',
        answer: 'Common Crawl CDX APIs provide exact capture counts for smaller and medium query matches. For high-volume domains or broad wildcard queries with tens of thousands of records, the index server returns paginated block estimates to maintain query performance within rate limits. Our checker explicitly labels counts as exact or estimated to ensure transparency.'
      },
      {
        question: 'How does CCBot crawl JavaScript single-page applications (SPAs)?',
        answer: 'Unlike Googlebot, which runs an evergreen headless Chromium browser to execute client-side JavaScript, CCBot fetches and archives raw HTTP server responses without executing heavy scripts. If your website relies exclusively on client-side rendering without Server-Side Rendering (SSR) or prerendering, CCBot only archives an empty HTML template container (#root or #app).'
      },
      {
        question: 'How do I check whether CCBot is blocked by robots.txt or edge firewalls?',
        answer: 'To check crawler permissions: inspect your robots.txt file for "User-agent: CCBot" directives under RFC 9309 standards. Our checker evaluates both historical archived robots.txt snapshots and performs live simulated crawler probes across CCBot, desktop browser, and Googlebot user-agents to detect HTTP 403 Forbidden responses, WAF challenges, and Cloudflare AI Scrape Shield blocks.'
      },
      {
        question: 'Can I compare XML sitemap URLs against Common Crawl archive records?',
        answer: 'Yes. Our tool allows you to input your XML sitemap URL alongside your domain audit. It extracts all sitemap URLs and compares them directly against archived Common Crawl captures in the selected collections, calculating a sitemap coverage percentage and highlighting specific URLs that have never been captured.'
      }
    ]
  }
};

/**
 * Common Organization JSON-LD entity for Indian Marketers
 */
export function getOrganizationSchema() {
  return {
    '@type': 'Organization',
    '@id': `${SITE_DOMAIN}/#organization`,
    name: SITE_NAME,
    url: SITE_DOMAIN,
    logo: {
      '@type': 'ImageObject',
      '@id': `${SITE_DOMAIN}/#logo`,
      url: LOGO_URL,
      caption: SITE_NAME
    },
    sameAs: SOCIAL_PROFILES,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+91 7045717717',
      contactType: 'customer service',
      email: 'marketing@indianmarketers.in'
    }
  };
}

/**
 * Common WebSite JSON-LD entity for Indian Marketers
 */
export function getWebSiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_DOMAIN}/#website`,
    url: SITE_DOMAIN,
    name: SITE_NAME,
    publisher: {
      '@id': `${SITE_DOMAIN}/#organization`
    }
  };
}

/**
 * Metadata for the main /tools directory page
 */
export function getToolsHubMetadata(): Metadata {
  const count = Object.keys(TOOLS_REGISTRY).length;
  const title = 'Free Technical SEO Tools Directory Online | Indian Marketers';
  const description = `Free technical SEO tools by Indian Marketers. Test robots.txt, validate schema markup, audit domain age, inspect crawler rendering, and check indexing online.`;
  const canonical = TOOLS_BASE_URL;

  return {
    title,
    description,
    alternates: {
      canonical
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1
      }
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      images: [
        {
          url: LOGO_URL,
          width: 246,
          height: 160,
          alt: `${SITE_NAME} SEO Tools`
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [LOGO_URL]
    }
  };
}

/**
 * JSON-LD structured data for the main /tools directory page
 */
export function getToolsHubJsonLd() {
  const toolList = Object.values(TOOLS_REGISTRY);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      getOrganizationSchema(),
      getWebSiteSchema(),
      {
        '@type': 'CollectionPage',
        '@id': `${TOOLS_BASE_URL}#webpage`,
        url: TOOLS_BASE_URL,
        name: 'Free Technical SEO Tools Directory Online | Indian Marketers',
        description: `Explore Indian Marketers' collection of ${toolList.length} free technical SEO tools. Test robots.txt, validate schema markup, check domain age, simulate SERPs, check mobile indexing, and more.`,
        isPartOf: {
          '@id': `${SITE_DOMAIN}/#website`
        },
        breadcrumb: {
          '@id': `${TOOLS_BASE_URL}#breadcrumb`
        },
        mainEntity: {
          '@id': `${TOOLS_BASE_URL}#itemlist`
        },
        inLanguage: 'en-US'
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${TOOLS_BASE_URL}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_DOMAIN}/`
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'SEO Tools',
            item: TOOLS_BASE_URL
          }
        ]
      },
      {
        '@type': 'ItemList',
        '@id': `${TOOLS_BASE_URL}#itemlist`,
        name: 'Indian Marketers SEO Tools Directory',
        description: `A comprehensive suite of ${toolList.length} technical SEO utilities for crawling, rendering, mobile SEO, local search, domain analysis, and structured data.`,
        numberOfItems: toolList.length,
        itemListElement: toolList.map((tool, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: tool.name,
          url: tool.canonical
        }))
      }
    ]
  };
}

/**
 * Metadata generator for an individual tool page
 */
export function getToolMetadata(slug: string): Metadata {
  const tool = TOOLS_REGISTRY[slug];
  if (!tool) {
    return getToolsHubMetadata();
  }

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    keywords: tool.keywords || [tool.name, 'SEO Tool', 'Indian Marketers', 'Technical SEO'],
    alternates: {
      canonical: tool.canonical
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1
      }
    },
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      url: tool.canonical,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      images: [
        {
          url: LOGO_URL,
          width: 246,
          height: 160,
          alt: `${tool.name} | ${SITE_NAME}`
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
      images: [LOGO_URL]
    }
  };
}

/**
 * JSON-LD structured data generator for an individual tool page
 */
export function getToolJsonLd(slug: string) {
  const tool = TOOLS_REGISTRY[slug];
  if (!tool) {
    return getToolsHubJsonLd();
  }

  const entities: any[] = [
    getOrganizationSchema(),
    getWebSiteSchema(),
    {
      '@type': 'WebPage',
      '@id': `${tool.canonical}#webpage`,
      url: tool.canonical,
      name: tool.metaTitle,
      description: tool.metaDescription,
      isPartOf: {
        '@id': `${SITE_DOMAIN}/#website`
      },
      breadcrumb: {
        '@id': `${tool.canonical}#breadcrumb`
      },
      mainEntity: {
        '@id': `${tool.canonical}#software`
      },
      inLanguage: 'en-US'
    },
    {
      '@type': 'WebApplication',
      '@id': `${tool.canonical}#software`,
      url: tool.canonical,
      name: tool.name,
      description: tool.metaDescription,
      applicationCategory: tool.softwareCategory,
      operatingSystem: 'All',
      browserRequirements: 'Requires modern JavaScript-enabled web browser',
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'INR'
      },
      provider: {
        '@id': `${SITE_DOMAIN}/#organization`
      },
      featureList: tool.features
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${tool.canonical}#breadcrumb`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: `${SITE_DOMAIN}/`
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'SEO Tools',
          item: TOOLS_BASE_URL
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: tool.name,
          item: tool.canonical
        }
      ]
    }
  ];

  if (tool.faqs && tool.faqs.length > 0) {
    entities.push({
      '@type': 'FAQPage',
      '@id': `${tool.canonical}#faq`,
      mainEntity: tool.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer
        }
      }))
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': entities
  };
}
