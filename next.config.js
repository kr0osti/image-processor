// Translations: locale and messages are resolved per request in i18n/request.ts
const createNextIntlPlugin = require('next-intl/plugin')
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hosts allowed to load dev-server resources (next dev only), e.g. a LAN IP
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS ? process.env.ALLOWED_DEV_ORIGINS.split(',') : [],
  // Increase API limits for handling large images
  serverExternalPackages: ['sharp'],
  experimental: {
    // Request bodies are buffered for proxy.ts (which runs on /api/*) and cut off at 10 MB by
    // default. 40 MB covers a 25 MB upload to /api/process and the largest /api/images data URL.
    proxyClientMaxBodySize: '40mb',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
    unoptimized: true,
  },
  // Ensure static files in public directory are accessible
  reactStrictMode: true,
  // Use standalone output for Docker
  output: 'standalone',
  // Add custom headers for static files
  async headers() {
    return [
      {
        source: '/uploads/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
    ];
  },
}

module.exports = withNextIntl(nextConfig)
