/**
 * @jest-environment node
 */
import { detectImportKind, isSupportedImport, svgIntrinsicSize, vectorRenderSize, IMPORT_ACCEPT } from '@/lib/image-import'

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

  it('renders vectors with their longest side at output size', () => {
    expect(vectorRenderSize(24, 12)).toEqual({ width: 1500, height: 750 })
    expect(vectorRenderSize(50, 100)).toEqual({ width: 750, height: 1500 })
    expect(vectorRenderSize(0, 0)).toEqual({ width: 1500, height: 1500 })
  })
})
