import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { DebugInfo } from "@/components/debug-info"
import { SiteHeader } from "@/components/site-header"
import { Toaster } from "@/components/toaster"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SiteHeader />
          {children}
          <Toaster />
          <DebugInfo />
        </ThemeProvider>
      </body>
    </html>
  )
}
