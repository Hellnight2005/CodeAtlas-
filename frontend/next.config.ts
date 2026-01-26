import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const GIT_AUTH_URL = process.env.GIT_AUTH_URL || 'http://localhost:5000';
    const REPO_PARSER_URL = process.env.REPO_PARSER_URL || 'http://localhost:5001';

    return [
      // Specialized Routes first
      {
        source: '/api/repo/generate-ast',
        destination: `${REPO_PARSER_URL}/generate-ast`,
      },
      {
        source: '/api/graph/delete',
        destination: `${REPO_PARSER_URL}/delete-graph`,
      },

      // Generic Groups
      {
        source: '/api/repo/:path*',
        destination: `${REPO_PARSER_URL}/api/repo/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${GIT_AUTH_URL}/auth/:path*`,
      },
      {
        source: '/api/auth/:path*',
        destination: `${GIT_AUTH_URL}/auth/:path*`,
      },
      {
        source: '/api/github/:path*',
        // Git_auth maps /... to /... (e.g. /search -> /search)
        // Check strictness: /api/github/search -> 5000/search
        destination: `${GIT_AUTH_URL}/:path*`,
      },
      {
        source: '/api/graph/:path*',
        destination: `${REPO_PARSER_URL}/api/graph/:path*`,
      },
      {
        source: '/api/check_for_the_file',
        destination: `${REPO_PARSER_URL}/api/check_for_the_file`,
      },
    ]
  },
};

export default nextConfig;
