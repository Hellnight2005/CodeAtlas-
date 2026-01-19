import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/repo/:path*',
        destination: 'http://localhost:5001/api/repo/:path*',
      },
      {
        source: '/auth/:path*',
        destination: 'http://localhost:5000/auth/:path*',
      },
      {
        source: '/api/auth/:path*',
        destination: 'http://localhost:5000/auth/:path*',
      },
      {
        source: '/api/github/:path*',
        destination: 'http://localhost:5000/:path*',
      },
      {
        source: '/api/graph/:path*',
        destination: 'http://localhost:5001/api/graph/:path*',
      },
    ]
  },
};

export default nextConfig;
