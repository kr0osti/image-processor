// Import the Next.js config from the config directory
// The actual configuration is in config/next/next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hosts allowed to load dev-server resources (next dev only), e.g. a LAN IP
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS ? process.env.ALLOWED_DEV_ORIGINS.split(',') : [],
  // Increase API limits for handling large images
  serverExternalPackages: ['sharp'],
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

module.exports = nextConfig
