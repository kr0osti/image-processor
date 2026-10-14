// Renders the PNG icon set from the SVG masters in this folder.
// Usage: node scripts/icons/render.mjs <output-dir>
// Then combine favicon-16/32/48.png into app/favicon.ico, copy apple-icon.png into app/
// and icon-*.png into public/icons/. app/icon.svg is icon.svg itself.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const outDir = process.argv[2]
if (!outDir) {
  console.error('Usage: node scripts/icons/render.mjs <output-dir>')
  process.exit(1)
}

// [source SVG, size in px, output file]
const jobs = [
  ['icon.svg', 16, 'favicon-16.png'],
  ['icon.svg', 32, 'favicon-32.png'],
  ['icon.svg', 48, 'favicon-48.png'],
  ['icon.svg', 192, 'icon-192.png'],
  ['icon.svg', 512, 'icon-512.png'],
  // iOS rounds the corners itself and needs an opaque, full-bleed square
  ['icon-square.svg', 180, 'apple-icon.png'],
  // Glyph kept inside the 80% safe zone so launchers can crop to any shape
  ['icon-maskable.svg', 192, 'icon-maskable-192.png'],
  ['icon-maskable.svg', 512, 'icon-maskable-512.png'],
]

const browser = await chromium.launch()
for (const [src, size, out] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const svg = readFileSync(fileURLToPath(new URL(src, import.meta.url)), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
  await page.screenshot({
    path: join(outDir, out),
    omitBackground: src !== 'icon-square.svg',
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await page.close()
}
await browser.close()
console.log(`Rendered ${jobs.length} icons to ${outDir}`)
