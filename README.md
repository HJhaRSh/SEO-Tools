
---

## 🛠️ Complete Suite of SEO Tools (14 Tools)

### 1. 🤖 Crawling & Access

* **Robots.txt Tester (`/tools/robots-txt-tester`)**
  * **RFC 9309 Compliant**: Full standard compliance with wildcard (`*`), end-of-line anchor (`$`), and longest-match specificity logic.
  * **Interactive Live Editor**: In-browser code editor with real-time test execution, syntax diagnostics, and a 1-click **Reset to Live File** option.
  * **Page Resource Extraction**: Crawls target HTML pages and checks whether linked scripts, stylesheets, and images are blocked from Googlebot.
  * **Sitemap Extraction**: Identifies and verifies HTTP status codes and XML format validity of declared sitemaps.

* **AI Bot Access Tester (`/tools/ai-bot-access-tester`)**
  * **35+ AI Spiders & Agents**: Tests crawler access for OpenAI (GPTBot, ChatGPT-User, SearchGPT), Anthropic (ClaudeBot, Claude-Web), PerplexityBot, Meta-ExternalAgent, Applebot-Extended, Google-Extended, Cohere, Bytespider, SemrushBot, and more.
  * **3-Layer Diagnostic Pipeline**:
    1. *Layer 1 (Robots.txt)*: RFC 9309 permission checks against live crawler rules.
    2. *Layer 2 (HTTP Simulation)*: Real-time network handshake, HTTP status verification, and redirect path tracking (`301 Moved Permanently`).
    3. *Layer 3 (WAF & Content Extraction)*: Detects Cloudflare Turnstile, CAPTCHA challenges, 403 Forbidden pages, and verifies visible word count.
  * **Bulk Testing & Export**: Batch inspect up to 100 URLs simultaneously with CSV export.

* **.htaccess Tester (`/tools/htaccess-tester`)**
  * **Apache Rewrite Simulator**: Validates Apache `.htaccess` directives, `RewriteEngine`, `RewriteCond`, and `RewriteRule` logic.
  * **Directive & Flag Support**: Handles `[R=301]`, `[R=302]`, `[L]`, `[NC]`, `[QSA]`, `[NE]`, `[F]`, and custom redirect chaining.
  * **Server Variables**: Simulates `%{HTTPS}`, `%{HTTP_HOST}`, `%{REQUEST_URI}`, `%{QUERY_STRING}`, and custom headers.
  * **Template Library**: One-click presets for HTTPS enforcement, www / non-www canonicalization, clean URLs, and trailing slash handling.

* **XML Sitemap Generator (`/tools/sitemap-generator`)**
  * **Multi-Source Ingestion**: Ingest URLs via CSV upload, Excel (`.xlsx`) spreadsheets, or direct text paste.
  * **Schema Standards**: Full compliance with the official `sitemaps.org` protocol, supporting `<lastmod>`, `<changefreq>`, and `<priority>`.
  * **Rich Sitemap Extensions**: Support for Images (`image:image`), Videos (`video:video`), Google News (`news:news`), and multi-language hreflang alternates (`xhtml:link`).
  * **Automatic Chunking**: Auto-splits large sites into sub-sitemaps at 50,000 URLs or 50 MB, generating an XML `<sitemapindex>`.
  * **Instant Download Manager**: Download individual XML files, a consolidated `.zip` archive, or a CSV validation error report.

---

### 2. 📱 Rendering & Mobile SEO

* **Fetch & Render Tool (`/tools/fetch-render`)**
  * **Headless Browser Execution**: Uses Playwright / Chromium to render pages exactly as modern search engine bots do.
  * **User-Agent Switching**: Emulates Googlebot Desktop, Googlebot Smartphone, Chrome Desktop, Mobile Safari, Bingbot, and custom user-agents.
  * **Asset & Console Diagnostics**: Identifies blocked or failed resources (CSS, JS, fonts, API calls) and captures client-side JavaScript console errors.
  * **Visual Snapshot**: Captures full-page and mobile viewport screenshots of the rendered page state.

* **Pre-rendering Tester (`/tools/prerendering-tester`)**
  * **Side-by-Side Comparison**: Compares the initial server-response HTML with the post-hydration client DOM.
  * **SEO Signal Diffing**: Highlights discrepancies in title tags, meta descriptions, canonical URLs, robots meta tags, and OpenGraph tags.
  * **Content Parity**: Measures word count differences, heading hierarchy changes (`h1`–`h6`), and detects internal links injected only via JavaScript.

* **Mobile-First Index Tool (`/tools/mobile-first-index`)**
  * **Desktop vs. Mobile Parity**: Audits parity between Googlebot Desktop and Googlebot Smartphone crawls.
  * **Hidden Content Detection**: Detects content, navigation links, or structured data removed or hidden on mobile screens.
  * **Canonical & Alternate Checks**: Flags mismatched canonical tags, hreflang annotations, and mobile redirect configurations.

