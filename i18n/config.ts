// Supported UI languages. The active one is stored in a cookie (no locale prefix in URLs);
// on a first visit it is negotiated from the browser's Accept-Language header.

export const locales = ['en', 'fr', 'es', 'de'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

// Each language's name in that language, for the switcher
export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
}

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value)

/**
 * Best supported locale for an Accept-Language header, e.g. "fr-CH, fr;q=0.9, en;q=0.8" → "fr".
 * Only the primary language subtag is matched; unsupported or missing headers give the default.
 */
export const negotiateLocale = (acceptLanguage: string | null | undefined): Locale => {
  if (!acceptLanguage) return defaultLocale

  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      const quality = q ? Number(q.slice(2)) : 1
      return { language: tag.trim().toLowerCase().split('-')[0], quality: Number.isFinite(quality) ? quality : 0, index }
    })
    .filter(({ language, quality }) => language && quality > 0)
    // Higher quality first; equal quality keeps header order
    .sort((a, b) => b.quality - a.quality || a.index - b.index)

  return ranked.map(({ language }) => language).find(isLocale) ?? defaultLocale
}

/** Remembers the chosen language for a year (browser only) */
export const saveLocaleCookie = (locale: Locale): void => {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`
}
