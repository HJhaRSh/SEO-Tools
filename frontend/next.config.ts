import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const backendTarget =
  process.env.BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  (isDev ? "http://localhost:5000" : "");

const nextConfig: NextConfig = {
  async rewrites() {
    // Only configure Next.js proxy rewrites if a backend target is defined.
    // In production on Vercel where vercel.json routes /api directly to the Express backend service,
    // omitting localhost fallback prevents ECONNREFUSED 500 errors.
    if (!backendTarget) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${backendTarget.replace(/\/$/, '')}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
