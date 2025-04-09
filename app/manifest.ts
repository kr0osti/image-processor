import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  // Get values from environment variables or use defaults
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'NextJS Image Processor'
  const siteDescription = process.env.NEXT_PUBLIC_SITE_DESCRIPTION || 
    'A powerful web application that allows you to download, process, and standardize images from various sources.'
  const themeColor = process.env.NEXT_PUBLIC_SITE_THEME_COLOR || '#000000'
  const backgroundColor = process.env.NEXT_PUBLIC_SITE_BACKGROUND_COLOR || '#ffffff'
  
  // Check if custom icons directory exists and use those icons if available
  const iconPath = '/custom-icons'
  
  return {
    name: siteName,
    short_name: siteName.split(' ').slice(0, 2).join(' '),
    description: siteDescription,
    start_url: '/',
    display: 'standalone',
    background_color: backgroundColor,
    theme_color: themeColor,
    icons: [
      {
        src: `${iconPath}/icon-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: `${iconPath}/icon-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: `${iconPath}/icon-maskable-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: `${iconPath}/icon-maskable-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
    ],
  }
}
