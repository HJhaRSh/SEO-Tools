import type { NextConfig } from "next";

const backendTarget = process.env.BACKEND_URL || process.env.BACKEND_API_URL || 'http://localhost:5000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendTarget.replace(/\/$/, '')}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
