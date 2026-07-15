import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(self)',
          },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value: "base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
