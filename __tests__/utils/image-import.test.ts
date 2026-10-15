/**
 * @jest-environment node
 */
import {
  croppedViewBox,
  detectImportKind,
  isSupportedImport,
  svgIntrinsicSize,
  vectorRenderSize,
  visibleBounds,
  IMPORT_ACCEPT,
  VECTOR_RENDER_SIZE,
} from '@/lib/image-import'

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)])
const text = (value: string) => new TextEncoder().encode(value)

describe('detectImportKind', () => {
  it('recognises formats from their leading bytes, whatever the name or type', () => {
    expect(detectImportKind('scan.bin', '', text('%PDF-1.7\n'))).toBe('pdf')
    expect(detectImportKind('logo.ai', 'application/postscript', text('%PDF-1.5'))).toBe('pdf')
    expect(detectImportKind('a.tif', '', bytes(0x49, 0x49, 0x2a, 0x00))).toBe('tiff')
    expect(detectImportKind('a.tiff', '', bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe('tiff')
    expect(detectImportKind('IMG_1.HEIC', '', text('\0\0\0\x18ftypheic\0\0\0\0'))).toBe('heic')
    expect(detectImportKind('photo', '', text('\0\0\0\x18ftypmif1\0\0\0\0'))).toBe('heic')
    expect(detectImportKind('icon', 'text/plain', text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg">'))).toBe('svg')
    expect(detectImportKind('logo.svgz', '', bytes(0x1f, 0x8b, 0x08))).toBe('svg')
  })

  it('passes formats browsers decode natively through', () => {
    for (const [name, type] of [
      ['a.png', 'image/png'],
      ['a.jpg', 'image/jpeg'],
      ['a.jfif', ''],
      ['a.webp', 'image/webp'],
      ['a.avif', 'image/avif'],
      ['a.avif', ''],
      ['a.gif', 'image/gif'],
      ['a.bmp', 'image/bmp'],
      ['a.ico', 'image/x-icon'],
    ]) {
      expect([name, detectImportKind(name, type, bytes(0x00))]).toEqual([name, 'native'])
    }
  })

  it('rejects files that are not images', () => {
    expect(detectImportKind('notes.txt', 'text/plain', text('hello'))).toBeNull()
    expect(detectImportKind('archive.zip', 'application/zip', bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull()
  })
})

describe('isSupportedImport', () => {
  it('accepts image types and known extensions, even without a MIME type', () => {
    expect(isSupportedImport({ name: 'a.png', type: 'image/png' })).toBe(true)
    expect(isSupportedImport({ name: 'doc.pdf', type: 'application/pdf' })).toBe(true)
    expect(isSupportedImport({ name: 'logo.ai', type: '' })).toBe(true)
    expect(isSupportedImport({ name: 'IMG_1.heic', type: '' })).toBe(true)
    expect(isSupportedImport({ name: 'photo.jfif', type: '' })).toBe(true)
    expect(isSupportedImport({ name: 'photo.avif', type: '' })).toBe(true)
    expect(isSupportedImport({ name: 'notes.txt', type: 'text/plain' })).toBe(false)
  })

  it('matches the file picker accept list', () => {
    for (const ext of ['.svg', '.pdf', '.ai', '.heic', '.tiff', '.webp', '.jfif', '.avif']) {
      expect(IMPORT_ACCEPT.split(',')).toContain(ext)
    }
  })
})

describe('vector sizing', () => {
  const svg = (attributes: Record<string, string>) => ({
    getAttribute: (name: string) => attributes[name] ?? null,
  }) as unknown as Element

  it('reads width/height, falling back to the viewBox and keeping the aspect ratio', () => {
    expect(svgIntrinsicSize(svg({ width: '24', height: '12' }))).toEqual({ width: 24, height: 12 })
    expect(svgIntrinsicSize(svg({ viewBox: '0 0 100 50' }))).toEqual({ width: 100, height: 50 })
    expect(svgIntrinsicSize(svg({ width: '200', viewBox: '0 0 100 50' }))).toEqual({ width: 200, height: 100 })
    expect(svgIntrinsicSize(svg({ width: '100%', height: '100%', viewBox: '0,0,40,80' }))).toEqual({ width: 40, height: 80 })
    expect(svgIntrinsicSize(svg({}))).toEqual({ width: 0, height: 0 })
  })

  it('renders vectors with their longest side at the output size', () => {
    expect(VECTOR_RENDER_SIZE).toBe(1500)
    expect(vectorRenderSize(24, 12)).toEqual({ width: 1500, height: 750 })
    expect(vectorRenderSize(50, 100)).toEqual({ width: 750, height: 1500 })
    expect(vectorRenderSize(624, 400)).toEqual({ width: 1500, height: 962 })
    expect(vectorRenderSize(0, 0)).toEqual({ width: 1500, height: 1500 })
  })
})

describe('vector margin cropping', () => {
  // 10x10 RGBA image, transparent except for the given opaque pixels
  const image = (pixels: [number, number, [number, number, number, number]][]) => {
    const data = new Uint8ClampedArray(10 * 10 * 4)
    for (const [x, y, rgba] of pixels) data.set(rgba, (y * 10 + x) * 4)
    return data
  }

  it('finds the visible drawing, ignoring transparent and pure-white pixels', () => {
    const data = image([
      [3, 2, [0, 0, 0, 255]],
      [6, 7, [200, 30, 30, 255]],
      [0, 0, [255, 255, 255, 255]], // white background
      [9, 9, [0, 0, 0, 8]], // nearly transparent
    ])
    expect(visibleBounds(data, 10, 10, 0)).toEqual({ x: 3, y: 2, width: 4, height: 6 })
    expect(visibleBounds(data, 10, 10, 2)).toEqual({ x: 1, y: 0, width: 8, height: 10 })
  })

  it('returns null when nothing is visible', () => {
    expect(visibleBounds(image([[5, 5, [255, 255, 255, 255]]]), 10, 10)).toBeNull()
  })

  it('maps pixel bounds back to a viewBox', () => {
    // viewBox 0 0 100 50 rendered at 200x100: 2 px per unit
    expect(croppedViewBox([0, 0, 100, 50], 200, 100, { x: 20, y: 10, width: 100, height: 40 })).toEqual([10, 5, 50, 20])
    // Offset viewBox, like CAD exports
    expect(croppedViewBox([-14, -30, 160, 100], 320, 200, { x: 0, y: 0, width: 160, height: 100 })).toEqual([-14, -30, 80, 50])
  })

  it('accounts for letterboxing when the aspect ratios differ', () => {
    // viewBox 0 0 100 100 in a 200x100 render: scale 1, centred with 50 px on each side
    expect(croppedViewBox([0, 0, 100, 100], 200, 100, { x: 50, y: 0, width: 100, height: 100 })).toEqual([0, 0, 100, 100])
    // preserveAspectRatio="none" stretches each axis independently
    expect(croppedViewBox([0, 0, 100, 100], 200, 100, { x: 0, y: 0, width: 100, height: 50 }, 'none')).toEqual([0, 0, 50, 50])
  })
})

