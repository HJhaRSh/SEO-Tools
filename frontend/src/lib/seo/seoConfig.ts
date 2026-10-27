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
  features: string[];
  faqs: ToolFaqItem[];
}

export const TOOLS_REGISTRY: Record<string, ToolSeoData> = {
  'robots-txt-tester': {
    slug: 'robots-txt-tester',
    name: 'robots.txt Tester',
    metaTitle: 'robots.txt Tester & RFC 9309 Validator | Indian Marketers',
    metaDescription: 'Test and debug robots.txt directives using RFC 9309 rules. Check URL crawlability, simulate edits in a sandbox editor, and audit blocked page resources online.',
    canonical: `${TOOLS_BASE_URL}/robots-txt-tester`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    features: [
      'RFC 9309 official robots.txt crawlability evaluation engine',
      'Longest-octet pattern specificity and Allow vs Disallow tie-breaking resolution',
      'In-memory live sandbox editor for real-time directive simulation',
      'Automated XML sitemap extraction and HTTP accessibility validation',
      'Embedded page resource crawler (CSS, JavaScript, and image access checks)'
    ],
    faqs: [
      {
        question: 'What is the difference between Crawlability and Indexability?',
        answer: "Robots.txt exclusively controls crawling (whether a bot is permitted to request and download the page). It does NOT prevent indexing. If a blocked URL receives external backlinks, Google can still index the URL and display it in search results without content snippets. To ensure a page is omitted from indexation, the page must be crawlable and include a 'noindex' robots meta tag or X-Robots-Tag header."
      },
      {
        question: 'How does rule precedence and tie-breaking work under RFC 9309?',
        answer: 'Directives are evaluated by pattern specificity (the number of octets in the matching rule). The longest matching rule takes precedence. When an Allow and Disallow rule match the identical path length, Allow takes precedence over Disallow.'
      },
      {
        question: "Why does Googlebot Smartphone use the 'Googlebot' user-agent group?",
        answer: "Google's official crawler documentation specifies that Googlebot Smartphone reads rules from the 'User-agent: Googlebot' group. It does not look for a separate smartphone token unless none is present."
      },
      {
        question: 'Why should I test embedded page resources (CSS, JS, images)?',
        answer: 'Modern search engines render pages like a browser. If your robots.txt file blocks Googlebot from accessing essential CSS or JavaScript files, Google cannot render the layout correctly, which can severely impair mobile-friendliness assessment, rankings, and structured data detection.'
      }
    ]
  },

  'ai-bot-access-tester': {
    slug: 'ai-bot-access-tester',
    name: 'AI Bot Access Tester',
    metaTitle: 'AI Bot Access Tester – Check AI Crawlers | Indian Marketers',
    metaDescription: 'Check if AI crawlers like GPTBot, ClaudeBot, and Perplexity can access your site. Test robots.txt rules, HTTP status codes, and WAF shields across bulk URLs.',
    canonical: `${TOOLS_BASE_URL}/ai-bot-access-tester`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Multi-layer crawler access diagnostic (robots.txt, HTTP response, WAF shield)',
      'Support for 17 AI crawler identities (GPTBot, ClaudeBot, PerplexityBot, Applebot, Meta, etc.)',
      'Bulk URL audit up to 100 pages per scan',
      'Detection of Cloudflare Turnstile, CAPTCHA challenges, and 403 Forbidden blockers',
      'Downloadable CSV access audit reports'
    ],
    faqs: [
      {
        question: 'What is the difference between robots.txt access and HTTP access?',
        answer: 'Robots.txt represents policy permission: it tells well-behaved crawlers whether they are allowed to request a URL. HTTP access tests actual server response: even if robots.txt allows a bot, a web server firewall (WAF), Cloudflare, or CDN rule might block the bot user-agent with HTTP 403 or a CAPTCHA challenge.'
      },
      {
        question: 'What are policy-only tokens like Google-Extended and Applebot-Extended?',
        answer: 'Google-Extended and Applebot-Extended are control tokens recognized exclusively in robots.txt to opt out of generative AI model training. They do not send standalone HTTP requests from separate crawler identities. For these tokens, HTTP testing is reported as Not Applicable.'
      },
      {
        question: "Does an 'Allowed' result guarantee my site appears in ChatGPT or Claude answers?",
        answer: "No. Permitting crawler access allows AI companies to download and index your page, but search citations and model training inclusions depend on the provider's proprietary ranking, freshness algorithms, and licensing policies."
      }
    ]
  },

  'htaccess-tester': {
    slug: 'htaccess-tester',
    name: '.htaccess Tester',
    metaTitle: 'Apache .htaccess Tester & Rewrite Debugger | Indian Marketers',
    metaDescription: 'Test Apache .htaccess rewrite rules and 301 redirects before deploying. Simulate URL rewrites, conditions, and HTTP status codes in a safe sandbox environment.',
    canonical: `${TOOLS_BASE_URL}/htaccess-tester`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Apache mod_rewrite and mod_alias execution simulation',
      'Line-by-line debug trace showing matched conditions and rewrite flags',
      'Pre-configured SEO templates for HTTPS redirects, www canonicalization, and clean URLs',
      'Customizable server variables (HTTPS, HTTP_HOST, User-Agent)',
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
      }
    ]
  },

  'sitemap-generator': {
    slug: 'sitemap-generator',
    name: 'Sitemap Generator',
    metaTitle: 'XML Sitemap Generator – CSV & Excel to XML | Indian Marketers',
    metaDescription: 'Generate standard XML sitemaps from CSV, Excel, or pasted URLs. Configure auto-depth priorities, format changefreq tags, and download clean sitemap.xml files.',
    canonical: `${TOOLS_BASE_URL}/sitemap-generator`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    features: [
      'CSV and Excel (.xlsx) spreadsheet ingestion with automatic column detection',
      'Intelligent URL-depth auto-scaling priority calculations',
      'Support for configurable changefreq tags and custom URL parameters',
      'Strict adherence to sitemaps.org Protocol and Google Search specifications',
      'Automatic 50,000 URL chunking and ZIP bundling for large datasets'
    ],
    faqs: [
      {
        question: 'How does the URL-depth Priority calculation work?',
        answer: 'Our intelligent depth logic automatically assigns priorities based on search engine crawl hierarchy: 1.0 for the root homepage (/), 0.8 for primary landing sections (depth 1, e.g. /services/), 0.6 for sub-categories/articles (depth 2, e.g. /services/seo/), and 0.4 for deep or nested pages (depth 3+). You can also switch to a fixed custom priority or disable the tag completely.'
      },
      {
        question: 'What does the Change Frequency toggle do?',
        answer: 'The <changefreq> tag provides hints to search engine crawlers regarding how frequently content updates (e.g., weekly, daily, monthly, or auto-depth). You can enable or disable this tag as needed, and individual URL values in spreadsheets or delimited text will always take precedence.'
      },
      {
        question: 'Can I still paste URLs with custom priorities or frequencies?',
        answer: "Yes! In manual paste mode, you can paste raw URLs or use delimiters like pipe (|), tab, or comma: e.g. 'https://example.com/promo | 0.9 | daily'. Any explicitly provided value will be preserved."
      },
      {
        question: 'What spreadsheet formats are supported?',
        answer: 'You can upload standard CSV (.csv) and Excel (.xlsx) files. The tool automatically detects your URL column whether your file includes headers or not.'
      },
      {
        question: 'What happens if my file has more than 50,000 URLs?',
        answer: 'According to the official Sitemap Protocol, each sitemap can contain up to 50,000 URLs. If your file exceeds 50,000 URLs or 50MB, the generator automatically splits them into valid sitemap chunks bundled in a convenient ZIP file.'
      },
      {
        question: 'How do I submit my generated sitemap to Google?',
        answer: "Upload sitemap.xml to the root directory of your website and submit the full URL inside Google Search Console (Indexing > Sitemaps), or add 'Sitemap: https://yourdomain.com/sitemap.xml' to your robots.txt file."
      }
    ]
  },

  'fetch-render': {
    slug: 'fetch-render',
    name: 'Fetch & Render',
    metaTitle: 'Fetch & Render Tool – JavaScript SEO Check | Indian Marketers',
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
    metaTitle: 'Pre-rendering Tester – Dynamic Rendering | Indian Marketers',
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
    metaTitle: 'Mobile-First Index Tool – Parity Audit | Indian Marketers',
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
    metaTitle: 'Mobile-Friendly Test – Usability Checker | Indian Marketers',
    metaDescription: 'Test webpage mobile usability across devices. Audit viewport configuration, horizontal content overflow, font readability, and interactive tap target spacing.',
    canonical: `${TOOLS_BASE_URL}/mobile-friendly-test`,
    category: 'Rendering & Mobile SEO',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Deep mobile usability testing engine inspired by TechnicalSEO and WCAG standards',
      'Accurate viewport meta tag inspection and horizontal content overflow detection',
      'Interactive tap target dimension and spacing evaluation (44x44 CSS px threshold)',
      'Computed font legibility measurements across smartphone presets',
      'Bulk URL audit mode supporting up to 50 URLs with CSV/XLSX export'
    ],
    faqs: [
      {
        question: 'Did Google retire the official Mobile-Friendly Test?',
        answer: 'Yes. Google retired the standalone Mobile-Friendly Test and API in December 2023, shifting emphasis towards Lighthouse and Core Web Vitals. This tool provides an independent, objective mobile usability evaluation engine.'
      },
      {
        question: 'What is the difference between Mobile-Friendly Testing and Mobile-First Indexing?',
        answer: 'Mobile-Friendly Testing evaluates how easily a human user can navigate and read a webpage on a smartphone (e.g. touch target spacing, viewport configuration, and horizontal scrolling). The Mobile-First Indexing tool compares content and SEO tag parity between desktop and mobile versions to ensure search crawlers index the correct data.'
      },
      {
        question: "What causes 'Size Content to Viewport' failures?",
        answer: 'Horizontal overflow occurs when elements like wide tables, rigid fixed-width containers (e.g. width: 800px), or large unconstrained images exceed the screen width, forcing smartphone users to pinch or scroll horizontally.'
      },
      {
        question: 'What are the recommended tap target dimensions?',
        answer: "Apple's Human Interface Guidelines and WCAG guidelines recommend an effective interactive tap target of at least 44x44 CSS pixels with at least 8px spacing between adjacent controls to prevent accidental touch mistakes."
      }
    ]
  },

  'hreflang-tester': {
    slug: 'hreflang-tester',
    name: 'hreflang Tags Tester',
    metaTitle: 'hreflang Tags Tester – International SEO | Indian Marketers',
    metaDescription: 'Validate hreflang annotations in HTML, HTTP headers, and XML sitemaps. Verify ISO language codes, reciprocal return tags, and x-default international fallbacks.',
    canonical: `${TOOLS_BASE_URL}/hreflang-tester`,
    category: 'International SEO',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Multi-source hreflang extraction (HTML <head>, HTTP Link headers, and XML Sitemaps)',
      'ISO 639-1 language code and ISO 3166-1 Alpha-2 country code syntax validation',
      'Bidirectional reciprocal return tag verification across alternate pages',
      'Self-referencing tag checks and x-default international fallback inspection',
      'Automated crawl checks for status codes, canonical alignment, and indexation blocks'
    ],
    faqs: [
      {
        question: "What is a 'Return Tag' (Reciprocal Link) error?",
        answer: 'If Page A declares Page B as its French alternate via hreflang, Page B MUST declare Page A as its English alternate. If Page B does not link back, Google will ignore the hreflang annotation for both pages to prevent third parties from falsely associating themselves with your content.'
      },
      {
        question: "Can I use 'en-UK' for users in the United Kingdom?",
        answer: "No. 'UK' is not an ISO 3166-1 Alpha-2 country code. Google officially requires 'en-GB' for the United Kingdom. Using 'en-UK' causes Google to reject the country specification."
      },
      {
        question: "What is 'x-default'?",
        answer: 'x-default is a special hreflang value reserved for international fallback pages, such as a country/language selector or a default global page when no specific region/language matches the searcher.'
      },
      {
        question: 'Do hreflang annotations need to be in the HTML head?',
        answer: 'Yes. HTML hreflang tags must be placed inside the <head> element. Tags placed inside the <body> are non-compliant and may be ignored by Googlebot. Alternatively, hreflang can be served via HTTP Link headers (ideal for PDFs) or XML sitemaps.'
      },
      {
        question: 'Does this tool work with XML sitemaps?',
        answer: 'Yes! You can enter an XML sitemap URL or upload a local sitemap XML file directly. The tool parses <xhtml:link> annotations and cross-verifies reciprocal return relationships across the sitemap dataset.'
      }
    ]
  },

  'local-search': {
    slug: 'local-search',
    name: 'Local Search Tool',
    metaTitle: 'Local Search Results Tool – Geo SERP Audit | Indian Marketers',
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
    metaTitle: 'Google SERP Simulator – Title Pixel Preview | Indian Marketers',
    metaDescription: 'Preview title tags and meta descriptions in Google search results. Check pixel widths, prevent snippet truncation, and simulate desktop and mobile displays.',
    canonical: `${TOOLS_BASE_URL}/serp-simulator`,
    category: 'Search Appearance & Structured Data',
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
    metaTitle: 'Knowledge Graph Search & Entity Finder | Indian Marketers',
    metaDescription: 'Search Google\'s Knowledge Graph to find entity machine IDs (MIDs), schema types, and match scores. Verify brand entity recognition and export findings to CSV.',
    canonical: `${TOOLS_BASE_URL}/knowledge-graph-search`,
    category: 'Search Appearance & Structured Data',
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
    metaTitle: 'Schema Markup Generator – JSON-LD Creator | Indian Marketers',
    metaDescription: 'Create valid Schema.org JSON-LD structured data in real time. Generate rich snippet markup for Organizations, Articles, FAQs, Local Businesses, and Products.',
    canonical: `${TOOLS_BASE_URL}/schema-generator`,
    category: 'Search Appearance & Structured Data',
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
    name: 'Schema Checker',
    metaTitle: 'Bulk Schema Checker – Structured Data Audit | Indian Marketers',
    metaDescription: 'Audit structured data markup across up to 100 URLs simultaneously. Detect JSON-LD, Microdata, and RDFa schema types, verify presence, and export reports to CSV.',
    canonical: `${TOOLS_BASE_URL}/schema-checker`,
    category: 'Search Appearance & Structured Data',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Multi-format structured data detection (JSON-LD including @graph, Microdata, and RDFa)',
      'Bulk URL audit mode checking up to 100 URLs simultaneously',
      'Identification of specific schema types declared on each page',
      'Detailed presence and error state reporting per URL',
      'One-click export to comma-separated CSV spreadsheets'
    ],
    faqs: [
      {
        question: 'What schema formats does this tool detect?',
        answer: 'It detects JSON-LD (including @graph and nested types), Microdata (itemscope/itemtype), and RDFa (typeof/vocab). The output only shows the schema type names — not the format used.'
      },
      {
        question: 'Will it detect schema added by JavaScript?',
        answer: 'This tool checks the raw HTML response returned by the server. Schema markup injected only after JavaScript execution may not be detected. Use the Fetch & Render tool if you need to inspect the fully rendered DOM.'
      },
      {
        question: "What does 'Schema Found: No' mean?",
        answer: 'It means no recognisable schema markup (JSON-LD, Microdata, or RDFa) was found in the raw HTML of that page. The page may still have schema injected via JavaScript.'
      },
      {
        question: 'How many URLs can I check at once?',
        answer: 'Up to 100 unique URLs per request. Duplicate URLs are automatically removed and only checked once.'
      }
    ]
  },

  'domain-age-checker': {
    slug: 'domain-age-checker',
    name: 'Domain Age Checker',
    metaTitle: 'Free Domain Age Checker Online | Indian Marketers',
    metaDescription: 'Check domain age online and find registration, updated and expiry dates. Use our free Domain Age Checker to analyze single or multiple domains.',
    canonical: `${TOOLS_BASE_URL}/domain-age-checker`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Authoritative RFC 9083 / RFC 9224 RDAP registration data retrieval engine',
      'Accurate calendar domain age calculation (years, months, days, total elapsed days)',
      'Single and bulk domain lookup supporting up to 20 domains per batch',
      'Expiration date tracking and remaining lifespan calculation',
      'Authoritative registrar, registration status, and nameserver detection',
      'Formula-injection protected CSV report export and one-click summary copying'
    ],
    faqs: [
      {
        question: 'How do I check the age of a domain?',
        answer: 'Simply enter a domain name or URL (e.g., google.com or https://example.com) into the input box and click "Check Domain Age". For multiple domains, switch to the "Bulk Domains" tab, paste up to 20 domains (one per line), and click "Check Bulk Domains".'
      },
      {
        question: 'Is this Domain Age Checker free?',
        answer: 'Yes. The Indian Marketers Domain Age Checker is 100% free with no registration, no API keys, and no subscription required.'
      },
      {
        question: 'Can I check multiple domains at once?',
        answer: 'Yes. The bulk checker tab lets you audit up to 20 unique domains in a single operation with bounded concurrency, individual row statuses, and downloadable CSV reports.'
      },
      {
        question: 'How is domain age calculated?',
        answer: 'Domain age is calculated using authoritative calendar arithmetic starting from the domain\'s verified registration timestamp up to the current UTC date, properly accounting for leap years, variable month lengths, and anniversary boundaries.'
      },
      {
        question: 'Is domain age the same as website age?',
        answer: 'No. Domain age indicates when the domain name record was first created at the registry. A domain may have been registered years before a live website was launched, or it may have been bought, parked, dropped, or re-registered with different owners.'
      },
      {
        question: "Can a domain's creation date change?",
        answer: 'If a domain lapses past all grace periods and is deleted from the registry, a subsequent registration creates a brand new record with a new creation date. However, standard registrar transfers and ownership renewals preserve the original creation date.'
      },
      {
        question: "Why is my domain's registration date unavailable?",
        answer: 'Certain country-code top-level domains (ccTLDs) do not publish public RDAP registration records or withhold creation dates under local privacy laws. In such cases, the tool transparently reports that the data is not provided rather than guessing or fabricating dates.'
      },
      {
        question: 'Does domain age directly improve Google rankings?',
        answer: 'No. Google representatives have repeatedly clarified that registration age alone is not a direct ranking factor. Older domains often rank well because they have had more time to accumulate high-quality content, authoritative backlinks, user trust, and brand recognition.'
      },
      {
        question: 'Can I check the expiry date of a domain?',
        answer: 'Yes. When exposed by the authoritative registry, the tool displays the registration expiration date and calculates the exact remaining days until renewal.'
      },
      {
        question: 'How accurate is RDAP registration data?',
        answer: 'RDAP (Registration Data Access Protocol) is the official successor to legacy WHOIS mandated by ICANN. It queries authoritative registries directly via structured JSON, ensuring maximum data integrity without scraping approximations.'
      }
    ]
  },

  'bulk-google-index-checker': {
    slug: 'bulk-google-index-checker',
    name: 'Bulk Google Index Checker',
    metaTitle: 'Bulk Google Index Checker Online | Indian Marketers',
    metaDescription: 'Check Google indexing status for multiple URLs with Search Console. View indexed pages, coverage reasons, live meta titles and descriptions, and export results.',
    canonical: `${TOOLS_BASE_URL}/bulk-google-index-checker`,
    category: 'Crawling & Access',
    softwareCategory: 'DeveloperApplication',
    features: [
      'Official Google Search Console URL Inspection API integration',
      'Batch URL processing up to 100 URLs with automatic inspection',
      'Real recorded Google index statuses: Indexed, Not Indexed, Alternate / Canonicalized',
      'Diagnostic coverage reasons, crawl states, and Google-selected canonical URLs',
      'Live server-side HTML meta title and description extraction with character counts',
      'Property scope validation for domain and URL-prefix Search Console properties',
      'Read-only OAuth 2.0 authorization with PKCE and AES-256-GCM session security',
      'Spreadsheet formula-safe CSV export and instant tabular clipboard copy'
    ],
    faqs: [
      {
        question: 'Is the Bulk Google Index Checker free?',
        answer: 'Yes. The Bulk Google Index Checker is 100% free to use. You simply connect your Google Search Console account with read-only permissions to inspect up to 100 URLs per session.'
      },
      {
        question: 'Why do I need Search Console access?',
        answer: 'Google treats indexing records, coverage states, crawl history, and canonical choices as private search engine data. Google only shares this information via the official URL Inspection API with accounts that have verified ownership or permission on the property.'
      },
      {
        question: 'Can I check multiple URLs together?',
        answer: 'Yes. You can paste up to 100 URLs at a time from your selected property. The tool automatically batches requests and retrieves indexing information directly from Google.'
      },
      {
        question: 'Can I inspect competitor websites?',
        answer: 'No. The Google URL Inspection API requires verified property ownership in Google Search Console. You can only inspect websites where your Google account has verified property access.'
      },
      {
        question: 'What does Not Indexed mean?',
        answer: 'Not Indexed means Google has crawled or discovered the URL but chose not to include it in the search index, or excluded it due to reasons such as a noindex tag, crawl anomaly, soft 404, or canonicalization.'
      },
      {
        question: 'Can I export indexing results?',
        answer: 'Yes. You can export the complete batch report as an RFC-compliant CSV spreadsheet, including Google indexing verdicts, coverage reasons, canonical URLs, last crawl timestamps, and live metadata.'
      },
      {
        question: 'Does the tool show meta titles and descriptions?',
        answer: 'Yes. In addition to Google indexing data, the tool concurrently extracts the live HTML meta title, meta description, and character counts directly from the public webpage.'
      },
      {
        question: "How current is Google's indexing information?",
        answer: "The data returned is Google's recorded index status from Googlebot's most recent crawl. It reflects what Google's search index currently knows about your page."
      },
      {
        question: 'Does connecting Google give the tool editing permissions?',
        answer: 'No. The tool requests strictly read-only access (https://www.googleapis.com/auth/webmasters.readonly). It cannot edit your sitemaps, modify settings, or change website verification.'
      },
      {
        question: 'What happens when I disconnect?',
        answer: 'Clicking Disconnect immediately destroys the server session cookie and attempts token revocation with Google. Your authorization token is discarded.'
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
  const title = 'Free Technical SEO Tools Directory | Indian Marketers';
  const description = `Explore Indian Marketers' collection of ${count} free technical SEO tools. Test robots.txt, validate schema markup, check domain age, simulate SERPs, check mobile indexing, and more.`;
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
        name: 'Free Technical SEO Tools Directory | Indian Marketers',
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
