// Turns any supported upload into a Blob that an <img> element can load.
// Formats browsers decode natively are passed through; SVG, PDF/AI, HEIC and
// TIFF are rendered to PNG first. Decoders are loaded only when needed.

import { OUTPUT_SIZE } from './image-layout'

export type ImportKind = 'native' | 'svg' | 'pdf' | 'heic' | 'tiff'

// Vectors are rasterized with their longest side at the output size, the
// largest they are ever drawn (vector sources skip the low-resolution warning)
export const VECTOR_RENDER_SIZE = OUTPUT_SIZE

export interface LoadedImport {
  blob: Blob
  // Rendered from a vector (SVG, PDF, AI): it has no fixed resolution, so it is never "low resolution"
  vector: boolean
}

// Value for the file input's accept attribute
export const IMPORT_ACCEPT = [
  'image/*',
  '.svg', '.svgz', '.pdf', '.ai',
  '.heic', '.heif', '.tif', '.tiff',
  '.avif', '.bmp', '.ico', '.jfif', '.webp', '.gif',
].join(',')

const EXTENSION_KINDS: Record<string, ImportKind> = {
  svg: 'svg',
  svgz: 'svg',
  pdf: 'pdf',
  ai: 'pdf', // Illustrator files embed a PDF
  heic: 'heic',
  heif: 'heic',
  tif: 'tiff',
  tiff: 'tiff',
}

const NATIVE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'cur', 'apng'])

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/**
 * Whether a file looks importable from its MIME type or extension. Used to
 * filter drag-and-drop; the content is checked again when it is converted.
 */
export const isSupportedImport = (file: { name: string; type: string }): boolean =>
  file.type.startsWith('image/') ||
  file.type === 'application/pdf' ||
  file.type === 'application/postscript' ||
  extensionOf(file.name) in EXTENSION_KINDS ||
  NATIVE_EXTENSIONS.has(extensionOf(file.name))

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte)

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end))

/**
 * Decides how to decode a file, preferring its leading bytes over the
 * (often missing or wrong) MIME type and extension.
 */
export const detectImportKind = (name: string, type: string, head: Uint8Array): ImportKind | null => {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf' // %PDF
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff'
  if (ascii(head, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(head, 8, 12))) return 'heic'

  if (startsWith(head, [0x1f, 0x8b]) && extensionOf(name) === 'svgz') return 'svg'
  // Text-based SVG: look for an <svg element near the start
  if (type === 'image/svg+xml' || /<svg[\s>]/i.test(new TextDecoder().decode(head))) return 'svg'

  const byExtension = EXTENSION_KINDS[extensionOf(name)]
  if (byExtension && byExtension !== 'svg') return byExtension
  if (type.startsWith('image/') || NATIVE_EXTENSIONS.has(extensionOf(name))) return 'native'
  return null
}

/**
 * Size to rasterize a vector at: its longest side becomes `target`, so vectors
 * are never upscaled from a small intrinsic size.
 */
export const vectorRenderSize = (width: number, height: number, target: number = VECTOR_RENDER_SIZE) => {
  const w = width > 0 ? width : target
  const h = height > 0 ? height : target
  const scale = target / Math.max(w, h)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/**
 * Intrinsic size of an SVG from its width/height attributes or viewBox.
 * Percentages and missing values give 0, meaning "unknown".
 */
export const svgIntrinsicSize = (svg: Element): { width: number; height: number } => {
  const length = (value: string | null) => (value && !value.trim().endsWith('%') ? parseFloat(value) || 0 : 0)
  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  const [vbWidth, vbHeight] = viewBox.length === 4 && viewBox.every(Number.isFinite) ? [viewBox[2], viewBox[3]] : [0, 0]
  let width = length(svg.getAttribute('width'))
  let height = length(svg.getAttribute('height'))
  // Keep the aspect ratio when only one dimension is given
  if (!width && height && vbWidth && vbHeight) width = (height * vbWidth) / vbHeight
  if (!height && width && vbWidth && vbHeight) height = (width * vbHeight) / vbWidth
  return { width: width || vbWidth, height: height || vbHeight }
}

const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode PNG'))), 'image/png'),
  )

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })

// .svgz files are gzip-compressed SVG
const svgText = async (file: Blob, head: Uint8Array): Promise<string> =>
  startsWith(head, [0x1f, 0x8b])
    ? new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : file.text()

// --- Vector margin cropping -------------------------------------------------
// Vectors are rendered twice: once to find where the drawing is, then again with
// the view cropped to it, so the drawing itself (not its empty margins) fills
// VECTOR_RENDER_SIZE and is never enlarged later.

export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Bounding box of the visible drawing in RGBA pixels: anything that is not
 * transparent or pure white, padded by `margin` pixels and clamped to the image.
 * Returns null when there is nothing visible.
 */
export const visibleBounds = (data: ArrayLike<number>, width: number, height: number, margin = 2): PixelBounds | null => {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const visible = data[i + 3] >= 16 && !(data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250)
      if (visible) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const x = Math.max(0, minX - margin)
  const y = Math.max(0, minY - margin)
  return { x, y, width: Math.min(width, maxX + 1 + margin) - x, height: Math.min(height, maxY + 1 + margin) - y }
}

/** Whether cropping to the bounds removes anything worth a second render */
const worthCropping = (bounds: PixelBounds | null, width: number, height: number): bounds is PixelBounds =>
  bounds !== null && (bounds.width < width - 1 || bounds.height < height - 1)

/**
 * The viewBox showing only `bounds` (pixels of an SVG rendered at width x height
 * with the given viewBox and preserveAspectRatio).
 */
