// User-adjustable processing settings, persisted in a cookie so they survive
// reloads and can be read on the server when rendering the settings page.

import { OUTPUT_SIZE, WHITE_BACKGROUND_PADDING, WHITE_RATIO_THRESHOLD } from './image-layout'

export interface ProcessingSettings {
  // Padding in pixels on each side of the 1500px canvas for white-background images
  padding: number
  // Percentage of sampled pixels that must be white for the image to count as white-background
  whiteThreshold: number
  // PNG output quality, 1-100: 100 is lossless, lower values use fewer colours for smaller files
  pngQuality: number
}

export const SETTINGS_COOKIE = 'image-processor-settings'
const ONE_YEAR = 60 * 60 * 24 * 365

export const DEFAULT_SETTINGS: ProcessingSettings = {
  padding: WHITE_BACKGROUND_PADDING,
  whiteThreshold: Math.round(WHITE_RATIO_THRESHOLD * 100),
  pngQuality: 80,
}

export const SETTINGS_LIMITS = {
  // At 600px per side the content area is still 300px wide
  padding: { min: 0, max: 600, step: 10 },
  whiteThreshold: { min: 50, max: 99, step: 1 },
  pngQuality: { min: 1, max: 100, step: 1 },
} as const

const clamp = (value: unknown, { min, max }: { min: number; max: number }, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Settings with missing or invalid values replaced by defaults and the rest clamped into range */
export const sanitizeSettings = (data: unknown): ProcessingSettings => {
  const values = (data && typeof data === 'object' ? data : {}) as Partial<Record<keyof ProcessingSettings, unknown>>
  return {
    padding: clamp(values.padding, SETTINGS_LIMITS.padding, DEFAULT_SETTINGS.padding),
    whiteThreshold: clamp(values.whiteThreshold, SETTINGS_LIMITS.whiteThreshold, DEFAULT_SETTINGS.whiteThreshold),
    pngQuality: clamp(values.pngQuality, SETTINGS_LIMITS.pngQuality, DEFAULT_SETTINGS.pngQuality),
  }
}

/** Settings from a raw (URI-encoded JSON) cookie value; anything unreadable gives the defaults */
export const parseSettings = (raw: string | undefined | null): ProcessingSettings => {
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    return sanitizeSettings(JSON.parse(decodeURIComponent(raw)))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export const serializeSettings = (settings: ProcessingSettings): string =>
  encodeURIComponent(JSON.stringify(sanitizeSettings(settings)))

/** Value of one cookie in a `document.cookie`-style string */
export const getCookieValue = (cookieString: string, name: string): string | undefined =>
  cookieString
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)

/** Current settings in the browser (defaults during server rendering) */
export const readSettingsCookie = (): ProcessingSettings =>
  parseSettings(typeof document === 'undefined' ? undefined : getCookieValue(document.cookie, SETTINGS_COOKIE))

export const writeSettingsCookie = (settings: ProcessingSettings): void => {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${SETTINGS_COOKIE}=${serializeSettings(settings)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`
}

/** Side length of the area the image is scaled into, for a given padding */
export const contentSize = (padding: number): number => OUTPUT_SIZE - padding * 2
