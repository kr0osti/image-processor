/**
 * @jest-environment node
 */
import UPNG from 'upng-js'
import { encodeCompressedPng, paletteSizeForQuality, LOSSLESS_QUALITY } from '@/lib/png-compress'

describe('paletteSizeForQuality', () => {
  it('is lossless at 100 and shrinks the palette as quality drops', () => {
    expect(paletteSizeForQuality(LOSSLESS_QUALITY)).toBe(0)
    expect(paletteSizeForQuality(80)).toBe(205)
    expect(paletteSizeForQuality(50)).toBe(128)
    expect(paletteSizeForQuality(1)).toBe(3)
    expect(paletteSizeForQuality(99)).toBeLessThanOrEqual(256)
  })
})

describe('encodeCompressedPng', () => {
  // A 300x300 photo-like image: a gradient with sensor-style noise, so it has
  // many distinct colours and lossless PNG can't compress it away
  const gradient = () => {
    const width = 300
    const height = 300
    const data = new Uint8ClampedArray(width * height * 4)
    let seed = 42
    const noise = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return (seed % 24) - 12
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        data.set([(x * 255) / width + noise(), (y * 255) / height + noise(), 128 + noise(), 255], i)
      }
    }
    return { data, width, height, colorSpace: 'srgb' } as ImageData
  }

  const decode = async (blob: Blob) => UPNG.decode(await blob.arrayBuffer())

  it('produces a valid PNG of the same size', async () => {
    const png = await encodeCompressedPng(gradient(), 80)
    const bytes = new Uint8Array(await png.arrayBuffer())
    expect(png.type).toBe('image/png')
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const decoded = await decode(png)
    expect([decoded.width, decoded.height]).toEqual([300, 300])
  })

  it('makes smaller files at lower quality', async () => {
    const lossless = await encodeCompressedPng(gradient(), 100)
    const medium = await encodeCompressedPng(gradient(), 50)
    const low = await encodeCompressedPng(gradient(), 5)
    // Typical for photos: quantization alone saves well over half
    expect(medium.size).toBeLessThan(lossless.size * 0.6)
    expect(low.size).toBeLessThan(medium.size)
  })

  it('keeps every pixel at quality 100', async () => {
    const image = gradient()
    const decoded = await decode(await encodeCompressedPng(image, 100))
    expect(Buffer.from(UPNG.toRGBA8(decoded)[0]).equals(Buffer.from(image.data.buffer))).toBe(true)
  })
})
