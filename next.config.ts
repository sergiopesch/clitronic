import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
