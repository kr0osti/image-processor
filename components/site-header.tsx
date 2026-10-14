'use client'

import * as React from 'react'
import Link from "next/link"
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { Monitor, Moon, Settings, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/language-switcher'

const THEMES = ['system', 'light', 'dark'] as const
const ICONS = { system: Monitor, light: Sun, dark: Moon }

function ThemeToggle() {
  const t = useTranslations('Header.theme')
  const { theme, setTheme } = useTheme()
  // next-themes only knows the theme after hydration: false on the server, true on the client
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const current = (mounted && THEMES.includes(theme as (typeof THEMES)[number]) ? theme : 'system') as (typeof THEMES)[number]
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]
  const Icon = ICONS[current]

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-full"
      onClick={() => setTheme(next)}
      aria-label={t('label', { current: t(current), next: t(next) })}
      title={t('label', { current: t(current), next: t(next) })}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export function SiteHeader() {
  const t = useTranslations('Header')
  const name = process.env.NEXT_PUBLIC_SITE_NAME || 'Image Processor'

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-sm shadow-primary/30"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M4 15l4-4 4 4 3-3 5 5" />
              <circle cx="15" cy="9" r="1.25" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="text-sm">{name}</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-full px-3">
            <Link href="/settings">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">{t('settings')}</span>
              <span className="sr-only sm:hidden">{t('settings')}</span>
            </Link>
          </Button>
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
