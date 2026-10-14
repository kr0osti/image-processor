// Pure helpers for the client-side image pipeline in app/page.tsx.
// Kept free of DOM/canvas access so they can be unit tested.

export const OUTPUT_SIZE = 1500
// Padding applied on each side when the white-background layout is used
export const WHITE_BACKGROUND_PADDING = 150
// Share of sampled pixels that must be white for the image to count as white-background
export const WHITE_RATIO_THRESHOLD = 0.85
// Padding counts as significant when trimming it would remove at least this share of the width or height
export const PADDING_TRIM_THRESHOLD = 0.1
// Longest side used when scanning for the content bounds, to keep detection fast on large images
export const BOUNDS_SCAN_SIZE = 1000

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A pixel counts as white when all channels are above 240, or when it is mostly transparent.
 */
export const isWhitePixel = (r: number, g: number, b: number, a: number): boolean =>
  (r > 240 && g > 240 && b > 240) || a < 50

/**
 * Regions sampled for background detection: the four edges plus the central area.
 */
export const getSampleRegions = (width: number, height: number): Rect[] => {
  const sampleSize = Math.max(10, Math.floor(Math.min(width, height) * 0.05))

  return [
    // Edges
    { x: 0, y: 0, width, height: sampleSize }, // top
    { x: 0, y: height - sampleSize, width, height: sampleSize }, // bottom
    { x: 0, y: sampleSize, width: sampleSize, height: height - (2 * sampleSize) }, // left
    { x: width - sampleSize, y: sampleSize, width: sampleSize, height: height - (2 * sampleSize) }, // right

    // Sample from center area too
    { x: width * 0.25, y: height * 0.25, width: width * 0.5, height: height * 0.5 },
  ]
}

/**
 * Counts white pixels in RGBA image data, sampling every 4th pixel for performance.
 */
export const countWhitePixels = (data: ArrayLike<number>): { white: number; total: number } => {
  let white = 0
  let total = 0

  for (let i = 0; i < data.length; i += 16) {
    if (isWhitePixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
      white++
    }
    total++
  }

  return { white, total }
}

/**
 * Whether the sampled counts describe a predominantly white background.
 */
export const isWhiteBackground = (white: number, total: number, threshold: number = WHITE_RATIO_THRESHOLD): boolean =>
  total > 0 && white / total > threshold

/**
 * Uses the user's override when set, otherwise runs detection.
 */
export const resolveWhiteBackground = (override: boolean | undefined, detect: () => boolean): boolean =>
  override ?? detect()

/**
 * Bounding box of the non-white pixels in RGBA image data, or null if every pixel is white.
 */
export const findContentBounds = (data: ArrayLike<number>, width: number, height: number): Rect | null => {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (!isWhitePixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Maps bounds found on a downscaled copy back to the original image, rounding
 * outwards so no content is cut off, and clamping to the image edges.
 */
export const scaleBounds = (bounds: Rect, scale: number, maxWidth: number, maxHeight: number): Rect => {
  const x = Math.max(0, Math.floor(bounds.x * scale))
  const y = Math.max(0, Math.floor(bounds.y * scale))
  const right = Math.min(maxWidth, Math.ceil((bounds.x + bounds.width) * scale))
  const bottom = Math.min(maxHeight, Math.ceil((bounds.y + bounds.height) * scale))
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * Whether trimming to the content bounds would remove a significant white margin.
 */
export const hasSignificantPadding = (
  bounds: Rect | null,
  width: number,
  height: number,
  threshold: number = PADDING_TRIM_THRESHOLD,
): boolean =>
  bounds !== null && (bounds.width <= width * (1 - threshold) || bounds.height <= height * (1 - threshold))

/**
 * Where to draw an image of the given size on the square output canvas.
 *
 * White-background images are scaled into the padded area; other images fill
 * the full width (landscape), full height (portrait) or the whole canvas (square).
 */
export const computeDrawRect = (
  imageWidth: number,
  imageHeight: number,
  whiteBackground: boolean,
  size: number = OUTPUT_SIZE,
  padding: number = WHITE_BACKGROUND_PADDING,
): Rect => {
  if (whiteBackground) {
    const scale = (size - padding * 2) / Math.max(imageWidth, imageHeight)
    const width = imageWidth * scale
    const height = imageHeight * scale
    return { x: (size - width) / 2, y: (size - height) / 2, width, height }
  }

  if (imageWidth === imageHeight) {
    return { x: 0, y: 0, width: size, height: size }
  }

  if (imageWidth > imageHeight) {
    const height = (imageHeight * size) / imageWidth
    return { x: 0, y: (size - height) / 2, width: size, height }
  }

  const width = (imageWidth * size) / imageHeight
  return { x: (size - width) / 2, y: 0, width, height: size }
}

// Upscaling beyond this factor triggers the low-resolution warning (small margin for rounding)
export const UPSCALE_WARNING_THRESHOLD = 1.01

/**
 * How much the source is enlarged to fill its draw rect. Values above 1 mean the
 * source is smaller than its area on the output canvas and will look softer.
 */
export const getUpscaleFactor = (sourceWidth: number, sourceHeight: number, rect: Rect): number =>
  Math.max(rect.width / sourceWidth, rect.height / sourceHeight)

export const isUpscaled = (factor: number): boolean => factor > UPSCALE_WARNING_THRESHOLD
