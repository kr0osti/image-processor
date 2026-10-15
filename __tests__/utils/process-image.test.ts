/**
 * @jest-environment node
 */
import sharp from 'sharp'
import {
  InvalidParamError,
  UnsupportedImageError,
  parseProcessParams,
  processImageBuffer,
  type ProcessParams,
} from '@/lib/process-image'

const defaults = (overrides: Partial<ProcessParams> = {}): ProcessParams => ({
  padding: 150,
  whiteThreshold: 85,
  pngQuality: 80,
  whiteBackground: 'auto',
  trimPadding: false,
  ...overrides,
})

// A dark product centred on a large white margin
const productOnWhite = () =>
  sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 200, height: 200, channels: 3, background: '#1e3a8a' } }, left: 300, top: 300 }])
    .png()
    .toBuffer()

// A full-bleed photo-like image: a gradient with sensor-style noise, no white anywhere
const photo = (width = 1200, height = 800) => {
  const data = Buffer.alloc(width * height * 3)
  let seed = 11
  const noise = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed % 24) - 12
  }
  for (let i = 0; i < data.length; i += 3) {
    const x = (i / 3) % width
    const y = Math.floor(i / 3 / width)
    data[i] = Math.max(0, Math.min(255, (x * 220) / width + noise()))
    data[i + 1] = Math.max(0, Math.min(255, 60 + (y * 120) / height + noise()))
    data[i + 2] = Math.max(0, Math.min(255, 70 + noise()))
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

const brightness = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return (data[i] + data[i + 1] + data[i + 2]) / 3
}

describe('parseProcessParams', () => {
  const from = (values: Record<string, string>) => (name: string) => values[name]

  it('uses the settings-page defaults', () => {
    expect(parseProcessParams(from({}))).toEqual(defaults())
  })

  it('reads and clamps values like the settings cookie', () => {
    expect(parseProcessParams(from({ padding: '80', whiteThreshold: '70', pngQuality: '500', trimPadding: 'true', whiteBackground: 'off' })))
      .toEqual(defaults({ padding: 80, whiteThreshold: 70, pngQuality: 100, trimPadding: true, whiteBackground: 'off' }))
    expect(parseProcessParams(from({ whiteBackground: 'yes' })).whiteBackground).toBe('on')
  })

  it('rejects malformed values', () => {
    expect(() => parseProcessParams(from({ padding: 'wide' }))).toThrow(InvalidParamError)
    expect(() => parseProcessParams(from({ whiteBackground: 'maybe' }))).toThrow(InvalidParamError)
    expect(() => parseProcessParams(from({ trimPadding: 'sometimes' }))).toThrow(InvalidParamError)
  })
})

// Real image encoding: allow for slow CPUs
jest.setTimeout(30_000)

describe('processImageBuffer', () => {
  it('pads a product on white into the 1200 px content area of a 1500 px PNG', async () => {
    const result = await processImageBuffer(await productOnWhite(), defaults())
    const meta = await sharp(result.png).metadata()

    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1500, 1500])
    expect(result.whiteBackground).toBe(true)
    expect(result.hasWhitePadding).toBe(true)
    expect(await brightness(result.png, 10, 10)).toBeGreaterThan(240)
    expect(await brightness(result.png, 750, 750)).toBeLessThan(120)
  })

  it('trims the white margin when asked, enlarging the product', async () => {
    const result = await processImageBuffer(await productOnWhite(), defaults({ trimPadding: true }))
    expect(result.trimmed).toBe(true)
    expect([result.sourceWidth, result.sourceHeight]).toEqual([200, 200])
    // The 200 px product now fills the 1200 px content area: dark near its edge
    expect(await brightness(result.png, 200, 750)).toBeLessThan(120)
    expect(result.upscale).toBeCloseTo(6)
  })

  it('fills the width with a full-bleed photo', async () => {
    const result = await processImageBuffer(await photo(), defaults())
    expect(result.whiteBackground).toBe(false)
    // 1200x800 scaled to 1500 wide: 1000 tall, centred vertically
    expect(await brightness(result.png, 750, 100)).toBeGreaterThan(240)
    expect(await brightness(result.png, 750, 750)).toBeLessThan(200)
  })

  it('honours explicit padding and the white-background override', async () => {
    const result = await processImageBuffer(await photo(), defaults({ whiteBackground: 'on', padding: 300 }))
    expect(result.whiteBackground).toBe(true)
    expect(await brightness(result.png, 750, 290)).toBeGreaterThan(240)
  })

  it('makes smaller files at lower PNG quality', async () => {
    const input = await photo()
    const lossless = await processImageBuffer(input, defaults({ pngQuality: 100 }))
    const compressed = await processImageBuffer(input, defaults({ pngQuality: 30 }))
    expect(compressed.png.length).toBeLessThan(lossless.png.length * 0.7)
  })

  it('renders SVGs without their margins, never as low resolution', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="624" height="400" viewBox="-14 -30 165.1 105.8">' +
        '<path d="M10 10 L120 10 L100 50 L20 50 Z" fill="#1e3a8a"/></svg>',
    )
    const result = await processImageBuffer(svg, defaults())
    expect(result.vector).toBe(true)
    expect(result.whiteBackground).toBe(true)
    expect(result.upscale).toBe(1)
    // Cropped to the drawing: about 1500 px on its longest side before layout
    expect(Math.max(result.sourceWidth, result.sourceHeight)).toBeGreaterThan(1400)
  })

  it('rejects data that is not an image', async () => {
    await expect(processImageBuffer(Buffer.from('not an image'), defaults())).rejects.toThrow(UnsupportedImageError)
  })
})
