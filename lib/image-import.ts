// Turns any supported upload into a Blob that an <img> element can load.
// Formats browsers decode natively are passed through; SVG, PDF/AI, HEIC and
// TIFF are rendered to PNG first. Decoders are loaded only when needed.

import { OUTPUT_SIZE } from './image-layout'

export type ImportKind = 'native' | 'svg' | 'pdf' | 'heic' | 'tiff'

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
export const vectorRenderSize = (width: number, height: number, target: number = OUTPUT_SIZE) => {
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

async function svgToPng(file: Blob, head: Uint8Array): Promise<Blob> {
  const doc = new DOMParser().parseFromString(await svgText(file, head), 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid SVG')
  }

  // Give the SVG explicit pixel dimensions at output size so it renders crisply;
  // a viewBox keeps the drawing scaled to those dimensions instead of cropped
  const intrinsic = svgIntrinsicSize(svg)
  const { width, height } = vectorRenderSize(intrinsic.width, intrinsic.height)
  if (!svg.getAttribute('viewBox') && intrinsic.width && intrinsic.height) {
    svg.setAttribute('viewBox', `0 0 ${intrinsic.width} ${intrinsic.height}`)
  }
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))

  // Loaded through <img>, so scripts and external resources in the SVG never run
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
    return await canvasToPng(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function pdfToPng(file: Blob): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await task.promise
    // First page only, rendered so its longest side is the output size
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: OUTPUT_SIZE / Math.max(base.width, base.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    return await canvasToPng(canvas)
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
 * Returns a Blob the browser can display for the given upload: the file
 * itself for native formats, otherwise a PNG rendering of it.
 *
 * @throws Error if the format is unsupported or the file can't be decoded
 */
export async function toLoadableBlob(file: File): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const kind = detectImportKind(file.name, file.type, head)

  switch (kind) {
    case 'native':
      return file
    case 'svg':
      return svgToPng(file, head)
    case 'pdf':
      return pdfToPng(file)
    case 'heic':
      return heicToPng(file)
    case 'tiff':
      return tiffToPng(file)
    default:
      throw new Error(`Unsupported file type: ${file.type || file.name}`)
  }
}