* **Mobile-Friendly Test (`/tools/mobile-friendly-test`)**
  * **Viewport Audit**: Validates `<meta name="viewport">` declaration and dynamic zoom constraints.
  * **Touch Target Sizing**: Identifies buttons and tap targets smaller than recommended mobile touch boundaries (48×48 px).
  * **Font Readability**: Flags illegible typography (font sizes below 12 px) requiring user zooming.
  * **Content Overflow**: Detects horizontal scrolling issues and elements extending beyond viewport boundaries.

---

### 3. 🌐 International SEO

* **hreflang Tags Tester (`/tools/hreflang-tester`)**
  * **Multi-Format Extraction**: Parses hreflang annotations from HTML `<link>` tags, HTTP response headers, and XML sitemaps.
  * **Code Validation**: Validates language codes against ISO 639-1 and region codes against ISO 3166-1 alpha-2.
  * **Reciprocal Link Verification**: Checks for bidirectional confirmation (confirms that regional target pages link back to the source).
  * **`x-default` Fallback Audit**: Verifies global fallback routing for unmatched user locales.

---

### 4. 📍 Local SEO

* **Local Search Simulator (`/tools/local-search`)**
  * **Location-Independent SERPs**: Simulates Google search results from specific geographic coordinates (Latitude / Longitude) and postal codes.
  * **UULE Parameter Engine**: Generates precise Google UULE geolocation strings to eliminate local IP/GPS bias.
  * **Country & Language Targeting**: Customizes Google domain (`google.com`, `google.co.in`, `google.co.uk`) and search interface language.

* **Review Link Generator (`/tools/review-link-generator`)**
  * **Direct Review Popup Links**: Generates frictionless Google Business review links that open the review dialog instantly.
  * **Google Place ID Finder**: Integrated search to resolve business Place IDs instantly.
  * **Print-Ready QR Codes**: Generates high-resolution SVG and PNG QR codes ready for storefront counters, table cards, and receipts.

---

### 5. 🔍 Search Appearance & Structured Data

* **Google SERP Simulator (`/tools/serp-simulator`)**
  * **Pixel-Width Accurate Preview**: Real-time preview calibrated to Google's 600px desktop title boundary and mobile constraints.
  * **Rich Snippets & Features**: Simulates review stars, ratings, pricing, publish dates, favicons, and breadcrumb navigation.
  * **Social Media Cards**: Live previews for Open Graph (Facebook / LinkedIn) and Twitter/X summary cards.

* **Knowledge Graph Search (`/tools/knowledge-graph-search`)**
  * **Entity Exploration**: Directly queries the Google Knowledge Graph Search API to uncover recognized entities.
  * **Machine ID & Authority Scores**: Displays entity MID (`/m/...`, `/g/...`), Schema.org types, and Google relevance scores.
  * **Disambiguation**: Uncovers related entities, descriptions, and verified Wikipedia/Wikidata associations.

* **Schema Markup Generator (`/tools/schema-generator`)**
  * **Visual Schema Builder**: Generates valid, error-free JSON-LD structured data.
  * **Supported Schema Types**: Organization, LocalBusiness, Article, FAQPage, Product, BreadcrumbList, Event, JobPosting, Recipe, and Person.
  * **Instant Validation**: 1-click copy, JSON file download, and direct link to test in Google's Rich Results Test tool.

---

## 🔒 Security & Safe Crawling Architecture

* **SSRF Protection (`safeFetch.ts` & `ssrf.ts`)**: Prevents Server-Side Request Forgery by resolving target hostnames and strictly blocking loopback (`127.0.0.1`, `localhost`), IPv6 equivalents (`::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local metadata addresses (`169.254.169.254`), and internal AWS/GCP/Azure cloud metadata endpoints.
* **Payload Size Boundaries**: Express middleware limits file uploads to 10 MB raw spreadsheet data (15 MB JSON boundary) to eliminate memory exhaustion attacks.
* **Script Injection Guards**: Public browser-render APIs reject arbitrary JavaScript injection (`evaluateScript`) and enforce pre-compiled, trusted audit routines.
* **Safe Redirect Chaining**: Maximum redirect depth caps prevent circular redirection loops.

---

## 🚀 Quick Start Guide

### Prerequisites
* **Node.js**: v18.0.0 or higher (v20+ recommended)
* **npm**: v9.0.0 or higher

### Installation

Clone the repository and install all workspace dependencies from the root:
```bash
git clone https://github.com/HJhaRSh/SEO-Tools.git
cd SEO-Tools
npm install
