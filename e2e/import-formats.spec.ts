import path from 'path';
import { test, expect, type Page } from '@playwright/test';

const fixture = (name: string) => path.join(__dirname, 'fixtures', 'import', name);

// Brightness (0-255) of points in the processed image, measured on the PNG the server stores
async function brightnessAt(page: Page, src: string, points: [number, number][]): Promise<number[]> {
  return page.evaluate(async ({ src, points }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return points.map(([x, y]) => {
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return (r + g + b) / 3;
    });
  }, { src, points });
}

// Each fixture is a dark blue rectangle centred on white
const formats = [
  ['WebP', 'product.webp'],
  ['AVIF', 'product.avif'],
  ['JFIF', 'product.jfif'],
  ['GIF', 'product.gif'],
  ['BMP', 'product.bmp'],
  ['TIFF', 'product.tiff'],
  ['SVG (viewBox only)', 'logo.svg'],
  ['PDF', 'product.pdf'],
  ['Illustrator (.ai)', 'logo.ai'],
] as const;

test.describe('Import formats', () => {
  for (const [label, file] of formats) {
    test(`imports ${label} and outputs a 1500px PNG`, async ({ page }) => {
      await page.goto('/');
      await page.locator('input[type="file"]').setInputFiles(fixture(file));

      await expect(page.getByRole('heading', { name: 'Processed Images (1)' })).toBeVisible({ timeout: 60_000 });
      const src = (await page.getByAltText('Processed image 1').getAttribute('src'))!;
      expect(src).toMatch(/-processed\.png/);

      const response = await page.request.get(src);
      expect(response.headers()['content-type']).toBe('image/png');

      // White padding around a dark product in the middle
      const [corner, center] = await brightnessAt(page, src, [[10, 10], [750, 750]]);
      expect(corner).toBeGreaterThan(230);
      expect(center).toBeLessThan(120);
    });
  }

  test('vectors are rendered at output size, so they are never flagged as low resolution', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles([fixture('logo.svg'), fixture('product.pdf')]);
    await expect(page.getByRole('heading', { name: 'Processed Images (2)' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Low resolution')).toHaveCount(0);
  });

  test('files that are not images are skipped with a message', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not an image'),
    });
    await expect(page.getByText("Couldn't read notes.txt", { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Processed Images/ })).toHaveCount(0);
  });
});
