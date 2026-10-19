import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const backendTarget =
  process.env.BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  (isDev ? "http://localhost:5000" : "");

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling native-binary or node-only packages — they must be loaded at runtime
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core', 'unzipper', 'archiver'],

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
        source: '/api/:path*',
        destination: `${backendTarget.replace(/\/$/, '')}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
