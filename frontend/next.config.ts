import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const backendTarget =
  process.env.BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  (isDev ? "http://localhost:5000" : "");

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  // Prevent Next.js from bundling native-binary or node-only packages — they must be loaded at runtime
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core', 'unzipper', 'archiver'],

  // Narrow serverless function tracing: exclude non-runtime GUI assets, types, docs, and map files
  outputFileTracingExcludes: {
    '*': [
      'node_modules/playwright-core/lib/vite/**',
      'node_modules/playwright-core/types/**',
      'node_modules/@swc/core*/**',
      'node_modules/@esbuild/**',
      'node_modules/typescript/**',
      'node_modules/**/*.md',
      'node_modules/**/*.d.ts',
      'node_modules/**/*.map',
    ],
  },

  async rewrites() {
    // Only configure Next.js proxy rewrites if a backend target is defined.
    // In production on Vercel where vercel.json routes /api directly to the Express backend service,
    // omitting localhost fallback prevents ECONNREFUSED 500 errors.
    if (!backendTarget) {
      return [];
    }

    return [
      {
        // Exclude Next.js-native mobile-friendly and mobile-first routes from backend proxy
        source: '/api/seo/mobile-friendly/:path*',
        destination: '/api/seo/mobile-friendly/:path*'
      },
      {
        source: '/api/seo/mobile-first-index/:path*',
        destination: '/api/seo/mobile-first-index/:path*'
      },
      {
        source: '/api/seo/robots/:path*',
        destination: '/api/seo/robots/:path*'
      },
      {
        source: '/api/seo/sitemap/:path*',
        destination: '/api/seo/sitemap/:path*'
      },
      {
        source: '/api/seo/ai-bot-access/:path*',
        destination: '/api/seo/ai-bot-access/:path*'
      },
      {
        source: '/api/seo/htaccess/:path*',
        destination: '/api/seo/htaccess/:path*'
      },
      {
        source: '/api/seo/fetch-render/:path*',
        destination: '/api/seo/fetch-render/:path*'
      },
      {
        source: '/api/seo/bulk-google-index-checker/:path*',
        destination: '/api/seo/bulk-google-index-checker/:path*'
      },
      {
        source: '/api/seo/local-search/:path*',
        destination: '/api/seo/local-search/:path*'
      },
      {
        source: '/api/:path*',
        destination: `${backendTarget.replace(/\/$/, '')}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
