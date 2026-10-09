# Indian Marketers SEO Tools Suite 🚀

A comprehensive, enterprise-grade technical SEO platform engineered for modern technical SEO analysis, AI crawler accessibility evaluation, and search bot diagnostics.

---

## 🏗️ Repository Architecture

This repository is split into a **dedicated backend service** and a **Next.js frontend application**:

```
SEO Tools/
├── backend/                  # Dedicated Express & Node.js Backend API
│   ├── src/
│   │   ├── index.ts          # Express Server (Port 5000)
│   │   ├── seo/              # Core SEO Parsers & Crawling Engine
│   │   │   ├── aiBotRegistry.ts        # 35 AI Bots with Tokens & Policy metadata
│   │   │   ├── aiBotTesterService.ts   # 3-Layer Access Diagnostic (RFC 9309, HTTP, WAF)
│   │   │   ├── robotsParser.ts         # RFC 9309 Compliant robots.txt parser
│   │   │   ├── robotsService.ts        # Live fetcher & rule resolution
│   │   │   ├── safeFetch.ts            # SSRF Protection & redirect tracker
│   │   │   ├── resourceService.ts      # HTML DOM resource extractor
│   │   │   └── ssrf.ts                 # IP range & DNS validation guards
│   │   ├── test-ai-bots.ts   # Automated test suite for AI bot access
│   │   └── test-robots.ts    # Unit test suite for robots.txt parser & SSRF
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/                 # Next.js 16.4 (Turbopack) / React 19 UI
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx                           # Suite Dashboard
    │   │   ├── tools/robots-txt-tester/           # Tool 1: Robots.txt Tester
    │   │   └── tools/ai-bot-access-tester/        # Tool 2: AI Bot Access Tester
    │   ├── components/                            # AppShell, AppSidebar, ToolLayout
    │   └── lib/                                   # Shared UI utilities
    ├── next.config.ts        # Reverse proxy rewrites to Backend (:5000)
    └── package.json
```

---

## 🛠️ Tools Implemented

### Tool 1: Robots.txt Tester
* **RFC 9309 Compliant**: Path prefix matching, wildcard resolution (`*`), end-of-URL anchor matching (`$`), and longest-match specificity resolution.
* **Interactive Live Editor**: In-browser editing with instant re-testing and a **Reset to Live File** button.
* **Page Resource Extraction**: Crawls HTML pages and checks whether embedded scripts, stylesheets, and images are blocked from Googlebot.
* **Sitemap Discovery**: Identifies and verifies HTTP status and XML validity of declared sitemaps.

### Tool 2: AI Bot Access Tester
* **35 AI Bots / User-Agents**: Exact reference selection covering OpenAI, SearchGPT, Claude, Perplexity, Meta, Apple, Google, Webz.io, Cohere, Huawei, and Semrush.
* **3-Layer Access Diagnostic**:
  1. **Layer 1: robots.txt Rules**: RFC 9309 policy permission check.
  2. **Layer 2: Simulated HTTP Requests**: Verifies actual server response status codes and redirect paths (`301 Moved Permanently`).
  3. **Layer 3: WAF Challenge & Word Count**: Detects Cloudflare Turnstile, CAPTCHAs, 403 Forbidden pages, and calculates visible content word counts.
* **TechnicalSEO Dark List Display**: Color-coded status response (`200 OK`, `301`, `403`), green checkmark / red cross indicator, and interactive deep-dive diagnostic inspection.
* **Bulk Testing**: Test up to 100 URLs simultaneously with CSV export.

---

## 🚀 Getting Started

### 1. Run the Backend Service
```bash
cd backend
npm install
npm run dev
```
*Backend runs on `http://localhost:5000`*

### 2. Run the Frontend Application
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:3000`*
*(All requests to `/api/*` are automatically forwarded to the backend service)*

### 3. Run Automated Tests
```bash
cd backend
npm test
```
All unit tests and end-to-end access test suites pass with zero errors.
