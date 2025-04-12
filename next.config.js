// Import the Next.js config from the config directory
// The actual configuration is in config/next/next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase API limits for handling large images
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: '10mb',
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

module.exports = nextConfig
