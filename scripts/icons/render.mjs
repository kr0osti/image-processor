// Renders the app icons from the SVG masters in this folder and writes them
// where Next.js and the web manifest expect them:
//   app/icon.svg, app/favicon.ico (16/32/48), app/apple-icon.png, public/icons/*.png
// Usage: node scripts/icons/render.mjs   (needs Chromium: pnpm exec playwright install chromium)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const svg = (name) => readFileSync(join(here, name), 'utf8')

// [source SVG, size in px, output path relative to the repo root]
const pngs = [
  ['icon.svg', 192, 'public/icons/icon-192.png'],
  ['icon.svg', 512, 'public/icons/icon-512.png'],
  // iOS rounds the corners itself and needs an opaque, full-bleed square
  ['icon-square.svg', 180, 'app/apple-icon.png'],
  // Glyph kept inside the 80% safe zone so launchers can crop to any shape
  ['icon-maskable.svg', 192, 'public/icons/icon-maskable-192.png'],
  ['icon-maskable.svg', 512, 'public/icons/icon-maskable-512.png'],
]
const faviconSizes = [16, 32, 48]

const browser = await chromium.launch()
const render = async (name, size) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(name).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  )
  const png = await page.screenshot({
    omitBackground: name !== 'icon-square.svg',
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await page.close()
  return png
}

mkdirSync(join(root, 'public/icons'), { recursive: true })
for (const [name, size, out] of pngs) {
  writeFileSync(join(root, out), await render(name, size))
}

// favicon.ico holding PNG-encoded 16/32/48 images (supported by all current browsers)
const images = []
for (const size of faviconSizes) images.push({ size, png: await render('icon.svg', size) })
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(images.length, 4)
let offset = 6 + 16 * images.length
const entries = images.map(({ size, png }) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size, 0) // width
  entry.writeUInt8(size, 1) // height
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += png.length
  return entry
})
writeFileSync(join(root, 'app/favicon.ico'), Buffer.concat([header, ...entries, ...images.map((i) => i.png)]))

copyFileSync(join(here, 'icon.svg'), join(root, 'app/icon.svg'))
await browser.close()
console.log(`Wrote ${pngs.length} PNGs, app/favicon.ico and app/icon.svg`)
