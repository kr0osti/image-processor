import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Image Processor/);
    await expect(page.getByRole('heading', { level: 1, name: /Image Processor/i })).toBeVisible();

    await expect(page.getByRole('tab', { name: /Upload Images/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /From Webpage/i })).toBeVisible();
  });

  test('should open on the upload tab and switch to the webpage tab', async ({ page }) => {
    await page.goto('/');

    const uploadTab = page.getByRole('tab', { name: /Upload Images/i });
    const webpageTab = page.getByRole('tab', { name: /From Webpage/i });

    await expect(uploadTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /Upload Images/i })).toBeVisible();

    await webpageTab.click();

    await expect(webpageTab).toHaveAttribute('aria-selected', 'true');
    await expect(uploadTab).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByLabel('Webpage URL')).toBeVisible();
  });

  test('should require a URL before fetching images', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: /From Webpage/i }).click();

    const urlInput = page.getByLabel('Webpage URL');
    await expect(urlInput).toHaveAttribute('required', '');

    // Native validation blocks the submit, so the input stays invalid and focused
    await page.getByRole('button', { name: /Fetch Images/i }).click();
    expect(await urlInput.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  });
});
