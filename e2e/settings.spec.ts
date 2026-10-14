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
    expect(JSON.parse(decodeURIComponent(cookie!.value))).toEqual({ padding: 120, whiteThreshold: 70 });

    // Rendered from the cookie on the server
    await page.reload();
    await expect(page.getByLabel('Padding', { exact: true })).toHaveValue('120');
    await expect(page.getByLabel('White detection threshold', { exact: true })).toHaveValue('70');

    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(page.getByLabel('Padding', { exact: true })).toHaveValue('300');
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
    // 200px fitted into the default 900px content area
    await expect(page.getByRole('note')).toContainText('200×200');
    await expect(page.getByRole('note')).toContainText('4.5×');
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
