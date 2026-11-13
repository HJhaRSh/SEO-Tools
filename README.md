# 🚀 Indian Marketers — Free Technical SEO Tools Suite

[![Next.js](https://img.shields.io/badge/Next.js-16.4.2-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3.0-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests Passing](https://img.shields.io/badge/Tests-16%20Suites%20Passed-brightgreen)](https://github.com/HJhaRSh/SEO-Tools)

A production-grade, privacy-first technical SEO platform engineered for digital marketers, agencies, developers, and technical SEO specialists. The platform features **20 specialized tools** across crawling, mobile parity, international targeting, local visibility, structured data, semantic relevance, and AI crawler readiness — 100% free with no login walls, subscriptions, or credit card requirements.

**Live Directory:** [indianmarketers.in/tools](https://indianmarketers.in/tools)

---

## 📑 Table of Contents

- [🛠️ The 20 Technical SEO Tools](#️-the-20-technical-seo-tools)
  - [1. 🤖 Crawling & Access](#1--crawling--access)
  - [2. 📱 Rendering & Mobile SEO](#2--rendering--mobile-seo)
  - [3. 🌐 International SEO](#3--international-seo)
  - [4. 📍 Local SEO](#4--local-seo)
  - [5. 🔍 Search Appearance & Structured Data](#5--search-appearance--structured-data)
  - [6. 🧠 Content & Semantic SEO](#6--content--semantic-seo)
- [🏗️ Architecture & Technology Stack](#️-architecture--technology-stack)
- [🔒 Security & Isolation Model](#-security--isolation-model)
- [🚀 Quick Start & Local Setup](#-quick-start--local-setup)
- [🧪 Running the Automated Test Suite](#-running-the-automated-test-suite)
- [☁️ Deployment Configuration](#️-deployment-configuration)
- [📄 License](#-license)

---

## 🛠️ The 20 Technical SEO Tools

### 1. 🤖 Crawling & Access

* **Robots.txt Tester (`/tools/robots-txt-tester`)**
  * **RFC 9309 Compliant**: Full parser adhering to Google's official RFC 9309 specification with wildcards (`*`), end-of-line anchors (`$`), and longest-match specificity tie-breaking.
  * **Live In-Browser Editor**: Edit rules on the fly, run real-time syntax diagnostics, and restore original live files with a single click.
  * **Critical Resource Extraction**: Discovers linked stylesheets, JavaScript files, and images to alert if Googlebot is blocked from rendering assets.
  * **XML Sitemap Validation**: Auto-discovers declared sitemaps and verifies status codes and XML schemas.

* **AI Bot Access Tester (`/tools/ai-bot-access-tester`)**
  * **35+ AI Spiders & Agents**: Audits permissions for OpenAI (*GPTBot, ChatGPT-User, SearchGPT*), Anthropic (*ClaudeBot, Claude-Web*), PerplexityBot, Meta-ExternalAgent, Applebot-Extended, Google-Extended, Cohere, Bytespider, and more.
  * **3-Layer Diagnostic Pipeline**:
    1. *Robots.txt Analysis*: RFC 9309 permission checks against declared crawl rules.
    2. *HTTP Probe Simulation*: Real network connection, status validation, and redirect path tracking.
    3. *WAF & Challenge Detection*: Detects Cloudflare Turnstile, CAPTCHA challenges, and 403 Forbidden blocks.
  * **Batch Testing**: Audit up to 100 URLs simultaneously with CSV export.

* **.htaccess Tester (`/tools/htaccess-tester`)**
  * **Apache Rewrite Simulator**: Validates Apache `.htaccess` directives, `RewriteEngine`, `RewriteCond`, and `RewriteRule` regular expressions.
  * **Flag & Variable Support**: Simulates `[R=301]`, `[R=302]`, `[L]`, `[NC]`, `[QSA]`, `[NE]`, `[F]`, and variables (`%{HTTPS}`, `%{HTTP_HOST}`, `%{REQUEST_URI}`).
  * **Template Library**: One-click presets for HTTPS enforcement, www/non-www normalization, trailing slash rules, and clean URLs.

* **XML Sitemap Generator (`/tools/sitemap-generator`)**
  * **Multi-Source Ingestion**: Ingest URLs via website crawling, CSV/Excel (`.xlsx`) upload, or manual text paste.
  * **Standards Compliant**: Full `sitemaps.org` compliance with `<lastmod>`, `<changefreq>`, and `<priority>`.
  * **Rich Extensions**: Supports Google Images (`image:image`), Videos (`video:video`), Google News (`news:news`), and hreflang alternates (`xhtml:link`).
  * **Automatic Chunking**: Auto-splits large websites at 50,000 URLs or 50 MB into sub-sitemaps with a consolidated `<sitemapindex>`.

* **Domain Age Checker (`/tools/domain-age-checker`)**
  * **RFC 9083 RDAP Protocol**: Direct ICANN Registration Data Access Protocol lookups for precise UTC registration timestamps.
  * **Full Lifecycle Metrics**: Computes exact domain age (years, months, days), registration date, last updated date, expiration countdown, registrar details, and nameservers.
  * **Batch Lookup**: Audit up to 20 domains concurrently with sanitized CSV export.

* **Bulk Google Index Checker (`/tools/bulk-google-index-checker`)**
  * **Google Search Console Integration**: Official Google Search Console URL Inspection API integration with secure OAuth2.
  * **Verdicts & Metadata**: Live index verdicts, crawl timestamp, canonical status, mobile usability, and live meta title/description fetching.
  * **CSV Reporting**: Export batch inspection audits with RFC 4180 CSV formula sanitization.

* **Common Crawl Checker (`/tools/common-crawl-checker`)**
  * **Historical Capture Analysis**: Queries the official Common Crawl CDX API index across public crawl archives.
  * **CCBot Access Audit**: Inspects historical robots.txt directives and live crawler access for Common Crawl's CCBot.
  * **Sitemap Coverage**: Compares indexed Common Crawl captures against live sitemap XML URLs to uncover crawl coverage gaps.

* **499 Timeout Risk Checker (`/tools/499-checker`)**
  * **AI Fetch Latency Assessment**: Measures server response timing (TTFB approximation) against time-sensitive AI crawler identities (*ChatGPT-User, Claude-User, Perplexity-User*).
  * **Directional Cache-Busting Probe**: Compares standard requests against a cache-busting query parameter probe to estimate caching overhead.
  * **Bounded Streaming Transport**: Monotonic high-resolution timers, 5-hop redirect tracking, and strict body download capping (512 KiB) preventing memory bloat.

---

### 2. 📱 Rendering & Mobile SEO

* **Fetch & Render Tool (`/tools/fetch-render`)**
  * **Chromium Headless Execution**: Leverages Playwright to render JavaScript single-page applications (React, Vue, Angular, Next.js).
  * **Bot User-Agent Emulation**: Emulates Googlebot Desktop, Googlebot Smartphone, Mobile Safari, Bingbot, and custom user agents.
  * **Console & Resource Diagnostics**: Captures uncaught JavaScript errors, network request failures, and blocked sub-resources.
  * **Visual Screenshots**: Generates high-resolution full-page and mobile viewport visual snapshots.

* **Pre-rendering Tester (`/tools/prerendering-tester`)**
  * **DOM Diffing Engine**: Compares raw server-response HTML side-by-side with post-hydration client DOM.
  * **SEO Signal Discrepancies**: Highlights differences in title tags, meta descriptions, canonical URLs, robots directives, and OpenGraph tags.
  * **Content Parity Auditing**: Measures word count changes, heading hierarchy mutations (`h1`–`h6`), and JS-injected links.

* **Mobile-First Index Tool (`/tools/mobile-first-index`)**
  * **Parity Auditing**: Compares Googlebot Desktop and Googlebot Smartphone crawls side by side.
  * **Hidden Content Discovery**: Uncovers navigation links, text, or structured data removed or hidden on mobile viewports.
  * **Canonical & Alternate Auditing**: Identifies mismatched mobile URLs, incorrect canonicals, and faulty mobile redirects.

* **Mobile-Friendly Test (`/tools/mobile-friendly-test`)**
  * **Viewport Configuration**: Validates `<meta name="viewport">` properties, width settings, and zoom constraints.
  * **Touch Target Verification**: Detects interactive buttons and links smaller than mobile minimums (48×48 px).
  * **Legibility & Overflow**: Flags typography under 12 px and horizontal scrolling overflow bugs.

---

### 3. 🌐 International SEO

* **hreflang Tags Tester (`/tools/hreflang-tester`)**
  * **Multi-Channel Parsing**: Extracts hreflang annotations from HTML `<link>` tags, HTTP response headers, and XML sitemaps.
  * **Standard Code Validation**: Validates language codes (ISO 639-1) and regional codes (ISO 3166-1 alpha-2).
  * **Bidirectional Confirmation**: Verifies return links (ensuring target regional pages link back to the source).
  * **`x-default` Validation**: Ensures global fallback routing for unmatched visitor locales.

---

### 4. 📍 Local SEO

* **Local Search Simulator (`/tools/local-search`)**
  * **UULE Geolocation Engine**: Generates precise Google UULE geolocation strings to eliminate physical IP bias.
  * **Multi-Country Targeting**: Simulates localized SERPs and Google Maps results from exact latitude/longitude coordinates and postal codes.
  * **Domain & Language Switching**: Supports global Google domains (`google.com`, `google.co.in`, `google.co.uk`) and UI languages.

* **Google Review Link Generator (`/tools/review-link-generator`)**
  * **Frictionless Review URLs**: Creates direct review dialog links that open the 5-star review modal immediately for customers.
  * **Place ID Resolver**: Built-in search to identify and verify Google Business Profile Place IDs.
  * **Print-Ready QR Codes**: Generates high-resolution vector SVG and PNG QR codes for marketing collaterals and receipts.

---

### 5. 🔍 Search Appearance & Structured Data

* **Google SERP Simulator (`/tools/serp-simulator`)**
  * **Pixel-Accurate Previews**: Calibrated precisely to Google's 600px desktop boundary and mobile snippet constraints.
  * **Rich Result Snippets**: Previews review stars, ratings, pricing, publish dates, favicons, and breadcrumbs.
  * **Social Media Cards**: Generates live previews for Open Graph (Facebook, LinkedIn) and Twitter/X cards.

* **Knowledge Graph Search (`/tools/knowledge-graph-search`)**
  * **Google Knowledge Graph API**: Queries Google's Knowledge Graph directly to uncover entity machine IDs (`/m/...`, `/g/...`).
  * **Entity Disambiguation**: Explores Schema.org types, entity descriptions, Wikipedia/Wikidata associations, and Google authority scores.

* **Schema Markup Generator (`/tools/schema-generator`)**
  * **Visual Schema Creator**: Builds error-free, Google-compliant JSON-LD structured data.
  * **Supported Schemas**: `Organization`, `LocalBusiness`, `Article`, `FAQPage`, `Product`, `BreadcrumbList`, `Event`, `JobPosting`, `Recipe`, and `Person`.
  * **1-Click Testing**: Instant copy, JSON file download, and direct links to Google's Rich Results Test.

* **Bulk Schema Checker (`/tools/schema-checker`)**
  * **Multi-URL Schema Auditing**: Audits structured data markup across up to 100 URLs simultaneously.
  * **Format Detection**: Detects and parses JSON-LD, Microdata, and RDFa schemas with detailed item type summaries.

---

### 6. 🧠 Content & Semantic SEO

* **AI Page Focus Analyzer (`/tools/page-focus-analyzer`)**
  * **3072-Dimensional Vector Embeddings**: Uses Google Gemini embedding models (`text-embedding-004`) to compute dense semantic vector representations.
  * **Cosine Similarity Scoring**: Rigorously maps raw cosine similarity to calibrated relevance bands (*Aligned, Moderate, Weak, Misaligned*).
  * **Topical Coverage & Competitor Comparison**: Identifies content gaps, search intent alignment, and keyword stuffing risks.

---

## 🏗️ Architecture & Technology Stack

The platform is built as a high-performance modern web application utilizing Next.js App Router for frontend/API services and an optional Express backend service orchestrated through Vercel's multi-service deployment model.

```
SEO-Tools/
├── vercel.json                 # Multi-service routing (frontend vs backend)
├── package.json                # Root workspace configuration
├── frontend/                   # Next.js 16 App Router application
│   ├── next.config.ts          # Turbopack/Webpack, serverExternalPackages, rewrites
│   ├── src/
│   │   ├── app/                # App Router pages, layouts, and API routes
│   │   │   ├── tools/          # Tool UI pages and dedicated client components
│   │   │   │   ├── 499-checker/
│   │   │   │   ├── ai-bot-access-tester/
│   │   │   │   ├── bulk-google-index-checker/
│   │   │   │   └── ...
│   │   │   └── api/seo/        # Node.js serverless API routes
│   │   ├── components/         # Shared UI: AppShell, AppSidebar, ToolLayout, JsonLdScript
│   │   └── lib/seo/            # Shared business logic, algorithms, and security utilities
│   │       ├── ssrf.ts         # Centralized SSRF validation and IP verification
│   │       ├── safeFetch.ts    # Secure network fetcher with timeout enforcement
│   │       ├── errorSanitizer.ts # Security redaction and error sanitization
│   │       ├── seoConfig.ts    # Site-wide SEO registry, metadata, and JSON-LD schema
│   │       └── timeout-risk/   # Isolated 499 Checker service, scoring, and transport
│   └── src/test-*.ts           # 16 comprehensive automated test suites
└── backend/                    # Express.js auxiliary services
```

* **Frontend Framework**: Next.js 16.4.2 (React 19.3.0) with Turbopack / Webpack
* **Styling**: Tailwind CSS v4 with custom CSS variable design tokens
* **Headless Browser**: Playwright Core (`playwright-core` 1.50.1) & `@sparticuz/chromium` 133.0.0
* **Data Processing**: Cheerio, CSV-Parse, ExcelJS, Fast-XML-Parser, Archiver, Unzipper
* **AI & Embeddings**: Google Gemini API (`@google/genai` 2.32.0) with `gemini-3.1-flash-lite` and `text-embedding-004`
* **Test Runner**: Node.js & `tsx` 4.19.2

---

## 🔒 Security & Isolation Model

Enterprise-grade security controls protect both the host infrastructure and visitor data:

1. **Strict SSRF Defense (`ssrf.ts` & `safeFetch.ts`)**:
   * Blocks IPv4 loopback (`127.0.0.0/8`, `localhost`) and IPv6 loopback (`::1`).
   * Blocks RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
   * Blocks cloud metadata endpoints (`169.254.169.254`, AWS IMDSv1/v2, GCP, Azure, Oracle).
   * Blocks IPv4-mapped IPv6 hex representations (`::ffff:7f00:1`, `::ffff:a9fe:a9fe`).
   * DNS rebinding prevention via connection-time IP pinning with preserved TLS SNI.
2. **Deterministic Error Sanitization (`errorSanitizer.ts`)**:
   * Redacts filesystem paths, stack traces, internal IPs, AWS keys, Stripe tokens, Bearer tokens, and basic auth credentials before sending responses to clients.
3. **CSV Formula Injection Neutralization**:
   * All CSV exports prepend a single quote (`'`) to any cell starting with `=`, `+`, `-`, `@`, `\t`, or `\r` to prevent remote code execution in Microsoft Excel and Google Sheets.
4. **Bounded Memory & Stream Limits**:
   * Body streaming limits (512 KiB decompressed, 2 MiB wire) prevent memory exhaustion attacks.
   * Explicit wall-clock per-probe deadlines prevent hanging serverless function containers.

---

## 🚀 Quick Start & Local Setup

### Prerequisites
* **Node.js**: v18.0.0 or higher (v20+ recommended)
* **npm**: v9.0.0 or higher
* **Git**

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/HJhaRSh/SEO-Tools.git
   cd SEO-Tools
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables** (Optional, for Google API & Search Console features):
   Create `frontend/.env.local`:
   ```env
   # Google Gemini API Key (for Page Focus Semantic Relevance Analyzer)
   GEMINI_API_KEY=your_gemini_api_key_here

   # Google Search Console OAuth (for Bulk Google Index Checker)
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   NEXTAUTH_SECRET=your_nextauth_secret_here
   NEXTAUTH_URL=http://localhost:3000
   ```

4. **Start Development Server**:
   ```bash
   npm run dev --workspace=frontend
   ```
   Open [http://localhost:3000/tools](http://localhost:3000/tools) in your browser.

5. **Build for Production**:
   ```bash
   npm run build --workspace=frontend
   ```

---

## 🧪 Running the Automated Test Suite

The project includes **16 comprehensive, deterministic test suites** validating security, SSRF defenses, RFC specifications, API error handling, and tool-specific logic:

```bash
npm test --workspace=frontend
```

### Test Coverage Highlights:
* `test-security-qa.ts`: SSRF defenses, IPv6 encodings, proxy isolation, and error sanitization.
* `test-499-checker.ts`: TTFB timing separation, body truncation, monotonic deadlines, and band scoring.
* `test-robots.txt`: RFC 9309 path matching, longest-match tie-breaking, and wildcard evaluation.
* `test-hreflang-tester.ts`: Language/region code validation, bidirectional return links, and XML parsing.
* `test-domain-age.ts`: RFC 9083 RDAP arithmetic, leap year handling, and date formatting.
* `test-bulk-google-index-checker.ts`: CSV formula injection guards and API error handling.
* `test-common-crawl.ts`: CDX API indexing, CCBot crawl directive analysis, and sitemap reconciliation.

---

## ☁️ Deployment Configuration

The repository is configured for zero-downtime deployment on **Vercel** via [`vercel.json`](./vercel.json).

* **Multi-Service Architecture**: Next.js App Router powers the primary frontend and serverless API routes (`/api/seo/*`), while auxiliary services run on the Express backend.
* **Header Security**: Applies `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, and strict `Cache-Control: no-store` headers to real-time scanning endpoints.
* **Automatic Route Rewriting**: Dedicated rules ensure Next.js API endpoints are cleanly separated from backend fallback proxies.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free for personal, commercial, and agency use.

Developed with ❤️ by [Indian Marketers](https://indianmarketers.in/).
