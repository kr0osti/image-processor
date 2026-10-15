// Server-side version of the browser pipeline in app/page.tsx, used by
// POST /api/process: decode with sharp, apply the same layout rules from
// lib/image-layout.ts, and encode a compressed 1500x1500 PNG.

import sharp, { type Metadata, type Sharp } from 'sharp'
import {
  BOUNDS_SCAN_SIZE,
  OUTPUT_SIZE,
  computeDrawRect,
  countWhitePixels,
  findContentBounds,
  getSampleRegions,
  getUpscaleFactor,
  hasSignificantPadding,
  isWhiteBackground,
  scaleBounds,
  type Rect,
} from './image-layout'
import { DEFAULT_SETTINGS, sanitizeSettings, type ProcessingSettings } from './settings'
import { LOSSLESS_QUALITY, paletteSizeForQuality } from './png-compress'
import { VECTOR_RENDER_SIZE, visibleBounds } from './image-import'

export type WhiteBackgroundMode = 'auto' | 'on' | 'off'

export interface ProcessParams extends ProcessingSettings {
  whiteBackground: WhiteBackgroundMode
  trimPadding: boolean
}

export interface ProcessResult {
  png: Buffer
  whiteBackground: boolean
  hasWhitePadding: boolean
  trimmed: boolean
  vector: boolean
  sourceWidth: number
  sourceHeight: number
  upscale: number
}

/** Input the server can't decode (HEIC and PDF need the browser UI) */
export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedImageError'
  }
}

/** Invalid request parameter, reported to the caller as a 400 */
export class InvalidParamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidParamError'
  }
}

// Decoding limit: about 100 megapixels, far beyond any product photo
const MAX_INPUT_PIXELS = 100_000_000
// Largest intermediate render when cropping a vector's margins (about 160 MB of RGBA)
const MAX_VECTOR_RENDER_PIXELS = 40_000_000

const TRUE = new Set(['1', 'true', 'yes', 'on'])
const FALSE = new Set(['0', 'false', 'no', 'off'])

/**
 * Processing parameters from request values (form fields or query string).
 * Missing values use the same defaults as the settings page; numbers are
 * clamped into range like the settings cookie; invalid flags are rejected.
 */
export function parseProcessParams(get: (name: string) => string | null | undefined): ProcessParams {
  const number = (name: keyof ProcessingSettings) => {
    const raw = get(name)
    if (raw == null || raw === '') return undefined
    const value = Number(raw)
    if (!Number.isFinite(value)) throw new InvalidParamError(`"${name}" must be a number`)
    return value
  }

  const settings = sanitizeSettings({
    padding: number('padding') ?? DEFAULT_SETTINGS.padding,
    whiteThreshold: number('whiteThreshold') ?? DEFAULT_SETTINGS.whiteThreshold,
    pngQuality: number('pngQuality') ?? DEFAULT_SETTINGS.pngQuality,
  })

  const background = (get('whiteBackground') ?? 'auto').toLowerCase()
  let whiteBackground: WhiteBackgroundMode
  if (background === 'auto') whiteBackground = 'auto'
  else if (TRUE.has(background)) whiteBackground = 'on'
  else if (FALSE.has(background)) whiteBackground = 'off'
  else throw new InvalidParamError('"whiteBackground" must be auto, on or off')

  const trim = (get('trimPadding') ?? 'false').toLowerCase()
  if (!TRUE.has(trim) && !FALSE.has(trim)) throw new InvalidParamError('"trimPadding" must be true or false')

  return { ...settings, whiteBackground, trimPadding: TRUE.has(trim) }
}

interface Raw {
  data: Buffer
  width: number
  height: number
}

const toRaw = async (image: Sharp): Promise<Raw> => {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Copies a rectangle of RGBA pixels out of a raw image */
const crop = ({ data, width }: Raw, region: Rect): Uint8Array => {
  const x = Math.max(0, Math.floor(region.x))
  const y = Math.max(0, Math.floor(region.y))
  const w = Math.max(0, Math.floor(region.width))
  const h = Math.max(0, Math.floor(region.height))
  const out = new Uint8Array(w * h * 4)
  for (let row = 0; row < h; row++) {
    const start = ((y + row) * width + x) * 4
    out.set(data.subarray(start, start + w * 4), row * w * 4)
  }
  return out
}

/** Same sampling as detectWhiteBorder in the browser: edges plus the centre */
const detectWhiteBackground = (raw: Raw, threshold: number): boolean => {
  let white = 0
  let total = 0
  for (const region of getSampleRegions(raw.width, raw.height)) {
    const counts = countWhitePixels(crop(raw, region))
    white += counts.white
    total += counts.total
  }
  return isWhiteBackground(white, total, threshold)
}

const fromRaw = (raw: Raw) => sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } })

/** Same as detectContentBounds in the browser: scanned on a downscaled copy for speed */
const detectContentBounds = async (raw: Raw): Promise<Rect | null> => {
  const scale = Math.min(1, BOUNDS_SCAN_SIZE / Math.max(raw.width, raw.height))
  const small = scale < 1
    ? await toRaw(fromRaw(raw).resize(Math.max(1, Math.round(raw.width * scale)), Math.max(1, Math.round(raw.height * scale)), { fit: 'fill' }))
    : raw
  const bounds = findContentBounds(small.data, small.width, small.height)
  return bounds && scaleBounds(bounds, raw.width / small.width, raw.width, raw.height)
}