export const croppedViewBox = (
  viewBox: [number, number, number, number],
  width: number,
  height: number,
  bounds: PixelBounds,
  preserveAspectRatio = 'xMidYMid meet',
): [number, number, number, number] => {
  const [vbX, vbY, vbW, vbH] = viewBox
  let scaleX = width / vbW
  let scaleY = height / vbH
  let offsetX = 0
  let offsetY = 0
  if (!preserveAspectRatio.trim().startsWith('none')) {
    // Uniform scale, centred (other alignments are rare and treated as centred)
    const scale = preserveAspectRatio.includes('slice') ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)
    scaleX = scale
    scaleY = scale
    offsetX = (width - vbW * scale) / 2
    offsetY = (height - vbH * scale) / 2
  }
  return [
    vbX + (bounds.x - offsetX) / scaleX,
    vbY + (bounds.y - offsetY) / scaleY,
    bounds.width / scaleX,
    bounds.height / scaleY,
  ]
}

const contentOf = (canvas: HTMLCanvasElement): PixelBounds | null =>
  visibleBounds(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)

async function renderSvg(svg: Element, width: number, height: number): Promise<HTMLCanvasElement> {
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  // Loaded through <img>, so scripts and external resources in the SVG never run
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, width, height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * SVG markup with scripts, event handlers, foreignObject and other non-SVG
 * content removed. Rendering through <img> already keeps scripts from running;
 * this keeps the markup safe wherever it is handled.
 */
export async function sanitizeSvg(markup: string): Promise<string> {
  const { default: DOMPurify } = await import('dompurify')
  return DOMPurify.sanitize(markup, { USE_PROFILES: { svg: true, svgFilters: true } })
}

async function svgToPng(file: Blob, head: Uint8Array): Promise<Blob> {
  const doc = new DOMParser().parseFromString(await sanitizeSvg(await svgText(file, head)), 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid SVG')
  }

  // A viewBox keeps the drawing scaled to the render size instead of cropped
  const intrinsic = svgIntrinsicSize(svg)
  if (!svg.getAttribute('viewBox') && intrinsic.width && intrinsic.height) {
    svg.setAttribute('viewBox', `0 0 ${intrinsic.width} ${intrinsic.height}`)
  }
  const { width, height } = vectorRenderSize(intrinsic.width, intrinsic.height)
  const first = await renderSvg(svg, width, height)

  // Second pass: crop the viewBox to the drawing and render it at full size
  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  const bounds = contentOf(first)
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || !worthCropping(bounds, width, height)) {
    return canvasToPng(first)
  }
  const cropped = croppedViewBox(
    viewBox as [number, number, number, number],
    width,
    height,
    bounds,
    svg.getAttribute('preserveAspectRatio') || undefined,
  )
  svg.setAttribute('viewBox', cropped.join(' '))
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  const size = vectorRenderSize(bounds.width, bounds.height)
  return canvasToPng(await renderSvg(svg, size.width, size.height))
}

async function pdfToPng(file: Blob): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await task.promise
    // First page only
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const render = async (scale: number, width: number, height: number, offsetX = 0, offsetY = 0) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const viewport = page.getViewport({ scale, offsetX, offsetY })
      await page.render({ canvas, viewport }).promise
      return canvas
    }

    // First pass: whole page with its longest side at VECTOR_RENDER_SIZE
    const scale = VECTOR_RENDER_SIZE / Math.max(base.width, base.height)
    const width = Math.round(base.width * scale)
    const height = Math.round(base.height * scale)
    const first = await render(scale, width, height)

    // Second pass: shift and scale the page so the drawing fills the render
    const bounds = contentOf(first)
    if (!worthCropping(bounds, width, height)) return await canvasToPng(first)
    const zoom = VECTOR_RENDER_SIZE / Math.max(bounds.width, bounds.height)
    return await canvasToPng(
      await render(
        scale * zoom,
        Math.round(bounds.width * zoom),
        Math.round(bounds.height * zoom),
        -bounds.x * zoom,
        -bounds.y * zoom,
      ),
    )
  } finally {
    await task.destroy()
  }
}

async function heicToPng(file: Blob): Promise<Blob> {
  const { default: heic2any } = await import('heic2any')
  const result = await heic2any({ blob: file, toType: 'image/png' })
  return Array.isArray(result) ? result[0] : result
}

async function tiffToPng(file: Blob): Promise<Blob> {
  const { default: UTIF } = await import('utif')
  const buffer = await file.arrayBuffer()
  const [ifd] = UTIF.decode(buffer)
  if (!ifd) throw new Error('Empty TIFF')
  UTIF.decodeImage(buffer, ifd)
  const rgba = UTIF.toRGBA8(ifd)

  const canvas = document.createElement('canvas')
  canvas.width = ifd.width
  canvas.height = ifd.height
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height), 0, 0)
  return await canvasToPng(canvas)
}

/**
 * Returns something the browser can display for the given upload: the file
 * itself for native formats, otherwise a PNG rendering of it.
 *
 * @throws Error if the format is unsupported or the file can't be decoded
 */
export async function toLoadableBlob(file: File): Promise<LoadedImport> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const kind = detectImportKind(file.name, file.type, head)

  switch (kind) {
    case 'native':
      return { blob: file, vector: false }
    case 'svg':
      return { blob: await svgToPng(file, head), vector: true }
    case 'pdf':
      return { blob: await pdfToPng(file), vector: true }
    case 'heic':
      return { blob: await heicToPng(file), vector: false }
    case 'tiff':
      return { blob: await tiffToPng(file), vector: false }
    default:
      throw new Error(`Unsupported file type: ${file.type || file.name}`)
  }
}
