/**
 * @jest-environment node
 */
import { defaultLocale, isLocale, locales, negotiateLocale } from '@/i18n/config'
import en from '@/messages/en.json'
import fr from '@/messages/fr.json'
import es from '@/messages/es.json'
import de from '@/messages/de.json'

type Messages = { [key: string]: string | Messages }

// Every leaf key path, e.g. "Home.tabs.upload"
const keyPaths = (messages: Messages, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keyPaths(value, `${prefix}${key}.`),
  )

const valueAt = (messages: Messages, path: string): string =>
  path.split('.').reduce<string | Messages>((node, key) => (node as Messages)[key], messages) as string

// ICU arguments ({count}, {index}) and rich-text tags (<mono>) a translation must keep
const placeholders = (message: string): string[] =>
  [...message.matchAll(/\{(\w+)[,}]|<(\w+)>/g)].map((m) => m[1] ?? `<${m[2]}>`).sort()

describe('negotiateLocale', () => {
  it('picks the best supported language from Accept-Language', () => {
    expect(negotiateLocale('fr-CH, fr;q=0.9, en;q=0.8')).toBe('fr')
    expect(negotiateLocale('de-DE,de;q=0.9')).toBe('de')
    expect(negotiateLocale('es-419')).toBe('es')
  })

  it('respects quality values over header order', () => {
    expect(negotiateLocale('en;q=0.5, es;q=0.9')).toBe('es')
  })

  it('skips unsupported languages', () => {
    expect(negotiateLocale('ja, it;q=0.9, de;q=0.8')).toBe('de')
  })

  it('falls back to the default locale', () => {
    expect(negotiateLocale(undefined)).toBe(defaultLocale)
    expect(negotiateLocale('')).toBe(defaultLocale)
    expect(negotiateLocale('ja, zh')).toBe(defaultLocale)
    expect(negotiateLocale('fr;q=0')).toBe(defaultLocale)
  })
})

describe('isLocale', () => {
  it('accepts supported locales only', () => {
    expect(locales.every(isLocale)).toBe(true)
    expect(isLocale('it')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})

describe('message catalogs', () => {
  const english = keyPaths(en)
  const catalogs: Record<string, Messages> = { fr, es, de }

  it('has a catalog for every supported locale', () => {
    expect(Object.keys(catalogs).sort()).toEqual(locales.filter((l) => l !== 'en').sort())
  })

  it.each(Object.keys(catalogs))('%s has exactly the English keys', (locale) => {
    expect(keyPaths(catalogs[locale]).sort()).toEqual([...english].sort())
  })

  it.each(Object.keys(catalogs))('%s keeps every placeholder and tag', (locale) => {
    for (const path of english) {
      expect([path, placeholders(valueAt(catalogs[locale], path))]).toEqual([path, placeholders(valueAt(en, path))])
    }
  })
})
