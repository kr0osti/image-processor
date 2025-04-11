import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { DebugInfo } from "@/components/debug-info"

const inter = Inter({ subsets: ["latin"] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: process.env.NEXT_PUBLIC_SITE_THEME_COLOR || '#000000',
}

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SITE_NAME || "Image Processor",
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "Download and process images from URLs",
  generator: 'v0.dev',
  icons: {
    icon: [
      { url: '/custom-icons/favicon.ico', sizes: 'any' },
      { url: '/custom-icons/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/custom-icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/custom-icons/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/custom-icons/safari-pinned-tab.svg',
        color: process.env.NEXT_PUBLIC_SITE_THEME_COLOR || '#000000',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <DebugInfo />
        </ThemeProvider>
      </body>
    </html>
  )
}


import './globals.css'
