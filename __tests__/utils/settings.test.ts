/**
 * @jest-environment node
 */
import {
  DEFAULT_SETTINGS,
  SETTINGS_COOKIE,
  contentSize,
  getCookieValue,
  parseSettings,
  sanitizeSettings,
  serializeSettings,
} from '@/lib/settings'

describe('parseSettings', () => {
  it('returns the defaults when there is no cookie', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips serialized settings', () => {
    const settings = { padding: 120, whiteThreshold: 70 }
    expect(parseSettings(serializeSettings(settings))).toEqual(settings)
  })

  it('falls back to the defaults for malformed values', () => {
    expect(parseSettings('not-json')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(encodeURIComponent('"a string"'))).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('%E0%A4%A')).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid fields when others are invalid', () => {
    expect(parseSettings(encodeURIComponent(JSON.stringify({ padding: 50, whiteThreshold: 'x' })))).toEqual({
      padding: 50,
      whiteThreshold: DEFAULT_SETTINGS.whiteThreshold,
    })
  })
})

describe('sanitizeSettings', () => {
  it('clamps values into the supported range', () => {
    expect(sanitizeSettings({ padding: -20, whiteThreshold: 200 })).toEqual({ padding: 0, whiteThreshold: 99 })
    expect(sanitizeSettings({ padding: 5000, whiteThreshold: 10 })).toEqual({ padding: 600, whiteThreshold: 50 })
  })

  it('rounds to whole numbers', () => {
    expect(sanitizeSettings({ padding: 120.6, whiteThreshold: 84.4 })).toEqual({ padding: 121, whiteThreshold: 84 })
  })
})

describe('getCookieValue', () => {
  it('finds the settings cookie among others', () => {
    const value = serializeSettings({ padding: 200, whiteThreshold: 90 })
    expect(getCookieValue(`theme=dark; ${SETTINGS_COOKIE}=${value}; other=1`, SETTINGS_COOKIE)).toBe(value)
  })

  it('does not match a cookie whose name only starts the same', () => {
    expect(getCookieValue(`${SETTINGS_COOKIE}-old=1`, SETTINGS_COOKIE)).toBeUndefined()
  })
})

describe('contentSize', () => {
  it('is the canvas minus the padding on both sides', () => {
    expect(contentSize(300)).toBe(900)
    expect(contentSize(0)).toBe(1500)
  })
})
