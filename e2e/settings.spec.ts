import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test('saves padding and threshold in a cookie and restores them', async ({ page, context }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

    const save = page.getByRole('button', { name: 'Save settings' });
    await expect(save).toBeDisabled();

    await page.getByLabel('Padding', { exact: true }).fill('120');
    await page.getByLabel('White detection threshold', { exact: true }).fill('70');
    await save.click();
    await expect(page.getByText('Settings saved')).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === 'image-processor-settings');
    expect(JSON.parse(decodeURIComponent(cookie!.value))).toEqual({ padding: 120, whiteThreshold: 70, pngQuality: 80 });

    // Rendered from the cookie on the server
    await page.reload();
    await expect(page.getByLabel('Padding', { exact: true })).toHaveValue('120');
    await expect(page.getByLabel('White detection threshold', { exact: true })).toHaveValue('70');

    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(page.getByLabel('Padding', { exact: true })).toHaveValue('150');
    await expect(page.getByLabel('White detection threshold', { exact: true })).toHaveValue('85');
  });

  test('snaps out-of-range values into range', async ({ page, context }) => {
    await page.goto('/settings');
    await page.getByLabel('Padding', { exact: true }).fill('5000');
    await page.getByLabel('Padding', { exact: true }).blur();
    await expect(page.getByLabel('Padding', { exact: true })).toHaveValue('600');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();
    await expect(page.getByLabel('Padding', { exact: true })).toHaveValue('600');
    const cookie = (await context.cookies()).find((c) => c.name === 'image-processor-settings');
    expect(JSON.parse(decodeURIComponent(cookie!.value)).padding).toBe(600);
  });
});

test.describe('Low-resolution warning', () => {
  // Draws a small product-on-white image in the browser and returns PNG bytes
  async function smallPng(page: import('@playwright/test').Page, size: number): Promise<Buffer> {
    const base64 = await page.evaluate((size) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#222';
      ctx.fillRect(size * 0.4, size * 0.4, size * 0.2, size * 0.2);
      return canvas.toDataURL('image/png').split(',')[1];
    }, size);
    return Buffer.from(base64, 'base64');
  }

  test('flags images that had to be upscaled', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'small.png', mimeType: 'image/png', buffer: await smallPng(page, 200) },
    ]);

    await expect(page.getByRole('heading', { name: 'Processed Images (1)' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Low resolution')).toBeVisible();
    // 200px fitted into the default 1200px content area (150px padding per side)
    await expect(page.getByRole('note')).toContainText('200×200');
    await expect(page.getByRole('note')).toContainText('6.0×');
  });

  test('does not flag large images', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'large.png', mimeType: 'image/png', buffer: await smallPng(page, 1600) },
    ]);

    await expect(page.getByRole('heading', { name: 'Processed Images (1)' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Low resolution')).toHaveCount(0);
  });
});

test.describe('PNG quality', () => {
  // A photo-like image (gradient plus noise), where palette compression matters
  async function photoPng(page: import('@playwright/test').Page): Promise<Buffer> {
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;
      const image = ctx.createImageData(800, 600);
      let seed = 7;
      for (let i = 0; i < image.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const x = (i / 4) % 800;
        const y = Math.floor(i / 4 / 800);
        image.data.set([(x * 255) / 800 + (seed % 30), (y * 255) / 600 + (seed % 20), 140, 255], i);
      }
      ctx.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    return Buffer.from(base64, 'base64');
  }

  async function savedSize(page: import('@playwright/test').Page, quality: number, name: string): Promise<number> {
    await page.goto('/settings');
    await page.getByLabel('PNG quality', { exact: true }).fill(String(quality));
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();

    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'image/png', buffer: await photoPng(page) });
    await expect(page.getByRole('heading', { name: 'Processed Images (1)' })).toBeVisible({ timeout: 60_000 });
    const src = (await page.getByAltText('Processed image 1').getAttribute('src'))!;
    const response = await page.request.get(src);
    expect(response.headers()['content-type']).toBe('image/png');
    return (await response.body()).length;
  }

  test('lower quality saves smaller PNGs', async ({ page }) => {
    const id = Date.now();
    const lossless = await savedSize(page, 100, `q100-${id}.png`);
    const compressed = await savedSize(page, 20, `q20-${id}.png`);
    expect(compressed).toBeLessThan(lossless * 0.6);
  });

  test('describes the palette size and lossless mode', async ({ page }) => {
    await page.goto('/settings');
    const field = page.getByLabel('PNG quality', { exact: true });
    await field.fill('50');
    await expect(page.getByText(/palette of 128 colours/)).toBeVisible();
    await field.fill('100');
    await expect(page.getByText(/Lossless/)).toBeVisible();
  });
});