/**
 * Rasterizes an SVG like the browser does: rendered so the drawing (not its
 * empty margins) has its longest side at VECTOR_RENDER_SIZE.
 */
async function renderSvg(input: Buffer): Promise<Raw> {
  const meta = await sharp(input).metadata()
  const baseDensity = meta.density || 72
  const longest = Math.max(meta.width || 0, meta.height || 0) || VECTOR_RENDER_SIZE
  const density = (baseDensity * VECTOR_RENDER_SIZE) / longest
  const first = await toRaw(sharp(input, { density, limitInputPixels: MAX_INPUT_PIXELS }))

  const bounds = visibleBounds(first.data, first.width, first.height)
  if (!bounds || (bounds.width >= first.width - 1 && bounds.height >= first.height - 1)) return first

  // Second pass: render the whole SVG larger so the drawing alone reaches VECTOR_RENDER_SIZE,
  // then cut it out. sharp can't crop the viewBox like the browser does, so the enlarged
  // render is capped; beyond the cap the drawing is enlarged from the first pass instead.
  const zoom = Math.min(
    VECTOR_RENDER_SIZE / Math.max(bounds.width, bounds.height),
    Math.sqrt(MAX_VECTOR_RENDER_PIXELS / (first.width * first.height)),
  )
  const second = zoom > 1 ? await toRaw(sharp(input, { density: density * zoom, limitInputPixels: MAX_INPUT_PIXELS })) : first
  const scale = second.width / first.width
  const left = Math.min(second.width - 1, Math.round(bounds.x * scale))
  const top = Math.min(second.height - 1, Math.round(bounds.y * scale))
  return toRaw(
    fromRaw(second).extract({
      left,
      top,
      width: Math.max(1, Math.min(second.width - left, Math.round(bounds.width * scale))),
      height: Math.max(1, Math.min(second.height - top, Math.round(bounds.height * scale))),
    }),
  )
}

/**
 * Processes one image into a compressed 1500x1500 PNG.
 *
 * @throws UnsupportedImageError if the input can't be decoded on the server
 */
export async function processImageBuffer(input: Buffer, params: ProcessParams): Promise<ProcessResult> {
  let meta: Metadata
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  } catch {
    throw new UnsupportedImageError(
      'Unsupported or damaged image. The API accepts PNG, JPEG, WebP, AVIF, GIF, TIFF and SVG; HEIC and PDF work in the web UI only.',
    )
  }
  if (meta.format === 'pdf' || (meta.format === 'heif' && meta.compression !== 'av1')) {
    throw new UnsupportedImageError('HEIC and PDF files can only be processed in the web UI.')
  }

  const vector = meta.format === 'svg'
  // First frame only for animations; EXIF orientation applied like browsers do
  const raw = vector
    ? await renderSvg(input)
    : await toRaw(sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false }).rotate())

  // Vectors default to the padded layout, as in the browser
  const whiteBackground =
    params.whiteBackground === 'on' ||
    (params.whiteBackground === 'auto' && (vector || detectWhiteBackground(raw, params.whiteThreshold / 100)))

  const contentBounds = await detectContentBounds(raw)
  const hasWhitePadding = !vector && hasSignificantPadding(contentBounds, raw.width, raw.height)
  const trimmed = params.trimPadding && !vector && contentBounds !== null
  const source: Rect = trimmed && contentBounds ? contentBounds : { x: 0, y: 0, width: raw.width, height: raw.height }

  const rect = computeDrawRect(source.width, source.height, whiteBackground, OUTPUT_SIZE, params.padding)
  const drawWidth = Math.max(1, Math.round(rect.width))
  const drawHeight = Math.max(1, Math.round(rect.height))

  // Source region scaled to its place (kept as raw pixels: an intermediate PNG
  // would cost a full encode), then flattened onto white like the browser canvas
  const placed = await fromRaw(raw)
    .extract({ left: source.x, top: source.y, width: source.width, height: source.height })
    .resize(drawWidth, drawHeight, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer()

  const canvas = sharp({
    create: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 3, background: '#ffffff' },
  }).composite([
    { input: placed, raw: { width: drawWidth, height: drawHeight, channels: 4 }, left: Math.round(rect.x), top: Math.round(rect.y) },
  ])

  // Note: sharp's "effort" option turns palette mode on, so the lossless path must not set it
  const png = params.pngQuality >= LOSSLESS_QUALITY
    ? await canvas.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
    : await canvas
        .png({ palette: true, colours: paletteSizeForQuality(params.pngQuality), quality: params.pngQuality, dither: 1, effort: 4 })
        .toBuffer()

  return {
    png,
    whiteBackground,
    hasWhitePadding,
    trimmed,
    vector,
    sourceWidth: source.width,
    sourceHeight: source.height,
    upscale: vector ? 1 : getUpscaleFactor(source.width, source.height, rect),
  }
}
