import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata")
  return {
    // The site name is a brand set per deployment, so it isn't translated
    title: process.env.NEXT_PUBLIC_SITE_NAME || "Image Processor",
    description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION || t("description"),
    // Icons come from the file conventions: app/icon.svg, app/favicon.ico, app/apple-icon.png
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        {/* Passes the request's locale and messages on to client components */}
        <NextIntlClientProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <SiteHeader />
            {children}
            <Toaster />
            <DebugInfo />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
