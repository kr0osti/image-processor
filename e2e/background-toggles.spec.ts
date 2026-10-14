import { test, expect, type Page } from '@playwright/test';

// Draws a test image in the browser and returns it as PNG bytes.
// `content` is the dark rectangle drawn on a white canvas.
async function makePng(
  page: Page,
  width: number,
  height: number,
  content: { x: number; y: number; width: number; height: number; color: string },
): Promise<Buffer> {
  const base64 = await page.evaluate(({ width, height, content }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = content.color;
    ctx.fillRect(content.x, content.y, content.width, content.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width, height, content });
  return Buffer.from(base64, 'base64');
}

// Brightness (0-255) of the given points of a processed image, as rendered in the page
async function samplePixels(page: Page, alt: string, points: [number, number][]): Promise<number[]> {
  const src = await page.getByAltText(alt).getAttribute('src');
  return page.evaluate(async ({ src, points }) => {
    const img = new Image();
    img.src = src!;
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

test.describe('Processed image toggles', () => {
  test('white background and trim padding switches reprocess a single image', async ({ page }) => {
    await page.goto('/');

    // A small product on a large white margin, and a full-bleed photo
    const product = await makePng(page, 800, 800, { x: 340, y: 340, width: 120, height: 120, color: 'black' });
    const photo = await makePng(page, 800, 600, { x: 0, y: 0, width: 800, height: 600, color: '#c03030' });
    const id = Date.now();

    await page.locator('input[type="file"]').setInputFiles([
      { name: `product-${id}.png`, mimeType: 'image/png', buffer: product },
      { name: `photo-${id}.png`, mimeType: 'image/png', buffer: photo },
    ]);

    await expect(page.getByRole('heading', { name: 'Processed Images (2)' })).toBeVisible({ timeout: 60_000 });

    const productWhiteBg = page.locator('#white-bg-0');
    const productTrim = page.locator('#trim-padding-0');
    const photoWhiteBg = page.locator('#white-bg-1');

    // Detection results: the product is on white with padding, the photo is neither
    await expect(productWhiteBg).toBeChecked();
    await expect(productTrim).toBeVisible();
    await expect(productTrim).not.toBeChecked();
    await expect(photoWhiteBg).not.toBeChecked();
    await expect(page.locator('#trim-padding-1')).toHaveCount(0);

    // Padded layout keeps the corners white
    const [cornerBefore] = await samplePixels(page, 'Processed image 1', [[10, 10]]);
    expect(cornerBefore).toBeGreaterThan(200);

    // Trimming reprocesses only that image and keeps the white background setting
    const photoSrc = await page.getByAltText('Processed image 2').getAttribute('src');
    await productTrim.click();
    await expect(productTrim).toBeChecked({ timeout: 30_000 });
    await expect(productWhiteBg).toBeChecked();
    await expect(page.getByAltText('Processed image 2')).toHaveAttribute('src', photoSrc!);

    // Turning the white background off as well makes the trimmed product fill the frame
    await productWhiteBg.click();
    await expect(productWhiteBg).not.toBeChecked({ timeout: 30_000 });
    await expect(productTrim).toBeChecked();
    await expect(productWhiteBg).toBeEnabled({ timeout: 30_000 });

    const [corner, center] = await samplePixels(page, 'Processed image 1', [[10, 10], [750, 750]]);
    expect(corner).toBeLessThan(60);
    expect(center).toBeLessThan(60);

    // The photo can be switched to the padded layout
    await photoWhiteBg.click();
    await expect(photoWhiteBg).toBeChecked({ timeout: 30_000 });
    await expect(photoWhiteBg).toBeEnabled({ timeout: 30_000 });
    const [photoCorner] = await samplePixels(page, 'Processed image 2', [[10, 10]]);
    expect(photoCorner).toBeGreaterThan(200);
  });
  test('new uploads are appended and images can be removed one by one or all at once', async ({ page }) => {
    await page.goto('/');

    const product = await makePng(page, 800, 800, { x: 340, y: 340, width: 120, height: 120, color: 'black' });
    const photo = await makePng(page, 800, 600, { x: 0, y: 0, width: 800, height: 600, color: '#c03030' });
    const id = Date.now();
    const input = page.locator('input[type="file"]');
    const uploads = page.locator('li', { hasText: /\.png/ });

    await input.setInputFiles({ name: `first-${id}.png`, mimeType: 'image/png', buffer: product });
    await expect(page.getByRole('heading', { name: 'Processed Images (1)' })).toBeVisible({ timeout: 60_000 });
    const firstSrc = await page.getByAltText('Processed image 1').getAttribute('src');

    // A second upload is added after the first instead of replacing it
    await input.setInputFiles({ name: `second-${id}.png`, mimeType: 'image/png', buffer: photo });
    await expect(page.getByRole('heading', { name: 'Processed Images (2)' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByAltText('Processed image 1')).toHaveAttribute('src', firstSrc!);
    await expect(uploads).toHaveCount(2);
    const secondSrc = await page.getByAltText('Processed image 2').getAttribute('src');

    // Removing the first image keeps the second, drops its uploaded file and deletes its saved file
    expect((await page.request.get(firstSrc!)).status()).toBe(200);
    await page.getByRole('button', { name: 'Remove image 1' }).click();
    await expect(page.getByRole('heading', { name: 'Processed Images (1)' })).toBeVisible();
    await expect(page.getByAltText('Processed image 1')).toHaveAttribute('src', secondSrc!);
    await expect(uploads).toHaveCount(1);
    await expect(uploads).toContainText(`second-${id}.png`);
    await expect.poll(async () => (await page.request.get(firstSrc!)).status()).toBe(404);
    expect((await page.request.get(secondSrc!)).status()).toBe(200);

    // The remaining image's switches still act on it
    await page.locator('#white-bg-0').click();
    await expect(page.locator('#white-bg-0')).toBeChecked({ timeout: 30_000 });

    // Delete All clears the page and deletes the saved file on the server
    const remainingSrc = await page.getByAltText('Processed image 1').getAttribute('src');
    expect((await page.request.get(remainingSrc!)).status()).toBe(200);

    await page.getByRole('button', { name: 'Delete All Files' }).click();
    await expect(page.getByRole('heading', { name: /Processed Images/ })).toHaveCount(0);
    await expect(uploads).toHaveCount(0);
    await expect(page.getByText('Deleted 1 file from the server')).toBeVisible();
    expect((await page.request.get(remainingSrc!)).status()).toBe(404);
  });

  test('removing one of two images saved under the same name keeps the shared file', async ({ page }) => {
    await page.goto('/');

    const product = await makePng(page, 800, 800, { x: 340, y: 340, width: 120, height: 120, color: 'black' });
    const name = `same-${Date.now()}.png`;
    const input = page.locator('input[type="file"]');

    // Both uploads are saved as the same <name>-processed file on the server
    await input.setInputFiles({ name, mimeType: 'image/png', buffer: product });
    await expect(page.getByRole('heading', { name: 'Processed Images (1)' })).toBeVisible({ timeout: 60_000 });
    await input.setInputFiles({ name, mimeType: 'image/png', buffer: product });
    await expect(page.getByRole('heading', { name: 'Processed Images (2)' })).toBeVisible({ timeout: 60_000 });
    const src = await page.getByAltText('Processed image 2').getAttribute('src');

    await page.getByRole('button', { name: 'Remove image 1' }).click();
    await expect(page.getByRole('heading', { name: 'Processed Images (1)' })).toBeVisible();
    expect((await page.request.get(src!)).status()).toBe(200);

    // Removing the last card that uses it deletes the file
    await page.getByRole('button', { name: 'Remove image 1' }).click();
    await expect(page.getByRole('heading', { name: /Processed Images/ })).toHaveCount(0);
    await expect.poll(async () => (await page.request.get(src!)).status()).toBe(404);
  });
});
